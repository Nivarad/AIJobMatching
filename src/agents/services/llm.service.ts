import { Injectable, Inject, Logger } from '@nestjs/common';
import { HfInference } from '@huggingface/inference';
import { ExtractedCandidateData, ExtractedJobData } from '../../common/interfaces';

export interface LLMConfig {
  hfToken: string;
  llmModel: string;
  embeddingModel: string;
  maxCandidatesReturn: number;
  dualMatchScore: number;
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private hf: HfInference;
  private model: string;

  constructor(@Inject('LLM_CONFIG') private config: LLMConfig) {
    this.hf = new HfInference(config.hfToken);
    this.model = config.llmModel;
    this.logger.log(`LLM Service initialized with model: ${this.model}`);
  }

  /**
   * Extract structured candidate data from CV text
   */
  async extractCandidateData(cvText: string): Promise<ExtractedCandidateData> {
    const prompt = `You are an expert HR assistant that extracts structured information from resumes/CVs.
Extract all relevant information from the following CV and return it as a valid JSON object.

The JSON must follow this exact structure:
{
  "name": "Full name",
  "email": "email@example.com",
  "phone": "phone number or null",
  "location": "city, country or null",
  "summary": "A brief 2-3 sentence professional summary optimized for semantic search, focusing on key skills, experience level, and expertise areas",
  "skills": [
    {"name": "Skill Name", "level": "beginner|intermediate|advanced|expert", "yearsOfExperience": number or null}
  ],
  "experience": [
    {"company": "Company Name", "title": "Job Title", "startDate": "YYYY-MM", "endDate": "YYYY-MM or null", "description": "Brief description", "skills": ["skill1", "skill2"]}
  ],
  "education": [
    {"institution": "University Name", "degree": "Degree Type", "field": "Field of Study", "graduationYear": number or null}
  ],
  "totalExperienceYears": number
}

IMPORTANT:
- Return ONLY the JSON object, no additional text
- Use null for missing optional fields
- For skill levels, estimate based on years of experience: <1 year = beginner, 1-3 years = intermediate, 3-5 years = advanced, 5+ years = expert
- Calculate totalExperienceYears from the work experience entries
- The summary should be keyword-rich for semantic search

CV TEXT:
${cvText}

JSON:`;

    try {
      const response = await this.hf.textGeneration({
        model: this.model,
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          temperature: 0.1,
          return_full_text: false,
        },
      });

      const jsonStr = this.extractJsonFromResponse(response.generated_text);
      const data = JSON.parse(jsonStr) as ExtractedCandidateData;

      this.logger.log(`Extracted candidate data for: ${data.name}`);
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
Extract all relevant information from the following job description and return it as a valid JSON object.

The JSON must follow this exact structure:
{
  "title": "Job Title",
  "description": "Full job description",
  "company": "Company Name or null",
  "location": "Location or null",
  "employmentType": "full-time|part-time|contract|internship",
  "summary": "A brief 2-3 sentence summary of the role optimized for semantic search, focusing on key requirements, technologies, and responsibilities",
  "requirements": [
    {"skill": "Required Skill", "required": true|false, "minYearsExperience": number or null}
  ],
  "salaryRange": {"min": number, "max": number, "currency": "USD"} or null,
  "benefits": ["benefit1", "benefit2"] or null
}

IMPORTANT:
- Return ONLY the JSON object, no additional text
- Use null for missing optional fields
- Mark skills as required: true if they are mandatory
- The summary should be keyword-rich for semantic search

JOB DESCRIPTION:
${jobText}

JSON:`;

    try {
      const response = await this.hf.textGeneration({
        model: this.model,
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          temperature: 0.1,
          return_full_text: false,
        },
      });

      const jsonStr = this.extractJsonFromResponse(response.generated_text);
      const data = JSON.parse(jsonStr) as ExtractedJobData;

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

Provide a match grade from 0-100 and brief reasoning.
Return ONLY a JSON object in this format:
{"grade": number, "reasoning": "Brief explanation"}

JSON:`;

    try {
      const response = await this.hf.textGeneration({
        model: this.model,
        inputs: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.3,
          return_full_text: false,
        },
      });

      const jsonStr = this.extractJsonFromResponse(response.generated_text);
      return JSON.parse(jsonStr);
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
    const prompt =
      type === 'candidate'
        ? `Create a concise, keyword-rich summary (under 200 words) optimized for semantic search for this candidate profile:
Name: ${data.name}
Skills: ${data.skills?.map((s) => s.name).join(', ') || 'Not specified'}
Experience: ${JSON.stringify(data.experience || [])}
Education: ${JSON.stringify(data.education || [])}

Focus on: technologies, skills, industries, achievements, role types, and experience level.
Return ONLY the summary text, no JSON or formatting.`
        : `Create a concise, keyword-rich summary (under 200 words) optimized for semantic search for this job:
Title: ${data.title}
Requirements: ${data.requirements?.map((r) => r.skill).join(', ') || 'Not specified'}
Description: ${data.description}

Focus on: required skills, technologies, responsibilities, and ideal candidate profile.
Return ONLY the summary text, no JSON or formatting.`;

    try {
      const response = await this.hf.textGeneration({
        model: this.model,
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.3,
          return_full_text: false,
        },
      });

      return response.generated_text.trim();
    } catch (error) {
      this.logger.error('Failed to generate search summary', error);
      return type === 'candidate'
        ? `${data.name} - ${data.skills?.map((s) => s.name).join(', ') || 'Professional'}`
        : `${data.title} - ${data.requirements?.map((r) => r.skill).join(', ') || 'Various skills required'}`;
    }
  }

  /**
   * Extract JSON from LLM response (handles markdown code blocks)
   */
  private extractJsonFromResponse(response: string): string {
    // Try to find JSON in markdown code block
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find JSON object directly
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    // Return as-is and hope for the best
    return response.trim();
  }
}
