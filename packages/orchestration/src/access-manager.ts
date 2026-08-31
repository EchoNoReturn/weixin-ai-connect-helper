import { getDb } from "@yoyojcoder-weixin-ai/core";

export type AccessStatus = "pending" | "approved" | "revoked";

export interface AccessRecord {
  userId: string;
  status: AccessStatus;
  firstSeenAt: number;
  updatedAt: number;
}

export interface AccessStore {
  getStatus(userId: string): AccessStatus | undefined;
  recordPending(userId: string): void;
}

interface AccessRow {
  user_id: string;
  status: AccessStatus;
  first_seen_at: number;
  updated_at: number;
}

function mapRow(row: AccessRow): AccessRecord {
  return {
    userId: row.user_id,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
  };
}

export class AccessManager implements AccessStore {
  getStatus(userId: string): AccessStatus | undefined {
    const row = getDb()
      .prepare("SELECT status FROM access_users WHERE user_id = ?")
      .get(userId) as Pick<AccessRow, "status"> | undefined;
    return row?.status;
  }

  recordPending(userId: string): void {
    getDb()
      .prepare("INSERT OR IGNORE INTO access_users (user_id, status) VALUES (?, 'pending')")
      .run(userId);
  }

  approve(userId: string): void {
    getDb()
      .prepare(`
        INSERT INTO access_users (user_id, status)
        VALUES (?, 'approved')
        ON CONFLICT(user_id) DO UPDATE SET
          status = 'approved',
          updated_at = unixepoch()
      `)
      .run(userId);
  }

  revoke(userId: string): void {
    getDb()
      .prepare(`
        INSERT INTO access_users (user_id, status)
        VALUES (?, 'revoked')
        ON CONFLICT(user_id) DO UPDATE SET
          status = 'revoked',
          updated_at = unixepoch()
      `)
      .run(userId);
  }

  list(status?: AccessStatus): AccessRecord[] {
    const rows = status
      ? getDb()
          .prepare("SELECT * FROM access_users WHERE status = ? ORDER BY updated_at DESC, user_id")
          .all(status)
      : getDb()
          .prepare("SELECT * FROM access_users ORDER BY updated_at DESC, user_id")
          .all();
    return (rows as AccessRow[]).map(mapRow);
  }
}
