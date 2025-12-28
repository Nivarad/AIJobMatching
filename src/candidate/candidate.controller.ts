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
import { CandidateService } from './candidate.service';
import { LoadFolderDto } from '../common/dto';

@Controller('candidate')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  /**
   * POST /api/candidate/load
   * Upload and process a single CV PDF file
   */
  @Post('load')
  @UseInterceptors(FileInterceptor('file'))
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
  async getStats() {
    return await this.candidateService.getStats();
  }

  /**
   * GET /api/candidate/:id
   * Get a specific candidate by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.candidateService.findOne(id);
  }

  /**
   * DELETE /api/candidate/:id
   * Delete a candidate
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.candidateService.remove(id);
    return {
      success: true,
      message: `Candidate ${id} deleted successfully`,
    };
  }
}
