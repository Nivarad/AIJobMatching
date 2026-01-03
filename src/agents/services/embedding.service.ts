/**
 * =============================================================================
 * EMBEDDING SERVICE - Google Text Embedding Integration
 * =============================================================================
 * 
 * This service generates vector embeddings using Google's text-embedding-004 model.
 * Embeddings are used for semantic similarity search in the RAG pipeline.
 * 
 * Key Features:
 * - 768-dimensional embeddings for semantic search
 * - Vector normalization for cosine similarity
 * - Batch embedding support for efficiency
 * - Cosine similarity calculation utility
 * 
 * Model: text-embedding-004
 * - Google's latest text embedding model
 * - 768 dimensions (higher than older models)
 * - Optimized for semantic similarity tasks
 * 
 * @author Niv Arad
 * @version 1.0.0
 * =============================================================================
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { LLMConfig } from './llm.service';

/**
 * EmbeddingService - Handles vector embedding generation
 * 
 * This service wraps the LangChain Google GenAI embeddings to provide
 * a consistent interface for embedding generation throughout the application.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private embeddings: GoogleGenerativeAIEmbeddings;
  private model: string;

  constructor(@Inject('LLM_CONFIG') private config: LLMConfig) {
    this.model = config.embeddingModel;
    // Initialize LangChain Google embeddings wrapper
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: config.geminiApiKey,
      model: this.model,
    });
    this.logger.log(`Embedding Service initialized with model: ${this.model}`);
  }

  /**
   * Generate embedding for a single text
   * 
   * Generates a 768-dimensional embedding vector for the input text.
   * The vector is normalized for cosine similarity calculation.
   * 
   * @param text - Input text to embed (e.g., CV summary, job summary)
   * @returns Promise<number[]> - Normalized 768-dimensional embedding vector
   */
  async embedText(text: string): Promise<number[]> {
    try {
      // Generate raw embedding using Google's model
      const embedding = await this.embeddings.embedQuery(text);
      
      // Normalize the embedding for cosine similarity (required by Qdrant)
      // Normalization ensures all vectors have unit length (magnitude = 1)
      const normalized = this.normalize(embedding);

      this.logger.debug(
        `Generated embedding with ${normalized.length} dimensions`,
      );
      return normalized;
    } catch (error) {
      this.logger.error('Failed to generate embedding', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * 
   * More efficient than calling embedText multiple times for large datasets.
   * All embeddings are normalized before returning.
   * 
   * @param texts - Array of texts to embed
   * @returns Promise<number[][]> - Array of normalized embedding vectors
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    try {
      // Batch embed all documents
      const embeddings = await this.embeddings.embedDocuments(texts);

      // Normalize all embeddings for consistency
      const normalized = embeddings.map((emb) => this.normalize(emb));

      this.logger.debug(
        `Generated ${normalized.length} embeddings with ${normalized[0]?.length} dimensions each`,
      );
      return normalized;
    } catch (error) {
      this.logger.error('Failed to generate batch embeddings', error);
      throw new Error(`Failed to generate batch embeddings: ${error.message}`);
    }
  }

  /**
   * Normalize vector for cosine similarity
   * 
   * Normalizes a vector to have unit length (magnitude = 1).
   * This is required for accurate cosine similarity calculations
   * and is a best practice when storing vectors in Qdrant.
   * 
   * Formula: normalized_v = v / ||v||
   * 
   * @param vector - Raw embedding vector
   * @returns number[] - Normalized vector with magnitude 1
   */
  private normalize(vector: number[]): number[] {
    // Calculate magnitude (Euclidean norm / L2 norm)
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );

    // Handle zero vector case
    if (magnitude === 0) {
      return vector;
    }

    // Divide each component by magnitude
    return vector.map((val) => val / magnitude);
  }

  /**
   * Calculate cosine similarity between two vectors
   * 
   * Cosine similarity measures the angle between two vectors:
   * - 1.0 = identical direction (most similar)
   * - 0.0 = perpendicular (no similarity)
   * - -1.0 = opposite direction (least similar)
   * 
   * For normalized vectors: similarity = dot_product(A, B)
   * 
   * @param vectorA - First embedding vector
   * @param vectorB - Second embedding vector
   * @returns number - Cosine similarity score (-1 to 1)
   */
  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    // Vectors must have same dimensions
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    // For normalized vectors, cosine similarity = dot product
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }

    // Vectors are already normalized, so magnitude is 1
    return dotProduct;
  }
}
