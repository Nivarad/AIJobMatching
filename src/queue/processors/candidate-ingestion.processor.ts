import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CANDIDATE_INGESTION_QUEUE } from '../queue.module';
import { CandidateIngestionJob } from '../queue.service';
import { CandidateIngestionAgent } from '../../agents/candidate-ingestion.agent';

@Processor(CANDIDATE_INGESTION_QUEUE)
export class CandidateIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(CandidateIngestionProcessor.name);

  constructor(
    private readonly candidateIngestionAgent: CandidateIngestionAgent,
  ) {
    super();
  }

  async process(job: Job<CandidateIngestionJob>): Promise<any> {
    this.logger.log(`Processing job ${job.id}: ${job.data.fileName}`);

    try {
      // Update progress
      await job.updateProgress(10);

      // Process the CV using the agent
      const result = await this.candidateIngestionAgent.processCV(
        job.data.filePath,
        async (progress: number) => {
          await job.updateProgress(progress);
        },
      );

      await job.updateProgress(100);

      this.logger.log(`Job ${job.id} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<CandidateIngestionJob>) {
    this.logger.log(
      `Job ${job.id} completed for file: ${job.data.fileName}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CandidateIngestionJob>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed for file: ${job.data.fileName}`,
      error.message,
    );
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job<CandidateIngestionJob>, progress: number) {
    this.logger.debug(`Job ${job.id} progress: ${progress}%`);
  }
}
