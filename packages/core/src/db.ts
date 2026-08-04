import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  const stateDir = process.env.BRIDGE_STATE_DIR?.trim() || path.join(os.homedir(), ".wah");
  mkdirSync(stateDir, { recursive: true });

  const dbPath = path.join(stateDir, "bridge.db");
  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      acp_session_id TEXT,
      owned_by_bridge INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_agent ON sessions(user_id, agent_id);
  `);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
