import { useEffect, useRef, useState } from "react";
import { connectLogs, type LogEntry } from "../api";

const LEVEL_COLOR: Record<string, string> = {
  error: "error",
  warn: "warn",
};

export function Logs() {
  const [entries, setEntries] = useState<Array<LogEntry & { replay: boolean }>>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const close = connectLogs((entry, isReplay) => {
      setConnected(true);
      setEntries((prev) => [...prev.slice(-999), { ...entry, replay: isReplay }]);
    });
    return close;
  }, []);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [entries, autoScroll]);

  const visible = filter
    ? entries.filter((e) => e.msg.includes(filter) || e.scope.includes(filter))
    : entries;

  return (
    <div>
      <h2>Logs {!connected && <span className="badge warn">连接中…</span>}</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="过滤（消息或 scope）" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label style={{ flex: "none", margin: 0 }}>
          <input type="checkbox" style={{ width: "auto", marginRight: 6 }}
            checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          自动滚动
        </label>
        <button className="ghost" style={{ flex: "none" }} onClick={() => setEntries([])}>清空</button>
      </div>
      <div className="log-viewer">
        {visible.length === 0 && <p className="muted">暂无日志</p>}
        {visible.map((e, i) => (
          <div key={i} className={`log-line ${LEVEL_COLOR[e.level] ?? ""}`}>
            <span className="ts">{e.ts.slice(11, 19)}</span>
            <span className="scope">[{e.scope}]</span>
            <span className="msg">{e.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
