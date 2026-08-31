import type { ParsedMessage } from "@yoyojcoder-weixin-ai/core";

const MAX_LENGTH = 5000;

export default function onReceive(msg: ParsedMessage): ParsedMessage {
  if (msg.text.length > MAX_LENGTH) {
    msg.text = msg.text.slice(0, MAX_LENGTH);
  }
  return msg;
}
