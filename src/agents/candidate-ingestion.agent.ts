import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate } from '../database/entities';
import { VectorService, CandidatePayload } from '../vector/vector.service';
import { LLMService } from './services/llm.service';
import { EmbeddingService } from './services/embedding.service';
import { PdfParserService } from './services/pdf-parser.service';
import { AgentProcessingResult, ExtractedCandidateData } from '../common/interfaces';

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
   * This is the main entry point for the agent
   */
  async processCV(
    filePath: string,
    progressCallback?: (progress: number) => Promise<void>,
  ): Promise<AgentProcessingResult> {
    this.logger.log(`Processing CV: ${filePath}`);

    try {
      // Step 1: Parse PDF (10-20%)
      await progressCallback?.(10);
      const parsedDoc = await this.pdfParserService.parsePdf(filePath);
      this.logger.log(`Parsed PDF: ${parsedDoc.fileName}`);
      await progressCallback?.(20);

      // Step 2: Extract structured data using LLM (20-50%)
      const extractedData = await this.llmService.extractCandidateData(
        parsedDoc.text,
      );
      this.logger.log(`Extracted data for: ${extractedData.name}`);
      await progressCallback?.(50);

      // Step 3: Generate search-optimized summary (50-60%)
      const searchSummary = await this.llmService.generateSearchSummary(
        'candidate',
        extractedData,
      );
      this.logger.log(`Generated summary for: ${extractedData.name}`);
      await progressCallback?.(60);

      // Step 4: Generate embedding (60-70%)
      const embedding = await this.embeddingService.embedText(
        searchSummary,
        false, // Not a query
      );
      this.logger.log(`Generated embedding with ${embedding.length} dimensions`);
      await progressCallback?.(70);

      // Step 5: Save to PostgreSQL (70-85%)
      const candidate = await this.saveToPostgres(
        extractedData,
        searchSummary,
        parsedDoc.text,
        filePath,
      );
      this.logger.log(`Saved candidate to PostgreSQL: ${candidate.id}`);
      await progressCallback?.(85);

      // Step 6: Save to Qdrant (85-95%)
      const qdrantPointId = await this.saveToQdrant(
        candidate,
        embedding,
        searchSummary,
      );

      // Update candidate with Qdrant point ID
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
        false,
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
   */
  private async saveToPostgres(
    data: ExtractedCandidateData,
    summary: string,
    rawText: string,
    filePath: string,
  ): Promise<Candidate> {
    // Check if candidate with same email exists
    const existing = await this.candidateRepository.findOne({
      where: { email: data.email },
    });

    if (existing) {
      // Update existing candidate
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
      existing.status = 'pending';

      return await this.candidateRepository.save(existing);
    }

    // Create new candidate
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
   * Save embedding to Qdrant
   */
  private async saveToQdrant(
    candidate: Candidate,
    embedding: number[],
    summary: string,
  ): Promise<string> {
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

    return await this.vectorService.upsertCandidate(
      candidate.id,
      embedding,
      payload,
    );
  }
}
