import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../database/entities';
import { VectorService, JobPayload } from '../vector/vector.service';
import { LLMService, LLMConfig } from './services/llm.service';
import { EmbeddingService } from './services/embedding.service';
import { PdfParserService } from './services/pdf-parser.service';
import { PostgresQueryTool } from './tools/postgres-query.tool';
import { VectorSearchTool, VectorSearchResult } from './tools/vector-search.tool';
import { MatchingGradeTool } from './tools/matching-grade.tool';
import { MatchingResult, ExtractedJobData } from '../common/interfaces';

@Injectable()
export class JobProcessingAgent {
  private readonly logger = new Logger(JobProcessingAgent.name);
  private maxCandidatesReturn: number;

  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
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
    const embedding = await this.embeddingService.embedText(searchSummary, false);
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
    const embedding = await this.embeddingService.embedText(searchSummary, false);
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
      location: jobData.location,
      limit: 20,
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

    // Step 4: Calculate scores
    this.logger.log('Calculating match scores...');
    const candidates: MatchingResult[] = [];
    let dualMatchCount = 0;

    for (const [candidateId, match] of candidateMap) {
      if (match.sqlMatch && match.vectorMatch) {
        dualMatchCount++;
      }

      const score = this.matchingGradeTool.calculateFinalScore(
        match.sqlMatch,
        match.vectorMatch,
        match.vectorScore,
      );

      const matchSources: ('sql' | 'vector')[] = [];
      if (match.sqlMatch) matchSources.push('sql');
      if (match.vectorMatch) matchSources.push('vector');

      candidates.push({
        candidateId,
        name: match.data.name,
        email: match.data.email,
        matchScore: score,
        matchSources,
        matchDetails: {
          sqlMatch: match.sqlMatch,
          vectorMatch: match.vectorMatch,
          vectorScore: match.vectorScore,
        },
        skills: match.data.skills || [],
        experienceYears: match.data.experienceYears || match.data.totalExperienceYears || 0,
        summary: match.data.summary,
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
