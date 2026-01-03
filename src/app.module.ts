/**
 * =============================================================================
 * APP MODULE - Root Application Module
 * =============================================================================
 * 
 * This is the root module of the AI Job Matching application. It orchestrates
 * all feature modules and infrastructure components.
 * 
 * Module Structure:
 * - ConfigModule: Environment configuration management (.env file)
 * - DatabaseModule: PostgreSQL connection for relational data storage
 * - VectorModule: Qdrant vector database for semantic search
 * - AgentsModule: AI agents for CV/job processing and matching
 * - CandidateModule: Candidate CRUD and CV ingestion endpoints
 * - JobOfferModule: Job offer processing and matching endpoints
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { VectorModule } from './vector/vector.module';
import { CandidateModule } from './candidate/candidate.module';
import { JobOfferModule } from './job-offer/job-offer.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    // =========================================================================
    // GLOBAL CONFIGURATION
    // =========================================================================
    // Loads environment variables from .env file and makes them available
    // throughout the application via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // =========================================================================
    // INFRASTRUCTURE MODULES
    // =========================================================================
    // DatabaseModule: PostgreSQL connection for storing candidates, jobs, etc.
    // VectorModule: Qdrant vector database for embedding storage and search
    DatabaseModule,
    VectorModule,
    
    // =========================================================================
    // FEATURE MODULES
    // =========================================================================
    // AgentsModule: AI agents (orchestrator, ingestion, matching)
    // CandidateModule: Candidate management and CV processing
    // JobOfferModule: Job offer management and candidate matching
    AgentsModule,
    CandidateModule,
    JobOfferModule,
  ],
})
export class AppModule {}
