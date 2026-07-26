// ACP 冒烟测试：不依赖微信扫码，直接驱动 `opencode acp` 回答一个问题。
// 运行: bun run test:acp

import { AcpAgent } from "../src/acp/agent.ts";

console.log("[test] 启动 opencode acp...");
const agent = await AcpAgent.start(
  "opencode",
  { command: "opencode", args: ["acp"], cwd: process.cwd() },
  { autoApprove: true },
);

try {
  console.log("[test] 发送 prompt...");
  const result = await agent.prompt(
    "smoke-test-user",
    "用一句中文回答：1+1等于几？",
    (full) => console.log(`[stream] 已累积 ${full.length} 字符`),
  );

  console.log("\n========== 最终结果 ==========");
  console.log(result.text);
  console.log("==============================");
  console.log(`stopReason=${result.stopReason}`);

  if (!result.text.includes("2")) {
    console.error("[test] ❌ 回复中没有预期的答案");
    process.exit(1);
  }
  console.log("[test] ✅ ACP 闭环正常");
} finally {
  await agent.dispose();
}
process.exit(0);
