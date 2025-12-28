import { IsString, IsOptional, IsArray, IsNumber, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SkillDto {
  @ApiProperty({ description: 'Name of the skill', example: 'TypeScript' })
  @IsString()
  name: string;

  @ApiProperty({ 
    description: 'Skill proficiency level', 
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    example: 'advanced' 
  })
  @IsEnum(['beginner', 'intermediate', 'advanced', 'expert'])
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';

  @ApiPropertyOptional({ description: 'Years of experience with this skill', example: 3 })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;
}

export class ExperienceDto {
  @ApiProperty({ description: 'Company name', example: 'Tech Corp' })
  @IsString()
  company: string;

  @ApiProperty({ description: 'Job title', example: 'Senior Developer' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Start date', example: '2020-01' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({ description: 'End date (null if current)', example: '2023-06' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ description: 'Job description', example: 'Led development team...' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Skills used in this role', example: ['TypeScript', 'React'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

export class EducationDto {
  @ApiProperty({ description: 'Educational institution', example: 'MIT' })
  @IsString()
  institution: string;

  @ApiProperty({ description: 'Degree obtained', example: 'Bachelor' })
  @IsString()
  degree: string;

  @ApiProperty({ description: 'Field of study', example: 'Computer Science' })
  @IsString()
  field: string;

  @ApiPropertyOptional({ description: 'Year of graduation', example: 2018 })
  @IsOptional()
  @IsNumber()
  graduationYear?: number;
}

export class CreateCandidateDto {
  @ApiProperty({ description: 'Full name of the candidate', example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email address', example: 'john@example.com' })
  @IsString()
  email: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Location', example: 'New York, USA' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'List of skills', type: [SkillDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDto)
  skills?: SkillDto[];

  @ApiPropertyOptional({ description: 'Work experience', type: [ExperienceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  experience?: ExperienceDto[];

  @ApiPropertyOptional({ description: 'Education history', type: [EducationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @ApiPropertyOptional({ description: 'Total years of experience', example: 5 })
  @IsOptional()
  @IsNumber()
  totalExperienceYears?: number;

  @ApiPropertyOptional({ description: 'Professional summary' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: 'Raw text from resume' })
  @IsOptional()
  @IsString()
  rawResumeText?: string;

  @ApiPropertyOptional({ description: 'Path to the resume file' })
  @IsOptional()
  @IsString()
  resumePath?: string;
}

export class LoadFolderDto {
  @ApiProperty({ description: 'Path to the folder containing CV files', example: '/data/cvs' })
  @IsString()
  folderPath: string;
}

export class CandidateResponseDto {
  @ApiProperty({ description: 'Candidate ID' })
  id: string;

  @ApiProperty({ description: 'Full name' })
  name: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Location' })
  location?: string;

  @ApiProperty({ description: 'Skills', type: [SkillDto] })
  skills: SkillDto[];

  @ApiProperty({ description: 'Experience', type: [ExperienceDto] })
  experience: ExperienceDto[];

  @ApiProperty({ description: 'Education', type: [EducationDto] })
  education: EducationDto[];

  @ApiProperty({ description: 'Total years of experience' })
  totalExperienceYears: number;

  @ApiPropertyOptional({ description: 'Professional summary' })
  summary?: string;

  @ApiProperty({ description: 'Candidate status' })
  status: string;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}
