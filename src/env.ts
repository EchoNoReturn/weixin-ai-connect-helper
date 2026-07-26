import os from "node:os";
import path from "node:path";

/**
 * 必须在任何 openclaw-weixin 相关模块之前导入：
 * 把插件包的状态目录从默认的 ~/.openclaw 重定向到本项目自己的目录，
 * 与本机可能存在的 OpenClaw 安装完全隔离（见 DESIGN.md §4.1）。
 */
export const STATE_DIR =
  process.env.BRIDGE_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".weixin-ai-connect-helper");

process.env.OPENCLAW_STATE_DIR = STATE_DIR;
