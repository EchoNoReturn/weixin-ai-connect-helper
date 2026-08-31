import "../../env.ts";
import { AccessManager, type AccessStatus } from "@yoyojcoder-weixin-ai/orchestration";

const VALID_FILTERS = new Set<AccessStatus>(["pending", "approved", "revoked"]);

function printRecords(manager: AccessManager, filter?: AccessStatus): void {
  const records = manager.list(filter);
  if (records.length === 0) {
    console.log(filter ? `没有 ${filter} 用户\n` : "没有访问记录\n");
    return;
  }

  console.log("状态\t\t用户 ID");
  for (const record of records) {
    console.log(`${record.status.padEnd(10)}\t${record.userId}`);
  }
  console.log("");
}

export async function execAccess(args: string[]): Promise<void> {
  const manager = new AccessManager();
  const subcommand = args[0] ?? "list";

  switch (subcommand) {
    case "list": {
      const rawFilter = args[1];
      if (rawFilter && !VALID_FILTERS.has(rawFilter as AccessStatus)) {
        throw new Error(`未知访问状态 "${rawFilter}"；可选: pending, approved, revoked`);
      }
      printRecords(manager, rawFilter as AccessStatus | undefined);
      return;
    }
    case "approve": {
      const userId = args[1]?.trim();
      if (!userId) throw new Error("用法: wah access approve <user-id>");
      manager.approve(userId);
      console.log(`✅ 已批准用户: ${userId}\n`);
      return;
    }
    case "revoke": {
      const userId = args[1]?.trim();
      if (!userId) throw new Error("用法: wah access revoke <user-id>");
      manager.revoke(userId);
      console.log(`✅ 已撤销用户: ${userId}\n`);
      return;
    }
    default:
      throw new Error(`未知子命令: access ${subcommand}`);
  }
}
