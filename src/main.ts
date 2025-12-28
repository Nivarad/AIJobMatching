import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create(AppModule);
  
  // Global validation pipe
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

  // Enable CORS
  app.enableCors();

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('AI Job Matching API')
    .setDescription('API for AI-powered job candidate matching')
    .setVersion('1.0.0')
    .addTag('Candidate', 'Candidate management endpoints')
    .addTag('Job Offer', 'Job offer management endpoints')
    .addTag('Queue', 'Queue management endpoints')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
  logger.log(`📋 Candidate endpoints: http://localhost:${port}/api/candidate`);
  logger.log(`💼 Job offer endpoints: http://localhost:${port}/api/job-offer`);
  logger.log(`📊 Queue endpoints: http://localhost:${port}/api/queue`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/docs`);
}

bootstrap();
