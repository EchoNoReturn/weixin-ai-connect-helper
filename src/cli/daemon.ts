import { mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const STATE_DIR = process.env.BRIDGE_STATE_DIR?.trim() || path.join(os.homedir(), ".weixin-ai-connect-helper");
const PID_FILE = path.join(STATE_DIR, "bridge.pid");
const HEALTH_FILE = path.join(STATE_DIR, "bridge.health.json");
const LOGS_DIR = path.join(STATE_DIR, "logs");

export function getPidPath(): string { return PID_FILE; }
export function getHealthPath(): string { return HEALTH_FILE; }
export function getStateDir(): string { return STATE_DIR; }
export function getLogsDir(): string { return LOGS_DIR; }

/** 查找最新的日志文件（按日期文件名排序），不存在则返回 null */
export async function findLatestLogFile(): Promise<string | null> {
  try {
    const names = await readdir(LOGS_DIR);
    const logs = names.filter((n) => n.endsWith(".log")).sort();
    const latest = logs[logs.length - 1];
    if (!latest) return null;
    return path.join(LOGS_DIR, latest);
  } catch {
    // 日志目录不存在（桥从未成功启动）
    return null;
  }
}

export function writePid(pid: number): void {
  mkdirSync(STATE_DIR, { recursive: true });
  Bun.write(PID_FILE, String(pid));
}

export async function readPid(): Promise<number | null> {
  const f = Bun.file(PID_FILE);
  if (!(await f.exists())) return null;
  const text = (await f.text()).trim();
  
  // 尝试解析为数字（我们自己写的格式）
  const pid = Number(text);
  if (!isNaN(pid)) return pid;
  
  // 尝试解析为 JSON（pgh 写入的格式）
  try {
    const info = JSON.parse(text);
    return info?.pid ?? null;
  } catch {
    return null;
  }
}

export function clearPid(): void {
  Bun.write(PID_FILE, "");
}

export async function isRunning(): Promise<boolean> {
  const pid = await readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    clearPid();
    return false;
  }
}

export interface HealthData {
  status: string;
  accountId?: string;
  lastMessageAt?: number;
  lastError?: string;
  reconnectAttempts: number;
  startedAt: number;
  pid: number;
}

export function writeHealth(data: HealthData): void {
  mkdirSync(STATE_DIR, { recursive: true });
  Bun.write(HEALTH_FILE, JSON.stringify(data, null, 2));
}

export async function readHealth(): Promise<HealthData | null> {
  const f = Bun.file(HEALTH_FILE);
  if (!(await f.exists())) return null;
  try {
    return JSON.parse(await f.text()) as HealthData;
  } catch {
    return null;
  }
}

export function clearHealth(): void {
  Bun.write(HEALTH_FILE, "");
}
