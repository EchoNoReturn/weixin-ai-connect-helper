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
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    if (row) return rowToRecord(row);

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
    // 同事务更新会话活跃时间，保证 list() 的"最近活跃"排序正确
    db.transaction(() => {
      db.prepare("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)").run(
        sessionId,
        role,
        content,
      );
      db.prepare("UPDATE sessions SET updated_at = unixepoch() WHERE id = ?").run(sessionId);
    })();
  }

  get(sessionId: string): SessionRecord | undefined {
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as any;
    return row ? rowToRecord(row) : undefined;
  }

  /** 会话列表（按最近活跃倒序），含消息数 */
  list(): Array<SessionRecord & { messageCount: number }> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT s.*, COUNT(m.id) AS message_count
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all() as any[];
    return rows.map((r) => ({ ...rowToRecord(r), messageCount: r.message_count as number }));
  }

  /** 会话消息历史（按时间正序） */
  getMessages(sessionId: string, limit = 100): Array<{ id: number; role: string; content: string; createdAt: number }> {
    const db = getDb();
    const rows = db.prepare(
      "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT ?",
    ).all(sessionId, limit) as any[];
    return rows.map((r) => ({
      id: r.id as number,
      role: r.role as string,
      content: r.content as string,
      createdAt: (r.created_at as number) * 1000,
    }));
  }
}

function rowToRecord(row: any): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    acpSessionId: row.acp_session_id ?? undefined,
    ownedByBridge: !!row.owned_by_bridge,
    createdAt: (row.created_at as number) * 1000,
    updatedAt: (row.updated_at as number) * 1000,
  };
}
