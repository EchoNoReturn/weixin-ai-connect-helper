import path from "node:path";
import os from "node:os";
import fs from "node:fs";

type LogFn = (msg: string, ...args: unknown[]) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

const COLORS: Record<Level, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

// 默认写到 state dir（~/.wah/logs，可被 BRIDGE_STATE_DIR 覆盖）；
// initFileLogging(dir) 可显式指定其他目录
const DEFAULT_LOGS_DIR = path.join(
  process.env.BRIDGE_STATE_DIR?.trim() || path.join(os.homedir(), ".wah"),
  "logs",
);

let logsDirOverride: string | null = null;
let logFile: string | null = null;
let logStream: fs.WriteStream | null = null;

function getLogsDir(): string {
  return logsDirOverride ?? DEFAULT_LOGS_DIR;
}

function getDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLogFile(): string {
  return path.join(getLogsDir(), `${getDateStr()}.log`);
}

function ensureLogDirSync(): void {
  fs.mkdirSync(getLogsDir(), { recursive: true });
}

function getLogStream(): fs.WriteStream | null {
  try {
    const file = getLogFile();
    if (logFile === file && logStream) return logStream;

    // 日期变了，关闭旧流
    if (logStream) {
      logStream.end();
    }

    ensureLogDirSync();
    logFile = file;
    logStream = fs.createWriteStream(file, { flags: "a" });
    return logStream;
  } catch {
    return null;
  }
}

function writeToFile(level: Level, scope: string, msg: string, args: unknown[]): void {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase()}] [${scope}] ${msg} ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
    const stream = getLogStream();
    stream?.write(line);
  } catch {
    // 忽略写入错误
  }
}

function createLogFn(level: Level, scope: string): LogFn {
  return (msg: string, ...args: unknown[]) => {
    const ts = new Date().toISOString().slice(11, 19);
    const prefix = `${COLORS[level]}[${ts}] [${level.toUpperCase()}] [${scope}]${RESET}`;
    if (level === "error") {
      console.error(prefix, msg, ...args);
    } else if (level === "warn") {
      console.warn(prefix, msg, ...args);
    } else {
      console.log(prefix, msg, ...args);
    }
    writeToFile(level, scope, msg, args);
  };
}

export function createLogger(scope: string): Logger {
  return {
    debug: createLogFn("debug", scope),
    info: createLogFn("info", scope),
    warn: createLogFn("warn", scope),
    error: createLogFn("error", scope),
  };
}

export async function initFileLogging(logsDir?: string): Promise<string> {
  if (logsDir) {
    logsDirOverride = logsDir;
  }
  ensureLogDirSync();
  const file = getLogFile();
  // 触发流创建
  getLogStream();
  return file;
}
