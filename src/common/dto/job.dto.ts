import { IsString, IsOptional, IsArray, IsNumber, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobRequirementDto {
  @ApiProperty({ description: 'Required skill name', example: 'TypeScript' })
  @IsString()
  skill: string;

  @ApiPropertyOptional({ description: 'Whether this skill is required', example: true })
  @IsOptional()
  required?: boolean;

  @ApiPropertyOptional({ description: 'Minimum years of experience', example: 2 })
  @IsOptional()
  @IsNumber()
  minYearsExperience?: number;
}

export class SalaryRangeDto {
  @ApiProperty({ description: 'Minimum salary', example: 50000 })
  @IsNumber()
  min: number;

  @ApiProperty({ description: 'Maximum salary', example: 100000 })
  @IsNumber()
  max: number;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @IsString()
  currency: string;
}

export class CreateJobDto {
  @ApiProperty({ description: 'Job title', example: 'Senior Software Engineer' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Job description', example: 'We are looking for...' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Company name', example: 'Tech Corp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Job location', example: 'Remote' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ 
    description: 'Employment type', 
    enum: ['full-time', 'part-time', 'contract', 'internship'],
    example: 'full-time' 
  })
  @IsOptional()
  @IsEnum(['full-time', 'part-time', 'contract', 'internship'])
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship';

  @ApiPropertyOptional({ description: 'Job requirements', type: [JobRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobRequirementDto)
  requirements?: JobRequirementDto[];

  @ApiPropertyOptional({ description: 'Salary range', type: SalaryRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryRangeDto)
  salaryRange?: SalaryRangeDto;

  @ApiPropertyOptional({ description: 'Job benefits', example: ['Health insurance', '401k'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];
}

export class MatchedCandidateDto {
  @ApiProperty({ description: 'Candidate ID' })
  candidateId: string;

  @ApiProperty({ description: 'Candidate name' })
  name: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'Match score (0-100)', example: 85 })
  matchScore: number;

  @ApiProperty({ description: 'Sources that found this match', enum: ['sql', 'vector'] })
  matchSources: ('sql' | 'vector')[];

  @ApiProperty({ description: 'Detailed match information' })
  matchDetails: {
    sqlMatch: boolean;
    vectorMatch: boolean;
    vectorScore?: number;
    llmGrade?: number;
  };

  @ApiProperty({ description: 'Candidate skills', example: ['TypeScript', 'React'] })
  skills: string[];

  @ApiProperty({ description: 'Years of experience', example: 5 })
  experienceYears: number;

  @ApiPropertyOptional({ description: 'Professional summary' })
  summary?: string;
}

export class MatchCandidatesResponseDto {
  @ApiProperty({ description: 'Job ID' })
  jobId: string;

  @ApiProperty({ description: 'Job title' })
  jobTitle: string;

  @ApiProperty({ description: 'Matched candidates', type: [MatchedCandidateDto] })
  candidates: MatchedCandidateDto[];

  @ApiProperty({ description: 'Search metadata' })
  searchMetadata: {
    sqlMatchCount: number;
    vectorMatchCount: number;
    dualMatchCount: number;
  };
}
