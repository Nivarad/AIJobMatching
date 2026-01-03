import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';

export interface QdrantConfig {
  host: string;
  port: number;
  candidatesCollection: string;
  jobsCollection: string;
  embeddingDimensions: number;
}

export interface CandidatePayload {
  candidateId: string;
  name?: string;
  email?: string;
  skills: string[];
  experienceYears: number;
  location?: string;
  summary: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface JobPayload {
  jobId: string;
  title: string;
  company?: string;
  requirements: string[];
  location?: string;
  summary: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: CandidatePayload | JobPayload;
}

@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private client: QdrantClient;
  private candidatesCollection: string;
  private jobsCollection: string;
  private embeddingDimensions: number;

  constructor(@Inject('QDRANT_CONFIG') private config: QdrantConfig) {
    this.client = new QdrantClient({
      host: config.host,
      port: config.port,
    });
    this.candidatesCollection = config.candidatesCollection;
    this.jobsCollection = config.jobsCollection;
    this.embeddingDimensions = config.embeddingDimensions;
  }

  async onModuleInit() {
    await this.ensureCollections();
  }

  /**
   * Ensure required collections exist in Qdrant
   */
  private async ensureCollections(): Promise<void> {
    try {
      // Check and create candidates collection
      const candidatesExists = await this.collectionExists(
        this.candidatesCollection,
      );
      if (!candidatesExists) {
        await this.createCollection(this.candidatesCollection);
        this.logger.log(
          `Created collection: ${this.candidatesCollection}`,
        );
      } else {
        this.logger.log(
          `Collection exists: ${this.candidatesCollection}`,
        );
      }

      // Check and create jobs collection
      const jobsExists = await this.collectionExists(this.jobsCollection);
      if (!jobsExists) {
        await this.createCollection(this.jobsCollection);
        this.logger.log(`Created collection: ${this.jobsCollection}`);
      } else {
        this.logger.log(`Collection exists: ${this.jobsCollection}`);
      }
    } catch (error) {
      this.logger.error('Failed to initialize Qdrant collections', error);
      throw error;
    }
  }

  /**
   * Check if a collection exists
   */
  private async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.client.getCollection(collectionName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a new collection with the configured dimensions
   */
  private async createCollection(collectionName: string): Promise<void> {
    try {
      this.logger.log(`Creating collection ${collectionName} with dimensions: ${this.embeddingDimensions}`);
      
      const vectorsConfig = {
        size: this.embeddingDimensions,
        distance: 'Cosine' as const,
      };
      
      this.logger.log(`Vectors config: ${JSON.stringify(vectorsConfig)}`);
      
      await this.client.createCollection(collectionName, {
        vectors: vectorsConfig,
      });
      
      this.logger.log(`Successfully created collection: ${collectionName}`);
    } catch (error) {
      this.logger.error(`Failed to create collection ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Upsert a candidate embedding into Qdrant
   */
  async upsertCandidate(
    candidateId: string,
    embedding: number[],
    payload: CandidatePayload,
  ): Promise<string> {
    const pointId = uuidv4();

    await this.client.upsert(this.candidatesCollection, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: payload,
        },
      ],
    });

    this.logger.log(`Upserted candidate ${candidateId} with point ID ${pointId}`);
    return pointId;
  }

  /**
   * Upsert a job embedding into Qdrant
   */
  async upsertJob(
    jobId: string,
    embedding: number[],
    payload: JobPayload,
  ): Promise<string> {
    const pointId = uuidv4();

    await this.client.upsert(this.jobsCollection, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: payload,
        },
      ],
    });

    this.logger.log(`Upserted job ${jobId} with point ID ${pointId}`);
    return pointId;
  }

  /**
   * Search for similar candidates based on job embedding
   */
  async searchCandidates(
    queryEmbedding: number[],
    limit: number = 10,
    filter?: {
      skills?: string[];
      minExperienceYears?: number;
      location?: string;
    },
  ): Promise<SearchResult[]> {
    const searchFilter = this.buildFilter(filter);

    const results = await this.client.search(this.candidatesCollection, {
      vector: queryEmbedding,
      limit,
      filter: searchFilter,
      with_payload: true,
    });

    return results.map((result) => ({
      id: result.id as string,
      score: result.score,
      payload: result.payload as CandidatePayload,
    }));
  }

  /**
   * Search for similar jobs based on candidate embedding
   */
  async searchJobs(
    queryEmbedding: number[],
    limit: number = 10,
  ): Promise<SearchResult[]> {
    const results = await this.client.search(this.jobsCollection, {
      vector: queryEmbedding,
      limit,
      with_payload: true,
    });

    return results.map((result) => ({
      id: result.id as string,
      score: result.score,
      payload: result.payload as JobPayload,
    }));
  }

  /**
   * Build Qdrant filter from search parameters
   */
  private buildFilter(filter?: {
    skills?: string[];
    minExperienceYears?: number;
    location?: string;
  }) {
    if (!filter) return undefined;

    const conditions: any[] = [];

    if (filter.skills && filter.skills.length > 0) {
      conditions.push({
        key: 'skills',
        match: { any: filter.skills },
      });
    }

    if (filter.minExperienceYears !== undefined) {
      conditions.push({
        key: 'experienceYears',
        range: { gte: filter.minExperienceYears },
      });
    }

    if (filter.location) {
      conditions.push({
        key: 'location',
        match: { value: filter.location },
      });
    }

    if (conditions.length === 0) return undefined;

    return { must: conditions };
  }

  /**
   * Delete a point by ID
   */
  async deletePoint(
    collectionName: 'candidates' | 'jobs',
    pointId: string,
  ): Promise<void> {
    const collection =
      collectionName === 'candidates'
        ? this.candidatesCollection
        : this.jobsCollection;

    await this.client.delete(collection, {
      wait: true,
      points: [pointId],
    });

    this.logger.log(`Deleted point ${pointId} from ${collection}`);
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(
    collectionName: 'candidates' | 'jobs',
  ): Promise<any> {
    const collection =
      collectionName === 'candidates'
        ? this.candidatesCollection
        : this.jobsCollection;

    return await this.client.getCollection(collection);
  }
}
