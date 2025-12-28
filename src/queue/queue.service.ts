import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { CANDIDATE_INGESTION_QUEUE } from './queue.module';

export interface CandidateIngestionJob {
  filePath: string;
  fileName: string;
  batchId?: string;
}

export interface QueueStatus {
  count: number;
  jobIds: string[];
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(CANDIDATE_INGESTION_QUEUE)
    private candidateIngestionQueue: Queue<CandidateIngestionJob>,
  ) {}

  /**
   * Add a single candidate ingestion job to the queue
   */
  async addCandidateIngestionJob(
    filePath: string,
    fileName: string,
  ): Promise<Job<CandidateIngestionJob>> {
    const job = await this.candidateIngestionQueue.add('ingest', {
      filePath,
      fileName,
    });

    this.logger.log(`Added candidate ingestion job: ${job.id} for ${fileName}`);
    return job;
  }

  /**
   * Add multiple candidate ingestion jobs (batch)
   */
  async addCandidateIngestionBatch(
    files: { filePath: string; fileName: string }[],
  ): Promise<{ batchId: string; jobIds: string[] }> {
    const batchId = `batch-${Date.now()}`;
    const jobIds: string[] = [];

    for (const file of files) {
      const job = await this.candidateIngestionQueue.add('ingest', {
        filePath: file.filePath,
        fileName: file.fileName,
        batchId,
      });
      jobIds.push(job.id as string);
    }

    this.logger.log(
      `Added batch ${batchId} with ${files.length} jobs`,
    );

    return { batchId, jobIds };
  }

  /**
   * Get pending (waiting + delayed) jobs
   */
  async getPendingJobs(): Promise<QueueStatus> {
    const waiting = await this.candidateIngestionQueue.getWaiting();
    const delayed = await this.candidateIngestionQueue.getDelayed();

    const allPending = [...waiting, ...delayed];

    return {
      count: allPending.length,
      jobIds: allPending.map((job) => job.id as string),
    };
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    status: string;
    progress: number;
    data: CandidateIngestionJob | null;
    failedReason?: string;
    result?: any;
  } | null> {
    const job = await this.candidateIngestionQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    return {
      id: job.id as string,
      status: state,
      progress: job.progress as number,
      data: job.data,
      failedReason: job.failedReason,
      result: job.returnvalue,
    };
  }

  /**
   * Get all active jobs
   */
  async getActiveJobs(): Promise<QueueStatus> {
    const active = await this.candidateIngestionQueue.getActive();

    return {
      count: active.length,
      jobIds: active.map((job) => job.id as string),
    };
  }

  /**
   * Get completed jobs
   */
  async getCompletedJobs(limit: number = 100): Promise<QueueStatus> {
    const completed = await this.candidateIngestionQueue.getCompleted(
      0,
      limit,
    );

    return {
      count: completed.length,
      jobIds: completed.map((job) => job.id as string),
    };
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(limit: number = 100): Promise<QueueStatus> {
    const failed = await this.candidateIngestionQueue.getFailed(0, limit);

    return {
      count: failed.length,
      jobIds: failed.map((job) => job.id as string),
    };
  }

  /**
   * Get queue overview
   */
  async getQueueOverview(): Promise<{
    pending: QueueStatus;
    active: QueueStatus;
    completed: QueueStatus;
    failed: QueueStatus;
  }> {
    const [pending, active, completed, failed] = await Promise.all([
      this.getPendingJobs(),
      this.getActiveJobs(),
      this.getCompletedJobs(),
      this.getFailedJobs(),
    ]);

    return { pending, active, completed, failed };
  }
}
