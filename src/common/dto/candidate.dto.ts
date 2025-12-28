import { IsString, IsOptional, IsArray, IsNumber, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SkillDto {
  @IsString()
  name: string;

  @IsEnum(['beginner', 'intermediate', 'advanced', 'expert'])
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';

  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;
}

export class ExperienceDto {
  @IsString()
  company: string;

  @IsString()
  title: string;

  @IsString()
  startDate: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

export class EducationDto {
  @IsString()
  institution: string;

  @IsString()
  degree: string;

  @IsString()
  field: string;

  @IsOptional()
  @IsNumber()
  graduationYear?: number;
}

export class CreateCandidateDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillDto)
  skills?: SkillDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperienceDto)
  experience?: ExperienceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationDto)
  education?: EducationDto[];

  @IsOptional()
  @IsNumber()
  totalExperienceYears?: number;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  rawResumeText?: string;

  @IsOptional()
  @IsString()
  resumePath?: string;
}

export class LoadFolderDto {
  @IsString()
  folderPath: string;
}

export class CandidateResponseDto {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  skills: SkillDto[];
  experience: ExperienceDto[];
  education: EducationDto[];
  totalExperienceYears: number;
  summary?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
