import {
  Controller,
  Get,
  Post,
  Delete,
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
import { CandidateService } from './candidate.service';
import { LoadFolderDto } from '../common/dto';

@ApiTags('Candidate')
@Controller('candidate')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  /**
   * POST /api/candidate/load
   * Upload and process a single CV PDF file
   */
  @Post('load')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload CV', description: 'Upload and process a single CV PDF file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF file of the CV',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'CV processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or no file uploaded' })
  async loadCV(@UploadedFile() file: Express.Multer.File) {
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
      const result = await this.candidateService.loadCVFromBuffer(
        file.buffer,
        file.originalname,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process CV',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /api/candidate/load_folder
   * Process all CVs from a server-side folder path
   */
  @Post('load_folder')
  @ApiOperation({ summary: 'Load CVs from folder', description: 'Process all CVs from a server-side folder path' })
  @ApiResponse({ status: 200, description: 'Folder processed successfully' })
  @ApiResponse({ status: 400, description: 'folderPath is required' })
  async loadFolder(@Body() dto: LoadFolderDto) {
    if (!dto.folderPath) {
      throw new HttpException(
        'folderPath is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.candidateService.loadFolder(dto.folderPath);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process folder',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /api/candidate
   * Get all candidates with pagination
   */
  @Get()
  @ApiOperation({ summary: 'Get all candidates', description: 'Get all candidates with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page', example: 20 })
  @ApiResponse({ status: 200, description: 'List of candidates' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return await this.candidateService.findAll(page, limit);
  }

  /**
   * GET /api/candidate/stats
   * Get candidate statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get statistics', description: 'Get candidate statistics' })
  @ApiResponse({ status: 200, description: 'Candidate statistics' })
  async getStats() {
    return await this.candidateService.getStats();
  }

  /**
   * GET /api/candidate/:id
   * Get a specific candidate by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get candidate by ID', description: 'Get a specific candidate by ID' })
  @ApiParam({ name: 'id', description: 'Candidate ID' })
  @ApiResponse({ status: 200, description: 'Candidate details' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async findOne(@Param('id') id: string) {
    return await this.candidateService.findOne(id);
  }

  /**
   * DELETE /api/candidate/:id
   * Delete a candidate
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete candidate', description: 'Delete a candidate' })
  @ApiParam({ name: 'id', description: 'Candidate ID' })
  @ApiResponse({ status: 200, description: 'Candidate deleted successfully' })
  @ApiResponse({ status: 404, description: 'Candidate not found' })
  async remove(@Param('id') id: string) {
    await this.candidateService.remove(id);
    return {
      success: true,
      message: `Candidate ${id} deleted successfully`,
    };
  }
}
