import { Injectable, Logger } from '@nestjs/common';
import { VectorService, SearchResult } from '../../vector/vector.service';
import { EmbeddingService } from '../services/embedding.service';

export interface VectorSearchParams {
  queryText: string;
  limit?: number;
  filter?: {
    skills?: string[];
    minExperienceYears?: number;
    location?: string;
  };
}

export interface VectorSearchResult {
  candidateId: string;
  name: string;
  email: string;
  skills: string[];
  experienceYears: number;
  location?: string;
  summary: string;
  vectorScore: number;
}

@Injectable()
export class VectorSearchTool {
  private readonly logger = new Logger(VectorSearchTool.name);

  constructor(
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Search for candidates using semantic search
   */
  async searchCandidates(
    params: VectorSearchParams,
  ): Promise<VectorSearchResult[]> {
    this.logger.log(
      `Vector search for candidates with query: "${params.queryText.substring(0, 50)}..."`,
    );

    try {
      // Generate embedding for the query (with query prefix for BGE)
      const queryEmbedding = await this.embeddingService.embedText(
        params.queryText,
      );

      // Search in Qdrant
      const results = await this.vectorService.searchCandidates(
        queryEmbedding,
        params.limit || 10,
        params.filter,
      );

      // Map results
      const searchResults: VectorSearchResult[] = results.map((result) => {
        const payload = result.payload as any;
        return {
          candidateId: payload.candidateId,
          name: payload.name,
          email: payload.email,
          skills: payload.skills || [],
          experienceYears: payload.experienceYears || 0,
          location: payload.location,
          summary: payload.summary,
          vectorScore: result.score,
        };
      });

      this.logger.log(
        `Found ${searchResults.length} candidates via vector search`,
      );
      return searchResults;
    } catch (error) {
      this.logger.error('Failed to perform vector search', error);
      throw new Error(`Failed to perform vector search: ${error.message}`);
    }
  }

  /**
   * Search for jobs using semantic search (for candidate matching)
   */
  async searchJobs(
    queryText: string,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    this.logger.log(
      `Vector search for jobs with query: "${queryText.substring(0, 50)}..."`,
    );

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.embedText(
        queryText,
      );

      // Search in Qdrant
      const results = await this.vectorService.searchJobs(queryEmbedding, limit);

      this.logger.log(`Found ${results.length} jobs via vector search`);
      return results;
    } catch (error) {
      this.logger.error('Failed to search jobs', error);
      throw new Error(`Failed to search jobs: ${error.message}`);
    }
  }

  /**
   * Generate embedding for text (exposed for external use)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return await this.embeddingService.embedText(text);
  }
}
