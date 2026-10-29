import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Credits, Landing } from "./pages/Landing";
import { Brand, Link } from "./shared/ui/Primitives";
import { Workspace } from "./features/workspace/Workspace";
import { AuthGate } from "./features/auth/Auth";
import { Docs } from "./pages/Docs";
import type { Navigate } from "./shared/types";
import "./styles/base.css";
import "./styles/tokens.css";
import "./styles/theme.css";
function Screen({
  path,
  location,
  navigate,
}: {
  path: string;
  location: string;
  navigate: Navigate;
}) {
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
            location={location}
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
  return (
    (window.location.pathname.replace(/\/$/, "") || "/") +
    window.location.search
  );
}
function App() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const change = () => setPath(currentPath());
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const navigate = useCallback<Navigate>((next, options) => {
    if (currentPath() !== next) {
      if (options?.replace) history.replaceState({}, "", next);
      else history.pushState({}, "", next);
    }
    setPath(next);
    if (options?.scroll !== false)
      window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return (
    <Screen path={path.split("?")[0]} location={path} navigate={navigate} />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
