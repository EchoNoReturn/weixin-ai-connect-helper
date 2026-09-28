import { describe, it, expect } from "bun:test";
import { createLogger, onLogEntry, recentLogs, type LogEntry } from "../logger.ts";

describe("logger 订阅广播", () => {
  it("保留 Error 堆栈和 cause，循环对象不使日志崩溃", () => {
    const error = new Error("agent failed", { cause: new Error("spawn ENOENT") });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => createLogger("errors").error("失败", error, circular)).not.toThrow();
    const message = recentLogs(1)[0]!.msg;
    expect(message).toContain("agent failed");
    expect(message).toContain("spawn ENOENT");
    expect(message).toContain("logger.test.ts");
  });
  it("订阅者收到日志条目", () => {
    const received: LogEntry[] = [];
    const off = onLogEntry((e) => received.push(e));
    try {
      const log = createLogger("test-scope");
      log.info("hello");
      log.warn("careful", { code: 42 });
      expect(received).toHaveLength(2);
      expect(received[0]!.level).toBe("info");
      expect(received[0]!.scope).toBe("test-scope");
      expect(received[0]!.msg).toBe("hello");
      expect(received[1]!.level).toBe("warn");
      expect(received[1]!.msg).toContain("careful");
      expect(received[1]!.msg).toContain("42");
      expect(typeof received[0]!.ts).toBe("string");
    } finally {
      off();
    }
  });

  it("退订后不再收到", () => {
    const received: LogEntry[] = [];
    const off = onLogEntry((e) => received.push(e));
    createLogger("s").info("before");
    off();
    createLogger("s").info("after");
    expect(received).toHaveLength(1);
    expect(received[0]!.msg).toBe("before");
  });

  it("recentLogs 返回最近条目", () => {
    const before = recentLogs().length;
    createLogger("ring-test").info("entry-for-ring");
    const logs = recentLogs();
    expect(logs.length).toBeGreaterThan(before);
    expect(logs[logs.length - 1]!.msg).toBe("entry-for-ring");
    expect(logs[logs.length - 1]!.scope).toBe("ring-test");
  });

  it("订阅者异常不影响其他订阅者和主流程", () => {
    const received: LogEntry[] = [];
    const off1 = onLogEntry(() => { throw new Error("boom"); });
    const off2 = onLogEntry((e) => received.push(e));
    try {
      createLogger("s").info("still works");
      expect(received).toHaveLength(1);
    } finally {
      off1();
      off2();
    }
  });
});
