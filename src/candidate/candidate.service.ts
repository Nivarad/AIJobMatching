import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate } from '../database/entities';
import { QueueService } from '../queue/queue.service';
import { OrchestratorAgent } from '../agents/orchestrator.agent';
import { CandidateIngestionAgent } from '../agents/candidate-ingestion.agent';

@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
    private readonly queueService: QueueService,
    private readonly orchestratorAgent: OrchestratorAgent,
    private readonly candidateIngestionAgent: CandidateIngestionAgent,
  ) {}

  /**
   * Load a single CV file and queue for processing
   */
  async loadCV(
    filePath: string,
  ): Promise<{ jobId: string; message: string }> {
    this.logger.log(`Queueing CV for processing: ${filePath}`);

    const job = await this.queueService.addCandidateIngestionJob(
      filePath,
      filePath.split(/[/\\]/).pop() || 'unknown.pdf',
    );

    return {
      jobId: job.id as string,
      message: `CV queued for processing. Use /api/queue/status/${job.id} to check progress.`,
    };
  }

  /**
   * Load a single CV from buffer (uploaded file)
   * This processes synchronously for immediate feedback
   */
  async loadCVFromBuffer(
    buffer: Buffer,
    fileName: string,
  ): Promise<{ candidateId: string; message: string }> {
    this.logger.log(`Processing uploaded CV: ${fileName}`);

    const result = await this.candidateIngestionAgent.processCVFromBuffer(
      buffer,
      fileName,
    );

    if (!result.success) {
      throw new Error(result.error || 'Failed to process CV');
    }

    return {
      candidateId: result.candidateId!,
      message: `CV processed successfully. Candidate ID: ${result.candidateId}`,
    };
  }

  /**
   * Load all CVs from a folder
   */
  async loadFolder(
    folderPath: string,
  ): Promise<{
    batchId: string;
    totalFiles: number;
    jobIds: string[];
    message: string;
  }> {
    this.logger.log(`Loading CVs from folder: ${folderPath}`);

    // Use orchestrator for folder processing
    const result = await this.orchestratorAgent.executeTask({
      type: 'ingest_folder',
      data: { folderPath },
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to process folder');
    }

    const candidateIds = result.results?.candidateIds || [];
    const failedFiles = result.results?.failedFiles || [];

    return {
      batchId: `batch-${Date.now()}`,
      totalFiles: candidateIds.length + failedFiles.length,
      jobIds: candidateIds,
      message: `Processed ${candidateIds.length} CVs successfully. ${failedFiles.length} failed.`,
    };
  }

  /**
   * Get all candidates
   */
  async findAll(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ candidates: Candidate[]; total: number; page: number; pages: number }> {
    const [candidates, total] = await this.candidateRepository.findAndCount({
      where: { status: 'active' },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      candidates,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get candidate by ID
   */
  async findOne(id: string): Promise<Candidate> {
    const candidate = await this.candidateRepository.findOne({
      where: { id },
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with ID ${id} not found`);
    }

    return candidate;
  }

  /**
   * Delete candidate
   */
  async remove(id: string): Promise<void> {
    const candidate = await this.findOne(id);
    await this.candidateRepository.remove(candidate);
    this.logger.log(`Deleted candidate: ${id}`);
  }

  /**
   * Get candidate statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    failed: number;
  }> {
    const [total, active, pending, failed] = await Promise.all([
      this.candidateRepository.count(),
      this.candidateRepository.count({ where: { status: 'active' } }),
      this.candidateRepository.count({ where: { status: 'pending' } }),
      this.candidateRepository.count({ where: { status: 'failed' } }),
    ]);

    return { total, active, pending, failed };
  }
}
