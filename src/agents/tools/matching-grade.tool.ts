import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLMService, LLMConfig } from '../services/llm.service';
import { Skill, Experience, Education } from '../../database/entities/candidate.entity';
import { JobRequirement } from '../../database/entities/job.entity';

export interface MatchingGradeParams {
  candidateSummary: string;
  candidateSkills: string[];
  jobSummary: string;
  jobRequirements: string[];
}

export interface MatchingGradeResult {
  grade: number;
  reasoning: string;
}

/**
 * Detailed candidate data for sophisticated matching
 */
export interface CandidateMatchData {
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  totalExperienceYears: number;
  location?: string;
  summary?: string;
}

/**
 * Detailed job data for sophisticated matching
 */
export interface JobMatchData {
  requirements: JobRequirement[];
  location?: string;
  employmentType?: string;
  summary?: string;
  minExperienceYears?: number;
}

/**
 * Configurable weights for different matching factors
 */
export interface MatchingWeights {
  skillMatch: number;           // Weight for skill matching (default: 35)
  skillProficiency: number;     // Weight for skill level match (default: 15)
  experienceMatch: number;      // Weight for experience years match (default: 20)
  locationMatch: number;        // Weight for location match (default: 10)
  vectorSimilarity: number;     // Weight for semantic similarity (default: 15)
  sqlMatch: number;             // Bonus for SQL match (default: 5)
}

/**
 * Detailed breakdown of the match score
 */
export interface MatchScoreBreakdown {
  totalScore: number;
  skillScore: number;
  proficiencyScore: number;
  experienceScore: number;
  locationScore: number;
  vectorScore: number;
  sqlBonus: number;
  matchedSkills: { skill: string; candidateLevel?: string; required: boolean; yearsMatch: boolean }[];
  missingRequiredSkills: string[];
  reasoning: string;
}

@Injectable()
export class MatchingGradeTool {
  private readonly logger = new Logger(MatchingGradeTool.name);
  private dualMatchScore: number;
  
  // Default weights (sum should equal 100)
  private readonly defaultWeights: MatchingWeights = {
    skillMatch: 35,
    skillProficiency: 15,
    experienceMatch: 20,
    locationMatch: 10,
    vectorSimilarity: 15,
    sqlMatch: 5,
  };

  // Skill level numeric values for comparison
  private readonly skillLevelValues: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  };

  constructor(
    private readonly llmService: LLMService,
    @Inject('LLM_CONFIG') private config: LLMConfig,
  ) {
    this.dualMatchScore = config.dualMatchScore;
  }

  /**
   * Sophisticated matching algorithm that considers multiple factors
   */
  calculateSophisticatedScore(
    candidate: CandidateMatchData,
    job: JobMatchData,
    vectorScore?: number,
    sqlMatch: boolean = false,
    weights: MatchingWeights = this.defaultWeights,
  ): MatchScoreBreakdown {
    const matchedSkills: MatchScoreBreakdown['matchedSkills'] = [];
    const missingRequiredSkills: string[] = [];

    // 1. SKILL MATCHING (considers exact and fuzzy matches)
    const { skillScore, proficiencyScore } = this.calculateSkillScores(
      candidate.skills,
      job.requirements,
      matchedSkills,
      missingRequiredSkills,
    );

    // 2. EXPERIENCE MATCHING (considers years and relevance)
    const experienceScore = this.calculateExperienceScore(
      candidate.totalExperienceYears,
      job.minExperienceYears,
      job.requirements,
    );

    // 3. LOCATION MATCHING
    const locationScore = this.calculateLocationScore(
      candidate.location,
      job.location,
    );

    // 4. VECTOR SIMILARITY (semantic match from embeddings)
    const normalizedVectorScore = vectorScore !== undefined 
      ? Math.min(100, vectorScore * 100) 
      : 50; // Default to neutral if no vector score

    // 5. SQL MATCH BONUS
    const sqlBonus = sqlMatch ? 100 : 0;

    // Calculate weighted total
    const totalScore = Math.round(
      (skillScore * weights.skillMatch +
        proficiencyScore * weights.skillProficiency +
        experienceScore * weights.experienceMatch +
        locationScore * weights.locationMatch +
        normalizedVectorScore * weights.vectorSimilarity +
        sqlBonus * weights.sqlMatch) / 100
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(
      totalScore,
      skillScore,
      proficiencyScore,
      experienceScore,
      matchedSkills,
      missingRequiredSkills,
      candidate.totalExperienceYears,
      job.minExperienceYears,
    );

    return {
      totalScore: Math.min(100, Math.max(0, totalScore)),
      skillScore,
      proficiencyScore,
      experienceScore,
      locationScore,
      vectorScore: normalizedVectorScore,
      sqlBonus,
      matchedSkills,
      missingRequiredSkills,
      reasoning,
    };
  }

  /**
   * Calculate skill matching scores
   */
  private calculateSkillScores(
    candidateSkills: Skill[],
    jobRequirements: JobRequirement[],
    matchedSkills: MatchScoreBreakdown['matchedSkills'],
    missingRequiredSkills: string[],
  ): { skillScore: number; proficiencyScore: number } {
    if (!jobRequirements || jobRequirements.length === 0) {
      return { skillScore: 50, proficiencyScore: 50 }; // Neutral if no requirements
    }

    let totalSkillPoints = 0;
    let totalProficiencyPoints = 0;
    let maxSkillPoints = 0;
    let maxProficiencyPoints = 0;

    const candidateSkillMap = new Map<string, Skill>();
    for (const skill of candidateSkills) {
      candidateSkillMap.set(skill.name.toLowerCase(), skill);
    }

    for (const req of jobRequirements) {
      const reqSkillLower = req.skill.toLowerCase();
      const weight = req.required ? 2 : 1; // Required skills worth 2x

      maxSkillPoints += weight * 100;
      maxProficiencyPoints += weight * 100;

      // Try exact match first
      let matchedSkill = candidateSkillMap.get(reqSkillLower);

      // Try fuzzy match if no exact match
      if (!matchedSkill) {
        for (const [candidateSkillName, skill] of candidateSkillMap) {
          if (this.fuzzySkillMatch(reqSkillLower, candidateSkillName)) {
            matchedSkill = skill;
            break;
          }
        }
      }

      if (matchedSkill) {
        // Skill found - calculate points
        const exactMatch = candidateSkillMap.has(reqSkillLower);
        const matchQuality = exactMatch ? 100 : 80; // Fuzzy match gets 80%
        totalSkillPoints += weight * matchQuality;

        // Calculate proficiency score
        const proficiencyMatch = this.calculateProficiencyMatch(
          matchedSkill,
          req.minYearsExperience,
        );
        totalProficiencyPoints += weight * proficiencyMatch;

        matchedSkills.push({
          skill: req.skill,
          candidateLevel: matchedSkill.level,
          required: req.required,
          yearsMatch: !req.minYearsExperience || 
            (matchedSkill.yearsOfExperience ?? 0) >= req.minYearsExperience,
        });
      } else {
        // Skill not found
        if (req.required) {
          missingRequiredSkills.push(req.skill);
        }
        // Partial credit for non-required skills (they might have related skills)
        if (!req.required) {
          totalSkillPoints += weight * 20; // 20% credit for missing preferred skills
        }
      }
    }

    const skillScore = maxSkillPoints > 0 
      ? Math.round((totalSkillPoints / maxSkillPoints) * 100)
      : 50;
    
    const proficiencyScore = maxProficiencyPoints > 0
      ? Math.round((totalProficiencyPoints / maxProficiencyPoints) * 100)
      : 50;

    return { skillScore, proficiencyScore };
  }

  /**
   * Fuzzy skill matching using common variations and related terms
   */
  private fuzzySkillMatch(required: string, candidate: string): boolean {
    // Normalize strings
    const req = required.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cand = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check if one contains the other
    if (req.includes(cand) || cand.includes(req)) {
      return true;
    }

    // Check for common abbreviations and variations
    const variations: Record<string, string[]> = {
      'javascript': ['js', 'ecmascript', 'es6', 'es2015'],
      'typescript': ['ts'],
      'python': ['py', 'python3'],
      'postgresql': ['postgres', 'psql', 'pgsql'],
      'mongodb': ['mongo'],
      'kubernetes': ['k8s'],
      'react': ['reactjs', 'reactnative'],
      'angular': ['angularjs', 'ng'],
      'vue': ['vuejs', 'vue3'],
      'node': ['nodejs', 'node.js'],
      'aws': ['amazonwebservices', 'amazon'],
      'gcp': ['googlecloud', 'googlecloudplatform'],
      'azure': ['microsoftazure'],
      'sql': ['mysql', 'mssql', 'tsql'],
      'excel': ['msexcel', 'microsoftexcel'],
      'word': ['msword', 'microsoftword'],
      'powerpoint': ['mspowerpoint', 'ppt'],
      'accounting': ['bookkeeping', 'financialaccounting'],
      'payroll': ['payrollprocessing', 'payrollmanagement'],
    };

    for (const [base, alts] of Object.entries(variations)) {
      const allVariants = [base, ...alts];
      const reqMatch = allVariants.some(v => req.includes(v) || v.includes(req));
      const candMatch = allVariants.some(v => cand.includes(v) || v.includes(cand));
      if (reqMatch && candMatch) {
        return true;
      }
    }

    // Levenshtein distance for close matches (allow 20% difference)
    const maxDistance = Math.floor(Math.max(req.length, cand.length) * 0.2);
    if (this.levenshteinDistance(req, cand) <= maxDistance) {
      return true;
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculate proficiency match based on skill level and years of experience
   */
  private calculateProficiencyMatch(
    candidateSkill: Skill,
    requiredYears?: number,
  ): number {
    let score = 0;

    // Level-based scoring (50% of proficiency score)
    const levelScore = (this.skillLevelValues[candidateSkill.level] / 4) * 100;
    score += levelScore * 0.5;

    // Years-based scoring (50% of proficiency score)
    if (requiredYears && candidateSkill.yearsOfExperience !== undefined) {
      const yearsRatio = Math.min(1, candidateSkill.yearsOfExperience / requiredYears);
      score += yearsRatio * 100 * 0.5;
    } else {
      // No years requirement, use level as proxy
      score += levelScore * 0.5;
    }

    return score;
  }

  /**
   * Calculate experience score with nuanced evaluation
   */
  private calculateExperienceScore(
    candidateYears: number,
    requiredYears?: number,
    requirements?: JobRequirement[],
  ): number {
    if (!requiredYears) {
      // Estimate required years from skill requirements
      if (requirements && requirements.length > 0) {
        const avgRequiredYears = requirements.reduce((sum, r) => 
          sum + (r.minYearsExperience || 0), 0) / requirements.length;
        requiredYears = avgRequiredYears || 3;
      } else {
        requiredYears = 3; // Default assumption
      }
    }

    const diff = candidateYears - requiredYears;

    if (diff >= 0 && diff <= 3) {
      // Perfect match: meets requirement or slightly over
      return 100;
    } else if (diff > 3 && diff <= 7) {
      // Slightly overqualified: might be okay
      return 90 - (diff - 3) * 5; // 85 to 70
    } else if (diff > 7) {
      // Significantly overqualified: risk of leaving
      return Math.max(50, 70 - (diff - 7) * 5);
    } else if (diff >= -2) {
      // Slightly under: trainable
      return 80 + diff * 10; // 60 to 80
    } else {
      // Significantly under: needs more experience
      return Math.max(20, 60 + diff * 10);
    }
  }

  /**
   * Calculate location match score
   */
  private calculateLocationScore(
    candidateLocation?: string,
    jobLocation?: string,
  ): number {
    if (!jobLocation || jobLocation.toLowerCase().includes('remote')) {
      return 100; // Remote jobs match everyone
    }

    if (!candidateLocation) {
      return 50; // Unknown location, neutral score
    }

    const candLoc = candidateLocation.toLowerCase();
    const jobLoc = jobLocation.toLowerCase();

    // Exact city match
    if (candLoc.includes(jobLoc) || jobLoc.includes(candLoc)) {
      return 100;
    }

    // Check for same country/region (simplified)
    const candParts = candLoc.split(/[,\s]+/);
    const jobParts = jobLoc.split(/[,\s]+/);

    for (const candPart of candParts) {
      for (const jobPart of jobParts) {
        if (candPart.length > 2 && jobPart.length > 2 && 
            (candPart.includes(jobPart) || jobPart.includes(candPart))) {
          return 80; // Same region
        }
      }
    }

    return 40; // Different location
  }

  /**
   * Generate human-readable reasoning for the match score
   */
  private generateReasoning(
    totalScore: number,
    skillScore: number,
    proficiencyScore: number,
    experienceScore: number,
    matchedSkills: MatchScoreBreakdown['matchedSkills'],
    missingRequiredSkills: string[],
    candidateYears: number,
    requiredYears?: number,
  ): string {
    const parts: string[] = [];

    // Overall assessment
    if (totalScore >= 85) {
      parts.push('Excellent match.');
    } else if (totalScore >= 70) {
      parts.push('Good match with some gaps.');
    } else if (totalScore >= 50) {
      parts.push('Moderate match.');
    } else {
      parts.push('Weak match.');
    }

    // Skill assessment
    const requiredMatched = matchedSkills.filter(s => s.required).length;
    const totalRequired = requiredMatched + missingRequiredSkills.length;
    if (totalRequired > 0) {
      parts.push(`Skills: ${requiredMatched}/${totalRequired} required skills matched.`);
    }

    if (missingRequiredSkills.length > 0) {
      parts.push(`Missing: ${missingRequiredSkills.slice(0, 3).join(', ')}${missingRequiredSkills.length > 3 ? '...' : ''}.`);
    }

    // Experience assessment
    if (requiredYears) {
      const diff = candidateYears - requiredYears;
      if (diff >= 0 && diff <= 3) {
        parts.push(`Experience: ${candidateYears} years (meets requirement).`);
      } else if (diff > 3) {
        parts.push(`Experience: ${candidateYears} years (overqualified by ${diff.toFixed(1)} years).`);
      } else {
        parts.push(`Experience: ${candidateYears} years (${Math.abs(diff).toFixed(1)} years below requirement).`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Calculate the final match score for a candidate (legacy method for backward compatibility)
   * If candidate is found in both SQL and vector search, score is boosted
   */
  calculateFinalScore(
    sqlMatch: boolean,
    vectorMatch: boolean,
    vectorScore?: number,
    llmGrade?: number,
  ): number {
    // Dual match = perfect score
    if (sqlMatch && vectorMatch) {
      this.logger.debug('Dual match detected - returning 100');
      return this.dualMatchScore;
    }

    // Calculate weighted score
    let score = 0;
    let weights = 0;

    if (sqlMatch) {
      score += 70; // SQL match contributes 70 points
      weights++;
    }

    if (vectorMatch && vectorScore !== undefined) {
      // Vector score is 0-1, scale to 0-80
      score += vectorScore * 80;
      weights++;
    }

    if (llmGrade !== undefined) {
      score += llmGrade * 0.5; // LLM grade contributes up to 50 points
      weights++;
    }

    // Normalize if we have multiple sources
    if (weights > 1) {
      score = Math.min(99, score / weights * 1.5); // Cap at 99 (100 reserved for dual match)
    }

    return Math.round(score);
  }

  /**
   * Get LLM-based matching grade between candidate and job
   */
  async getMatchingGrade(
    params: MatchingGradeParams,
  ): Promise<MatchingGradeResult> {
    this.logger.log('Generating LLM matching grade');

    try {
      const result = await this.llmService.generateMatchingGrade(
        params.candidateSummary,
        params.candidateSkills,
        params.jobSummary,
        params.jobRequirements,
      );

      this.logger.log(`LLM grade: ${result.grade}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to get LLM matching grade', error);
      return {
        grade: 50,
        reasoning: 'Unable to determine match quality due to processing error',
      };
    }
  }

  /**
   * Batch calculate match scores for multiple candidates
   */
  async batchCalculateScores(
    candidates: {
      candidateId: string;
      sqlMatch: boolean;
      vectorMatch: boolean;
      vectorScore?: number;
      candidateSummary?: string;
      candidateSkills?: string[];
    }[],
    jobSummary: string,
    jobRequirements: string[],
    includeLLMGrade: boolean = false,
  ): Promise<Map<string, { score: number; llmGrade?: number; reasoning?: string }>> {
    const results = new Map<
      string,
      { score: number; llmGrade?: number; reasoning?: string }
    >();

    for (const candidate of candidates) {
      let llmGrade: number | undefined;
      let reasoning: string | undefined;

      // Get LLM grade if requested and we have the necessary data
      if (
        includeLLMGrade &&
        candidate.candidateSummary &&
        candidate.candidateSkills
      ) {
        try {
          const llmResult = await this.getMatchingGrade({
            candidateSummary: candidate.candidateSummary,
            candidateSkills: candidate.candidateSkills,
            jobSummary,
            jobRequirements,
          });
          llmGrade = llmResult.grade;
          reasoning = llmResult.reasoning;
        } catch (error) {
          this.logger.warn(
            `Failed to get LLM grade for candidate ${candidate.candidateId}`,
          );
        }
      }

      const finalScore = this.calculateFinalScore(
        candidate.sqlMatch,
        candidate.vectorMatch,
        candidate.vectorScore,
        llmGrade,
      );

      results.set(candidate.candidateId, {
        score: finalScore,
        llmGrade,
        reasoning,
      });
    }

    return results;
  }

  /**
   * Sophisticated batch scoring using full candidate and job data
   */
  async batchCalculateSophisticatedScores(
    candidates: {
      candidateId: string;
      candidateData: CandidateMatchData;
      sqlMatch: boolean;
      vectorMatch: boolean;
      vectorScore?: number;
    }[],
    job: JobMatchData,
    weights?: MatchingWeights,
  ): Promise<Map<string, MatchScoreBreakdown>> {
    const results = new Map<string, MatchScoreBreakdown>();

    for (const candidate of candidates) {
      const breakdown = this.calculateSophisticatedScore(
        candidate.candidateData,
        job,
        candidate.vectorScore,
        candidate.sqlMatch,
        weights,
      );

      results.set(candidate.candidateId, breakdown);
    }

    // Sort by score (handled by caller if needed)
    this.logger.log(`Calculated sophisticated scores for ${candidates.length} candidates`);
    
    return results;
  }
}
