import { expect, test } from "bun:test";
import { describePermission } from "../permission-description.ts";
import { mergeToolCall } from "../../packages/agent/src/tool-call-details.ts";

test("permission explains requesting program, operation, targets and purpose", () => {
  const text = describePermission({ toolCallId: "t", title: "运行测试", kind: "execute", name: "bash",
    locations: [{ path: "D:/repo" }], rawInput: { command: "bun test", description: "验证修改是否通过测试", cwd: "D:/repo" },
  }, "opencode", "帮我修复测试", { command: "opencode.exe", cwd: "D:/default" });
  for (const part of ["opencode.exe", "执行命令或程序", "bun test", "D:/repo", "验证修改是否通过测试", "帮我修复测试", "bash"]) expect(text).toContain(part);
});

test("directory-only permission does not invent read access or purpose", () => {
  const text = describePermission({ toolCallId: "t", title: "D:\\codespace\\zhishi" }, "opencode", "分析项目");
  expect(text).toContain("访问目标：D:\\codespace\\zhishi");
  expect(text).toContain("不能判断是否只读");
  expect(text).toContain("未提供本次操作的具体用途");
  expect(text).not.toContain("读取文件内容");
});

test("file modifications include target and before/after content", () => {
  const text = describePermission({ toolCallId: "t", kind: "edit", content: [
    { type: "diff", path: "config.ts", oldText: "enabled = false", newText: "enabled = true" },
  ] }, "codex", "修改配置");
  for (const part of ["创建或修改文件", "config.ts", "enabled = false", "enabled = true"]) expect(text).toContain(part);
});

test("raw structured credential fields are hidden", () => {
  const text = describePermission({ toolCallId: "t", rawInput: { token: "secret-value", env: { KEY: "env-secret" }, path: "/repo" } }, "agent", "task");
  expect(text).not.toContain("secret-value");
  expect(text).not.toContain("env-secret");
  expect(text).toContain("/repo");
});

test("partial permission updates preserve tool details and explicit updates replace them", () => {
  const previous = { toolCallId: "t", kind: "read" as const, rawInput: { path: "/repo" }, title: "read" };
  expect(mergeToolCall(previous, { toolCallId: "t", title: "directory", kind: null })).toMatchObject({ title: "directory", kind: "read", rawInput: { path: "/repo" } });
  expect(mergeToolCall(previous, { toolCallId: "t", rawInput: { path: "/other" } }).rawInput).toEqual({ path: "/other" });
});
