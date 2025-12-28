import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { VectorModule } from './vector/vector.module';
import { QueueModule } from './queue/queue.module';
import { CandidateModule } from './candidate/candidate.module';
import { JobOfferModule } from './job-offer/job-offer.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Infrastructure modules
    DatabaseModule,
    VectorModule,
    QueueModule,
    
    // Feature modules
    AgentsModule,
    CandidateModule,
    JobOfferModule,
  ],
})
export class AppModule {}
