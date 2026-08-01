import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const STATE_DIR = process.env.BRIDGE_STATE_DIR?.trim() || path.join(os.homedir(), ".weixin-ai-connect-helper");
const PID_FILE = path.join(STATE_DIR, "bridge.pid");
const HEALTH_FILE = path.join(STATE_DIR, "bridge.health.json");

export function getPidPath(): string { return PID_FILE; }
export function getHealthPath(): string { return HEALTH_FILE; }

export function writePid(pid: number): void {
  mkdirSync(STATE_DIR, { recursive: true });
  Bun.write(PID_FILE, String(pid));
}

export async function readPid(): Promise<number | null> {
  const f = Bun.file(PID_FILE);
  if (!(await f.exists())) return null;
  const text = (await f.text()).trim();
  const pid = Number(text);
  return isNaN(pid) ? null : pid;
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
