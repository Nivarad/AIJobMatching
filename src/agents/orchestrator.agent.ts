/**
 * =============================================================================
 * ORCHESTRATOR AGENT
 * =============================================================================
 * 
 * The Orchestrator Agent is the central coordinator in the agentic architecture.
 * It acts as a task router, delegating incoming tasks to the appropriate
 * specialized worker agents based on the task type.
 * 
 * Responsibilities:
 * - Route tasks to appropriate worker agents (CandidateIngestionAgent, JobProcessingAgent)
 * - Handle task results and errors
 * - Provide unified interface for all AI operations
 * 
 * Supported Task Types:
 * - ingest_cv: Process a single CV/resume file
 * - ingest_folder: Batch process multiple CVs from a folder
 * - match_job: Process a job description and find matching candidates
 * 
 * Architecture Flow:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     OrchestratorAgent                           │
 * │                     (Task Router)                               │
 * └─────────────────────────┬───────────────────────────────────────┘
 *                           │
 *           ┌───────────────┴───────────────┐
 *           ▼                               ▼
 * ┌─────────────────────┐         ┌─────────────────────┐
 * │ CandidateIngestion  │         │   JobProcessing     │
 * │      Agent          │         │      Agent          │
 * │ (CV Processing)     │         │ (Job + Matching)    │
 * └─────────────────────┘         └─────────────────────┘
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { CandidateIngestionAgent } from './candidate-ingestion.agent';
import { JobProcessingAgent } from './job-processing.agent';
import { PdfParserService } from './services/pdf-parser.service';
import { AgentProcessingResult, MatchingResult } from '../common/interfaces';
import { Job } from '../database/entities';

/**
 * Enum-like type for supported task types
 * - ingest_cv: Single CV ingestion
 * - ingest_folder: Batch CV ingestion from folder
 * - match_job: Job matching with candidates
 */
export type TaskType = 'ingest_cv' | 'ingest_folder' | 'match_job';

/**
 * Task input interface - represents a task to be executed by the orchestrator
 */
export interface OrchestratorTask {
  type: TaskType;
  data: {
    filePath?: string;      // File path for file-based processing
    folderPath?: string;    // Folder path for batch processing
    buffer?: Buffer;        // File buffer for uploaded files
    fileName?: string;      // Original filename for buffer uploads
  };
}

/**
 * Task result interface - represents the outcome of task execution
 */
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

/**
 * OrchestratorAgent - Central task coordinator
 * 
 * This injectable service acts as the main entry point for all AI operations.
 * It follows the delegation pattern, routing tasks to specialized agents
 * while providing a unified interface to the rest of the application.
 */
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
   * 
   * This method acts as a task router, examining the task type and
   * delegating to the appropriate specialized agent for processing.
   * 
   * @param task - The task to execute with type and data
   * @returns Promise<OrchestratorResult> - Result of task execution
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
   * Handle single CV ingestion task
   * 
   * Delegates to CandidateIngestionAgent for processing a single CV.
   * Supports both file path and buffer (uploaded file) inputs.
   * 
   * @param data - CV file data (either filePath or buffer+fileName)
   * @returns Promise<OrchestratorResult> - Ingestion result with candidate ID
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
   * 
   * Processes all PDF files in a given folder. This method continues
   * processing even if individual files fail, collecting successful
   * results and error information for failed files.
   * 
   * Error Handling Strategy:
   * - Individual file failures don't stop batch processing
   * - Failed files are tracked with their error messages
   * - Returns partial success with both successes and failures
   * 
   * @param data - Folder path containing CV PDFs
   * @returns Promise<OrchestratorResult> - Batch processing results
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
   * Handle job matching task
   * 
   * Delegates to JobProcessingAgent to:
   * 1. Parse the job description PDF
   * 2. Extract structured job data using LLM
   * 3. Save job to databases (PostgreSQL + Qdrant)
   * 4. Find matching candidates using dual search strategy
   * 5. Calculate sophisticated match scores
   * 
   * @param data - Job description file data
   * @returns Promise<OrchestratorResult> - Job and matching candidates
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
