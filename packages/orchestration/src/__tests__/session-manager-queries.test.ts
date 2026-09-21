import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tmpState = mkdtempSync(path.join(tmpdir(), "wah-sm-"));
process.env.BRIDGE_STATE_DIR = tmpState;

const { SessionManager } = await import("../session-manager.ts");
const { closeDb, getDb } = await import("@yoyojcoder-weixin-ai/core");

afterAll(async () => {
  closeDb();
  await Bun.sleep(100);
  try { rmSync(tmpState, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
});

describe("SessionManager 基础", () => {
  it("creates new session", () => {
    const mgr = new SessionManager();
    const session = mgr.getOrCreate("new@im.wechat", "opencode");
    expect(session.id).toBe("new@im.wechat:opencode");
    expect(session.userId).toBe("new@im.wechat");
    expect(session.agentId).toBe("opencode");
    expect(session.ownedByBridge).toBe(true);
  });

  it("returns existing session on second call", () => {
    const mgr = new SessionManager();
    const s1 = mgr.getOrCreate("dup@im.wechat", "opencode");
    const s2 = mgr.getOrCreate("dup@im.wechat", "opencode");
    expect(s2.id).toBe(s1.id);
  });
});

describe("SessionManager 查询方法", () => {
  it("list 返回会话及消息数，按活跃倒序", () => {
    const mgr = new SessionManager();
    mgr.getOrCreate("ua@im.wechat", "opencode");
    mgr.getOrCreate("ub@im.wechat", "claude");
    mgr.saveMessage("ua@im.wechat:opencode", "user", "q1");
    mgr.saveMessage("ua@im.wechat:opencode", "assistant", "a1");
    mgr.saveMessage("ua@im.wechat:opencode", "user", "q2");

    // DB 是进程级单例（可能被其他测试文件写入），只断言本用例的会话
    const list = mgr.list().filter((s) => ["ua@im.wechat", "ub@im.wechat"].includes(s.userId));
    expect(list).toHaveLength(2);
    const ua = list.find((s) => s.userId === "ua@im.wechat")!;
    const ub = list.find((s) => s.userId === "ub@im.wechat")!;
    expect(ua.messageCount).toBe(3);
    expect(ub.messageCount).toBe(0);
    expect(ua.ownedByBridge).toBe(true);
    expect(typeof ua.createdAt).toBe("number");
  });

  it("getMessages 按时间正序返回消息", () => {
    const mgr = new SessionManager();
    mgr.getOrCreate("uc@im.wechat", "opencode");
    mgr.saveMessage("uc@im.wechat:opencode", "user", "第一问");
    mgr.saveMessage("uc@im.wechat:opencode", "assistant", "第一答");

    const msgs = mgr.getMessages("uc@im.wechat:opencode");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("user");
    expect(msgs[0]!.content).toBe("第一问");
    expect(msgs[1]!.role).toBe("assistant");
    expect(msgs[0]!.id).toBeLessThan(msgs[1]!.id);
  });

  it("getMessages 支持 limit", () => {
    const mgr = new SessionManager();
    mgr.getOrCreate("ud@im.wechat", "opencode");
    for (let i = 0; i < 5; i++) mgr.saveMessage("ud@im.wechat:opencode", "user", `m${i}`);
    const msgs = mgr.getMessages("ud@im.wechat:opencode", 3);
    expect(msgs).toHaveLength(3);
    expect(msgs[0]!.content).toBe("m0");
  });

  it("getMessages 未知会话返回空数组", () => {
    const mgr = new SessionManager();
    expect(mgr.getMessages("nobody:noop")).toEqual([]);
  });

  it("get 返回字段映射正确（snake_case → camelCase）", () => {
    const mgr = new SessionManager();
    mgr.getOrCreate("ue@im.wechat", "opencode");
    mgr.updateAcpSessionId("ue@im.wechat:opencode", "acp-123");
    const rec = mgr.get("ue@im.wechat:opencode")!;
    expect(rec.userId).toBe("ue@im.wechat");
    expect(rec.agentId).toBe("opencode");
    expect(rec.acpSessionId).toBe("acp-123");
    expect(rec.ownedByBridge).toBe(true);
  });

  it("getOrCreate 已存在会话同样返回映射后的记录", () => {
    // 回归：曾经直接返回 snake_case 裸行，userId/ownedByBridge 全是 undefined
    const mgr = new SessionManager();
    mgr.getOrCreate("uf@im.wechat", "opencode");
    const rec = mgr.getOrCreate("uf@im.wechat", "opencode");
    expect(rec.userId).toBe("uf@im.wechat");
    expect(rec.agentId).toBe("opencode");
    expect(rec.ownedByBridge).toBe(true);
    expect(typeof rec.createdAt).toBe("number");
    expect(typeof rec.updatedAt).toBe("number");
  });

  it("saveMessage 更新会话 updated_at（list 按最近活跃排序）", () => {
    const mgr = new SessionManager();
    mgr.getOrCreate("ug@im.wechat", "opencode");
    // 把活跃时间改到过去，再存消息，应被刷回当前时间
    getDb().prepare("UPDATE sessions SET updated_at = unixepoch() - 3600 WHERE id = ?").run("ug@im.wechat:opencode");
    const before = mgr.get("ug@im.wechat:opencode")!.updatedAt;

    mgr.saveMessage("ug@im.wechat:opencode", "user", "新消息");

    const after = mgr.get("ug@im.wechat:opencode")!.updatedAt;
    expect(after).toBeGreaterThan(before);
  });
});
