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
        port: parseInt(configService.get<string>('QDRANT_PORT', '6333'), 10),
        candidatesCollection: configService.get<string>(
          'QDRANT_CANDIDATES_COLLECTION',
          'candidates',
        ),
        jobsCollection: configService.get<string>(
          'QDRANT_JOBS_COLLECTION',
          'jobs',
        ),
        embeddingDimensions: parseInt(
          configService.get<string>('EMBEDDING_DIMENSIONS', '768'),
          10,
        ),
      }),
    },
    VectorService,
  ],
  exports: [VectorService],
})
export class VectorModule {}
