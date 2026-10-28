import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Credits, Landing } from "./components/Landing";
import { Brand, Link } from "./components/Primitives";
import { Workspace } from "./components/Workspace";
import { AuthGate } from "./components/Auth";
import { Docs } from "./components/Docs";
import type { Navigate } from "./types";
import "./style.css";
import "./mission-tokens.css";
function Screen({ path, navigate }: { path: string; navigate: Navigate }) {
  if (path === "/") return <Landing navigate={navigate} />;
  if (path === "/credits") return <Credits navigate={navigate} />;
  if (
    path === "/docs" ||
    /^\/docs\/(quickstart|first-campaign|evidence|integrations|api|troubleshooting)$/.test(
      path,
    )
  )
    return <Docs path={path} navigate={navigate} />;
  if (
    path === "/app" ||
    /^\/app\/(campaigns|findings|targets|integrations)$/.test(path) ||
    /^\/app\/runs\/[a-f0-9-]+$/.test(path)
  )
    return (
      <AuthGate navigate={navigate}>
        {(session, onSessionChange) => (
          <Workspace
            key={session.workspace?.id ?? "local"}
            path={path}
            navigate={navigate}
            session={session}
            onSessionChange={onSessionChange}
          />
        )}
      </AuthGate>
    );
  return (
    <div className="not-found">
      <Brand navigate={navigate} />
      <main>
        <span className="eyebrow">404 / A QUIETER CORNER</span>
        <h1>This line leads nowhere.</h1>
        <p>The page may have moved. Your workspace is still here.</p>
        <Link to="/app" navigate={navigate} className="button primary">
          Back to workspace
        </Link>
      </main>
    </div>
  );
}
function currentPath() {
  return window.location.pathname.replace(/\/$/, "") || "/";
}
function App() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const change = () => setPath(currentPath());
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const navigate = useCallback((next: string) => {
    if (window.location.pathname !== next) history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return <Screen path={path} navigate={navigate} />;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
