import { useEffect, useState, type FormEvent } from "react";
import { api, type AgentInfo } from "../api";

export function Agents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [defaultAgent, setDefaultAgent] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = () =>
    api.agents()
      .then((d) => { setAgents(d.agents); setDefaultAgent(d.defaultAgent); setError(""); })
      .catch((e) => setError(String(e.message ?? e)));

  useEffect(() => { void load(); }, []);

  const onDelete = async (id: string) => {
    if (!confirm(`确定删除 agent "${id}"？`)) return;
    try {
      await api.deleteAgent(id);
      setNotice("已删除，重启桥接后生效");
      await load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  const onSetDefault = async (id: string) => {
    try {
      await api.putConfig({ defaultAgent: id });
      setNotice("默认 agent 已更新，重启桥接后生效");
      await load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  const onNotifyPolicy = async (id: string, notifyPolicy: string) => {
    try {
      await api.updateAgent(id, { notifyPolicy: notifyPolicy as AgentInfo["notifyPolicy"] });
      setNotice("已更新，重启桥接后生效");
      await load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  return (
    <div>
      <h2>Agents</h2>
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="card muted">{notice}</div>}
      <div className="card">
        <table>
          <thead>
            <tr><th>ID</th><th>命令</th><th>参数</th><th>工作目录</th><th>结束通知</th><th>操作</th></tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td>
                  {a.id} {a.isDefault && <span className="badge ok">默认</span>}
                </td>
                <td><code>{a.command}</code></td>
                <td><code>{a.args.join(" ")}</code></td>
                <td className="muted">{a.cwd}</td>
                <td>
                  <select value={a.notifyPolicy} onChange={(e) => onNotifyPolicy(a.id, e.target.value)}>
                    <option value="none">none</option>
                    <option value="own">own</option>
                    <option value="all">all</option>
                  </select>
                </td>
                <td className="row" style={{ gap: 6 }}>
                  {!a.isDefault && (
                    <>
                      <button className="ghost" onClick={() => onSetDefault(a.id)}>设为默认</button>
                      <button className="danger" onClick={() => onDelete(a.id)}>删除</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginBottom: 0 }}>当前默认: {defaultAgent}</p>
      </div>

      {showAdd ? (
        <AddAgentForm
          onDone={async () => { setShowAdd(false); setNotice("已添加，重启桥接后生效"); await load(); }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button onClick={() => setShowAdd(true)}>+ 添加 Agent</button>
      )}
    </div>
  );
}

function AddAgentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ id: "", command: "", args: "", cwd: ".", notifyPolicy: "none" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.addAgent({
        id: form.id.trim(),
        command: form.command.trim(),
        args: form.args.trim() ? form.args.trim().split(/\s+/) : [],
        cwd: form.cwd.trim() || ".",
        notifyPolicy: form.notifyPolicy,
      });
      onDone();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>添加 Agent</h3>
      {error && <div className="error-box">{error}</div>}
      <div className="row">
        <label><span>ID（路由前缀如 /oc）</span>
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
        </label>
        <label><span>命令</span>
          <input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} required />
        </label>
      </div>
      <div className="row">
        <label><span>参数（空格分隔）</span>
          <input value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder="acp" />
        </label>
        <label><span>工作目录</span>
          <input value={form.cwd} onChange={(e) => setForm({ ...form, cwd: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? "提交中…" : "添加"}</button>
        <button type="button" className="ghost" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}
