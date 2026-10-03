import { expect, test } from "bun:test";
import path from "node:path";
import { AcpAgent } from "@yoyojcoder-weixin-ai/agent";
import { UserDecisions } from "../src/user-decisions.ts";
import { createAgentInteraction } from "../src/agent-interaction.ts";
import type { IncomingMessage } from "@yoyojcoder-weixin-ai/core";

for (const autoApprove of [false, true]) test(`ACP subprocess round trip forwards questions (autoApprove=${autoApprove})`, async () => {
  const agent = await AcpAgent.start("fake", {
    command: process.execPath, args: [path.join(import.meta.dir, "fixtures/interactive-agent.ts")], cwd: process.cwd(),
  }, { autoApprove });
  const owner: IncomingMessage = { channelId: "wx", platform: "weixin", conversationId: "user", senderId: "user", text: "task", receivedAt: 0 };
  const prompts: string[] = [];
  let broker: UserDecisions;
  broker = new UserDecisions(async (_owner, text) => {
    if (!text.startsWith("[需要你决定")) return;
    prompts.push(text);
    // Simulate a later inbound WeChat message while the original prompt remains blocked.
    setTimeout(() => { void broker.handle({ ...owner, text: "2" }); }, 5);
  });
  try {
    const result = await agent.prompt("bridge-session", "task", () => {}, createAgentInteraction(broker, owner, "fake", async () => {}));
    expect(JSON.parse(result.text)).toEqual({ permission: { outcome: { outcome: "selected", optionId: autoApprove ? "allow" : "deny" } }, answer: { action: "accept", content: { plan: "B" } } });
    expect(prompts).toHaveLength(autoApprove ? 1 : 2);
    if (!autoApprove) {
      expect(prompts[0]).toContain("读取文件内容");
      expect(prompts[0]).toContain("D:/project/README.md");
      expect(prompts[0]).toContain("了解项目功能");
    }
  } finally { broker.close(); await agent.dispose(); }
});
