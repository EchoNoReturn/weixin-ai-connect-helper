import type { ToolCallUpdate } from "@agentclientprotocol/sdk";
import type { AgentConfig } from "@yoyojcoder-weixin-ai/core";

const ACTIONS: Record<string, string> = {
  read: "读取文件内容", edit: "创建或修改文件", delete: "删除文件或目录",
  move: "移动或重命名文件", search: "搜索文件或内容", execute: "执行命令或程序",
  fetch: "访问网络资源", think: "分析处理", switch_mode: "切换 Agent 工作模式",
};

function valueText(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  return typeof value === "string" ? value : JSON.stringify(value, (key, value) =>
    /^(token|api[_-]?key|password|secret|authorization|env)$/i.test(key) ? "[已隐藏]" : value, 2);
}

/** Describe only facts supplied by the agent/config; a directory title does not imply read-only access. */
export function describePermission(
  tool: ToolCallUpdate, agentId: string, task: string,
  config?: Pick<AgentConfig, "command" | "cwd">,
): string {
  const input = tool.rawInput && typeof tool.rawInput === "object" && !Array.isArray(tool.rawInput)
    ? tool.rawInput as Record<string, unknown> : {};
  const purpose = valueText(input.description ?? input.reason ?? input.purpose ?? input.explanation);
  const command = valueText(input.command ?? input.cmd);
  const targets = new Set<string>();
  for (const location of tool.locations ?? []) targets.add(location.path);
  for (const key of ["path", "filePath", "file_path", "directory", "url", "source", "destination"]) {
    const value = valueText(input[key]);
    if (value) targets.add(value);
  }
  // Some agents send only the directory as the permission title.
  if (tool.title && /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(tool.title)) targets.add(tool.title);
  for (const item of tool.content ?? []) if (item.type === "diff") targets.add(item.path);
  const lines = [
    `申请程序：${agentId}${config ? `（启动程序：${config.command}）` : ""}`,
    `你的任务：${task || "未提供"}`,
    `准备执行：${tool.title || "Agent 未提供操作说明"}`,
    `申请操作类型：${ACTIONS[tool.kind ?? ""] ?? "Agent 未说明具体权限类型，不能判断是否只读"}`,
    `操作用途：${purpose ?? "Agent 未提供本次操作的具体用途；上方仅为你的任务背景"}`,
    `访问目标：${targets.size ? [...targets].join("；") : "Agent 未提供具体路径或地址"}`,
  ];
  if (tool.name) lines.push(`使用工具：${tool.name}`);
  const cwd = valueText(input.workdir ?? input.cwd) ?? config?.cwd;
  if (cwd) lines.push(`工作目录${input.workdir || input.cwd ? "" : "（Agent 配置）"}：${cwd}`);
  if (command) lines.push(`待执行命令：\n${command}`);
  const raw = valueText(tool.rawInput);
  if (raw) lines.push(`操作参数（Agent 提供）：\n${raw}`);
  for (const item of tool.content ?? []) {
    if (item.type === "content" && item.content.type === "text") lines.push(`补充说明（Agent 提供）：\n${item.content.text}`);
    if (item.type === "diff") lines.push(`拟修改文件：${item.path}\n修改前：\n${item.oldText ?? "（新建文件）"}\n修改后：\n${item.newText}`);
    if (item.type === "terminal") lines.push(`关联终端：${item.terminalId}`);
  }
  return lines.join("\n");
}
