import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Config } from "./types.js";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_STORAGE_DIR = join(homedir(), ".agent-memcp");

const DEFAULTS: Config = {
  storageDir: DEFAULT_STORAGE_DIR,
  sqlitePath: join(DEFAULT_STORAGE_DIR, "memories.db"),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFileConfig(storageDir: string): Partial<Config> {
  const configPath = join(storageDir, "config.json");
  if (!existsSync(configPath)) return {};
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Partial<Config>;
  } catch {
    // Malformed config — ignore and use defaults
    return {};
  }
}

// ─── Load Config ──────────────────────────────────────────────────────────────

/**
 * Loads configuration by merging (highest → lowest priority):
 *   1. Environment variables
 *   2. ~/.agent-memcp/config.json  (or MEMCP_STORAGE_DIR/config.json)
 *   3. Built-in defaults
 */
export function loadConfig(): Config {
  // Step 1: determine storageDir (env var or default)
  const storageDir = process.env["MEMCP_STORAGE_DIR"]
    ? resolve(process.env["MEMCP_STORAGE_DIR"])
    : DEFAULTS.storageDir;

  // Step 2: read file-based config from that dir
  const fileConfig = readFileConfig(storageDir);

  const defaultSqlitePath = join(storageDir, "memories.db");

  const sqlitePath =
    process.env["MEMCP_SQLITE_PATH"] ??
    fileConfig.sqlitePath ??
    defaultSqlitePath;

  return {
    storageDir,
    sqlitePath: resolve(sqlitePath),
  };
}

// ─── Ensure Directories ───────────────────────────────────────────────────────

/**
 * Creates the storage directory if it doesn't exist.
 * Call this once at startup.
 */
export function ensureStorageDirs(config: Config): void {
  mkdirSync(config.storageDir, { recursive: true });
}

// ─── Persist Config ───────────────────────────────────────────────────────────

/**
 * Writes the current config to ~/.agent-memcp/config.json.
 */
export function saveConfig(config: Config): void {
  mkdirSync(config.storageDir, { recursive: true });
  const configPath = join(config.storageDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}
