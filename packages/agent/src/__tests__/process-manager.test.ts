import { describe, it, expect } from "bun:test";
import { ProcessManager } from "../process-manager.ts";
import type { AcpAgent, AgentLifecycle } from "../acp-client.ts";
import type { AgentConfig } from "@yoyojcoder-weixin-ai/core";

const CFG: Record<string, AgentConfig> = {
  opencode: { command: "opencode", args: ["acp"], cwd: "." },
};

function fakeAgent(id: string): AcpAgent {
  return { id, dispose: async () => {} } as unknown as AcpAgent;
}

describe("ProcessManager", () => {
  it("throws for unknown agent", async () => {
    const pm = new ProcessManager(CFG, { autoApprove: true });
    await expect(pm.getAgent("nope")).rejects.toThrow('未知 agent "nope"');
  });

  it("starts agent once and caches it", async () => {
    let starts = 0;
    const pm = new ProcessManager(CFG, {
      autoApprove: true,
      startAgent: async (id) => { starts++; return fakeAgent(id); },
    });
    const a1 = await pm.getAgent("opencode");
    const a2 = await pm.getAgent("opencode");
    expect(starts).toBe(1);
    expect(a1).toBe(a2);
  });

  it("passes lifecycle callbacks through to start options", async () => {
    const events: string[] = [];
    const lifecycle: AgentLifecycle = {
      onReady: (id) => events.push(`ready:${id}`),
      onExit: (id, code) => events.push(`exit:${id}:${code}`),
    };
    const pm = new ProcessManager(CFG, {
      autoApprove: true,
      lifecycle,
      startAgent: async (id, _cfg, opts) => {
        opts.lifecycle?.onReady?.(id);
        opts.lifecycle?.onExit?.(id, 0);
        return fakeAgent(id);
      },
    });
    await pm.getAgent("opencode");
    expect(events).toEqual(["ready:opencode", "exit:opencode:0"]);
  });

  it("removes failed agent from cache so next call retries", async () => {
    let attempts = 0;
    const pm = new ProcessManager(CFG, {
      autoApprove: true,
      startAgent: async (id) => {
        attempts++;
        if (attempts === 1) throw new Error("spawn failed");
        return fakeAgent(id);
      },
    });
    await expect(pm.getAgent("opencode")).rejects.toThrow("spawn failed");
    const agent = await pm.getAgent("opencode");
    expect(attempts).toBe(2);
    expect(agent.id).toBe("opencode");
  });

  it("evicts agent from cache when its process exits, next call restarts", async () => {
    let starts = 0;
    let capturedLifecycle: AgentLifecycle | undefined;
    const pm = new ProcessManager(CFG, {
      autoApprove: true,
      startAgent: async (id, _cfg, opts) => {
        starts++;
        capturedLifecycle = opts.lifecycle;
        return fakeAgent(id);
      },
    });
    await pm.getAgent("opencode");
    expect(starts).toBe(1);

    // 进程退出后缓存应被驱逐
    capturedLifecycle?.onExit?.("opencode", 1);
    await pm.getAgent("opencode");
    expect(starts).toBe(2);
  });

  it("dispose disposes all cached agents", async () => {
    const disposed: string[] = [];
    const pm = new ProcessManager(CFG, {
      autoApprove: true,
      startAgent: async (id) => ({ id, dispose: async () => { disposed.push(id); } }) as unknown as AcpAgent,
    });
    await pm.getAgent("opencode");
    await pm.dispose();
    expect(disposed).toEqual(["opencode"]);
  });
});
