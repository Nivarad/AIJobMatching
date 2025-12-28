import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VectorService } from './vector.service';

@Global()
@Module({
  providers: [
    {
      provide: 'QDRANT_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        host: configService.get<string>('QDRANT_HOST', 'localhost'),
        port: configService.get<number>('QDRANT_PORT', 6333),
        candidatesCollection: configService.get<string>(
          'QDRANT_CANDIDATES_COLLECTION',
          'candidates',
        ),
        jobsCollection: configService.get<string>(
          'QDRANT_JOBS_COLLECTION',
          'jobs',
        ),
        embeddingDimensions: configService.get<number>(
          'EMBEDDING_DIMENSIONS',
          384,
        ),
      }),
    },
    VectorService,
  ],
  exports: [VectorService],
})
export class VectorModule {}
