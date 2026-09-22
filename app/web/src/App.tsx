import { Layout, useHashRoute } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Agents } from "./pages/Agents";
import { Sessions } from "./pages/Sessions";
import { Plugins } from "./pages/Plugins";
import { Settings } from "./pages/Settings";
import { Logs } from "./pages/Logs";

export function App() {
  const route = useHashRoute();

  let page: React.ReactNode;
  if (route === "/" || route === "") page = <Dashboard />;
  else if (route.startsWith("/agents")) page = <Agents />;
  else if (route.startsWith("/sessions")) page = <Sessions />;
  else if (route.startsWith("/plugins")) page = <Plugins />;
  else if (route.startsWith("/settings")) page = <Settings />;
  else if (route.startsWith("/logs")) page = <Logs />;
  else page = <div className="error-box">未知页面: {route}</div>;

  return <Layout route={route}>{page}</Layout>;
}
