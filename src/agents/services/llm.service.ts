import { Injectable, Inject, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  ExtractedCandidateData,
  ExtractedJobData,
} from '../../common/interfaces';

export interface LLMConfig {
  geminiApiKey: string;
  llmModel: string;
  embeddingModel: string;
  maxCandidatesReturn: number;
  dualMatchScore: number;
}

// Zod Schemas for Structured Output
const ExperienceLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

const SkillSchema = z.object({
  name: z.string().describe('Name of the skill'),
  level: ExperienceLevelSchema.describe('Proficiency level of the skill'),
  yearsOfExperience: z
    .number()
    .nullable()
    .describe('Years of experience with this skill'),
});

const WorkExperienceSchema = z.object({
  company: z.string().describe('Company name'),
  title: z.string().describe('Job title'),
  startDate: z.string().describe('Start date in YYYY-MM format'),
  endDate: z.string().nullable().describe('End date in YYYY-MM format or null if current'),
  description: z.string().describe('Brief description of responsibilities'),
  skills: z.array(z.string()).describe('Skills used in this role'),
});

const EducationSchema = z.object({
  institution: z.string().describe('Name of the educational institution'),
  degree: z.string().describe('Type of degree'),
  field: z.string().describe('Field of study'),
  graduationYear: z.number().nullable().describe('Year of graduation'),
});

const CandidateExtractionSchema = z.object({
  name: z.string().nullable().describe('Full name of the candidate'),
  email: z.string().nullable().describe('Email address'),
  phone: z.string().nullable().describe('Phone number'),
  location: z.string().nullable().describe('Location/city'),
  summary: z
    .string()
    .describe('Keyword-rich professional summary for semantic search'),
  skills: z.array(SkillSchema).describe('List of skills'),
  experience: z.array(WorkExperienceSchema).describe('Work experience history'),
  education: z.array(EducationSchema).describe('Educational background'),
  totalExperienceYears: z
    .number()
    .describe('Total years of professional experience'),
});

const JobRequirementSchema = z.object({
  skill: z.string().describe('Required skill name'),
  required: z.boolean().describe('True if mandatory, false if preferred'),
  minYearsExperience: z
    .number()
    .nullable()
    .describe('Minimum years of experience required'),
});

const SalaryRangeSchema = z.object({
  min: z.number().describe('Minimum salary'),
  max: z.number().describe('Maximum salary'),
  currency: z.string().describe('Currency code (e.g., USD)'),
});

const JobExtractionSchema = z.object({
  title: z.string().describe('Job title'),
  description: z.string().describe('Brief job description'),
  company: z.string().nullable().describe('Company name'),
  location: z.string().nullable().describe('Job location'),
  employmentType: z
    .enum(['full-time', 'part-time', 'contract', 'internship'])
    .describe('Type of employment'),
  summary: z
    .string()
    .describe('Keyword-rich summary for semantic search'),
  requirements: z.array(JobRequirementSchema).describe('Job requirements'),
  salaryRange: SalaryRangeSchema.nullable().describe('Salary range if specified'),
  benefits: z.array(z.string()).nullable().describe('List of benefits'),
});

const MatchGradeSchema = z.object({
  grade: z
    .number()
    .min(0)
    .max(100)
    .describe('Match score from 0-100'),
  reasoning: z.string().describe('Explanation of the match score'),
});

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(@Inject('LLM_CONFIG') private config: LLMConfig) {
    this.modelName = config.llmModel;
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    this.logger.log(`LLM Service initialized with model: ${this.modelName}`);
  }

  /**
   * Extract structured candidate data from CV text
   */
  async extractCandidateData(cvText: string): Promise<ExtractedCandidateData> {
    const prompt = `You are an expert HR assistant that extracts structured information from resumes/CVs.
Extract all relevant information from the following CV.

INSTRUCTIONS:
- Use null for missing optional fields
- For skill levels, estimate based on years: <1 year = beginner, 1-3 years = intermediate, 3-5 years = advanced, 5+ years = expert
- Calculate totalExperienceYears from work experience entries
- The summary should be keyword-rich for semantic search

CV TEXT:
${cvText}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: zodToJsonSchema(CandidateExtractionSchema as any) as any,
          temperature: 0.1,
        },
      });

      const data = CandidateExtractionSchema.parse(
        JSON.parse(response.text as string),
      ) as ExtractedCandidateData;

      this.logger.log(
        `Extracted candidate data for: ${data.name || 'Unknown'}`,
      );
      return data;
    } catch (error) {
      this.logger.error('Failed to extract candidate data', error);
      throw new Error(`Failed to extract candidate data: ${error.message}`);
    }
  }

  /**
   * Extract structured job data from job description text
   */
  async extractJobData(jobText: string): Promise<ExtractedJobData> {
    const prompt = `You are an expert HR assistant that extracts structured information from job descriptions.
Extract all relevant information from the following job description.

INSTRUCTIONS:
- Use null for missing optional fields
- Mark skills as required: true if mandatory, false if preferred/nice-to-have
- The summary should be keyword-rich for semantic search

JOB DESCRIPTION:
${jobText}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: zodToJsonSchema(JobExtractionSchema as any) as any,
          temperature: 0.1,
        },
      });

      const data = JobExtractionSchema.parse(
        JSON.parse(response.text as string),
      ) as ExtractedJobData;

      this.logger.log(`Extracted job data for: ${data.title}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to extract job data', error);
      throw new Error(`Failed to extract job data: ${error.message}`);
    }
  }

  /**
   * Generate a matching grade between a candidate and job
   */
  async generateMatchingGrade(
    candidateSummary: string,
    candidateSkills: string[],
    jobSummary: string,
    jobRequirements: string[],
  ): Promise<{ grade: number; reasoning: string }> {
    const prompt = `You are an expert HR matching system. Evaluate how well a candidate matches a job based on their profiles.

CANDIDATE:
Summary: ${candidateSummary}
Skills: ${candidateSkills.join(', ')}

JOB:
Summary: ${jobSummary}
Required Skills: ${jobRequirements.join(', ')}

Evaluate the match and provide a grade from 0-100 with reasoning.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: zodToJsonSchema(MatchGradeSchema as any) as any,
          temperature: 0.1,
        },
      });

      const result = MatchGradeSchema.parse(
        JSON.parse(response.text as string),
      );

      this.logger.log(`Generated match grade: ${result.grade}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to generate matching grade', error);
      return { grade: 50, reasoning: 'Unable to determine match quality' };
    }
  }

  /**
   * Generate a search-optimized summary
   */
  async generateSearchSummary(
    type: 'candidate' | 'job',
    data: any,
  ): Promise<string> {
    if (type === 'candidate') {
      const prompt = `Create a concise, keyword-rich summary (under 200 words) optimized for semantic search for a candidate profile.

INSTRUCTIONS:
- Return ONLY the summary text starting directly with content
- Start directly with content like: "Senior developer with..." or "Experienced professional..."
- Focus on: technologies, skills, industries, achievements, role types, and experience level

Candidate Information:
Name: ${data.name || 'Not specified'}
Skills: ${data.skills?.map((s: any) => s.name).join(', ') || 'Not specified'}
Experience: ${JSON.stringify(data.experience || [])}
Education: ${JSON.stringify(data.education || [])}`;

      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            temperature: 0.3,
          },
        });

        const summary = (response.text as string).trim();

        // Clean up any remaining prefixes
        const cleanedSummary = summary
          .replace(/^(here is the summary:?|summary:?)\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim();

        return cleanedSummary;
      } catch (error) {
        this.logger.error('Failed to generate candidate search summary', error);
        return `${data.name || 'Candidate'} - ${data.skills?.map((s: any) => s.name).join(', ') || 'Professional'}`;
      }
    } else {
      const prompt = `Create a concise, keyword-rich summary (under 200 words) optimized for semantic search for a job posting.

INSTRUCTIONS:
- Return ONLY the summary text starting directly with content
- Start directly with content like: "Position requires..." or "Seeking experienced..."
- Focus on: required skills, technologies, responsibilities, and ideal candidate profile

Job Information:
Title: ${data.title}
Requirements: ${data.requirements?.map((r: any) => r.skill).join(', ') || 'Not specified'}
Description: ${data.description}`;

      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: prompt,
          config: {
            temperature: 0.3,
          },
        });

        const summary = (response.text as string).trim();

        // Clean up any remaining prefixes
        const cleanedSummary = summary
          .replace(/^(here is the summary:?|summary:?)\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim();

        return cleanedSummary;
      } catch (error) {
        this.logger.error('Failed to generate job search summary', error);
        return `${data.title} - ${data.requirements?.map((r: any) => r.skill).join(', ') || 'Various skills required'}`;
      }
    }
  }
}
