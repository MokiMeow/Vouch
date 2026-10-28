import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Credits, Landing } from "./components/Landing";
import { Brand, Link } from "./components/Primitives";
import { Workspace } from "./components/Workspace";
import "./style.css";
function App() {
  const [path, setPath] = useState(
    window.location.pathname.replace(/\/$/, "") || "/",
  );
  useEffect(() => {
    const change = () => {
      setPath(window.location.pathname.replace(/\/$/, "") || "/");
    };
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const navigate = useCallback((next: string) => {
    if (window.location.pathname !== next) history.pushState({}, "", next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  if (path === "/") return <Landing navigate={navigate} />;
  if (path === "/credits") return <Credits navigate={navigate} />;
  if (
    path === "/app" ||
    /^\/app\/(campaigns|findings|targets|integrations)$/.test(path) ||
    /^\/app\/runs\/[a-f0-9-]+$/.test(path)
  )
    return <Workspace path={path} navigate={navigate} />;
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
