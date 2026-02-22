import type { Config, StorageBackend } from "../types.js";
import { SqliteBackend } from "./sqlite-backend.js";
import type { EmbeddingService } from "../embedding.js";

/**
 * Factory: returns a SqliteBackend for the given config.
 * Call `backend.init()` after getting the instance.
 */
export function createBackend(
  config: Config,
  embeddingService: EmbeddingService
): StorageBackend {
  return new SqliteBackend(config.sqlitePath, embeddingService);
}
