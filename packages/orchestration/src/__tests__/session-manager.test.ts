import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// Mock the db module
const mockRun = mock(() => {});
const mockGet = mock(() => undefined);
const mockAll = mock(() => []);

mock.module("@yoyojcoder-weixin-ai/core", () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      run: mockRun,
      get: mockGet,
      all: mockAll,
    }),
  }),
}));

import { SessionManager } from "../session-manager.ts";

describe("SessionManager", () => {
  beforeEach(() => {
    mockRun.mockClear();
    mockGet.mockClear();
    mockAll.mockClear();
  });

  it("creates new session", () => {
    mockGet.mockReturnValue(undefined);
    const mgr = new SessionManager();
    const session = mgr.getOrCreate("user@im.wechat", "opencode");
    expect(session.id).toBe("user@im.wechat:opencode");
    expect(session.userId).toBe("user@im.wechat");
    expect(session.agentId).toBe("opencode");
    expect(session.ownedByBridge).toBe(true);
  });

  it("returns existing session", () => {
    mockGet.mockReturnValue({ id: "user@im.wechat:opencode", userId: "user@im.wechat", agentId: "opencode", ownedByBridge: true });
    const mgr = new SessionManager();
    const session = mgr.getOrCreate("user@im.wechat", "opencode");
    expect(session.id).toBe("user@im.wechat:opencode");
  });
});
