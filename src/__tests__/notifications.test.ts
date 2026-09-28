import { expect, test } from "bun:test";
import type { IncomingMessage, OutgoingMessage } from "@yoyojcoder-weixin-ai/core";
import { processMessageWithFeedback, startupNotification } from "../notifications.ts";

const message: IncomingMessage = {
  channelId: "weixin-main", platform: "weixin", conversationId: "user", senderId: "user",
  text: "hello", receivedAt: 0, messageId: "m1", replyContext: { contextToken: "ctx" },
};

test("failed execution replies to the source with context and logs the original error", async () => {
  const sent: OutgoingMessage[] = [];
  const errors: unknown[][] = [];
  const failure = new Error("secret internal failure");
  await processMessageWithFeedback(message, async () => { throw failure; }, {
    send: async (out) => { sent.push(out); return { ...out, messageIds: [], sentAt: 0 }; },
  }, { error: (...args) => { errors.push(args); } });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ conversationId: "user", replyContext: message.replyContext, replyToMessageId: "m1" });
  expect(sent[0]!.text).toContain("执行失败");
  expect(sent[0]!.text).not.toContain("secret");
  expect(errors[0]![1]).toBe(failure);
});

test("failed error delivery is logged once without recursion", async () => {
  let attempts = 0;
  const errors: unknown[] = [];
  await processMessageWithFeedback(message, async () => { throw new Error("broken agent"); }, {
    send: async () => { attempts++; throw new Error("offline"); },
  }, { error: (...args) => { errors.push(args); } });
  expect(attempts).toBe(1);
  expect(errors).toHaveLength(2);
});

test("unauthorized sender receives approval instructions", async () => {
  let text = "";
  await processMessageWithFeedback(message, async () => { throw new Error("非白名单用户 user"); }, {
    send: async (out) => { text = out.text; return { ...out, messageIds: [], sentAt: 0 }; },
  }, { error: () => {} });
  expect(text).toContain("wah access approve");
});

test("successful execution has no failure notification", async () => {
  await processMessageWithFeedback(message, async () => {}, {
    send: async () => { throw new Error("must not send"); },
  }, { error: () => { throw new Error("must not log"); } });
});

test("startup notice includes time, OS, hostname and user", () => {
  const text = startupNotification(new Date("2026-09-28T12:00:00Z"));
  for (const label of ["2026", "启动时间：", "操作系统：", "主机：", "用户名："]) expect(text).toContain(label);
});
