import { Injectable, Inject, Logger } from '@nestjs/common';
import { LLMService, LLMConfig } from '../services/llm.service';

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

@Injectable()
export class MatchingGradeTool {
  private readonly logger = new Logger(MatchingGradeTool.name);
  private dualMatchScore: number;

  constructor(
    private readonly llmService: LLMService,
    @Inject('LLM_CONFIG') private config: LLMConfig,
  ) {
    this.dualMatchScore = config.dualMatchScore;
  }

  /**
   * Calculate the final match score for a candidate
   * If candidate is found in both SQL and vector search, score is 100
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
}
