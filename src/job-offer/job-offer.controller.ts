import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JobOfferService } from './job-offer.service';

@Controller('job-offer')
export class JobOfferController {
  constructor(private readonly jobOfferService: JobOfferService) {}

  /**
   * POST /api/job-offer/match
   * Upload a job description PDF and find matching candidates
   * Returns top 5 candidates sorted by match score
   */
  @Post('match')
  @UseInterceptors(FileInterceptor('file'))
  async matchCandidates(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new HttpException(
        'Only PDF files are supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.jobOfferService.matchCandidates(
        file.buffer,
        file.originalname,
      );

      return {
        success: true,
        message: `Found ${result.candidates.length} matching candidates`,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process job offer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/job-offer/match-path
   * Process a job description from server-side file path
   */
  @Post('match-path')
  async matchCandidatesFromPath(@Body('filePath') filePath: string) {
    if (!filePath) {
      throw new HttpException(
        'filePath is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.jobOfferService.matchCandidatesFromPath(filePath);

      return {
        success: true,
        message: `Found ${result.candidates.length} matching candidates`,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process job offer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/job-offer
   * Get all jobs with pagination
   */
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return await this.jobOfferService.findAll(page, limit);
  }

  /**
   * GET /api/job-offer/stats
   * Get job statistics
   */
  @Get('stats')
  async getStats() {
    return await this.jobOfferService.getStats();
  }

  /**
   * GET /api/job-offer/:id
   * Get a specific job by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.jobOfferService.findOne(id);
  }

  /**
   * PATCH /api/job-offer/:id/close
   * Close a job
   */
  @Patch(':id/close')
  async closeJob(@Param('id') id: string) {
    const job = await this.jobOfferService.closeJob(id);
    return {
      success: true,
      message: `Job ${id} closed successfully`,
      job,
    };
  }

  /**
   * DELETE /api/job-offer/:id
   * Delete a job
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.jobOfferService.remove(id);
    return {
      success: true,
      message: `Job ${id} deleted successfully`,
    };
  }
}
