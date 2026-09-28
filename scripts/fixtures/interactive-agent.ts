// Minimal ACP peer for integration tests. stdout contains protocol messages only.
import { createInterface } from "node:readline";
const send = (message: unknown) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message as object }) + "\n");
let promptId: string | number;
let permission: unknown;
let session = 0;
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === "initialize") send({ id: message.id, result: { protocolVersion: message.params.protocolVersion, agentCapabilities: {} } });
  else if (message.method === "session/new") send({ id: message.id, result: { sessionId: `s${++session}` } });
  else if (message.method === "session/prompt") {
    promptId = message.id;
    send({ id: "permission", method: "session/request_permission", params: { sessionId: `s${session}`, toolCall: { toolCallId: "tool", title: "测试工具" }, options: [
      { optionId: "allow", kind: "allow_once", name: "允许" }, { optionId: "deny", kind: "reject_once", name: "拒绝" },
    ] } });
  } else if (message.id === "permission") {
    permission = message.result;
    send({ id: "question", method: "elicitation/create", params: { mode: "form", sessionId: `s${session}`, message: "选择方案", requestedSchema: { type: "object", properties: { plan: { type: "string", enum: ["A", "B"] } }, required: ["plan"] } } });
  } else if (message.id === "question") {
    send({ method: "session/update", params: { sessionId: `s${session}`, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ permission, answer: message.result }) } } } });
    send({ id: promptId!, result: { stopReason: "end_turn" } });
  }
}
