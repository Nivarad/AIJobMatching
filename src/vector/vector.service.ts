/**
 * =============================================================================
 * VECTOR SERVICE - Qdrant Vector Database Integration
 * =============================================================================
 * 
 * This service handles all interactions with the Qdrant vector database,
 * which stores embeddings for semantic search functionality in the RAG pipeline.
 * 
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                         QDRANT VECTOR DATABASE                              │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │  Collection: candidates                │  Collection: jobs                  │
 * │  ┌─────────────────────────────────┐   │  ┌─────────────────────────────┐   │
 * │  │ Vector: 768-dim embedding       │   │  │ Vector: 768-dim embedding   │   │
 * │  │ Payload:                        │   │  │ Payload:                    │   │
 * │  │   - candidateId                 │   │  │   - jobId                   │   │
 * │  │   - name, email                 │   │  │   - title, company          │   │
 * │  │   - skills[]                    │   │  │   - requirements[]          │   │
 * │  │   - experienceYears             │   │  │   - location                │   │
 * │  │   - location                    │   │  │   - summary                 │   │
 * │  │   - summary                     │   │  │   - createdAt               │   │
 * │  └─────────────────────────────────┘   │  └─────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * Distance Metric: Cosine Similarity
 * - Values range from 0 (dissimilar) to 1 (identical)
 * - Embeddings are normalized, so cosine = dot product
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for Qdrant connection
 */
export interface QdrantConfig {
  host: string;                    // Qdrant server host (default: localhost)
  port: number;                    // Qdrant server port (default: 6333)
  candidatesCollection: string;    // Collection name for candidates
  jobsCollection: string;          // Collection name for jobs
  embeddingDimensions: number;     // Vector dimensions (768 for text-embedding-004)
}

/**
 * Payload structure for candidate vectors
 * Contains metadata stored alongside the embedding
 */
export interface CandidatePayload {
  candidateId: string;        // Reference to PostgreSQL record
  name?: string;              // Candidate name
  email?: string;             // Contact email
  skills: string[];           // List of skill names
  experienceYears: number;    // Total years of experience
  location?: string;          // Candidate location
  summary: string;            // Professional summary (used for embedding)
  createdAt: string;          // Timestamp
  [key: string]: unknown;     // Allow additional properties
}

/**
 * Payload structure for job vectors
 */
export interface JobPayload {
  jobId: string;              // Reference to PostgreSQL record
  title: string;              // Job title
  company?: string;           // Company name
  requirements: string[];     // Required skills
  location?: string;          // Job location
  summary: string;            // Job summary (used for embedding)
  createdAt: string;          // Timestamp
  [key: string]: unknown;     // Allow additional properties
}

/**
 * Result from vector similarity search
 */
export interface SearchResult {
  id: string;                            // Qdrant point ID
  score: number;                         // Cosine similarity (0-1)
  payload: CandidatePayload | JobPayload; // Associated metadata
}

/**
 * VectorService - Manages Qdrant vector database operations
 * 
 * This service provides:
 * - Collection initialization on startup
 * - Upsert operations for adding/updating vectors
 * - Similarity search with optional filtering
 * - Point management (delete, info)
 */
@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private client: QdrantClient;
  private candidatesCollection: string;
  private jobsCollection: string;
  private embeddingDimensions: number;

  constructor(@Inject('QDRANT_CONFIG') private config: QdrantConfig) {
    // Initialize Qdrant client with configured connection
    this.client = new QdrantClient({
      host: config.host,
      port: config.port,
    });
    this.candidatesCollection = config.candidatesCollection;
    this.jobsCollection = config.jobsCollection;
    this.embeddingDimensions = config.embeddingDimensions;
  }

  /**
   * NestJS lifecycle hook - runs when module initializes
   * Ensures required collections exist before application starts
   */
  async onModuleInit() {
    await this.ensureCollections();
  }

  /**
   * Ensure required collections exist in Qdrant
   * Creates collections if they don't exist
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
   * Check if a collection exists in Qdrant
   * 
   * @param collectionName - Name of the collection to check
   * @returns true if collection exists, false otherwise
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
   * Create a new collection with the configured vector dimensions
   * Uses Cosine distance metric for similarity measurement
   * 
   * @param collectionName - Name for the new collection
   */
  private async createCollection(collectionName: string): Promise<void> {
    try {
      this.logger.log(`Creating collection ${collectionName} with dimensions: ${this.embeddingDimensions}`);
      
      // Configure vectors with Cosine similarity (best for normalized embeddings)
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
   * 
   * Creates a new point with the candidate's embedding and metadata.
   * The point ID is auto-generated as UUID.
   * 
   * @param candidateId - PostgreSQL candidate ID for reference
   * @param embedding - 768-dimensional vector
   * @param payload - Candidate metadata
   * @returns Generated point ID
   */
  async upsertCandidate(
    candidateId: string,
    embedding: number[],
    payload: CandidatePayload,
  ): Promise<string> {
    const pointId = uuidv4();

    await this.client.upsert(this.candidatesCollection, {
      wait: true,  // Wait for operation to complete
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
   * 
   * @param jobId - PostgreSQL job ID for reference
   * @param embedding - 768-dimensional vector
   * @param payload - Job metadata
   * @returns Generated point ID
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
   * 
   * This is the core semantic search functionality. Given a job's
   * embedding, it finds candidates with similar embeddings (similar
   * professional profiles/skills).
   * 
   * @param queryEmbedding - Job embedding to search against
   * @param limit - Maximum number of results (default: 10)
   * @param filter - Optional filters for skills, experience, location
   * @returns Array of matching candidates with similarity scores
   */
  async searchCandidates(
    queryEmbedding: number[],
    limit: number = 10,
    filter?: {
      skills?: string[];            // Filter by required skills
      minExperienceYears?: number;  // Filter by minimum experience
      location?: string;            // Filter by location
    },
  ): Promise<SearchResult[]> {
    // Build Qdrant filter from search parameters
    const searchFilter = this.buildFilter(filter);

    const results = await this.client.search(this.candidatesCollection, {
      vector: queryEmbedding,
      limit,
      filter: searchFilter,
      with_payload: true,  // Include metadata in results
    });

    return results.map((result) => ({
      id: result.id as string,
      score: result.score,
      payload: result.payload as CandidatePayload,
    }));
  }

  /**
   * Search for similar jobs based on candidate embedding
   * 
   * Finds jobs that match a candidate's profile based on
   * semantic similarity of their embeddings.
   * 
   * @param queryEmbedding - Candidate embedding to search against
   * @param limit - Maximum number of results
   * @returns Array of matching jobs with similarity scores
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
   * 
   * Translates high-level filter criteria into Qdrant's filter format.
   * Supports filtering by:
   * - skills (any match)
   * - minimum experience years (range)
   * - exact location match
   * 
   * @param filter - Search filter parameters
   * @returns Qdrant-compatible filter object or undefined
   */
  private buildFilter(filter?: {
    skills?: string[];
    minExperienceYears?: number;
    location?: string;
  }) {
    if (!filter) return undefined;

    const conditions: any[] = [];

    // Skills filter: match if candidate has ANY of the required skills
    if (filter.skills && filter.skills.length > 0) {
      conditions.push({
        key: 'skills',
        match: { any: filter.skills },
      });
    }

    // Experience filter: minimum years required
    if (filter.minExperienceYears !== undefined) {
      conditions.push({
        key: 'experienceYears',
        range: { gte: filter.minExperienceYears },
      });
    }

    // Location filter: exact match
    if (filter.location) {
      conditions.push({
        key: 'location',
        match: { value: filter.location },
      });
    }

    // Return undefined if no conditions (no filter applied)
    if (conditions.length === 0) return undefined;

    // Combine conditions with AND (must all match)
    return { must: conditions };
  }

  /**
   * Delete a point by ID
   * 
   * @param collectionName - 'candidates' or 'jobs'
   * @param pointId - Qdrant point ID to delete
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
   * Get collection information
   * 
   * Returns statistics and configuration for a collection.
   * Useful for debugging and monitoring.
   * 
   * @param collectionName - 'candidates' or 'jobs'
   * @returns Collection info object from Qdrant
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
