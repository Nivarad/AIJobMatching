import { Controller, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * GET /api/queue/pending
   * Get all pending jobs (waiting + delayed)
   */
  @Get('pending')
  async getPendingJobs() {
    return await this.queueService.getPendingJobs();
  }

  /**
   * GET /api/queue/status/:jobId
   * Get status of a specific job
   */
  @Get('status/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.queueService.getJobStatus(jobId);

    if (!status) {
      throw new HttpException(
        `Job ${jobId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return status;
  }

  /**
   * GET /api/queue/overview
   * Get overview of all queues
   */
  @Get('overview')
  async getQueueOverview() {
    return await this.queueService.getQueueOverview();
  }

  /**
   * GET /api/queue/active
   * Get all active jobs
   */
  @Get('active')
  async getActiveJobs() {
    return await this.queueService.getActiveJobs();
  }

  /**
   * GET /api/queue/completed
   * Get completed jobs
   */
  @Get('completed')
  async getCompletedJobs() {
    return await this.queueService.getCompletedJobs();
  }

  /**
   * GET /api/queue/failed
   * Get failed jobs
   */
  @Get('failed')
  async getFailedJobs() {
    return await this.queueService.getFailedJobs();
  }
}
