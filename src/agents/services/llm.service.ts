import { Injectable, Inject, Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { ExtractedCandidateData, ExtractedJobData } from '../../common/interfaces';

export interface LLMConfig {
  geminiApiKey: string;
  llmModel: string;
  embeddingModel: string;
  maxCandidatesReturn: number;
  dualMatchScore: number;
}

// Zod Schemas for Structured Output

const ExperienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);

const SkillSchema = z.object({
  name: z.string(),
  level: ExperienceLevelSchema,
  yearsOfExperience: z.number().nullable(),
});

const WorkExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  description: z.string(),
  skills: z.array(z.string()),
});

const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  graduationYear: z.number().nullable(),
});

const CandidateExtractionSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string(),
  skills: z.array(SkillSchema),
  experience: z.array(WorkExperienceSchema),
  education: z.array(EducationSchema),
  totalExperienceYears: z.number(),
});

const JobRequirementSchema = z.object({
  skill: z.string(),
  required: z.boolean(),
  minYearsExperience: z.number().nullable(),
});

const SalaryRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  currency: z.string(),
});

const JobExtractionSchema = z.object({
  title: z.string(),
  description: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']),
  summary: z.string(),
  requirements: z.array(JobRequirementSchema),
  salaryRange: SalaryRangeSchema.nullable(),
  benefits: z.array(z.string()).nullable(),
});

const MatchGradeSchema = z.object({
  grade: z.number().min(0).max(100),
  reasoning: z.string(),
});

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private llm: ChatGoogleGenerativeAI;
  private model: string;

  constructor(@Inject('LLM_CONFIG') private config: LLMConfig) {
    this.model = config.llmModel;
    this.llm = new ChatGoogleGenerativeAI({
      apiKey: config.geminiApiKey,
      model: this.model,
      temperature: 0.1,
    });
    this.logger.log(`LLM Service initialized with model: ${this.model}`);
  }

  /**
   * Extract structured candidate data from CV text
   */
  async extractCandidateData(cvText: string): Promise<ExtractedCandidateData> {
    const systemTemplate = `You are an expert HR assistant that extracts structured information from resumes/CVs.
Extract all relevant information from the following CV and return it as a valid JSON object.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON matching the schema
- NO additional text, NO markdown formatting, NO explanations
- Use null for missing optional fields
- For skill levels, estimate based on years: <1 year = beginner, 1-3 years = intermediate, 3-5 years = advanced, 5+ years = expert
- Calculate totalExperienceYears from work experience entries
- The summary should be keyword-rich for semantic search`;

    const userTemplate = `EXAMPLE 1:
CV: "John Doe, john@example.com, 555-1234. Senior Software Engineer with 8 years of experience in Python and JavaScript. Worked at TechCorp (2018-2023) as Full Stack Developer, built microservices. Bachelor's in Computer Science from MIT, 2015."
JSON: {{"name": "John Doe", "email": "john@example.com", "phone": "555-1234", "location": null, "summary": "Senior Software Engineer with 8 years of experience specializing in Python, JavaScript, and microservices architecture. Full stack development background with proven track record at TechCorp.", "skills": [{{"name": "Python", "level": "expert", "yearsOfExperience": 8}}, {{"name": "JavaScript", "level": "expert", "yearsOfExperience": 8}}], "experience": [{{"company": "TechCorp", "title": "Full Stack Developer", "startDate": "2018-01", "endDate": "2023-12", "description": "Built microservices", "skills": ["Python", "JavaScript"]}}], "education": [{{"institution": "MIT", "degree": "Bachelor's", "field": "Computer Science", "graduationYear": 2015}}], "totalExperienceYears": 8}}

EXAMPLE 2:
CV: "Sarah Lee, sarah.lee@email.com. Data Scientist at DataCo since 2021. PhD in Statistics from Stanford 2020. Expert in machine learning, R, Python. Previous: Analyst at FinTech Ltd 2018-2021."
JSON: {{"name": "Sarah Lee", "email": "sarah.lee@email.com", "phone": null, "location": null, "summary": "Data Scientist with PhD in Statistics and 6 years of experience in machine learning, Python, and R. Currently at DataCo with background in financial analytics.", "skills": [{{"name": "Machine Learning", "level": "expert", "yearsOfExperience": 6}}, {{"name": "Python", "level": "expert", "yearsOfExperience": 6}}, {{"name": "R", "level": "expert", "yearsOfExperience": 6}}], "experience": [{{"company": "DataCo", "title": "Data Scientist", "startDate": "2021-01", "endDate": null, "description": "Machine learning and data analysis", "skills": ["Machine Learning", "Python", "R"]}}, {{"company": "FinTech Ltd", "title": "Analyst", "startDate": "2018-01", "endDate": "2021-12", "description": "Financial data analysis", "skills": ["Python", "R"]}}], "education": [{{"institution": "Stanford", "degree": "PhD", "field": "Statistics", "graduationYear": 2020}}], "totalExperienceYears": 6}}

NOW EXTRACT FROM THIS CV:
{cvText}`;

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemTemplate],
      ["user", userTemplate],
    ]);

    try {
      const formattedPrompt = await promptTemplate.invoke({ cvText });
      const structuredLlm = this.llm.withStructuredOutput(CandidateExtractionSchema);
      const data = await structuredLlm.invoke(formattedPrompt);
      
      this.logger.log(`Extracted candidate data for: ${data.name}`);
      return data as ExtractedCandidateData;
    } catch (error) {
      this.logger.error('Structured output failed, attempting fallback parsing', error);
      
      try {
        // Fallback: try raw text generation and parse JSON
        const formattedPrompt = await promptTemplate.invoke({ cvText });
        const response = await this.llm.invoke(formattedPrompt);
        const jsonStr = this.extractJsonFromResponse(response.content.toString());
        const data = JSON.parse(jsonStr) as ExtractedCandidateData;
        
        this.logger.log(`Extracted candidate data (fallback) for: ${data.name}`);
        return data;
      } catch (fallbackError) {
        this.logger.error('Failed to extract candidate data', fallbackError);
        throw new Error(`Failed to extract candidate data: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Extract structured job data from job description text
   */
  async extractJobData(jobText: string): Promise<ExtractedJobData> {
    const systemTemplate = `You are an expert HR assistant that extracts structured information from job descriptions.
Extract all relevant information from the following job description and return it as a valid JSON object.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON matching the schema
- NO additional text, NO markdown formatting, NO explanations
- Use null for missing optional fields
- Mark skills as required: true if mandatory, false if preferred/nice-to-have
- The summary should be keyword-rich for semantic search`;

    const userTemplate = `EXAMPLE 1:
JOB: "Senior Backend Engineer at TechStartup. Full-time position in San Francisco. We need 5+ years Python experience, Docker, Kubernetes required. AWS nice to have. Build scalable microservices. Salary $150k-$200k. Benefits: health insurance, 401k."
JSON: {{"title": "Senior Backend Engineer", "description": "Build scalable microservices", "company": "TechStartup", "location": "San Francisco", "employmentType": "full-time", "summary": "Senior Backend Engineer role requiring 5+ years Python experience, Docker, and Kubernetes expertise. Focus on building scalable microservices architecture at TechStartup in San Francisco.", "requirements": [{{"skill": "Python", "required": true, "minYearsExperience": 5}}, {{"skill": "Docker", "required": true, "minYearsExperience": null}}, {{"skill": "Kubernetes", "required": true, "minYearsExperience": null}}, {{"skill": "AWS", "required": false, "minYearsExperience": null}}], "salaryRange": {{"min": 150000, "max": 200000, "currency": "USD"}}, "benefits": ["health insurance", "401k"]}}

EXAMPLE 2:
JOB: "Data Scientist role at AI Corp. Remote contract position. Must have machine learning expertise, 3+ years Python and R. Deep learning frameworks preferred. Analyze large datasets."
JSON: {{"title": "Data Scientist", "description": "Analyze large datasets", "company": "AI Corp", "location": "Remote", "employmentType": "contract", "summary": "Data Scientist contract position requiring machine learning expertise with 3+ years of Python and R experience. Focus on large-scale data analysis with deep learning applications at AI Corp.", "requirements": [{{"skill": "Machine Learning", "required": true, "minYearsExperience": null}}, {{"skill": "Python", "required": true, "minYearsExperience": 3}}, {{"skill": "R", "required": true, "minYearsExperience": 3}}, {{"skill": "Deep Learning", "required": false, "minYearsExperience": null}}], "salaryRange": null, "benefits": null}}

NOW EXTRACT FROM THIS JOB DESCRIPTION:
{jobText}`;

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemTemplate],
      ["user", userTemplate],
    ]);

    try {
      const formattedPrompt = await promptTemplate.invoke({ jobText });
      const structuredLlm = this.llm.withStructuredOutput(JobExtractionSchema);
      const data = await structuredLlm.invoke(formattedPrompt);
      
      this.logger.log(`Extracted job data for: ${data.title}`);
      return data as ExtractedJobData;
    } catch (error) {
      this.logger.error('Structured output failed, attempting fallback parsing', error);
      
      try {
        // Fallback: try raw text generation and parse JSON
        const formattedPrompt = await promptTemplate.invoke({ jobText });
        const response = await this.llm.invoke(formattedPrompt);
        const jsonStr = this.extractJsonFromResponse(response.content.toString());
        const data = JSON.parse(jsonStr) as ExtractedJobData;
        
        this.logger.log(`Extracted job data (fallback) for: ${data.title}`);
        return data;
      } catch (fallbackError) {
        this.logger.error('Failed to extract job data', fallbackError);
        throw new Error(`Failed to extract job data: ${fallbackError.message}`);
      }
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
    const systemTemplate = `You are an expert HR matching system. Evaluate how well a candidate matches a job based on their profiles.

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON with grade (0-100) and reasoning
- NO additional text, NO markdown formatting, NO explanations`;

    const userTemplate = `CANDIDATE:
Summary: {candidateSummary}
Skills: {candidateSkills}

JOB:
Summary: {jobSummary}
Required Skills: {jobRequirements}

EXAMPLE 1:
Candidate: "Senior Python developer, 8 years experience, Django, Flask, AWS"
Job: "Backend engineer, Python, Django, 5+ years required"
JSON: {{"grade": 92, "reasoning": "Excellent match with 8 years Python experience exceeding 5-year requirement, strong Django expertise, and relevant AWS cloud skills"}}

EXAMPLE 2:
Candidate: "Junior JavaScript developer, React, 1 year experience"
Job: "Senior Full Stack Engineer, 5+ years Node.js, React, Python required"
JSON: {{"grade": 45, "reasoning": "Partial match on React skills but lacks senior-level experience (only 1 year vs 5+ required) and missing Node.js and Python requirements"}}

NOW EVALUATE THIS MATCH:`;

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemTemplate],
      ["user", userTemplate],
    ]);

    const inputs = {
      candidateSummary,
      candidateSkills: candidateSkills.join(', '),
      jobSummary,
      jobRequirements: jobRequirements.join(', '),
    };

    try {
      const formattedPrompt = await promptTemplate.invoke(inputs);
      const structuredLlm = this.llm.withStructuredOutput(MatchGradeSchema);
      const result = await structuredLlm.invoke(formattedPrompt);
      
      this.logger.log(`Generated match grade: ${result.grade}`);
      return result as { grade: number; reasoning: string };
    } catch (error) {
      this.logger.error('Structured output failed for match grading, attempting fallback', error);
      
      try {
        // Fallback: try raw text generation and parse JSON
        const formattedPrompt = await promptTemplate.invoke(inputs);
        const response = await this.llm.invoke(formattedPrompt);
        const jsonStr = this.extractJsonFromResponse(response.content.toString());
        const result = JSON.parse(jsonStr);
        
        this.logger.log(`Generated match grade (fallback): ${result.grade}`);
        return result;
      } catch (fallbackError) {
        this.logger.error('Failed to generate matching grade', fallbackError);
        return { grade: 50, reasoning: 'Unable to determine match quality' };
      }
    }
  }

  /**
   * Generate a search-optimized summary
   */
  async 
  generateSearchSummary(
    type: 'candidate' | 'job',
    data: any,
  ): Promise<string> {
    if (type === 'candidate') {
      const systemTemplate = `Create a concise, keyword-rich summary (under 200 words) optimized for semantic search for a candidate profile.

CRITICAL INSTRUCTIONS:
- Return ONLY the summary text starting directly with content
- DO NOT use phrases like "Here is the summary:", "Summary:", or similar prefixes
- Start directly with content like: "Candidate is a..." or "Senior developer with..." or "Experienced professional..."
- Focus on: technologies, skills, industries, achievements, role types, and experience level
- NO markdown, NO formatting, just plain summary text`;

      const userTemplate = `Candidate Information:
Name: {name}
Skills: {skills}
Experience: {experience}
Education: {education}

EXAMPLE OUTPUT:
"Senior Software Engineer with 8 years of experience specializing in Python, JavaScript, and cloud architecture. Proven expertise in building scalable microservices and leading development teams at Fortune 500 companies. Strong background in DevOps practices including Docker, Kubernetes, and AWS."

NOW CREATE SUMMARY:`;

      const promptTemplate = ChatPromptTemplate.fromMessages([
        ["system", systemTemplate],
        ["user", userTemplate],
      ]);

      const inputs = {
        name: data.name,
        skills: data.skills?.map((s) => s.name).join(', ') || 'Not specified',
        experience: JSON.stringify(data.experience || []),
        education: JSON.stringify(data.education || []),
      };

      try {
        const formattedPrompt = await promptTemplate.invoke(inputs);
        const response = await this.llm.invoke(formattedPrompt);
        const summary = response.content.toString().trim();
        
        // Clean up any remaining prefixes
        const cleanedSummary = summary
          .replace(/^(here is the summary:?|summary:?)\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim();
        
        return cleanedSummary;
      } catch (error) {
        this.logger.error('Failed to generate candidate search summary', error);
        return `${data.name} - ${data.skills?.map((s) => s.name).join(', ') || 'Professional'}`;
      }
    } else {
      const systemTemplate = `Create a concise, keyword-rich summary (under 200 words) optimized for semantic search for a job posting.

CRITICAL INSTRUCTIONS:
- Return ONLY the summary text starting directly with content
- DO NOT use phrases like "Here is the summary:", "Summary:", or similar prefixes
- Start directly with content like: "Position requires..." or "Seeking experienced..." or "Role focuses on..."
- Focus on: required skills, technologies, responsibilities, and ideal candidate profile
- NO markdown, NO formatting, just plain summary text`;

      const userTemplate = `Job Information:
Title: {title}
Requirements: {requirements}
Description: {description}

EXAMPLE OUTPUT:
"Senior Backend Engineer position requiring 5+ years of Python development experience with strong expertise in microservices architecture. Must have hands-on experience with Docker, Kubernetes, and AWS cloud infrastructure. Ideal candidate will lead technical design decisions and mentor junior developers."

NOW CREATE SUMMARY:`;

      const promptTemplate = ChatPromptTemplate.fromMessages([
        ["system", systemTemplate],
        ["user", userTemplate],
      ]);

      const inputs = {
        title: data.title,
        requirements: data.requirements?.map((r) => r.skill).join(', ') || 'Not specified',
        description: data.description,
      };

      try {
        const formattedPrompt = await promptTemplate.invoke(inputs);
        const response = await this.llm.invoke(formattedPrompt);
        const summary = response.content.toString().trim();
        
        // Clean up any remaining prefixes
        const cleanedSummary = summary
          .replace(/^(here is the summary:?|summary:?)\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim();
        
        return cleanedSummary;
      } catch (error) {
        this.logger.error('Failed to generate job search summary', error);
        return `${data.title} - ${data.requirements?.map((r) => r.skill).join(', ') || 'Various skills required'}`;
      }
    }
  }

  /**
   * Extract JSON from LLM response (handles markdown code blocks)
   * Used as fallback when structured output fails
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
