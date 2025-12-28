import { IsString, IsOptional, IsArray, IsNumber, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class JobRequirementDto {
  @IsString()
  skill: string;

  @IsOptional()
  required?: boolean;

  @IsOptional()
  @IsNumber()
  minYearsExperience?: number;
}

export class SalaryRangeDto {
  @IsNumber()
  min: number;

  @IsNumber()
  max: number;

  @IsString()
  currency: string;
}

export class CreateJobDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(['full-time', 'part-time', 'contract', 'internship'])
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobRequirementDto)
  requirements?: JobRequirementDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryRangeDto)
  salaryRange?: SalaryRangeDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];
}

export class MatchCandidatesResponseDto {
  jobId: string;
  jobTitle: string;
  candidates: MatchedCandidateDto[];
  searchMetadata: {
    sqlMatchCount: number;
    vectorMatchCount: number;
    dualMatchCount: number;
  };
}

export class MatchedCandidateDto {
  candidateId: string;
  name: string;
  email: string;
  matchScore: number;
  matchSources: ('sql' | 'vector')[];
  matchDetails: {
    sqlMatch: boolean;
    vectorMatch: boolean;
    vectorScore?: number;
    llmGrade?: number;
  };
  skills: string[];
  experienceYears: number;
  summary?: string;
}
