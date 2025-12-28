import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../database/entities';
import { OrchestratorAgent } from '../agents/orchestrator.agent';
import { JobProcessingAgent } from '../agents/job-processing.agent';
import { MatchingResult } from '../common/interfaces';

@Injectable()
export class JobOfferService {
  private readonly logger = new Logger(JobOfferService.name);

  constructor(
    @InjectRepository(Job)
    private jobRepository: Repository<Job>,
    private readonly orchestratorAgent: OrchestratorAgent,
    private readonly jobProcessingAgent: JobProcessingAgent,
  ) {}

  /**
   * Process a job description PDF and find matching candidates
   * Returns the job and top 5 matching candidates
   */
  async matchCandidates(
    buffer: Buffer,
    fileName: string,
  ): Promise<{
    job: {
      id: string;
      title: string;
      company?: string;
      location?: string;
      requirements: string[];
    };
    candidates: MatchingResult[];
    searchMetadata: {
      sqlMatchCount: number;
      vectorMatchCount: number;
      dualMatchCount: number;
    };
  }> {
    this.logger.log(`Processing job offer for matching: ${fileName}`);

    const result = await this.jobProcessingAgent.processJobFromBuffer(
      buffer,
      fileName,
    );

    return {
      job: {
        id: result.job.id,
        title: result.job.title,
        company: result.job.company,
        location: result.job.location,
        requirements: result.job.requirements.map((r) => r.skill),
      },
      candidates: result.candidates,
      searchMetadata: result.searchMetadata,
    };
  }

  /**
   * Process a job description from file path
   */
  async matchCandidatesFromPath(
    filePath: string,
  ): Promise<{
    job: {
      id: string;
      title: string;
      company?: string;
      location?: string;
      requirements: string[];
    };
    candidates: MatchingResult[];
    searchMetadata: {
      sqlMatchCount: number;
      vectorMatchCount: number;
      dualMatchCount: number;
    };
  }> {
    this.logger.log(`Processing job offer from path: ${filePath}`);

    const result = await this.jobProcessingAgent.processJobAndMatch(filePath);

    return {
      job: {
        id: result.job.id,
        title: result.job.title,
        company: result.job.company,
        location: result.job.location,
        requirements: result.job.requirements.map((r) => r.skill),
      },
      candidates: result.candidates,
      searchMetadata: result.searchMetadata,
    };
  }

  /**
   * Get all jobs
   */
  async findAll(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ jobs: Job[]; total: number; page: number; pages: number }> {
    const [jobs, total] = await this.jobRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      jobs,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Get job by ID
   */
  async findOne(id: string): Promise<Job> {
    const job = await this.jobRepository.findOne({
      where: { id },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return job;
  }

  /**
   * Delete job
   */
  async remove(id: string): Promise<void> {
    const job = await this.findOne(id);
    await this.jobRepository.remove(job);
    this.logger.log(`Deleted job: ${id}`);
  }

  /**
   * Get job statistics
   */
  async getStats(): Promise<{
    total: number;
    open: number;
    closed: number;
    draft: number;
  }> {
    const [total, open, closed, draft] = await Promise.all([
      this.jobRepository.count(),
      this.jobRepository.count({ where: { status: 'open' } }),
      this.jobRepository.count({ where: { status: 'closed' } }),
      this.jobRepository.count({ where: { status: 'draft' } }),
    ]);

    return { total, open, closed, draft };
  }

  /**
   * Close a job
   */
  async closeJob(id: string): Promise<Job> {
    const job = await this.findOne(id);
    job.status = 'closed';
    return await this.jobRepository.save(job);
  }
}
