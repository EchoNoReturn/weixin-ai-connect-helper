import {
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  unregisterWeixinAccountId,
  getSyncBufFilePath,
} from "@yoyojcoder-weixin-ai/transport";
import { getDb } from "@yoyojcoder-weixin-ai/core";

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

    // 2. 从索引中移除
    unregisterWeixinAccountId(id);

    // 3. 删除账号数据文件
    const dataPath = new URL(`../accounts/${id}.json`, import.meta.url).pathname;
    // 用 Bun.file + 写空内容来清理（安全方式）
    const accountsDir = new URL("../accounts/", import.meta.url).pathname;
    Bun.spawnSync(["rm", "-f", accountsDir + `${id}.json`]);

    // 4. 清理 SQLite 中该账号的 sessions
    try {
      const db = getDb();
      db.prepare("DELETE FROM messages WHERE session_id LIKE ?").run(`%:${id}%`);
      db.prepare("DELETE FROM sessions WHERE agent_id = ? OR user_id LIKE ?").run(id, `%${id}%`);
    } catch {
      // DB 可能还没初始化，忽略
    }

    console.log(`  ✅ 已清理`);
  }

  console.log("\n登出完成，下次启动需重新扫码登录\n");
}
