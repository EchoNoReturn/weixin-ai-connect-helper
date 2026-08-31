import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// Mock the db module
const mockRun = mock(() => {});
const mockGet = mock((): unknown => undefined);
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
    mockGet.mockReturnValueOnce(undefined).mockReturnValueOnce({
      id: "user@im.wechat:opencode",
      user_id: "user@im.wechat",
      agent_id: "opencode",
      acp_session_id: null,
      owned_by_bridge: 1,
      created_at: 1,
      updated_at: 1,
    });
    const mgr = new SessionManager();
    const session = mgr.getOrCreate("user@im.wechat", "opencode");
    expect(session.id).toBe("user@im.wechat:opencode");
    expect(session.userId).toBe("user@im.wechat");
    expect(session.agentId).toBe("opencode");
    expect(session.ownedByBridge).toBe(true);
  });

  it("returns existing session", () => {
    mockGet.mockReturnValue({
      id: "user@im.wechat:opencode",
      user_id: "user@im.wechat",
      agent_id: "opencode",
      acp_session_id: null,
      owned_by_bridge: 1,
      created_at: 1,
      updated_at: 1,
    });
    const mgr = new SessionManager();
    const session = mgr.getOrCreate("user@im.wechat", "opencode");
    expect(session.id).toBe("user@im.wechat:opencode");
  });
});
