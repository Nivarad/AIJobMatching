import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { CandidateIngestionProcessor } from './processors/candidate-ingestion.processor';
import { AgentsModule } from '../agents/agents.module';

export const CANDIDATE_INGESTION_QUEUE = 'candidate-ingestion';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({
      name: CANDIDATE_INGESTION_QUEUE,
    }),
    AgentsModule,
  ],
  controllers: [QueueController],
  providers: [QueueService, CandidateIngestionProcessor],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
