import { Injectable, Inject, Logger } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { LLMConfig } from './llm.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private embeddings: GoogleGenerativeAIEmbeddings;
  private model: string;

  constructor(@Inject('LLM_CONFIG') private config: LLMConfig) {
    this.model = config.embeddingModel;
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: config.geminiApiKey,
      model: this.model,
    });
    this.logger.log(`Embedding Service initialized with model: ${this.model}`);
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const embedding = await this.embeddings.embedQuery(text);
      
      // Normalize the embedding for cosine similarity (required by Qdrant)
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
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    try {
      const embeddings = await this.embeddings.embedDocuments(texts);

      // Normalize all embeddings
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
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((val) => val / magnitude);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }

    // Vectors are already normalized, so magnitude is 1
    return dotProduct;
  }
}
