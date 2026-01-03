/**
 * =============================================================================
 * AI JOB-CANDIDATE MATCHING SYSTEM
 * =============================================================================
 * 
 * Main Application Entry Point
 * 
 * This is the bootstrap file for the NestJS application that initializes:
 * - Global validation pipes for request validation
 * - CORS configuration for cross-origin requests
 * - Swagger/OpenAPI documentation
 * - API routing with global prefix
 * 
 * The system uses an agentic architecture with RAG (Retrieval Augmented Generation)
 * to intelligently match job descriptions with candidate CVs.
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Bootstrap function - Initializes and starts the NestJS application
 * 
 * This function performs the following setup:
 * 1. Creates the NestJS application instance
 * 2. Configures global validation pipes for DTO validation
 * 3. Enables CORS for frontend communication
 * 4. Sets up API routing with '/api' prefix
 * 5. Generates Swagger documentation for API testing
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // Create the NestJS application instance with the root AppModule
  const app = await NestFactory.create(AppModule);
  
  // =========================================================================
  // GLOBAL VALIDATION PIPE
  // =========================================================================
  // Automatically validates incoming requests against DTOs
  // - whitelist: Strips properties not defined in DTO
  // - forbidNonWhitelisted: Throws error for unknown properties
  // - transform: Automatically transforms payloads to DTO instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // =========================================================================
  // CORS CONFIGURATION
  // =========================================================================
  // Enable Cross-Origin Resource Sharing for frontend applications
  app.enableCors();

  // =========================================================================
  // API PREFIX
  // =========================================================================
  // All routes will be prefixed with '/api' (e.g., /api/candidate, /api/job-offer)
  app.setGlobalPrefix('api');

  // =========================================================================
  // SWAGGER DOCUMENTATION
  // =========================================================================
  // Configure OpenAPI documentation for API exploration and testing
  const config = new DocumentBuilder()
    .setTitle('AI Job Matching API')
    .setDescription(
      'AI-powered job-candidate matching system using LLM agents, ' +
      'semantic search with Qdrant, and SQL queries for intelligent matching. ' +
      'Built with Google Gemini 2.5 Flash Lite for structured data extraction.'
    )
    .setVersion('1.0.0')
    .addTag('Candidate', 'Candidate CV ingestion and management endpoints')
    .addTag('Job Offer', 'Job offer processing and candidate matching endpoints')
    .addTag('Queue', 'Background job queue management endpoints')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // =========================================================================
  // START APPLICATION
  // =========================================================================
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  // Log startup information
  logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
  logger.log(`📋 Candidate endpoints: http://localhost:${port}/api/candidate`);
  logger.log(`💼 Job offer endpoints: http://localhost:${port}/api/job-offer`);
  logger.log(`📊 Queue endpoints: http://localhost:${port}/api/queue`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/docs`);
}
//Start the application
bootstrap();
