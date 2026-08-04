import { existsSync } from "fs";
import path from "path";

/**
 * 判断是否为开发阶段
 * 自动检测：从源码运行时入口是 .ts 文件（与 bin-dir.ts 的启发式一致）；
 * 可用 WAH_DEV=1 / WAH_DEV=0 显式覆盖。
 */
export function isDevMode(): boolean {
  if (process.env.WAH_DEV === "1") {
    return true;
  }
  if (process.env.WAH_DEV === "0") {
    return false;
  }
  return process.argv[1]?.endsWith(".ts") ?? false;
}

/** Windows 下为可执行文件名补 .exe 后缀（也可直接拼在相对路径末尾） */
export function exeName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

export interface ResolveToolOptions {
  /** dev 模式下相对于项目根目录的候选路径（不含扩展名） */
  devPath?: string;
  /** 显式指定工具路径的环境变量名 */
  envVar?: string;
  /** 额外的候选目录（绝对路径），如常见安装目录 */
  extraDirs?: string[];
}

function* toolCandidates(name: string, opts: ResolveToolOptions): Generator<string> {
  const file = exeName(name);

  // 1. 环境变量显式覆盖
  if (opts.envVar) {
    const override = process.env[opts.envVar];
    if (override) yield override;
  }

  // 2. dev 模式：项目内构建产物（此时 execPath 是 bun 自身，同目录查找无意义）
  if (isDevMode() && opts.devPath) {
    yield path.resolve(import.meta.dir, "../..", exeName(opts.devPath));
  }

  // 3. 全局：PATH（Windows 按 PATHEXT 补扩展名）
  const pathEnv = process.env.PATH;
  if (pathEnv) {
    const exts = process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
      : [""];
    for (const dir of pathEnv.split(path.delimiter)) {
      if (!dir) continue;
      for (const ext of exts) {
        yield path.join(dir, name + ext);
      }
    }
  }

  // 4. 全局：额外候选目录（常见安装位置，用于 PATH 被裁剪的场景）
  for (const dir of opts.extraDirs ?? []) {
    yield path.join(dir, file);
  }

  // 5. 兜底：与可执行文件同目录（打包发布布局）
  if (!isDevMode()) {
    yield path.join(path.dirname(process.execPath), file);
  }

  // 6. 兜底：当前工作目录
  yield path.join(process.cwd(), file);
}

/**
 * 按优先级解析外部工具的可执行文件路径：
 * 环境变量覆盖 → dev 项目路径 → 全局（PATH / extraDirs）→ execPath 同级目录 → cwd
 * 找不到返回 null。
 */
export function resolveTool(name: string, opts: ResolveToolOptions = {}): string | null {
  for (const candidate of toolCandidates(name, opts)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
