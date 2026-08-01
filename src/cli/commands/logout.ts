import "../../env.ts";
import path from "node:path";
import {
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  getSyncBufFilePath,
} from "@yoyojcoder-weixin-ai/transport";
import { getDb } from "@yoyojcoder-weixin-ai/core";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR!;
const ACCOUNTS_DIR = path.join(STATE_DIR, "openclaw-weixin", "accounts");
const ACCOUNTS_INDEX = path.join(STATE_DIR, "openclaw-weixin", "accounts.json");

export async function execLogout(): Promise<void> {
  const ids = listIndexedWeixinAccountIds();
  if (ids.length === 0) {
    console.log("未登录，无需登出\n");
    return;
  }

  for (const id of ids) {
    console.log(`登出账号: ${id}`);

    // 1. 删除同步 buffer 文件
    const syncFile = getSyncBufFilePath(id);
    const f = Bun.file(syncFile);
    if (await f.exists()) {
      await Bun.write(syncFile, "");
    }

    // 2. 删除账号数据文件
    const accountFile = path.join(ACCOUNTS_DIR, `${id}.json`);
    Bun.spawnSync(["rm", "-f", accountFile]);

    // 3. 清理 SQLite 中该账号的 sessions
    try {
      const db = getDb();
      db.prepare("DELETE FROM messages WHERE session_id LIKE ?").run(`%:${id}%`);
      db.prepare("DELETE FROM sessions WHERE agent_id = ? OR user_id LIKE ?").run(id, `%${id}%`);
    } catch {
      // DB 可能还没初始化，忽略
    }

    console.log(`  ✅ 已清理`);
  }

  // 4. 清空账号索引文件
  await Bun.write(ACCOUNTS_INDEX, "[]");

  console.log("\n登出完成，下次启动需重新扫码登录\n");
}
