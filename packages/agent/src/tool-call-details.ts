import type { ToolCallUpdate } from "@agentclientprotocol/sdk";

/** ACP updates are partial; null and omitted fields keep the previously supplied detail. */
export function mergeToolCall(previous: ToolCallUpdate | undefined, update: ToolCallUpdate): ToolCallUpdate {
  return { ...previous, ...Object.fromEntries(Object.entries(update).filter(([, value]) => value != null)) } as ToolCallUpdate;
}
