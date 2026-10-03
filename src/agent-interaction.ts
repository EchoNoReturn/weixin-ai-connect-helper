import type { AgentInteraction } from "@yoyojcoder-weixin-ai/agent";
import type { IncomingMessage, AgentConfig } from "@yoyojcoder-weixin-ai/core";
import type { ElicitationSchema, ElicitationPropertySchema, ElicitationContentValue, StringPropertySchema, NumberPropertySchema, MultiSelectPropertySchema, EnumOption } from "@agentclientprotocol/sdk";
import { UserDecisions } from "./user-decisions.ts";
import { describePermission } from "./permission-description.ts";

function choices(property: ElicitationPropertySchema): Array<{ value: string; label: string }> {
  if (property.type === "string") {
    const p = property as StringPropertySchema;
    return p.oneOf?.map((v) => ({ value: v.const, label: v.title }))
      ?? p.enum?.map((v) => ({ value: v, label: v })) ?? [];
  }
  if (property.type === "array") {
    const items = (property as MultiSelectPropertySchema).items;
    if ("anyOf" in items && Array.isArray(items.anyOf)) {
      return (items.anyOf as EnumOption[]).map((v) => ({ value: v.const, label: v.title }));
    }
    if ("enum" in items && Array.isArray(items.enum)) return (items.enum as string[]).map((v) => ({ value: v, label: v }));
  }
  return [];
}

export function parseField(property: ElicitationPropertySchema, text: string): ElicitationContentValue {
  const options = choices(property);
  const select = (text: string): string => {
    const numbered = /^[1-9]\d*$/.test(text) ? options[Number(text) - 1] : undefined;
    const selected = numbered ?? options.find((v) => v.value === text || v.label === text);
    if (!selected) throw new Error("请选择列出的选项编号");
    return selected.value;
  };
  if (property.type === "string") {
    const p = property as StringPropertySchema;
    const value = options.length ? select(text) : text;
    if (!value) throw new Error("请输入文字");
    if (p.minLength != null && [...value].length < p.minLength) throw new Error(`至少 ${p.minLength} 个字符`);
    if (p.maxLength != null && [...value].length > p.maxLength) throw new Error(`最多 ${p.maxLength} 个字符`);
    if (p.pattern && !new RegExp(p.pattern, "u").test(value)) throw new Error(`内容须符合格式 ${p.pattern}`);
    if (p.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("请输入邮箱地址");
    if (p.format === "uri") { try { new URL(value); } catch { throw new Error("请输入完整 URI"); } }
    if ((p.format === "date" || p.format === "date-time") && (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(Date.parse(value)))) throw new Error("请输入有效日期");
    return value;
  }
  if (property.type === "boolean") {
    if (["1", "是", "true", "yes"].includes(text.toLowerCase())) return true;
    if (["2", "否", "false", "no"].includes(text.toLowerCase())) return false;
    throw new Error("回复 1（是）或 2（否）");
  }
  if (property.type === "number" || property.type === "integer") {
    const value = Number(text);
    const p = property as NumberPropertySchema;
    if (!text || !Number.isFinite(value) || (property.type === "integer" && !Number.isInteger(value))) throw new Error("请输入有效数字");
    if (p.minimum != null && value < p.minimum) throw new Error(`不能小于 ${p.minimum}`);
    if (p.maximum != null && value > p.maximum) throw new Error(`不能大于 ${p.maximum}`);
    return value;
  }
  if (property.type === "array") {
    const p = property as MultiSelectPropertySchema;
    const selected = text === "[]" ? [] : [...new Set(text.split(/[,，]/).map((v) => select(v.trim())))];
    if (p.minItems != null && selected.length < p.minItems) throw new Error(`至少选择 ${p.minItems} 项`);
    if (p.maxItems != null && selected.length > p.maxItems) throw new Error(`最多选择 ${p.maxItems} 项`);
    return selected;
  }
  throw new Error(`不支持的字段类型 ${property.type}`);
}

export function createAgentInteraction(
  decisions: UserDecisions, owner: IncomingMessage, agentId: string,
  send: (text: string) => Promise<void>,
  agentConfig?: Pick<AgentConfig, "command" | "cwd">,
): AgentInteraction {
  return {
    async permission(request, signal) {
      if (owner.platform !== "weixin") {
        await send("[需要用户授权] 当前请求—响应渠道不支持等待交互；请通过微信处理，或在本机设置权限策略。");
        return { outcome: { outcome: "cancelled" } };
      }
      const descriptions: Record<string, string> = { allow_once: "允许本次", allow_always: "始终允许", reject_once: "拒绝本次", reject_always: "始终拒绝" };
      const question = `${describePermission(request.toolCall, agentId, owner.text, agentConfig)}\n\n请选择：\n${request.options.map((o, i) => `${i + 1}. ${o.name}（${descriptions[o.kind] ?? o.kind}）`).join("\n")}`;
      const optionId = await decisions.ask(owner, question, (text) => {
        const named = request.options.filter((o) => o.name === text || descriptions[o.kind] === text);
        const option = /^[1-9]\d*$/.test(text) ? request.options[Number(text) - 1] : named.length === 1 ? named[0] : undefined;
        if (!option) throw new Error("请回复选项数字或完整选项文字");
        return option.optionId;
      }, signal);
      return { outcome: optionId === null ? { outcome: "cancelled" } : { outcome: "selected", optionId } };
    },
    async elicit(request, signal) {
      if (owner.platform !== "weixin" || request.mode !== "form" || !("requestedSchema" in request)) {
        await send("[Agent 提问未完成] 当前仅支持通过微信回答会话内的表单提问；该请求已取消。");
        return { action: "cancel" };
      }
      const schema = request.requestedSchema as ElicitationSchema;
      const entries = Object.entries(schema.properties ?? {});
      if (entries.some(([, p]) => !["string", "boolean", "integer", "number", "array"].includes(p.type))) {
        await send("[Agent 提问未完成] 问题包含不支持的字段类型，已取消。");
        return { action: "cancel" };
      }
      const content: Record<string, ElicitationContentValue> = Object.create(null);
      if (!entries.length) {
        const accepted = await decisions.ask(owner, `Agent：${agentId}\n${request.message}\n1. 确认\n2. 拒绝`, (text) => {
          if (!["1", "2"].includes(text)) throw new Error("回复 1 或 2");
          return text === "1";
        }, signal);
        return accepted === null ? { action: "cancel" } : accepted ? { action: "accept", content } : { action: "decline" };
      }
      for (const [index, [key, property]] of entries.entries()) {
        const options = choices(property);
        const required = schema.required?.includes(key) ?? false;
        const skip = Symbol("skip");
        const question = `Agent：${agentId}\n${request.message}\n问题 ${index + 1}/${entries.length}：${property.title ?? key}\n${property.description ?? ""}\n${options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}\n${property.type === "boolean" ? "1. 是\n2. 否" : property.type === "array" ? "多选用逗号分隔编号，例如 1,3；不选填 []" : options.length ? "回复选项编号" : "回复你的答案"}${required ? "" : "；可选项回复“跳过”即可"}`;
        const value = await decisions.ask(owner, question, (text) => !required && text === "跳过" ? skip : parseField(property, text), signal);
        if (value === null) return { action: "cancel" };
        if (value !== skip) content[key] = value;
      }
      return { action: "accept", content };
    },
  };
}
