import { expect, test } from "bun:test";
import type { IncomingMessage } from "@yoyojcoder-weixin-ai/core";
import { UserDecisions } from "../user-decisions.ts";
import { createAgentInteraction, parseField } from "../agent-interaction.ts";

const original: IncomingMessage = { channelId: "wx", accountId: "bot", platform: "weixin", conversationId: "chat", senderId: "owner", text: "hello", receivedAt: 0, replyContext: { contextToken: "old" } };
function setup(timeout = 1000) {
  const sent: string[] = [];
  const owner = { ...original };
  const broker = new UserDecisions(async (_owner, text) => { sent.push(text); }, timeout);
  const reply = (text: string, changes: Partial<IncomingMessage> = {}) => broker.handle({ ...owner, text, replyContext: { contextToken: "new" }, ...changes });
  return { broker, sent, owner, reply };
}

test("only original sender/channel/account/conversation can answer; latest context is forwarded", async () => {
  const s = setup();
  const waiting = s.broker.ask(s.owner, "choose", Number, new AbortController().signal);

  for (const patch of [{ senderId: "attacker" }, { channelId: "other" }, { accountId: "other" }, { conversationId: "other" }]) {
    expect(await s.reply("9", patch)).toBe(false);
  }
  await s.reply("2");
  expect(await waiting).toBe(2);
  expect(s.owner.replyContext).toEqual({ contextToken: "new" });
  expect(await s.reply("normal chat")).toBe(false);

});

test("invalid answers and ordinary chat while waiting do not enter prompt queue", async () => {
  const s = setup();
  const waiting = s.broker.ask(s.owner, "number", (t) => { if (t !== "1") throw new Error("choose 1"); return t; }, new AbortController().signal);
  expect(await s.reply("hello")).toBe(true);
  await s.reply("9");
  expect(s.sent.at(-1)).toContain("答案无效");
  await s.reply("1");
  expect(await waiting).toBe("1");
  expect(await s.reply("normal chat")).toBe(false);
});

test("timeout, abort, user cancellation and bridge shutdown cancel instead of granting", async () => {
  const s = setup(10);
  expect(await s.broker.ask(s.owner, "timeout", String, new AbortController().signal)).toBeNull();
  const abort = new AbortController();
  const waiting = s.broker.ask(s.owner, "abort", String, abort.signal);
  abort.abort();
  expect(await waiting).toBeNull();
  const cancel = s.broker.ask(s.owner, "cancel", String, new AbortController().signal);
  await s.reply("取消");
  expect(await cancel).toBeNull();
  const shutdown = s.broker.ask(s.owner, "shutdown", String, new AbortController().signal);
  s.broker.close();
  expect(await shutdown).toBeNull();
});

test("failed question delivery cleans up waiting request", async () => {
  const broker = new UserDecisions(async () => { throw new Error("offline"); });
  await expect(broker.ask(original, "q", String, new AbortController().signal)).rejects.toThrow("offline");
  expect(await broker.handle(original)).toBe(false);
});

test("free text answers need no prefix and question prompts contain no commands", async () => {
  const s = setup();
  const waiting = s.broker.ask(s.owner, "项目叫什么？", String, new AbortController().signal);
  expect(s.sent[0]).not.toContain("/reply");
  expect(s.sent[0]).not.toContain("/cancel");
  await s.reply("我的微信助手");
  expect(await waiting).toBe("我的微信助手");
});

test("queued cancellation never displays the cancelled question and shutdown clears all", async () => {
  const s = setup();
  const a = s.broker.ask(s.owner, "first", String, new AbortController().signal);
  const abort = new AbortController();
  const b = s.broker.ask(s.owner, "hidden", String, abort.signal);
  const c = s.broker.ask(s.owner, "third", String, new AbortController().signal);
  abort.abort();
  expect(await b).toBeNull();
  expect(s.sent).toHaveLength(1);
  await s.reply("answer");
  expect(await a).toBe("answer");
  expect(s.sent.at(-1)).toContain("third");
  expect(s.sent.join("\n")).not.toContain("hidden");
  s.broker.close();
  expect(await c).toBeNull();
});

test("queued questions only start their timeout after being displayed", async () => {
  const s = setup(40);
  const a = s.broker.ask(s.owner, "first", String, new AbortController().signal);
  const b = s.broker.ask(s.owner, "second", String, new AbortController().signal);
  expect(await a).toBeNull();
  expect(s.sent.at(-1)).toContain("second");
  await s.reply("answer");
  expect(await b).toBe("answer");
});

test("simultaneous questions are displayed and answered one at a time", async () => {
  const s = setup();
  const a = s.broker.ask(s.owner, "a", String, new AbortController().signal);
  expect(s.sent).toHaveLength(1);
  const b = s.broker.ask(s.owner, "b", String, new AbortController().signal);
  expect(s.sent).toHaveLength(1);
  await s.reply("A");
  expect(s.sent.at(-1)).toContain("b");
  await s.reply("B");
  expect(await a).toBe("A");
  expect(await b).toBe("B");
});

test("permission options preserve exact option IDs", async () => {
  const s = setup();
  const interaction = createAgentInteraction(s.broker, s.owner, "codex", async () => {});
  const response = interaction.permission({ sessionId: "s", toolCall: { toolCallId: "t", title: "run command" }, options: [
    { kind: "allow_once", optionId: "allow-id", name: "允许" }, { kind: "reject_once", optionId: "deny-id", name: "拒绝" },
  ] }, new AbortController().signal);
  await s.reply("拒绝");
  expect(await response).toEqual({ outcome: { outcome: "selected", optionId: "deny-id" } });
});

test("form questions collect user answers field by field and preserve types", async () => {
  const s = setup();
  const response = createAgentInteraction(s.broker, s.owner, "opencode", async () => {}).elicit({
    mode: "form", sessionId: "s", message: "选择方案", requestedSchema: {
      properties: { plan: { type: "string", enum: ["A", "B"] }, count: { type: "integer", minimum: 1 }, note: { type: "string" } },
      required: ["plan", "count"],
    },
  }, new AbortController().signal);
  await s.reply("2");
  await Bun.sleep(0);
  await s.reply("3");
  await Bun.sleep(0);
  await s.reply("跳过");
  expect(await response).toEqual({ action: "accept", content: { plan: "B", count: 3 } });
});

test("field validation rejects out of range input and handles multi-select and booleans", () => {
  expect(() => parseField({ type: "integer", minimum: 1 }, "0")).toThrow();
  expect(() => parseField({ type: "integer" }, "1.5")).toThrow();
  expect(() => parseField({ type: "string", enum: ["a"] }, "2")).toThrow();
  expect(parseField({ type: "boolean" }, "否")).toBe(false);
  expect(parseField({ type: "array", items: { type: "string", enum: ["a", "b", "c"] } }, "1,3")).toEqual(["a", "c"]);
});
