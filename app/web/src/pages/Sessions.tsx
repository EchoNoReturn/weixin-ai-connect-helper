import { useEffect, useState } from "react";
import { api, type SessionItem, type SessionMessage } from "../api";

export function Sessions() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.sessions()
      .then((d) => setSessions(d.sessions))
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (selected) {
    return <SessionDetail sessionId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <h2>Sessions</h2>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        {sessions.length === 0 ? (
          <p className="muted">暂无会话</p>
        ) : (
          <table>
            <thead>
              <tr><th>用户</th><th>Agent</th><th>消息数</th><th>最近活跃</th><th></th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.userId}</td>
                  <td>{s.agentId}</td>
                  <td>{s.messageCount}</td>
                  <td className="muted">{new Date(s.updatedAt).toLocaleString()}</td>
                  <td><button className="ghost" onClick={() => setSelected(s.id)}>查看消息</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SessionDetail({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.sessionMessages(sessionId, 200)
      .then((d) => setMessages(d.messages))
      .catch((e) => setError(String(e.message ?? e)));
  }, [sessionId]);

  return (
    <div>
      <h2>
        <a href="#/sessions" onClick={(e) => { e.preventDefault(); onBack(); }}>← Sessions</a>
        {" / "}{sessionId}
      </h2>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        {messages.length === 0 ? (
          <p className="muted">暂无消息</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`msg-bubble ${m.role}`}>
              <div className="msg-meta">{m.role} · {new Date(m.createdAt).toLocaleString()}</div>
              {m.content}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
