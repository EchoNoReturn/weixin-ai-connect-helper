import { spawnSync } from "child_process";

/** 同步执行命令（stdio 继承），失败即退出进程 */
export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): void {
  const result = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
  if (result.error) {
    console.error(`执行失败: ${cmd} ${args.join(" ")}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`命令退出码 ${result.status}: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

/** 检查命令是否可用 */
export function hasCommand(cmd: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(cmd, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}
