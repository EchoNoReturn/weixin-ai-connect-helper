import { useEffect, useState } from "react";
import { api, type StatusResponse } from "../api";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  connected: { cls: "ok", label: "已连接" },
  starting: { cls: "warn", label: "启动中" },
  reconnecting: { cls: "warn", label: "重连中" },
  stopped: { cls: "err", label: "已停止" },
};

function fmtAgo(ts: number | undefined, now: number): string {
  if (!ts) return "-";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s 前`;
  return `${Math.floor(s / 60)}m${s % 60}s 前`;
}

export function Dashboard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.status()
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(String(e.message ?? e)));
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (error) return <div className="error-box">加载失败: {error}</div>;
  if (!data) return <p className="muted">加载中…</p>;

  const b = data.bridge;
  const badge = STATUS_BADGE[b.status] ?? { cls: "muted", label: b.status };
  const uptime = "startedAt" in b && b.startedAt ? Math.round((data.now - b.startedAt) / 1000) : 0;

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="card">
        <h3>桥接状态</h3>
        <p>状态: <span className={`badge ${badge.cls}`}>{badge.label}</span></p>
        {"accountId" in b && b.accountId && <p>微信账号: {b.accountId}</p>}
        <p>版本: {data.version}</p>
        {uptime > 0 && <p>运行时长: {Math.floor(uptime / 60)}m{uptime % 60}s</p>}
        {"lastMessageAt" in b && <p>最后消息: {fmtAgo(b.lastMessageAt, data.now)}</p>}
        {"reconnectAttempts" in b && b.reconnectAttempts! > 0 && <p>重连次数: {b.reconnectAttempts}</p>}
        {"lastError" in b && b.lastError && <p className="error-box" style={{ margin: 0 }}>最后错误: {b.lastError}</p>}
      </div>
    </div>
  );
}
