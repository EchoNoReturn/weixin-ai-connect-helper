import { readPid, clearPid, clearHealth, isRunning } from "../daemon.ts";

export async function execStop(): Promise<void> {
  if (!(await isRunning())) {
    console.log("桥未在运行\n");
    clearPid();
    clearHealth();
    return;
  }

  const pid = await readPid();
  if (pid) {
    console.log(`停止桥进程 (PID: ${pid})...`);
    try {
      process.kill(pid, "SIGTERM");
    } catch (err) {
      console.error(`停止失败: ${String(err)}`);
    }
  }

  clearPid();
  clearHealth();
  console.log("✅ 已停止\n");
}
