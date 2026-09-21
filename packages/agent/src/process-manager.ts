import { AcpAgent, type AgentLifecycle } from "./acp-client.ts";
import type { AgentConfig } from "@yoyojcoder-weixin-ai/core";

export interface ProcessManagerOptions {
  autoApprove: boolean;
  lifecycle?: AgentLifecycle;
  /** 可注入的 agent 启动工厂（测试用），默认 AcpAgent.start */
  startAgent?: (id: string, cfg: AgentConfig, opts: ProcessManagerOptions) => Promise<AcpAgent>;
}

export class ProcessManager {
  private agents = new Map<string, Promise<AcpAgent>>();

  constructor(
    private agentConfigs: Record<string, AgentConfig>,
    private opts: ProcessManagerOptions,
  ) {}

  async getAgent(agentId: string): Promise<AcpAgent> {
    let pending = this.agents.get(agentId);
    if (!pending) {
      const cfg = this.agentConfigs[agentId];
      if (!cfg) throw new Error(`未知 agent "${agentId}"`);
      const start = this.opts.startAgent ?? ((id, c, o) => AcpAgent.start(id, c, o));
      // 包装 onExit：子进程退出后把死 agent 从缓存驱逐，
      // 否则后续消息会一直发往已退出的进程，只能重启桥才能恢复
      const opts: ProcessManagerOptions = {
        ...this.opts,
        lifecycle: {
          ...this.opts.lifecycle,
          onExit: (id, code) => {
            if (this.agents.get(id) === pending) this.agents.delete(id);
            this.opts.lifecycle?.onExit?.(id, code);
          },
        },
      };
      pending = start(agentId, cfg, opts);
      this.agents.set(agentId, pending);
      pending.catch(() => {
        if (this.agents.get(agentId) === pending) this.agents.delete(agentId);
      });
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
