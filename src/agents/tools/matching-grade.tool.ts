/**
 * =============================================================================
 * MATCHING GRADE TOOL - Sophisticated Candidate-Job Matching
 * =============================================================================
 * 
 * This tool implements the sophisticated matching algorithm that calculates
 * how well a candidate matches a job opening. It uses a multi-factor weighted
 * scoring system that considers:
 * 
 * Scoring Factors (default weights):
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Factor              │ Weight │ Description                              │
 * ├─────────────────────┼────────┼──────────────────────────────────────────┤
 * │ Skill Match         │  35%   │ Required vs optional skills presence     │
 * │ Skill Proficiency   │  15%   │ Experience levels alignment              │
 * │ Experience Years    │  20%   │ Total years vs requirements              │
 * │ Location Match      │  10%   │ Geographic alignment                     │
 * │ Vector Similarity   │  15%   │ Semantic relevance from embeddings       │
 * │ SQL Match Bonus     │   5%   │ Found in structured search               │
 * └─────────────────────┴────────┴──────────────────────────────────────────┘
 * 
 * Special Cases:
 * - Dual Match (SQL + Vector): Gets maximum score (configurable, default 100)
 * - Missing Required Skills: Significant penalty
 * - Overqualification: Slight penalty (risk of leaving)
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLMService, LLMConfig } from '../services/llm.service';
import { Skill, Experience, Education } from '../../database/entities/candidate.entity';
import { JobRequirement } from '../../database/entities/job.entity';

/**
 * Parameters for basic matching grade calculation
 */
export interface MatchingGradeParams {
  candidateSummary: string;
  candidateSkills: string[];
  jobSummary: string;
  jobRequirements: string[];
}

/**
 * Result of matching grade calculation
 */
export interface MatchingGradeResult {
  grade: number;      // 0-100 score
  reasoning: string;  // Human-readable explanation
}

/**
 * Detailed candidate data for sophisticated matching
 * Contains all information needed for multi-factor scoring
 */
export interface CandidateMatchData {
  skills: Skill[];                    // Skills with proficiency levels
  experience: Experience[];           // Work history
  education: Education[];             // Education background
  totalExperienceYears: number;       // Total years of experience
  location?: string;                  // Candidate location
  summary?: string;                   // Professional summary
}

/**
 * Detailed job data for sophisticated matching
 */
export interface JobMatchData {
  requirements: JobRequirement[];     // Skill requirements
  location?: string;                  // Job location (or "remote")
  employmentType?: string;            // full-time, part-time, etc.
  summary?: string;                   // Job summary
  minExperienceYears?: number;        // Minimum years required
}

/**
 * Configurable weights for different matching factors
 * All weights should sum to 100 for percentage-based scoring
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
 * Provides transparency into how the final score was calculated
 */
export interface MatchScoreBreakdown {
  totalScore: number;           // Final weighted score (0-100)
  skillScore: number;           // Score from skill matching
  proficiencyScore: number;     // Score from proficiency alignment
  experienceScore: number;      // Score from experience years
  locationScore: number;        // Score from location matching
  vectorScore: number;          // Score from semantic similarity
  sqlBonus: number;             // Bonus from SQL match
  matchedSkills: {              // Details of matched skills
    skill: string;
    candidateLevel?: string;
    required: boolean;
    yearsMatch: boolean;
  }[];
  missingRequiredSkills: string[];  // List of unmatched required skills
  reasoning: string;            // Human-readable explanation
}

/**
 * MatchingGradeTool - Implements sophisticated candidate-job matching
 * 
 * This tool is used by the JobProcessingAgent to calculate match scores
 * for candidates found through SQL and vector searches.
 */
@Injectable()
export class MatchingGradeTool {
  private readonly logger = new Logger(MatchingGradeTool.name);
  private dualMatchScore: number;
  
  // Default weights (sum should equal 100 for percentage calculation)
  private readonly defaultWeights: MatchingWeights = {
    skillMatch: 35,
    skillProficiency: 15,
    experienceMatch: 20,
    locationMatch: 10,
    vectorSimilarity: 15,
    sqlMatch: 5,
  };

  // Numeric values for skill level comparison
  // Used to calculate proficiency match scores
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
   * Calculate sophisticated match score considering multiple factors
   * 
   * This is the main scoring method that evaluates a candidate against
   * job requirements using a weighted multi-factor approach.
   * 
   * @param candidate - Candidate data with skills, experience, etc.
   * @param job - Job requirements and criteria
   * @param vectorScore - Semantic similarity score from vector search (0-1)
   * @param sqlMatch - Whether candidate was found in SQL search
   * @param weights - Custom weights (optional, uses defaults if not provided)
   * @returns MatchScoreBreakdown - Detailed score breakdown
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

    // =========================================================================
    // 1. SKILL MATCHING (considers exact and fuzzy matches)
    // =========================================================================
    const { skillScore, proficiencyScore } = this.calculateSkillScores(
      candidate.skills,
      job.requirements,
      matchedSkills,
      missingRequiredSkills,
    );

    // =========================================================================
    // 2. EXPERIENCE MATCHING (considers years and relevance)
    // =========================================================================
    const experienceScore = this.calculateExperienceScore(
      candidate.totalExperienceYears,
      job.minExperienceYears,
      job.requirements,
    );

    // =========================================================================
    // 3. LOCATION MATCHING
    // =========================================================================
    const locationScore = this.calculateLocationScore(
      candidate.location,
      job.location,
    );

    // =========================================================================
    // 4. VECTOR SIMILARITY (semantic match from embeddings)
    // =========================================================================
    // Normalize to 0-100 scale, default to 50 (neutral) if no score
    const normalizedVectorScore = vectorScore !== undefined 
      ? Math.min(100, vectorScore * 100) 
      : 50;

    // =========================================================================
    // 5. SQL MATCH BONUS
    // =========================================================================
    const sqlBonus = sqlMatch ? 100 : 0;

    // =========================================================================
    // CALCULATE WEIGHTED TOTAL
    // =========================================================================
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
   * 
   * This method compares candidate skills against job requirements using
   * both exact matching and fuzzy matching for variations (e.g., "JS" = "JavaScript").
   * 
   * @param candidateSkills - Candidate's skills with proficiency levels
   * @param jobRequirements - Job skill requirements
   * @param matchedSkills - Output: populated with matched skills
   * @param missingRequiredSkills - Output: populated with missing required skills
   * @returns Object containing skillScore and proficiencyScore (0-100 each)
   */
  private calculateSkillScores(
    candidateSkills: Skill[],
    jobRequirements: JobRequirement[],
    matchedSkills: MatchScoreBreakdown['matchedSkills'],
    missingRequiredSkills: string[],
  ): { skillScore: number; proficiencyScore: number } {
    // Return neutral score if no requirements specified
    if (!jobRequirements || jobRequirements.length === 0) {
      return { skillScore: 50, proficiencyScore: 50 };
    }

    let totalSkillPoints = 0;
    let totalProficiencyPoints = 0;
    let maxSkillPoints = 0;
    let maxProficiencyPoints = 0;

    // Create lookup map for efficient skill matching
    const candidateSkillMap = new Map<string, Skill>();
    for (const skill of candidateSkills) {
      candidateSkillMap.set(skill.name.toLowerCase(), skill);
    }

    // Evaluate each job requirement
    for (const req of jobRequirements) {
      const reqSkillLower = req.skill.toLowerCase();
      const weight = req.required ? 2 : 1; // Required skills worth 2x

      maxSkillPoints += weight * 100;
      maxProficiencyPoints += weight * 100;

      // Try exact match first
      let matchedSkill = candidateSkillMap.get(reqSkillLower);

      // Try fuzzy match if no exact match (handles abbreviations, typos)
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

        // Calculate proficiency score based on level and years
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

    // Calculate final percentages
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
   * 
   * Handles:
   * - Abbreviations: "JS" → "JavaScript", "K8s" → "Kubernetes"
   * - Product variations: "PostgreSQL" → "Postgres", "PSQL"
   * - Related terms: "accounting" → "bookkeeping"
   * - Typos: Uses Levenshtein distance (up to 20% difference)
   * 
   * @param required - Required skill name from job
   * @param candidate - Candidate skill name
   * @returns true if skills are considered a match
   */
  private fuzzySkillMatch(required: string, candidate: string): boolean {
    // Normalize strings (remove special characters for comparison)
    const req = required.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cand = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Check if one contains the other
    if (req.includes(cand) || cand.includes(req)) {
      return true;
    }

    // Common abbreviations and variations for technical and professional skills
    // This dictionary enables matching between different forms of the same skill
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

    // Check if both skills map to the same base concept
    for (const [base, alts] of Object.entries(variations)) {
      const allVariants = [base, ...alts];
      const reqMatch = allVariants.some(v => req.includes(v) || v.includes(req));
      const candMatch = allVariants.some(v => cand.includes(v) || v.includes(cand));
      if (reqMatch && candMatch) {
        return true;
      }
    }

    // Levenshtein distance for close matches (allow 20% difference for typos)
    const maxDistance = Math.floor(Math.max(req.length, cand.length) * 0.2);
    if (this.levenshteinDistance(req, cand) <= maxDistance) {
      return true;
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * 
   * Used for fuzzy string matching to catch typos and minor variations.
   * The Levenshtein distance is the minimum number of single-character edits
   * (insertions, deletions, substitutions) needed to change one string to another.
   * 
   * @param a - First string
   * @param b - Second string
   * @returns Number of edits required to transform a into b
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize matrix with incremental values
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix using dynamic programming
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]; // Characters match
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // Substitution
            matrix[i][j - 1] + 1,     // Insertion
            matrix[i - 1][j] + 1,     // Deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculate proficiency match based on skill level and years of experience
   * 
   * Combines two factors:
   * - Skill level (beginner/intermediate/advanced/expert) - 50% weight
   * - Years of experience vs requirement - 50% weight
   * 
   * @param candidateSkill - Candidate's skill with level and years
   * @param requiredYears - Minimum years required by job
   * @returns Proficiency score (0-100)
   */
  private calculateProficiencyMatch(
    candidateSkill: Skill,
    requiredYears?: number,
  ): number {
    let score = 0;

    // Level-based scoring (50% of proficiency score)
    // Expert = 100%, Advanced = 75%, Intermediate = 50%, Beginner = 25%
    const levelScore = (this.skillLevelValues[candidateSkill.level] / 4) * 100;
    score += levelScore * 0.5;

    // Years-based scoring (50% of proficiency score)
    if (requiredYears && candidateSkill.yearsOfExperience !== undefined) {
      const yearsRatio = Math.min(1, candidateSkill.yearsOfExperience / requiredYears);
      score += yearsRatio * 100 * 0.5;
    } else {
      // No years requirement, use level as proxy for experience
      score += levelScore * 0.5;
    }

    return score;
  }

  /**
   * Calculate experience score with nuanced evaluation
   * 
   * Scoring strategy:
   * - Perfect match (0-3 years over): 100 points
   * - Slightly overqualified (4-7 years over): 70-85 points (risk of leaving)
   * - Significantly overqualified (7+ years): 50-70 points (high turnover risk)
   * - Slightly under (1-2 years below): 60-80 points (trainable)
   * - Significantly under: 20-60 points (needs more experience)
   * 
   * @param candidateYears - Candidate's total years of experience
   * @param requiredYears - Job's minimum years requirement
   * @param requirements - Job requirements (used to estimate if no explicit years)
   * @returns Experience score (0-100)
   */
  private calculateExperienceScore(
    candidateYears: number,
    requiredYears?: number,
    requirements?: JobRequirement[],
  ): number {
    if (!requiredYears) {
      // Estimate required years from skill requirements if not specified
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
   * 
   * Scoring:
   * - Remote jobs: 100 (matches everyone)
   * - Unknown candidate location: 50 (neutral)
   * - Same city: 100
   * - Same region/country: 80
   * - Different location: 40
   * 
   * @param candidateLocation - Candidate's location
   * @param jobLocation - Job's location
   * @returns Location score (0-100)
   */
  private calculateLocationScore(
    candidateLocation?: string,
    jobLocation?: string,
  ): number {
    // Remote jobs match everyone
    if (!jobLocation || jobLocation.toLowerCase().includes('remote')) {
      return 100;
    }

    // Unknown location gets neutral score
    if (!candidateLocation) {
      return 50;
    }

    // Normalize for comparison
    const candLoc = candidateLocation.toLowerCase();
    const jobLoc = jobLocation.toLowerCase();

    // Exact city match (one contains the other)
    if (candLoc.includes(jobLoc) || jobLoc.includes(candLoc)) {
      return 100;
    }

    // Check for same country/region (simplified word-based comparison)
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
   * 
   * Creates a summary that explains:
   * - Overall match quality
   * - Skills matched vs required
   * - Missing critical skills
   * - Experience alignment
   * 
   * @param totalScore - Final calculated score
   * @param skillScore - Score from skill matching
   * @param proficiencyScore - Score from proficiency matching
   * @param experienceScore - Score from experience matching
   * @param matchedSkills - List of skills that matched
   * @param missingRequiredSkills - List of required skills not found
   * @param candidateYears - Candidate's experience years
   * @param requiredYears - Required experience years
   * @returns Human-readable reasoning string
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

    // Overall assessment based on score thresholds
    if (totalScore >= 85) {
      parts.push('Excellent match.');
    } else if (totalScore >= 70) {
      parts.push('Good match with some gaps.');
    } else if (totalScore >= 50) {
      parts.push('Moderate match.');
    } else {
      parts.push('Weak match.');
    }

    // Skill assessment summary
    const requiredMatched = matchedSkills.filter(s => s.required).length;
    const totalRequired = requiredMatched + missingRequiredSkills.length;
    if (totalRequired > 0) {
      parts.push(`Skills: ${requiredMatched}/${totalRequired} required skills matched.`);
    }

    // List missing critical skills (first 3)
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
   * 
   * Simple scoring method that combines SQL match, vector score, and LLM grade.
   * Note: If candidate is found in both SQL and vector search, they receive 
   * the maximum score (dual match bonus).
   * 
   * @param sqlMatch - Whether candidate was found via SQL query
   * @param vectorMatch - Whether candidate was found via vector search
   * @param vectorScore - Semantic similarity score (0-1)
   * @param llmGrade - Optional LLM-generated grade (0-100)
   * @returns Final match score (0-100)
   */
  calculateFinalScore(
    sqlMatch: boolean,
    vectorMatch: boolean,
    vectorScore?: number,
    llmGrade?: number,
  ): number {
    // Dual match = perfect score (found by both search strategies)
    if (sqlMatch && vectorMatch) {
      this.logger.debug('Dual match detected - returning maximum score');
      return this.dualMatchScore;
    }

    // Calculate weighted score from available sources
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
   * 
   * Uses Gemini to analyze candidate and job summaries and provide
   * a semantic understanding of match quality beyond keyword matching.
   * 
   * @param params - Candidate and job summaries and skills
   * @returns MatchingGradeResult with grade and reasoning
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
      // Return neutral grade on error
      return {
        grade: 50,
        reasoning: 'Unable to determine match quality due to processing error',
      };
    }
  }

  /**
   * Batch calculate match scores for multiple candidates
   * 
   * Efficiently processes multiple candidates against a single job.
   * Optionally includes LLM-based grading for enhanced accuracy.
   * 
   * @param candidates - Array of candidate data with search match info
   * @param jobSummary - Job description summary
   * @param jobRequirements - List of required skills
   * @param includeLLMGrade - Whether to include LLM-based grading
   * @returns Map of candidateId → score details
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
   * 
   * Uses the multi-factor weighted scoring algorithm to evaluate
   * all candidates with detailed breakdowns.
   * 
   * @param candidates - Array of candidates with full data
   * @param job - Job requirements and criteria
   * @param weights - Custom weights (optional)
   * @returns Map of candidateId → detailed score breakdown
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

    this.logger.log(`Calculated sophisticated scores for ${candidates.length} candidates`);
    
    return results;
  }
}
