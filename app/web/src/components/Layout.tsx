import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { path: "/", label: "Dashboard" },
  { path: "/agents", label: "Agents" },
  { path: "/sessions", label: "Sessions" },
  { path: "/plugins", label: "Plugins" },
  { path: "/settings", label: "Settings" },
  { path: "/logs", label: "Logs" },
];

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => setHash(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  return (
    <div className="layout">
      <div className="sidebar">
        <h1>微信 AI 桥接</h1>
        <nav>
          {NAV.map((n) => (
            <a
              key={n.path}
              href={`#${n.path}`}
              className={route === n.path || (n.path !== "/" && route.startsWith(n.path)) ? "active" : ""}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="content">{children}</div>
    </div>
  );
}
