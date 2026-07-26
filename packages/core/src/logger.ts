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
