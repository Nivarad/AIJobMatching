import { Injectable, Inject, Logger } from '@nestjs/common';
import { HfInference } from '@huggingface/inference';
import { LLMConfig } from './llm.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private hf: HfInference;
  private model: string;

  constructor(@Inject('LLM_CONFIG') private config: LLMConfig) {
    this.hf = new HfInference(config.hfToken);
    this.model = config.embeddingModel;
    this.logger.log(`Embedding Service initialized with model: ${this.model}`);
  }

  /**
   * Generate embedding for a single text
   * For BGE models, queries should have a special prefix for retrieval tasks
   */
  async embedText(text: string, isQuery: boolean = false): Promise<number[]> {
    try {
      // BGE models recommend adding instruction prefix for queries
      const inputText = isQuery
        ? `Represent this sentence for searching relevant passages: ${text}`
        : text;

      const embedding = await this.hf.featureExtraction({
        model: this.model,
        inputs: inputText,
      });

      // The response is a number[] for single input
      const vector = Array.isArray(embedding[0])
        ? (embedding[0] as number[])
        : (embedding as number[]);

      // Normalize the embedding for cosine similarity
      const normalized = this.normalize(vector);

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
  async embedTexts(
    texts: string[],
    isQuery: boolean = false,
  ): Promise<number[][]> {
    try {
      const inputTexts = isQuery
        ? texts.map(
            (t) => `Represent this sentence for searching relevant passages: ${t}`,
          )
        : texts;

      const embeddings = await this.hf.featureExtraction({
        model: this.model,
        inputs: inputTexts,
      });

      // Normalize all embeddings
      const normalized = (embeddings as number[][]).map((emb) =>
        this.normalize(emb),
      );

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
