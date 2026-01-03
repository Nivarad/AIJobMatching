import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Candidate, Job } from '../database/entities';
import { VectorModule } from '../vector/vector.module';

// Services
import { LLMService } from './services/llm.service';
import { EmbeddingService } from './services/embedding.service';
import { PdfParserService } from './services/pdf-parser.service';

// Agents
import { CandidateIngestionAgent } from './candidate-ingestion.agent';
import { JobProcessingAgent } from './job-processing.agent';
import { OrchestratorAgent } from './orchestrator.agent';

// Tools
import { PostgresQueryTool } from './tools/postgres-query.tool';
import { VectorSearchTool } from './tools/vector-search.tool';
import { MatchingGradeTool } from './tools/matching-grade.tool';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Candidate, Job]),
    VectorModule,
  ],
  providers: [
    // Configuration
    {
      provide: 'LLM_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        geminiApiKey: configService.get<string>('GEMINI_API_KEY'),
        llmModel: configService.get<string>(
          'LLM_MODEL',
          'gemini-2.5-flash-lite',
        ),
        embeddingModel: configService.get<string>(
          'EMBEDDING_MODEL',
          'text-embedding-004',
        ),
        maxCandidatesReturn: configService.get<number>(
          'MAX_CANDIDATES_RETURN',
          5,
        ),
        dualMatchScore: configService.get<number>('DUAL_MATCH_SCORE', 100),
      }),
    },

    // Services
    LLMService,
    EmbeddingService,
    PdfParserService,

    // Tools
    PostgresQueryTool,
    VectorSearchTool,
    MatchingGradeTool,

    // Agents
    CandidateIngestionAgent,
    JobProcessingAgent,
    OrchestratorAgent,
  ],
  exports: [
    LLMService,
    EmbeddingService,
    PdfParserService,
    CandidateIngestionAgent,
    JobProcessingAgent,
    OrchestratorAgent,
    PostgresQueryTool,
    VectorSearchTool,
    MatchingGradeTool,
  ],
})
export class AgentsModule {}
