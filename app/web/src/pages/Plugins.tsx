import { useEffect, useState } from "react";
import { api, type PluginInfo } from "../api";

export function Plugins() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api.plugins()
      .then((d) => { setPlugins(d.plugins); setError(""); })
      .catch((e) => setError(String(e.message ?? e)));

  useEffect(() => { void load(); }, []);

  const toggle = async (name: string, enabled: boolean) => {
    try {
      await api.togglePlugin(name, enabled);
      setNotice(`插件 "${name}" 已${enabled ? "启用" : "禁用"}，重启桥接后生效`);
      await load();
    } catch (e: any) { setError(String(e.message ?? e)); }
  };

  return (
    <div>
      <h2>Plugins</h2>
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="card muted">{notice}</div>}
      <div className="card">
        {plugins.length === 0 ? (
          <p className="muted">plugins.json 中没有插件</p>
        ) : (
          <table>
            <thead>
              <tr><th>名称</th><th>Hook 分组</th><th>入口</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.hooks.map((h) => <span key={h} className="badge muted" style={{ marginRight: 4 }}>{h}</span>)}</td>
                  <td className="muted"><code>{p.entry}</code></td>
                  <td>
                    <span className={`badge ${p.enabled ? "ok" : "muted"}`}>
                      {p.enabled ? "已启用" : "已禁用"}
                    </span>
                  </td>
                  <td>
                    <button className="ghost" onClick={() => toggle(p.name, !p.enabled)}>
                      {p.enabled ? "禁用" : "启用"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
