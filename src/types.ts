/**
 * Core types for agent-memcp
 */

// ─── Memory Entry ────────────────────────────────────────────────────────────

export interface MemoryEntry {
  /** Unique identifier (nanoid) */
  id: string;
  /** Optional short name / identifier — used for upsert by key */
  key?: string;
  /** Free-text content of the memory */
  content: string;
  /** Optional tags for categorisation and filtering */
  tags: string[];
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-updated timestamp */
  updatedAt: string;
}

// ─── Scope ───────────────────────────────────────────────────────────────────

/**
 * Scope for a memory operation.
 * - `undefined` / `null`  → global scope
 * - `"*"`                 → all scopes (read operations only)
 * - any other string      → project-specific scope
 */
export type Scope = string | undefined | null;

// ─── Storage Backend Interface ────────────────────────────────────────────────

export interface StorageBackend {
  /** Ensure backend is initialised (create files/tables etc.) */
  init(): Promise<void>;

  /**
   * Store a memory.
   * - If `entry.key` is provided and a memory with that key already exists in
   *   the given scope, it is updated (upsert). Otherwise a new entry is created.
   * - Returns the final stored entry.
   */
  store(scope: Scope, entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt"> & { id: string }): Promise<MemoryEntry>;

  /**
   * Full-text search across `key` and `content` fields.
   * - `scope === "*"` searches across all scopes.
   * - `tags` filter is AND-based (entry must have all specified tags).
   */
  retrieve(opts: {
    scope: Scope;
    query: string;
    tags?: string[];
    limit?: number;
  }): Promise<MemoryEntry[]>;

  /**
   * List all memories in a scope (no text query).
   * - `scope === "*"` lists across all scopes.
   * - `tags` filter is AND-based.
   */
  list(opts: {
    scope: Scope;
    tags?: string[];
  }): Promise<MemoryEntry[]>;

  /**
   * Delete a memory by id within the given scope.
   * Returns `true` if deleted, `false` if not found.
   */
  delete(scope: Scope, id: string): Promise<boolean>;

  /**
   * Rename a project scope.
   * All memories belonging to `oldName` are moved to `newName`.
   * Returns `true` if the project existed and was renamed, `false` if not found.
   * Throws if `newName` already exists.
   */
  renameProject(oldName: string, newName: string): Promise<boolean>;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface Config {
  /** Root directory for all data */
  storageDir: string;
  /** Path to SQLite DB file */
  sqlitePath: string;
}
