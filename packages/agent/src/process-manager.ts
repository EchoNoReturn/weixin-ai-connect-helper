import { AcpAgent } from "./acp-client.ts";
import type { AgentConfig } from "@yoyojcoder-weixin-ai/core";

export class ProcessManager {
  private agents = new Map<string, Promise<AcpAgent>>();

  constructor(
    private agentConfigs: Record<string, AgentConfig>,
    private opts: { autoApprove: boolean },
  ) {}

  async getAgent(agentId: string): Promise<AcpAgent> {
    let pending = this.agents.get(agentId);
    if (pending) {
      const existing = await pending;
      if (existing.isAlive) return existing;
      this.agents.delete(agentId);
      pending = undefined;
    }
    if (!pending) {
      const cfg = this.agentConfigs[agentId];
      if (!cfg) throw new Error(`未知 agent "${agentId}"`);
      pending = AcpAgent.start(agentId, cfg, this.opts);
      this.agents.set(agentId, pending);
      pending.catch(() => this.agents.delete(agentId));
      void pending.then((agent) => {
        agent.onExit(() => {
          if (this.agents.get(agentId) === pending) this.agents.delete(agentId);
        });
      }).catch(() => {});
    }
    return pending;
  }

  async dispose(): Promise<void> {
    for (const pending of this.agents.values()) {
      const agent = await pending.catch(() => null);
      await agent?.dispose();
    }
    this.agents.clear();
  }
}
