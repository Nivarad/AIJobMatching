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
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JobOfferService } from './job-offer.service';

@ApiTags('Job Offer')
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
  @ApiOperation({ summary: 'Match candidates', description: 'Upload a job description PDF and find matching candidates. Returns top 5 candidates sorted by match score.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF file of the job description',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Matching candidates found' })
  @ApiResponse({ status: 400, description: 'Invalid file or no file uploaded' })
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
  @ApiOperation({ summary: 'Match candidates from file path', description: 'Process a job description from server-side file path' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the job description PDF file',
          example: '/data/jobs/job_description.pdf',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Matching candidates found' })
  @ApiResponse({ status: 400, description: 'filePath is required' })
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
  @ApiOperation({ summary: 'Get all jobs', description: 'Get all jobs with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page', example: 20 })
  @ApiResponse({ status: 200, description: 'List of jobs' })
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
  @ApiOperation({ summary: 'Get statistics', description: 'Get job statistics' })
  @ApiResponse({ status: 200, description: 'Job statistics' })
  async getStats() {
    return await this.jobOfferService.getStats();
  }

  /**
   * GET /api/job-offer/:id
   * Get a specific job by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID', description: 'Get a specific job by ID' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(@Param('id') id: string) {
    return await this.jobOfferService.findOne(id);
  }

  /**
   * PATCH /api/job-offer/:id/close
   * Close a job
   */
  @Patch(':id/close')
  @ApiOperation({ summary: 'Close job', description: 'Close a job' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job closed successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
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
  @ApiOperation({ summary: 'Delete job', description: 'Delete a job' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async remove(@Param('id') id: string) {
    await this.jobOfferService.remove(id);
    return {
      success: true,
      message: `Job ${id} deleted successfully`,
    };
  }
}
