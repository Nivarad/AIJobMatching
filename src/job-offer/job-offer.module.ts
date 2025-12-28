import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobOfferController } from './job-offer.controller';
import { JobOfferService } from './job-offer.service';
import { Job } from '../database/entities';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    AgentsModule,
  ],
  controllers: [JobOfferController],
  providers: [JobOfferService],
  exports: [JobOfferService],
})
export class JobOfferModule {}
