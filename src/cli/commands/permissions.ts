import { loadConfig, saveConfig } from "../../config.ts";
import { getConfigPath } from "../../bin-dir.ts";

export async function execPermissions(action: "status" | "enable" | "disable"): Promise<void> {
  const config = await loadConfig();
  if (action !== "status") {
    config.autoApprove = action === "enable";
    await saveConfig(config);
  }
  console.log(`Agent 权限自动批准：${config.autoApprove ? "开启" : "关闭"} (autoApprove=${config.autoApprove})`);
  console.log(`配置文件：${getConfigPath("bridge.config.json")}`);
  console.log(action === "status" ? "以上为已保存配置；运行中的桥接使用启动时的设置。" : "已保存，请运行 wah restart 后生效。");
  console.log("开启后自动批准 Agent 请求的文件、命令等工具权限；关闭时转发微信由用户决定。Agent 提问始终由用户回答，微信访问审批独立生效。");
}
