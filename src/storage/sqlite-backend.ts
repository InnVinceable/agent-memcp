import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { MemoryEntry, StorageBackend, Scope } from "../types.js";
import { EmbeddingService, cosineSimilarity } from "../embedding.js";

// better-sqlite3 is a CommonJS module; we use a dynamic require via createRequire
// so this file stays as ESM while still importing the CJS package at runtime.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ─── Types for better-sqlite3 ─────────────────────────────────────────────────

interface BetterSqlite3Database {
  prepare(sql: string): BetterSqlite3Statement;
  exec(sql: string): void;
  close(): void;
}

interface BetterSqlite3Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

// ─── Row shape stored in SQLite ───────────────────────────────────────────────

interface MemoryRow {
  id: string;
  scope: string;
  key: string | null;
  content: string;
  tags: string; // JSON array serialised as text
  embedding: Buffer | null; // Float32Array serialised as BLOB
  created_at: string;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseScope(scope: Scope): string {
  if (!scope || scope === "") return "global";
  return scope;
}

function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    key: row.key ?? undefined,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasAllTags(entryTags: string[], filterTags: string[]): boolean {
  if (filterTags.length === 0) return true;
  const lower = entryTags.map((t) => t.toLowerCase());
  return filterTags.every((t) => lower.includes(t.toLowerCase()));
}

/** Deserialise a BLOB buffer back into a Float32Array. */
function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Serialise a Float32Array to a Node.js Buffer for SQLite BLOB storage. */
function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

// ─── SqliteBackend ────────────────────────────────────────────────────────────

export class SqliteBackend implements StorageBackend {
  private db: BetterSqlite3Database | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly embeddingService: EmbeddingService
  ) {}

  async init(): Promise<void> {
    // Ensure parent directory exists
    mkdirSync(dirname(this.dbPath), { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3") as new (
      path: string
    ) => BetterSqlite3Database;

    this.db = new Database(this.dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id         TEXT PRIMARY KEY,
        scope      TEXT NOT NULL DEFAULT 'global',
        key        TEXT,
        content    TEXT NOT NULL,
        tags       TEXT NOT NULL DEFAULT '[]',
        embedding  BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS idx_memories_key   ON memories(scope, key);
    `);

    // Migrate: add embedding column to existing databases that predate this feature
    const cols = this.all("PRAGMA table_info(memories)") as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "embedding")) {
      this.db.exec("ALTER TABLE memories ADD COLUMN embedding BLOB");
    }
  }

  private get(sql: string, ...params: unknown[]): unknown {
    if (!this.db) throw new Error("SqliteBackend not initialised");
    return this.db.prepare(sql).get(...params);
  }

  private all(sql: string, ...params: unknown[]): unknown[] {
    if (!this.db) throw new Error("SqliteBackend not initialised");
    return this.db.prepare(sql).all(...params);
  }

  private run(sql: string, ...params: unknown[]): { changes: number } {
    if (!this.db) throw new Error("SqliteBackend not initialised");
    return this.db.prepare(sql).run(...params);
  }

  async store(
    scope: Scope,
    entry: Omit<MemoryEntry, "createdAt" | "updatedAt"> & { id: string }
  ): Promise<MemoryEntry> {
    const scopeStr = normaliseScope(scope);
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(entry.tags);

    // Generate embedding for the content
    const embeddingVec = await this.embeddingService.embed(entry.content);
    const embeddingBlob = float32ToBuffer(embeddingVec);

    // Upsert by key if provided
    if (entry.key) {
      const existing = this.get(
        "SELECT * FROM memories WHERE scope = ? AND lower(key) = lower(?)",
        scopeStr,
        entry.key
      ) as MemoryRow | undefined;

      if (existing) {
        this.run(
          `UPDATE memories
           SET key = ?, content = ?, tags = ?, embedding = ?, updated_at = ?
           WHERE id = ?`,
          entry.key,
          entry.content,
          tagsJson,
          embeddingBlob,
          now,
          existing.id
        );
        return rowToEntry({
          ...existing,
          key: entry.key,
          content: entry.content,
          tags: tagsJson,
          embedding: embeddingBlob,
          updated_at: now,
        });
      }
    }

    // Insert new
    this.run(
      `INSERT INTO memories (id, scope, key, content, tags, embedding, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.id,
      scopeStr,
      entry.key ?? null,
      entry.content,
      tagsJson,
      embeddingBlob,
      now,
      now
    );

    return {
      id: entry.id,
      key: entry.key,
      content: entry.content,
      tags: entry.tags,
      createdAt: now,
      updatedAt: now,
    };
  }

  async retrieve(opts: {
    scope: Scope;
    query: string;
    tags?: string[];
    limit?: number;
  }): Promise<MemoryEntry[]> {
    const { scope, query, tags = [], limit = 20 } = opts;
    const scopeStr = normaliseScope(scope);

    // Embed the query vector
    const queryVec = await this.embeddingService.embed(query);

    // Fetch all candidate rows (scoped or global)
    let rows: MemoryRow[];
    if (scope === "*") {
      rows = this.all(
        "SELECT * FROM memories ORDER BY updated_at DESC"
      ) as MemoryRow[];
    } else {
      rows = this.all(
        "SELECT * FROM memories WHERE scope = ? ORDER BY updated_at DESC",
        scopeStr
      ) as MemoryRow[];
    }

    // Filter by tags, then score by cosine similarity
    type Scored = { entry: MemoryEntry; score: number };
    const scored: Scored[] = [];

    for (const row of rows) {
      const entryTags = JSON.parse(row.tags) as string[];
      if (!hasAllTags(entryTags, tags)) continue;

      const entry = rowToEntry(row);

      if (!row.embedding) {
        // Entry predates semantic search — skip (no vector available)
        continue;
      }

      const entryVec = bufferToFloat32(row.embedding);
      const score = cosineSimilarity(queryVec, entryVec);
      scored.push({ entry, score });
    }

    // Sort by descending similarity and return top-k
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.entry);
  }

  async list(opts: { scope: Scope; tags?: string[] }): Promise<MemoryEntry[]> {
    const { scope, tags = [] } = opts;
    const scopeStr = normaliseScope(scope);

    let rows: MemoryRow[];
    if (scope === "*") {
      rows = this.all(
        "SELECT * FROM memories ORDER BY updated_at DESC"
      ) as MemoryRow[];
    } else {
      rows = this.all(
        "SELECT * FROM memories WHERE scope = ? ORDER BY updated_at DESC",
        scopeStr
      ) as MemoryRow[];
    }

    if (tags.length === 0) return rows.map(rowToEntry);

    return rows
      .filter((row) => {
        const entryTags = JSON.parse(row.tags) as string[];
        return hasAllTags(entryTags, tags);
      })
      .map(rowToEntry);
  }

  async delete(scope: Scope, id: string): Promise<boolean> {
    const scopeStr = normaliseScope(scope);
    const result = this.run(
      "DELETE FROM memories WHERE scope = ? AND id = ?",
      scopeStr,
      id
    );
    return result.changes > 0;
  }

  async renameProject(oldName: string, newName: string): Promise<boolean> {
    // Check old project exists
    const existing = this.get(
      "SELECT COUNT(*) as cnt FROM memories WHERE scope = ?",
      oldName
    ) as { cnt: number };
    if (!existing || existing.cnt === 0) return false;

    // Check new project name is not already in use
    const conflict = this.get(
      "SELECT COUNT(*) as cnt FROM memories WHERE scope = ?",
      newName
    ) as { cnt: number };
    if (conflict && conflict.cnt > 0) {
      throw new Error(`Project "${newName}" already exists`);
    }

    this.run("UPDATE memories SET scope = ? WHERE scope = ?", newName, oldName);
    return true;
  }
}
