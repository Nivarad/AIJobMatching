/**
 * =============================================================================
 * CANDIDATE INGESTION AGENT
 * =============================================================================
 * 
 * The Candidate Ingestion Agent is responsible for processing CV/resume files
 * and ingesting them into the system. It implements a multi-step RAG pipeline
 * that transforms unstructured CV data into structured, searchable information.
 * 
 * RAG Pipeline Steps:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Step 1: PDF Parsing                                                      │
 * │ Extract raw text from PDF using pdf-parse library                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Step 2: LLM Extraction (Gemini 2.5 Flash Lite)                          │
 * │ Extract structured data: name, skills, experience, education            │
 * │ Uses structured output (JSON schema) for reliable extraction            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Step 3: Summary Generation (LLM)                                         │
 * │ Generate keyword-rich summary optimized for semantic search              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Step 4: Embedding Generation (text-embedding-004)                        │
 * │ Generate 768-dimensional embeddings for vector search                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                    ┌───────────────┴───────────────┐
 *                    ▼                               ▼
 * ┌─────────────────────────────┐    ┌─────────────────────────────┐
 * │ Step 5: PostgreSQL Storage  │    │ Step 6: Qdrant Storage      │
 * │ Store structured data for   │    │ Store embeddings for        │
 * │ SQL filtering queries       │    │ semantic similarity search  │
 * └─────────────────────────────┘    └─────────────────────────────┘
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate } from '../database/entities';
import { VectorService, CandidatePayload } from '../vector/vector.service';
import { LLMService } from './services/llm.service';
import { EmbeddingService } from './services/embedding.service';
import { PdfParserService } from './services/pdf-parser.service';
import { AgentProcessingResult, ExtractedCandidateData } from '../common/interfaces';

/**
 * CandidateIngestionAgent - Specialized agent for CV/resume processing
 * 
 * This agent handles the complete pipeline for ingesting candidate CVs:
 * parsing, extraction, embedding generation, and storage in both
 * relational and vector databases.
 */
@Injectable()
export class CandidateIngestionAgent {
  private readonly logger = new Logger(CandidateIngestionAgent.name);

  constructor(
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
    private readonly vectorService: VectorService,
    private readonly llmService: LLMService,
    private readonly embeddingService: EmbeddingService,
    private readonly pdfParserService: PdfParserService,
  ) {}

  /**
   * Process a CV file and ingest it into the system
   * 
   * This is the main entry point for CV processing from file paths.
   * It orchestrates the entire RAG pipeline from PDF parsing to
   * dual database storage.
   * 
   * @param filePath - Path to the CV PDF file
   * @param progressCallback - Optional callback for progress updates (0-100)
   * @returns Promise<AgentProcessingResult> - Processing result with candidate ID
   */
  async processCV(
    filePath: string,
    progressCallback?: (progress: number) => Promise<void>,
  ): Promise<AgentProcessingResult> {
    this.logger.log(`Processing CV: ${filePath}`);

    try {
      // =====================================================================
      // STEP 1: Parse PDF (10-20%)
      // =====================================================================
      // Extract raw text content from the PDF file using pdf-parse library
      await progressCallback?.(10);
      const parsedDoc = await this.pdfParserService.parsePdf(filePath);
      this.logger.log(`Parsed PDF: ${parsedDoc.fileName}`);
      await progressCallback?.(20);

      // =====================================================================
      // STEP 2: Extract structured data using LLM (20-50%)
      // =====================================================================
      // Use Gemini 2.5 Flash Lite with structured output to extract:
      // - Personal info (name, email, phone, location)
      // - Skills with proficiency levels
      // - Work experience with dates and descriptions
      // - Education history
      // - Total years of experience
      const extractedData = await this.llmService.extractCandidateData(
        parsedDoc.text,
      );
      this.logger.log(`Extracted data for: ${extractedData.name}`);
      await progressCallback?.(50);

      // =====================================================================
      // STEP 3: Generate search-optimized summary (50-60%)
      // =====================================================================
      // Generate a keyword-rich summary specifically designed for
      // semantic search - includes key skills, experience highlights,
      // and domain expertise
      const searchSummary = await this.llmService.generateSearchSummary(
        'candidate',
        extractedData,
      );
      this.logger.log(`Generated summary for: ${extractedData.name}`);
      await progressCallback?.(60);

      // =====================================================================
      // STEP 4: Generate embedding (60-70%)
      // =====================================================================
      // Use Google's text-embedding-004 model to generate 768-dimensional
      // embeddings. These are normalized for cosine similarity search.
      const embedding = await this.embeddingService.embedText(
        searchSummary,
      );
      this.logger.log(`Generated embedding with ${embedding.length} dimensions`);
      await progressCallback?.(70);

      // =====================================================================
      // STEP 5: Save to PostgreSQL (70-85%)
      // =====================================================================
      // Store structured data in PostgreSQL for SQL-based filtering
      // (e.g., filter by years of experience, specific skills)
      const candidate = await this.saveToPostgres(
        extractedData,
        searchSummary,
        parsedDoc.text,
        filePath,
      );
      this.logger.log(`Saved candidate to PostgreSQL: ${candidate.id}`);
      await progressCallback?.(85);

      // =====================================================================
      // STEP 6: Save to Qdrant (85-95%)
      // =====================================================================
      // Store embedding in Qdrant vector database for semantic search
      // Also store payload with candidate metadata for hybrid search
      const qdrantPointId = await this.saveToQdrant(
        candidate,
        embedding,
        searchSummary,
      );

      // Update candidate with Qdrant reference and activate
      candidate.qdrantPointId = qdrantPointId;
      candidate.status = 'active';
      await this.candidateRepository.save(candidate);
      this.logger.log(`Saved candidate to Qdrant: ${qdrantPointId}`);
      await progressCallback?.(95);

      return {
        success: true,
        candidateId: candidate.id,
        data: extractedData,
      };
    } catch (error) {
      this.logger.error(`Failed to process CV: ${filePath}`, error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process a CV from buffer (uploaded file)
   * 
   * Similar to processCV but works with file buffers from HTTP uploads.
   * This is the primary method used when CVs are uploaded via the API.
   * 
   * @param buffer - PDF file buffer from upload
   * @param fileName - Original filename for reference
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise<AgentProcessingResult> - Processing result with candidate ID
   */
  async processCVFromBuffer(
    buffer: Buffer,
    fileName: string,
    progressCallback?: (progress: number) => Promise<void>,
  ): Promise<AgentProcessingResult> {
    this.logger.log(`Processing CV from buffer: ${fileName}`);

    try {
      // Step 1: Parse PDF buffer
      await progressCallback?.(10);
      const parsedDoc = await this.pdfParserService.parsePdfBuffer(
        buffer,
        fileName,
      );
      await progressCallback?.(20);

      // Step 2: Extract structured data using LLM
      const extractedData = await this.llmService.extractCandidateData(
        parsedDoc.text,
      );
      await progressCallback?.(50);

      // Step 3: Generate search-optimized summary
      const searchSummary = await this.llmService.generateSearchSummary(
        'candidate',
        extractedData,
      );
      await progressCallback?.(60);

      // Step 4: Generate embedding
      const embedding = await this.embeddingService.embedText(
        searchSummary,
      );
      await progressCallback?.(70);

      // Step 5: Save to PostgreSQL
      const candidate = await this.saveToPostgres(
        extractedData,
        searchSummary,
        parsedDoc.text,
        fileName,
      );
      await progressCallback?.(85);

      // Step 6: Save to Qdrant
      const qdrantPointId = await this.saveToQdrant(
        candidate,
        embedding,
        searchSummary,
      );

      // Update candidate with Qdrant point ID
      candidate.qdrantPointId = qdrantPointId;
      candidate.status = 'active';
      await this.candidateRepository.save(candidate);
      await progressCallback?.(95);

      return {
        success: true,
        candidateId: candidate.id,
        data: extractedData,
      };
    } catch (error) {
      this.logger.error(`Failed to process CV buffer: ${fileName}`, error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Save extracted data to PostgreSQL
   * 
   * Stores the structured candidate data in PostgreSQL for SQL-based queries.
   * Handles both new candidates and updates to existing ones (matched by email).
   * 
   * Deduplication Strategy:
   * - If a candidate with the same email exists, update their record
   * - Otherwise, create a new candidate record
   * - Null emails are always treated as new candidates
   * 
   * @param data - Extracted candidate data from LLM
   * @param summary - Search-optimized summary
   * @param rawText - Original PDF text content
   * @param filePath - Path to source file
   * @returns Promise<Candidate> - Saved or updated candidate entity
   */
  private async saveToPostgres(
    data: ExtractedCandidateData,
    summary: string,
    rawText: string,
    filePath: string,
  ): Promise<Candidate> {
    // Check if candidate with same email exists (only if email is provided)
    // Don't match on null emails as that would update random candidates
    let existing: Candidate | null = null;
    if (data.email) {
      existing = await this.candidateRepository.findOne({
        where: { email: data.email },
      });
    }

    if (existing) {
      // Update existing candidate with new information
      existing.name = data.name;
      existing.phone = data.phone;
      existing.location = data.location;
      existing.skills = data.skills;
      existing.experience = data.experience;
      existing.education = data.education;
      existing.totalExperienceYears = data.totalExperienceYears;
      existing.summary = summary;
      existing.rawResumeText = rawText;
      existing.resumePath = filePath;
      existing.status = 'pending'; // Mark as pending until Qdrant storage completes

      return await this.candidateRepository.save(existing);
    }

    // Create new candidate record
    const candidate = this.candidateRepository.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      location: data.location,
      skills: data.skills,
      experience: data.experience,
      education: data.education,
      totalExperienceYears: data.totalExperienceYears,
      summary: summary,
      rawResumeText: rawText,
      resumePath: filePath,
      status: 'pending',
    });

    return await this.candidateRepository.save(candidate);
  }

  /**
   * Save embedding to Qdrant vector database
   * 
   * Stores the candidate's embedding vector in Qdrant along with
   * metadata payload for hybrid search capabilities.
   * 
   * Payload includes:
   * - candidateId: Reference to PostgreSQL record
   * - name, email: For display in search results
   * - skills: Array of skill names for filtering
   * - experienceYears: For filtering by experience
   * - location, summary: For context in results
   * 
   * @param candidate - Candidate entity from PostgreSQL
   * @param embedding - 768-dimensional embedding vector
   * @param summary - Search summary for payload
   * @returns Promise<string> - Qdrant point ID for reference
   */
  private async saveToQdrant(
    candidate: Candidate,
    embedding: number[],
    summary: string,
  ): Promise<string> {
    // Prepare payload with candidate metadata
    const payload: CandidatePayload = {
      candidateId: candidate.id,
      name: candidate.name,
      email: candidate.email,
      skills: candidate.skills.map((s) => s.name),
      experienceYears: candidate.totalExperienceYears,
      location: candidate.location,
      summary: summary,
      createdAt: new Date().toISOString(),
    };

    // Upsert to Qdrant and return the point ID
    return await this.vectorService.upsertCandidate(
      candidate.id,
      embedding,
      payload,
    );
  }
}
