// Extracted candidate data from LLM
export interface ExtractedCandidateData {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary: string;
  skills: {
    name: string;
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
  }[];
  experience: {
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    description: string;
    skills?: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    field: string;
    graduationYear?: number;
  }[];
  totalExperienceYears: number;
}

// Extracted job data from LLM
export interface ExtractedJobData {
  title: string;
  description: string;
  company?: string;
  location?: string;
  employmentType?: 'full-time' | 'part-time' | 'contract' | 'internship';
  summary: string;
  requirements: {
    skill: string;
    required: boolean;
    minYearsExperience?: number;
  }[];
  salaryRange?: {
    min: number;
    max: number;
    currency: string;
  };
  benefits?: string[];
}

// Agent processing result
export interface AgentProcessingResult {
  success: boolean;
  candidateId?: string;
  jobId?: string;
  error?: string;
  data?: ExtractedCandidateData | ExtractedJobData;
}

// Matching result from tools
export interface MatchingResult {
  candidateId: string;
  name?: string;
  email?: string;
  matchScore: number;
  matchSources: ('sql' | 'vector')[];
  matchDetails: {
    sqlMatch: boolean;
    vectorMatch: boolean;
    vectorScore?: number;
    llmGrade?: number;
  };
  skills: string[];
  experienceYears: number; // Can be decimal (e.g., 19.5 years)
  summary?: string;
}
