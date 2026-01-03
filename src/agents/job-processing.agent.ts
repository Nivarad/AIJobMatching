import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job, Candidate } from '../database/entities';
import { VectorService, JobPayload } from '../vector/vector.service';
import { LLMService, LLMConfig } from './services/llm.service';
import { EmbeddingService } from './services/embedding.service';
import { PdfParserService } from './services/pdf-parser.service';
import { PostgresQueryTool } from './tools/postgres-query.tool';
import { VectorSearchTool, VectorSearchResult } from './tools/vector-search.tool';
import { 
  MatchingGradeTool, 
  CandidateMatchData, 
  JobMatchData,
  MatchScoreBreakdown 
} from './tools/matching-grade.tool';
import { MatchingResult, ExtractedJobData } from '../common/interfaces';

@Injectable()
export class JobProcessingAgent {
  private readonly logger = new Logger(JobProcessingAgent.name);
  private maxCandidatesReturn: number;

  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
    private readonly vectorService: VectorService,
    private readonly llmService: LLMService,
    private readonly embeddingService: EmbeddingService,
    private readonly pdfParserService: PdfParserService,
    private readonly postgresQueryTool: PostgresQueryTool,
    private readonly vectorSearchTool: VectorSearchTool,
    private readonly matchingGradeTool: MatchingGradeTool,
    @Inject('LLM_CONFIG') private config: LLMConfig,
  ) {
    this.maxCandidatesReturn = config.maxCandidatesReturn;
  }

  /**
   * Process a job description file and find matching candidates
   * Returns top 5 candidates sorted by match score
   */
  async processJobAndMatch(
    filePath: string,
  ): Promise<{
    job: Job;
    candidates: MatchingResult[];
    searchMetadata: {
      sqlMatchCount: number;
      vectorMatchCount: number;
      dualMatchCount: number;
    };
  }> {
    this.logger.log(`Processing job description: ${filePath}`);

    // Step 1: Parse PDF
    const parsedDoc = await this.pdfParserService.parsePdf(filePath);
    this.logger.log(`Parsed job PDF: ${parsedDoc.fileName}`);

    // Step 2: Extract structured data using LLM
    const extractedData = await this.llmService.extractJobData(parsedDoc.text);
    this.logger.log(`Extracted job data: ${extractedData.title}`);

    // Step 3: Generate search-optimized summary
    const searchSummary = await this.llmService.generateSearchSummary(
      'job',
      extractedData,
    );
    this.logger.log(`Generated job summary`);

    // Step 4: Save job to database
    const job = await this.saveJobToPostgres(
      extractedData,
      searchSummary,
      parsedDoc.text,
      filePath,
    );

    // Step 5: Save to Qdrant
    const embedding = await this.embeddingService.embedText(searchSummary);
    const qdrantPointId = await this.saveJobToQdrant(job, embedding, searchSummary);
    job.qdrantPointId = qdrantPointId;
    await this.jobRepository.save(job);

    // Step 6: Find matching candidates
    const matchResult = await this.findMatchingCandidates(
      extractedData,
      searchSummary,
    );

    return {
      job,
      candidates: matchResult.candidates,
      searchMetadata: matchResult.metadata,
    };
  }

  /**
   * Process a job from buffer and find matching candidates
   */
  async processJobFromBuffer(
    buffer: Buffer,
    fileName: string,
  ): Promise<{
    job: Job;
    candidates: MatchingResult[];
    searchMetadata: {
      sqlMatchCount: number;
      vectorMatchCount: number;
      dualMatchCount: number;
    };
  }> {
    this.logger.log(`Processing job from buffer: ${fileName}`);

    // Step 1: Parse PDF buffer
    const parsedDoc = await this.pdfParserService.parsePdfBuffer(buffer, fileName);

    // Step 2: Extract structured data
    const extractedData = await this.llmService.extractJobData(parsedDoc.text);

    // Step 3: Generate summary
    const searchSummary = await this.llmService.generateSearchSummary(
      'job',
      extractedData,
    );

    // Step 4: Save to database
    const job = await this.saveJobToPostgres(
      extractedData,
      searchSummary,
      parsedDoc.text,
      fileName,
    );

    // Step 5: Save to Qdrant
    const embedding = await this.embeddingService.embedText(searchSummary);
    const qdrantPointId = await this.saveJobToQdrant(job, embedding, searchSummary);
    job.qdrantPointId = qdrantPointId;
    await this.jobRepository.save(job);

    // Step 6: Find matching candidates
    const matchResult = await this.findMatchingCandidates(
      extractedData,
      searchSummary,
    );

    return {
      job,
      candidates: matchResult.candidates,
      searchMetadata: matchResult.metadata,
    };
  }

  /**
   * Find matching candidates using both SQL and vector search
   * Uses sophisticated scoring algorithm for accurate matching
   */
  private async findMatchingCandidates(
    jobData: ExtractedJobData,
    jobSummary: string,
  ): Promise<{
    candidates: MatchingResult[];
    metadata: {
      sqlMatchCount: number;
      vectorMatchCount: number;
      dualMatchCount: number;
    };
  }> {
    this.logger.log('Finding matching candidates...');

    // Extract required skills from job
    const requiredSkills = jobData.requirements
      .filter((r) => r.required)
      .map((r) => r.skill);

    const allSkills = jobData.requirements.map((r) => r.skill);

    // Get minimum experience requirement
    const minExperience = Math.min(
      ...jobData.requirements
        .filter((r) => r.minYearsExperience !== undefined)
        .map((r) => r.minYearsExperience!),
      0,
    );

    // Step 1: SQL Query
    this.logger.log('Executing SQL query...');
    const sqlResults = await this.postgresQueryTool.queryCandidates({
      skills: allSkills,
      minExperienceYears: minExperience > 0 ? minExperience : undefined,
      // location: jobData.location,
      limit: 20,
      minSkillMatchPercentage: 30, // Require 30% skill overlap
    });
    this.logger.log(`SQL found ${sqlResults.length} candidates`);

    // Step 2: Vector Search
    this.logger.log('Executing vector search...');
    const vectorResults = await this.vectorSearchTool.searchCandidates({
      queryText: jobSummary,
      limit: 20,
    });
    this.logger.log(`Vector search found ${vectorResults.length} candidates`);

    // Step 3: Merge results and identify dual matches
    const candidateMap = new Map<
      string,
      {
        sqlMatch: boolean;
        vectorMatch: boolean;
        vectorScore?: number;
        data: any;
      }
    >();

    // Add SQL results
    for (const result of sqlResults) {
      candidateMap.set(result.candidateId, {
        sqlMatch: true,
        vectorMatch: false,
        data: result,
      });
    }

    // Add/merge vector results
    for (const result of vectorResults) {
      const existing = candidateMap.get(result.candidateId);
      if (existing) {
        existing.vectorMatch = true;
        existing.vectorScore = result.vectorScore;
      } else {
        candidateMap.set(result.candidateId, {
          sqlMatch: false,
          vectorMatch: true,
          vectorScore: result.vectorScore,
          data: result,
        });
      }
    }

    // Step 4: Fetch full candidate data for sophisticated scoring
    const candidateIds = Array.from(candidateMap.keys());
    const fullCandidates = await this.candidateRepository.find({
      where: { id: In(candidateIds) },
    });

    const candidateDataMap = new Map<string, Candidate>();
    for (const candidate of fullCandidates) {
      candidateDataMap.set(candidate.id, candidate);
    }

    // Build job match data for sophisticated scoring
    const jobMatchData: JobMatchData = {
      requirements: jobData.requirements,
      location: jobData.location,
      summary: jobSummary,
      minExperienceYears: minExperience > 0 ? minExperience : undefined,
    };

    // Step 5: Calculate sophisticated scores
    this.logger.log('Calculating sophisticated match scores...');
    const candidates: MatchingResult[] = [];
    let dualMatchCount = 0;

    for (const [candidateId, match] of candidateMap) {
      if (match.sqlMatch && match.vectorMatch) {
        dualMatchCount++;
      }

      const fullCandidate = candidateDataMap.get(candidateId);
      
      let score: number;
      let scoreBreakdown: MatchScoreBreakdown | undefined;

      if (fullCandidate) {
        // Use sophisticated scoring with full candidate data
        const candidateMatchData: CandidateMatchData = {
          skills: fullCandidate.skills,
          experience: fullCandidate.experience,
          education: fullCandidate.education,
          totalExperienceYears: fullCandidate.totalExperienceYears,
          location: fullCandidate.location,
          summary: fullCandidate.summary,
        };

        scoreBreakdown = this.matchingGradeTool.calculateSophisticatedScore(
          candidateMatchData,
          jobMatchData,
          match.vectorScore,
          match.sqlMatch,
        );
        score = scoreBreakdown.totalScore;
      } else {
        // Fallback to simple scoring if full data not available
        score = this.matchingGradeTool.calculateFinalScore(
          match.sqlMatch,
          match.vectorMatch,
          match.vectorScore,
        );
      }

      const matchSources: ('sql' | 'vector')[] = [];
      if (match.sqlMatch) matchSources.push('sql');
      if (match.vectorMatch) matchSources.push('vector');

      candidates.push({
        candidateId,
        name: match.data.name || fullCandidate?.name,
        email: match.data.email || fullCandidate?.email,
        matchScore: score,
        matchSources,
        matchDetails: {
          sqlMatch: match.sqlMatch,
          vectorMatch: match.vectorMatch,
          vectorScore: match.vectorScore,
          // Include sophisticated score breakdown if available
          ...(scoreBreakdown && {
            skillScore: scoreBreakdown.skillScore,
            proficiencyScore: scoreBreakdown.proficiencyScore,
            experienceScore: scoreBreakdown.experienceScore,
            locationScore: scoreBreakdown.locationScore,
            matchedSkillsCount: scoreBreakdown.matchedSkills.length,
            missingRequiredSkills: scoreBreakdown.missingRequiredSkills,
            reasoning: scoreBreakdown.reasoning,
          }),
        },
        skills: match.data.skills || fullCandidate?.skills.map(s => s.name) || [],
        experienceYears: match.data.experienceYears || fullCandidate?.totalExperienceYears || 0,
        summary: match.data.summary || fullCandidate?.summary,
      });
    }

    // Sort by score and take top N
    candidates.sort((a, b) => b.matchScore - a.matchScore);
    const topCandidates = candidates.slice(0, this.maxCandidatesReturn);

    this.logger.log(
      `Returning top ${topCandidates.length} candidates (${dualMatchCount} dual matches)`,
    );

    return {
      candidates: topCandidates,
      metadata: {
        sqlMatchCount: sqlResults.length,
        vectorMatchCount: vectorResults.length,
        dualMatchCount,
      },
    };
  }

  /**
   * Save job to PostgreSQL
   */
  private async saveJobToPostgres(
    data: ExtractedJobData,
    summary: string,
    rawText: string,
    filePath: string,
  ): Promise<Job> {
    const job = this.jobRepository.create({
      title: data.title,
      description: data.description,
      company: data.company,
      location: data.location,
      employmentType: data.employmentType || 'full-time',
      requirements: data.requirements,
      salaryRange: data.salaryRange,
      benefits: data.benefits,
      summary: summary,
      rawDescriptionText: rawText,
      jobDescriptionPath: filePath,
      status: 'open',
    });

    return await this.jobRepository.save(job);
  }

  /**
   * Save job to Qdrant
   */
  private async saveJobToQdrant(
    job: Job,
    embedding: number[],
    summary: string,
  ): Promise<string> {
    const payload: JobPayload = {
      jobId: job.id,
      title: job.title,
      company: job.company,
      requirements: job.requirements.map((r) => r.skill),
      location: job.location,
      summary: summary,
      createdAt: new Date().toISOString(),
    };

    return await this.vectorService.upsertJob(job.id, embedding, payload);
  }
}
