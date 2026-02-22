/**
 * EmbeddingService — wraps @huggingface/transformers to produce 384-dim
 * float vectors from text using all-MiniLM-L6-v2 (int8 quantized, ~23 MB).
 *
 * Initialization is lazy: the pipeline is created on the first call to
 * embed() or embedBatch(), so the MCP server handshake is never blocked.
 *
 * IMPORTANT: ORT_LOG_LEVEL must be set to 'error' before the first import
 * of @huggingface/transformers to prevent onnxruntime-node from writing
 * verbose output to stdout, which would corrupt the stdio JSON-RPC stream.
 * This is handled in src/index.ts before this module is loaded.
 */

// @huggingface/transformers ships a dedicated Node.js ESM build and resolves
// correctly under "moduleResolution": "Node16".
import { pipeline, env } from "@huggingface/transformers";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

// Typed helper to sidestep the overly-complex union overloads on pipeline()
const featurePipeline = pipeline as unknown as (
  task: "feature-extraction",
  model: string,
  options?: Record<string, unknown>
) => Promise<FeatureExtractionPipeline>;

// Store the model cache inside the same directory as the rest of the data
// so everything is in one predictable place (~/.agent-memcp/models/).
// This is configured externally by the caller via env.cacheDir before init().
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// ─── Cosine similarity ────────────────────────────────────────────────────────

/**
 * Computes cosine similarity between two equal-length float vectors.
 * Returns a value in [-1, 1]; higher = more similar.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── EmbeddingService ─────────────────────────────────────────────────────────

export class EmbeddingService {
  private initPromise: Promise<void> | null = null;
  private extractor: FeatureExtractionPipeline | null = null;

  constructor(private readonly cacheDir: string) {}

  /**
   * Trigger model loading in the background.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  warmUp(): void {
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
  }

  private async _init(): Promise<void> {
    console.error("[agent-memcp] Loading embedding model (first run may take a moment)...");

    // Point the HF cache to our data directory
    env.cacheDir = this.cacheDir;
    // Never phone home for model cards, telemetry etc.
    env.allowRemoteModels = true; // allow download on first run
    env.useBrowserCache = false;  // no IndexedDB in Node

    this.extractor = await featurePipeline("feature-extraction", MODEL_ID, {
      dtype: "q8",   // ~23 MB int8 quantized — best for CPU-only inference
      device: "cpu",
    });

    console.error("[agent-memcp] Embedding model ready.");
  }

  /** Ensure the pipeline is loaded, waiting if necessary. */
  private async ensureReady(): Promise<FeatureExtractionPipeline> {
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
    await this.initPromise;
    return this.extractor!;
  }

  /**
   * Embed a single string.
   * Returns a mean-pooled, L2-normalised 384-dim Float32Array.
   */
  async embed(text: string): Promise<Float32Array> {
    const extractor = await this.ensureReady();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    // output.data is a Float32Array
    return output.data as Float32Array;
  }

  /**
   * Embed multiple strings in a single batched forward pass.
   * Returns one Float32Array per input string.
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const extractor = await this.ensureReady();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const data = output.data as Float32Array;
    const dims = data.length / texts.length;
    return texts.map((_, i) => data.slice(i * dims, (i + 1) * dims));
  }
}
