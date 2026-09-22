import { useEffect, useState, type FormEvent } from "react";
import { api, type BridgeConfig } from "../api";

export function Settings() {
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.getConfig()
      .then(setConfig)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!config) return <p className="muted">加载中…</p>;

  const save = async (patch: BridgeConfig) => {
    try {
      await api.putConfig(patch);
      setNotice("配置已保存，重启桥接后生效");
      setError("");
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  return (
    <div>
      <h2>Settings</h2>
      {notice && <div className="card muted">{notice}</div>}
      {error && <div className="error-box">{error}</div>}

      <BasicSection config={config} onSave={save} />
      <StreamSection config={config} onSave={save} />
      <AllowFromSection config={config} onSave={save} />
    </div>
  );
}

function BasicSection({ config, onSave }: { config: BridgeConfig; onSave: (p: BridgeConfig) => Promise<void> }) {
  const [autoApprove, setAutoApprove] = useState(Boolean(config.autoApprove));
  const [webPort, setWebPort] = useState(String(config.webPort ?? 3210));
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const port = Number(webPort);
    await onSave({ autoApprove, webPort: Number.isFinite(port) && port > 0 ? port : 3210 });
    setBusy(false);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>基础</h3>
      <label className="row" style={{ alignItems: "center" }}>
        <span style={{ flex: "none" }}>
          <input type="checkbox" style={{ width: "auto", marginRight: 6 }}
            checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
          autoApprove（自动批准 agent 权限请求，PoC 行为）
        </span>
      </label>
      <label><span>Web 控制台端口</span>
        <input value={webPort} onChange={(e) => setWebPort(e.target.value)} type="number" min={1} max={65535} />
      </label>
      <button type="submit" disabled={busy}>保存</button>
    </form>
  );
}

function StreamSection({ config, onSave }: { config: BridgeConfig; onSave: (p: BridgeConfig) => Promise<void> }) {
  const [minChars, setMinChars] = useState(String(config.streamFlushMinChars ?? 200));
  const [idleMs, setIdleMs] = useState(String(config.streamFlushIdleMs ?? 3000));
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSave({
      streamFlushMinChars: Math.max(1, Number(minChars) || 200),
      streamFlushIdleMs: Math.max(0, Number(idleMs) || 3000),
    });
    setBusy(false);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>流式发送策略</h3>
      <div className="row">
        <label><span>冲刷最小字符数</span>
          <input value={minChars} onChange={(e) => setMinChars(e.target.value)} type="number" min={1} />
        </label>
        <label><span>冲刷空闲间隔 (ms)</span>
          <input value={idleMs} onChange={(e) => setIdleMs(e.target.value)} type="number" min={0} />
        </label>
      </div>
      <p className="muted">缓冲达到最小字符数且距上次冲刷超过空闲间隔时发送增量；prompt 结束必冲刷。</p>
      <button type="submit" disabled={busy}>保存</button>
    </form>
  );
}

function AllowFromSection({ config, onSave }: { config: BridgeConfig; onSave: (p: BridgeConfig) => Promise<void> }) {
  const initial = Array.isArray(config.allowFrom) ? (config.allowFrom as string[]).join("\n") : "";
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const allowFrom = text.split("\n").map((s) => s.trim()).filter(Boolean);
    await onSave({ allowFrom });
    setBusy(false);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>白名单（allowFrom）</h3>
      <label><span>微信用户 ID，每行一个；留空 = 自动绑定首个用户</span>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="muted">⚠️ 白名单是安全边界——agent 具有 shell 级访问权限。</p>
      <button type="submit" disabled={busy}>保存</button>
    </form>
  );
}
