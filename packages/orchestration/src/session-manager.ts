import { getDb } from "@yoyojcoder-weixin-ai/core";

export interface SessionRecord {
  id: string;
  userId: string;
  agentId: string;
  acpSessionId?: string;
  ownedByBridge: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  agent_id: string;
  acp_session_id: string | null;
  owned_by_bridge: number;
  created_at: number;
  updated_at: number;
}

function mapSessionRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    acpSessionId: row.acp_session_id ?? undefined,
    ownedByBridge: row.owned_by_bridge === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SessionManager {
  getOrCreate(userId: string, agentId: string, requestedId?: string): SessionRecord {
    const id = requestedId ?? `${userId}:${agentId}`;
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    if (row) return mapSessionRow(row);

    const created = db.prepare(
      "INSERT INTO sessions (id, user_id, agent_id, owned_by_bridge) VALUES (?, ?, ?, 1) RETURNING *",
    ).get(id, userId, agentId) as SessionRow;
    return mapSessionRow(created);
  }

  updateAcpSessionId(sessionId: string, acpSessionId: string): void {
    const db = getDb();
    db.prepare("UPDATE sessions SET acp_session_id = ?, updated_at = unixepoch() WHERE id = ?").run(
      acpSessionId,
      sessionId,
    );
  }

  saveMessage(sessionId: string, role: "user" | "assistant", content: string): void {
    const db = getDb();
    db.prepare("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)").run(
      sessionId,
      role,
      content,
    );
  }

  get(sessionId: string): SessionRecord | undefined {
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
    return row ? mapSessionRow(row) : undefined;
  }
}
