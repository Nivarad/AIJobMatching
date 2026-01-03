import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, MoreThanOrEqual } from 'typeorm';
import { Candidate } from '../../database/entities';

export interface PostgresQueryParams {
  skills?: string[];
  minExperienceYears?: number;
  location?: string;
  limit?: number;
  minSkillMatchPercentage?: number; // 0-100, default 60%
}

export interface PostgresQueryResult {
  candidateId: string;
  name?: string;
  email?: string;
  skills: string[];
  experienceYears: number;
  location?: string;
  summary?: string;
}

@Injectable()
export class PostgresQueryTool {
  private readonly logger = new Logger(PostgresQueryTool.name);

  constructor(
    @InjectRepository(Candidate)
    private candidateRepository: Repository<Candidate>,
  ) {}

  /**
   * Query candidates from PostgreSQL based on job requirements
   */
  async queryCandidates(
    params: PostgresQueryParams,
  ): Promise<PostgresQueryResult[]> {
    this.logger.log(`Querying candidates with params: ${JSON.stringify(params)}`);

    try {
      const queryBuilder = this.candidateRepository
        .createQueryBuilder('candidate')
        .where('candidate.status = :status', { status: 'active' });

      // Filter by minimum experience years
      if (params.minExperienceYears !== undefined) {
        queryBuilder.andWhere(
          'candidate.totalExperienceYears >= :minExp',
          { minExp: params.minExperienceYears },
        );
      }

      // // Filter by location (case-insensitive)
      // if (params.location) {
      //   queryBuilder.andWhere(
      //     'LOWER(candidate.location) LIKE LOWER(:location)',
      //     { location: `%${params.location}%` },
      //   );
      // }

      // Filter by skills (JSONB query with minimum match percentage)
      if (params.skills && params.skills.length > 0) {
        const minMatchPercentage = params.minSkillMatchPercentage ?? 60; // Default 60%
        const minMatchCount = Math.ceil((params.skills.length * minMatchPercentage) / 100);

        this.logger.log(
          `Requiring ${minMatchCount}/${params.skills.length} skills (${minMatchPercentage}% match)`,
        );

        // Create a subquery that counts matching skills
        const skillCheckConditions = params.skills
          .map((_, index) => {
            return `(
              CASE WHEN EXISTS (
                SELECT 1 FROM jsonb_array_elements(candidate.skills) AS s
                WHERE LOWER(s->>'name') LIKE LOWER(:skill${index})
              ) THEN 1 ELSE 0 END
            )`;
          })
          .join(' + ');

        // Add WHERE clause that requires minimum number of matching skills
        queryBuilder.andWhere(
          `(${skillCheckConditions}) >= :minMatchCount`,
          {
            ...params.skills.reduce(
              (acc, skill, index) => {
                acc[`skill${index}`] = `%${skill}%`;
                return acc;
              },
              {} as Record<string, string>,
            ),
            minMatchCount,
          },
        );
      }

      // Apply limit
      queryBuilder.take(params.limit || 20);

      // Order by experience (most experienced first)
      queryBuilder.orderBy('candidate.totalExperienceYears', 'DESC');

      const candidates = await queryBuilder.getMany();

      const results: PostgresQueryResult[] = candidates.map((candidate) => ({
        candidateId: candidate.id,
        name: candidate.name,
        email: candidate.email,
        skills: candidate.skills.map((s) => s.name),
        experienceYears: candidate.totalExperienceYears,
        location: candidate.location,
        summary: candidate.summary,
      }));

      this.logger.log(`Found ${results.length} candidates matching SQL query`);
      return results;
    } catch (error) {
      this.logger.error('Failed to query candidates', error);
      throw new Error(`Failed to query candidates: ${error.message}`);
    }
  }

  /**
   * Get candidate by ID
   */
  async getCandidateById(candidateId: string): Promise<Candidate | null> {
    return await this.candidateRepository.findOne({
      where: { id: candidateId },
    });
  }

  /**
   * Get candidates by IDs
   */
  async getCandidatesByIds(candidateIds: string[]): Promise<Candidate[]> {
    return await this.candidateRepository.find({
      where: { id: In(candidateIds) },
    });
  }

  /**
   * Search candidates by text (simple full-text search on summary)
   */
  async searchCandidatesByText(
    searchText: string,
    limit: number = 20,
  ): Promise<PostgresQueryResult[]> {
    const candidates = await this.candidateRepository
      .createQueryBuilder('candidate')
      .where('candidate.status = :status', { status: 'active' })
      .andWhere(
        '(LOWER(candidate.summary) LIKE LOWER(:search) OR LOWER(candidate.name) LIKE LOWER(:search))',
        { search: `%${searchText}%` },
      )
      .take(limit)
      .orderBy('candidate.totalExperienceYears', 'DESC')
      .getMany();

    return candidates.map((candidate) => ({
      candidateId: candidate.id,
      name: candidate.name,
      email: candidate.email,
      skills: candidate.skills.map((s) => s.name),
      experienceYears: candidate.totalExperienceYears,
      location: candidate.location,
      summary: candidate.summary,
    }));
  }
}
