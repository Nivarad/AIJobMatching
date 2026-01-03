/**
 * =============================================================================
 * JOB PROCESSING AGENT
 * =============================================================================
 * 
 * The Job Processing Agent is responsible for processing job descriptions and
 * finding matching candidates using a dual search strategy that combines SQL
 * queries and semantic vector search.
 * 
 * Key Responsibilities:
 * 1. Parse and extract structured data from job description PDFs
 * 2. Store job data in both PostgreSQL and Qdrant
 * 3. Execute dual search strategy (SQL + Vector) to find candidates
 * 4. Calculate sophisticated match scores considering multiple factors
 * 
 * Dual Search Strategy:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    JOB MATCHING PIPELINE                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                    ┌───────────────┴───────────────┐
 *                    ▼                               ▼
 * ┌─────────────────────────────┐    ┌─────────────────────────────┐
 * │     SQL Query (PostgreSQL)  │    │   Vector Search (Qdrant)    │
 * │                             │    │                             │
 * │ Filters candidates by:      │    │ Semantic similarity using:  │
 * │ - Required skills (JSONB)   │    │ - Job summary embedding     │
 * │ - Years of experience       │    │ - Candidate embeddings      │
 * │ - Skill match percentage    │    │ - Cosine similarity         │
 * └─────────────────────────────┘    └─────────────────────────────┘
 *                    │                               │
 *                    └───────────────┬───────────────┘
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                      RESULT MERGING                                      │
 * │                                                                          │
 * │ - Combine results from both searches                                    │
 * │ - Identify "dual matches" (found in both SQL and vector)                │
 * │ - Calculate sophisticated match scores                                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                   SOPHISTICATED SCORING                                  │
 * │                                                                          │
 * │ Weighted factors:                                                        │
 * │ - Skill match (35%): Required vs optional skills                         │
 * │ - Skill proficiency (15%): Experience levels match                       │
 * │ - Experience years (20%): Meets/exceeds requirements                     │
 * │ - Location match (10%): Same city/region/remote                          │
 * │ - Vector similarity (15%): Semantic relevance                            │
 * │ - SQL match bonus (5%): Found in structured search                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * @author  Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

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

/**
 * JobProcessingAgent - Specialized agent for job processing and candidate matching
 * 
 * This agent combines job processing with intelligent candidate matching using
 * multiple tools: PostgresQueryTool, VectorSearchTool, and MatchingGradeTool.
 */
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
    // Maximum number of candidates to return in results (configurable via env)
    this.maxCandidatesReturn = config.maxCandidatesReturn;
  }

  /**
   * Process a job description file and find matching candidates
   * 
   * Main entry point for job processing from file paths. Executes the full
   * pipeline: parse → extract → store → match → score.
   * 
   * @param filePath - Path to the job description PDF
   * @returns Promise with job entity, matched candidates, and search metadata
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

    // =========================================================================
    // STEP 1: Parse PDF
    // =========================================================================
    const parsedDoc = await this.pdfParserService.parsePdf(filePath);
    this.logger.log(`Parsed job PDF: ${parsedDoc.fileName}`);

    // =========================================================================
    // STEP 2: Extract structured data using LLM
    // =========================================================================
    // Uses Gemini 2.5 Flash Lite to extract: title, requirements, salary, etc.
    const extractedData = await this.llmService.extractJobData(parsedDoc.text);
    this.logger.log(`Extracted job data: ${extractedData.title}`);

    // =========================================================================
    // STEP 3: Generate search-optimized summary
    // =========================================================================
    const searchSummary = await this.llmService.generateSearchSummary(
      'job',
      extractedData,
    );
    this.logger.log(`Generated job summary`);

    // =========================================================================
    // STEP 4: Save job to PostgreSQL
    // =========================================================================
    const job = await this.saveJobToPostgres(
      extractedData,
      searchSummary,
      parsedDoc.text,
      filePath,
    );

    // =========================================================================
    // STEP 5: Save to Qdrant vector database
    // =========================================================================
    const embedding = await this.embeddingService.embedText(searchSummary);
    const qdrantPointId = await this.saveJobToQdrant(job, embedding, searchSummary);
    job.qdrantPointId = qdrantPointId;
    await this.jobRepository.save(job);

    // =========================================================================
    // STEP 6: Find matching candidates using dual search strategy
    // =========================================================================
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
   * 
   * Similar to processJobAndMatch but works with file buffers from HTTP uploads.
   * This is the primary method used when job descriptions are uploaded via the API.
   * 
   * @param buffer - PDF file buffer from upload
   * @param fileName - Original filename for reference
   * @returns Promise with job entity, matched candidates, and search metadata
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
   * 
   * This is the core matching algorithm that implements the dual search strategy.
   * It combines structured filtering (SQL) with semantic similarity (vector search)
   * to find the most relevant candidates.
   * 
   * Algorithm:
   * 1. Execute SQL query with skill and experience filters
   * 2. Execute vector search using job summary embedding
   * 3. Merge results, identifying "dual matches" found in both
   * 4. Fetch full candidate data for sophisticated scoring
   * 5. Calculate weighted match scores
   * 6. Return top N candidates sorted by score
   * 
   * @param jobData - Extracted job data with requirements
   * @param jobSummary - Search-optimized job summary
   * @returns Promise with matched candidates and search metadata
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

    // =========================================================================
    // EXTRACT JOB REQUIREMENTS
    // =========================================================================
    // Separate required skills from preferred/optional skills
    const requiredSkills = jobData.requirements
      .filter((r) => r.required)
      .map((r) => r.skill);

    const allSkills = jobData.requirements.map((r) => r.skill);

    // Get minimum experience requirement (lowest of all specified)
    const minExperience = Math.min(
      ...jobData.requirements
        .filter((r) => r.minYearsExperience !== undefined)
        .map((r) => r.minYearsExperience!),
      0,
    );

    // =========================================================================
    // STEP 1: SQL Query - Structured filtering
    // =========================================================================
    // Query PostgreSQL with skill and experience filters
    // Uses JSONB queries for flexible skill matching
    this.logger.log('Executing SQL query...');
    const sqlResults = await this.postgresQueryTool.queryCandidates({
      skills: allSkills,
      minExperienceYears: minExperience > 0 ? minExperience : undefined,
      limit: 20,
      minSkillMatchPercentage: 30, // Require 30% skill overlap for recall
    });
    this.logger.log(`SQL found ${sqlResults.length} candidates`);

    // =========================================================================
    // STEP 2: Vector Search - Semantic similarity
    // =========================================================================
    // Search Qdrant using job summary embedding for semantic matches
    this.logger.log('Executing vector search...');
    const vectorResults = await this.vectorSearchTool.searchCandidates({
      queryText: jobSummary,
      limit: 20,
    });
    this.logger.log(`Vector search found ${vectorResults.length} candidates`);

    // =========================================================================
    // STEP 3: Merge results and identify dual matches
    // =========================================================================
    // Create a map to track candidates from both search methods
    const candidateMap = new Map<
      string,
      {
        sqlMatch: boolean;
        vectorMatch: boolean;
        vectorScore?: number;
        data: any;
      }
    >();

    // Add SQL results to map
    for (const result of sqlResults) {
      candidateMap.set(result.candidateId, {
        sqlMatch: true,
        vectorMatch: false,
        data: result,
      });
    }

    // Add/merge vector results - track dual matches
    for (const result of vectorResults) {
      const existing = candidateMap.get(result.candidateId);
      if (existing) {
        // Dual match - found in both SQL and vector search
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

    // =========================================================================
    // STEP 4: Fetch full candidate data for sophisticated scoring
    // =========================================================================
    const candidateIds = Array.from(candidateMap.keys());
    const fullCandidates = await this.candidateRepository.find({
      where: { id: In(candidateIds) },
    });

    const candidateDataMap = new Map<string, Candidate>();
    for (const candidate of fullCandidates) {
      candidateDataMap.set(candidate.id, candidate);
    }

    // Build job match data structure for scoring algorithm
    const jobMatchData: JobMatchData = {
      requirements: jobData.requirements,
      location: jobData.location,
      summary: jobSummary,
      minExperienceYears: minExperience > 0 ? minExperience : undefined,
    };

    // =========================================================================
    // STEP 5: Calculate sophisticated match scores
    // =========================================================================
    this.logger.log('Calculating sophisticated match scores...');
    const candidates: MatchingResult[] = [];
    let dualMatchCount = 0;

    for (const [candidateId, match] of candidateMap) {
      // Count dual matches for metadata
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

        // Calculate weighted score considering all factors
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

      // Build match sources array
      const matchSources: ('sql' | 'vector')[] = [];
      if (match.sqlMatch) matchSources.push('sql');
      if (match.vectorMatch) matchSources.push('vector');

      // Construct final result with all details
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

    // =========================================================================
    // STEP 6: Sort and return top N candidates
    // =========================================================================
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
   * Save job to PostgreSQL database
   * 
   * Stores structured job data for querying and reference.
   * 
   * @param data - Extracted job data from LLM
   * @param summary - Search-optimized summary
   * @param rawText - Original PDF text
   * @param filePath - Source file path
   * @returns Promise<Job> - Saved job entity
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
   * Save job embedding to Qdrant vector database
   * 
   * Stores job embedding for potential candidate-to-job matching.
   * 
   * @param job - Job entity from PostgreSQL
   * @param embedding - 768-dimensional embedding vector
   * @param summary - Search summary for payload
   * @returns Promise<string> - Qdrant point ID
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
