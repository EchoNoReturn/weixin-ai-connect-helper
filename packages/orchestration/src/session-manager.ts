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

export class SessionManager {
  getOrCreate(userId: string, agentId: string): SessionRecord {
    const id = `${userId}:${agentId}`;
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRecord | undefined;
    if (row) return row;

    db.prepare(
      "INSERT INTO sessions (id, user_id, agent_id, owned_by_bridge) VALUES (?, ?, ?, 1)",
    ).run(id, userId, agentId);

    return {
      id,
      userId,
      agentId,
      ownedByBridge: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
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
    return db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRecord | undefined;
  }
}
