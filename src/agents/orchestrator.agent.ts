import { Injectable, Logger } from '@nestjs/common';
import { CandidateIngestionAgent } from './candidate-ingestion.agent';
import { JobProcessingAgent } from './job-processing.agent';
import { PdfParserService } from './services/pdf-parser.service';
import { AgentProcessingResult, MatchingResult } from '../common/interfaces';
import { Job } from '../database/entities';

export type TaskType = 'ingest_cv' | 'ingest_folder' | 'match_job';

export interface OrchestratorTask {
  type: TaskType;
  data: {
    filePath?: string;
    folderPath?: string;
    buffer?: Buffer;
    fileName?: string;
  };
}

export interface OrchestratorResult {
  success: boolean;
  taskType: TaskType;
  results?: {
    // For CV ingestion
    candidateId?: string;
    candidateIds?: string[];
    failedFiles?: { filePath: string; error: string }[];

    // For job matching
    job?: Job;
    candidates?: MatchingResult[];
    searchMetadata?: {
      sqlMatchCount: number;
      vectorMatchCount: number;
      dualMatchCount: number;
    };
  };
  error?: string;
}

@Injectable()
export class OrchestratorAgent {
  private readonly logger = new Logger(OrchestratorAgent.name);

  constructor(
    private readonly candidateIngestionAgent: CandidateIngestionAgent,
    private readonly jobProcessingAgent: JobProcessingAgent,
    private readonly pdfParserService: PdfParserService,
  ) {}

  /**
   * Main entry point - delegates tasks to appropriate worker agents
   */
  async executeTask(task: OrchestratorTask): Promise<OrchestratorResult> {
    this.logger.log(`Orchestrator received task: ${task.type}`);

    switch (task.type) {
      case 'ingest_cv':
        return this.handleCVIngestion(task.data);

      case 'ingest_folder':
        return this.handleFolderIngestion(task.data);

      case 'match_job':
        return this.handleJobMatching(task.data);

      default:
        return {
          success: false,
          taskType: task.type,
          error: `Unknown task type: ${task.type}`,
        };
    }
  }

  /**
   * Handle single CV ingestion
   */
  private async handleCVIngestion(data: {
    filePath?: string;
    buffer?: Buffer;
    fileName?: string;
  }): Promise<OrchestratorResult> {
    try {
      let result: AgentProcessingResult;

      if (data.buffer && data.fileName) {
        // Process from buffer (uploaded file)
        result = await this.candidateIngestionAgent.processCVFromBuffer(
          data.buffer,
          data.fileName,
        );
      } else if (data.filePath) {
        // Process from file path
        result = await this.candidateIngestionAgent.processCV(data.filePath);
      } else {
        return {
          success: false,
          taskType: 'ingest_cv',
          error: 'No file path or buffer provided',
        };
      }

      return {
        success: result.success,
        taskType: 'ingest_cv',
        results: {
          candidateId: result.candidateId,
        },
        error: result.error,
      };
    } catch (error) {
      this.logger.error('CV ingestion failed', error);
      return {
        success: false,
        taskType: 'ingest_cv',
        error: error.message,
      };
    }
  }

  /**
   * Handle folder ingestion (batch processing)
   * Continues on failures and returns partial results
   */
  private async handleFolderIngestion(data: {
    folderPath?: string;
  }): Promise<OrchestratorResult> {
    if (!data.folderPath) {
      return {
        success: false,
        taskType: 'ingest_folder',
        error: 'No folder path provided',
      };
    }

    try {
      // Get all PDF files from folder
      const pdfFiles = await this.pdfParserService.getPdfFilesFromFolder(
        data.folderPath,
      );

      if (pdfFiles.length === 0) {
        return {
          success: true,
          taskType: 'ingest_folder',
          results: {
            candidateIds: [],
            failedFiles: [],
          },
        };
      }

      const candidateIds: string[] = [];
      const failedFiles: { filePath: string; error: string }[] = [];

      // Process each file - continue on failures
      for (const filePath of pdfFiles) {
        try {
          this.logger.log(`Processing: ${filePath}`);
          const result = await this.candidateIngestionAgent.processCV(filePath);

          if (result.success && result.candidateId) {
            candidateIds.push(result.candidateId);
          } else {
            failedFiles.push({
              filePath,
              error: result.error || 'Unknown error',
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to process ${filePath}: ${error.message}`);
          failedFiles.push({
            filePath,
            error: error.message,
          });
        }
      }

      this.logger.log(
        `Folder ingestion complete: ${candidateIds.length} success, ${failedFiles.length} failed`,
      );

      return {
        success: true,
        taskType: 'ingest_folder',
        results: {
          candidateIds,
          failedFiles,
        },
      };
    } catch (error) {
      this.logger.error('Folder ingestion failed', error);
      return {
        success: false,
        taskType: 'ingest_folder',
        error: error.message,
      };
    }
  }

  /**
   * Handle job matching
   */
  private async handleJobMatching(data: {
    filePath?: string;
    buffer?: Buffer;
    fileName?: string;
  }): Promise<OrchestratorResult> {
    try {
      let result: {
        job: Job;
        candidates: MatchingResult[];
        searchMetadata: {
          sqlMatchCount: number;
          vectorMatchCount: number;
          dualMatchCount: number;
        };
      };

      if (data.buffer && data.fileName) {
        // Process from buffer
        result = await this.jobProcessingAgent.processJobFromBuffer(
          data.buffer,
          data.fileName,
        );
      } else if (data.filePath) {
        // Process from file path
        result = await this.jobProcessingAgent.processJobAndMatch(data.filePath);
      } else {
        return {
          success: false,
          taskType: 'match_job',
          error: 'No file path or buffer provided',
        };
      }

      return {
        success: true,
        taskType: 'match_job',
        results: {
          job: result.job,
          candidates: result.candidates,
          searchMetadata: result.searchMetadata,
        },
      };
    } catch (error) {
      this.logger.error('Job matching failed', error);
      return {
        success: false,
        taskType: 'match_job',
        error: error.message,
      };
    }
  }
}
