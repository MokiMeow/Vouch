import {
  ArrowRightIcon,
  GearSixIcon,
  SignOutIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, setApiSessionToken } from "../../shared/lib";
import type { AuthSession, Navigate } from "../../shared/types";
import { Brand, Modal } from "../../shared/ui/Primitives";
import "../../styles/auth.css";

type SessionChange = (session: AuthSession) => void;
const SessionContext = createContext<AuthSession | null>(null);
export const useWorkspaceSession = () => useContext(SessionContext);
function acceptSession(session: AuthSession, publish: SessionChange) {
  setApiSessionToken(session.csrfToken);
  publish(session);
}
export function AuthGate({
  navigate,
  children,
}: {
  navigate: Navigate;
  children: (session: AuthSession, change: SessionChange) => ReactNode;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const changeSession = useCallback((next: AuthSession) => {
    generation.current++;
    acceptSession(next, setSession);
    try {
      localStorage.setItem(
        "vouch-session-change",
        `${Date.now()}-${Math.random()}`,
      );
    } catch {
      /* Storage may be unavailable in a private browser. */
    }
  }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setError("");
    try {
      const next = await api("/auth/session");
      if (current === generation.current) acceptSession(next, setSession);
    } catch (error) {
      if (current === generation.current) setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const expired = () => {
      setSession(null);
      setApiSessionToken(null);
      void load();
    };
    const changedInAnotherTab = (event: StorageEvent) => {
      if (event.key === "vouch-session-change") expired();
    };
    window.addEventListener("vouch-session-expired", expired);
    window.addEventListener("storage", changedInAnotherTab);
    return () => {
      generation.current++;
      window.removeEventListener("vouch-session-expired", expired);
      window.removeEventListener("storage", changedInAnotherTab);
    };
  }, [load]);
  if (session?.authenticated)
    return (
      <SessionContext.Provider value={session}>
        {children(session, changeSession)}
      </SessionContext.Provider>
    );
  return (
    <div className="auth-page">
      <header>
        <Brand navigate={navigate} />
        <a href="/docs">Read the documentation</a>
      </header>
      <main className="auth-main">
        <span className="eyebrow">VOUCH / WORKSPACE ACCESS</span>
        <h1>
          Your evidence.
          <br />
          <span>Your workspace.</span>
        </h1>
        {session ? (
          <LoginForm onSession={changeSession} />
        ) : (
          <div role={error ? "alert" : "status"}>
            <p>{error || "Checking workspace access…"}</p>
            {error && (
              <button className="button secondary" onClick={() => void load()}>
                Try again
              </button>
            )}
          </div>
        )}
      </main>
      <div className="auth-art" aria-hidden="true">
        <img
          src="/brand/vouch-builder.webp"
          alt=""
          width="220"
          height="220"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
      </div>
    </div>
  );
}
function LoginForm({ onSession }: { onSession: SessionChange }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      onSession(
        await api("/auth/login", {
          email: form.get("email"),
          password: form.get("password"),
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="setup-form auth-login" onSubmit={submit}>
      <p>Sign in to continue your authorized testing.</p>
      {error && (
        <p className="inline-error" role="alert">
          <WarningCircleIcon size={18} />
          {error}
        </p>
      )}
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          maxLength={254}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
        />
      </label>
      <button className="button primary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
        <ArrowRightIcon size={18} />
      </button>
      <p className="form-help">
        Ask your workspace owner for access. Credentials stay on the server.
      </p>
    </form>
  );
}
export function SessionControls({
  session,
  onChange,
}: {
  session: AuthSession;
  onChange: SessionChange;
}) {
  const [settings, setSettings] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function switchWorkspace(id: string) {
    setBusy(true);
    setError("");
    try {
      onChange(await api("/auth/workspace", { workspaceId: id }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", {});
      onChange({
        ...session,
        authenticated: false,
        csrfToken: null,
        user: null,
        workspace: null,
        workspaces: [],
      });
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  if (session.mode === "local")
    return (
      <span className="workspace-mode">
        <span className="status-dot" />
        Local sandbox
      </span>
    );
  return (
    <div className="session-controls">
      <label className="sr-only" htmlFor="workspace-picker">
        Current workspace
      </label>
      <select
        id="workspace-picker"
        aria-label="Current workspace"
        value={session.workspace?.id ?? ""}
        disabled={busy}
        onChange={(e) => void switchWorkspace(e.target.value)}
      >
        {session.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        aria-label="Workspace and account settings"
        title="Workspace and account settings"
        onClick={() => setSettings(true)}
      >
        <GearSixIcon size={18} />
      </button>
      <button
        className="icon-button session-signout"
        aria-label="Sign out"
        title="Sign out"
        disabled={busy}
        onClick={() => void logout()}
      >
        <SignOutIcon size={18} />
      </button>
      {error && (
        <span className="session-error" role="alert">
          {error}
        </span>
      )}
      {settings && (
        <Modal
          title="Your workspace and account."
          onClose={() => setSettings(false)}
        >
          <AccountSettings session={session} onChange={onChange} />
          <button
            className="button secondary account-signout"
            disabled={busy}
            onClick={() => void logout()}
          >
            <SignOutIcon size={18} />
            Sign out
          </button>
        </Modal>
      )}
    </div>
  );
}
function AccountSettings({
  session,
  onChange,
}: {
  session: AuthSession;
  onChange: SessionChange;
}) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, endpoint: string) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget,
      data = Object.fromEntries(
        [...new FormData(element)].filter(
          ([key, value]) => !["name", "password"].includes(key) || value !== "",
        ),
      );
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api(endpoint, data);
      if (endpoint === "/auth/workspaces") onChange(result);
      else if (endpoint === "/auth/password") {
        onChange({
          ...session,
          authenticated: false,
          csrfToken: null,
          user: null,
          workspace: null,
          workspaces: [],
        });
        return;
      } else setMessage("Workspace access saved.");
      element.reset();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-settings">
      <p>
        {session.user?.name} · {session.user?.email}
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {session.workspace?.role === "owner" && (
        <MembershipList session={session} />
      )}
      {session.workspace?.role === "owner" && (
        <details>
          <summary>Give someone workspace access</summary>
          <form
            className="setup-form"
            onSubmit={(event) => void submit(event, "/auth/members")}
          >
            <label>
              Email
              <input type="email" name="email" required maxLength={254} />
            </label>
            <label>
              Name
              <input name="name" maxLength={100} />
            </label>
            <label>
              Initial password for a new account
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                maxLength={256}
              />
            </label>
            <small>
              Leave the password empty when adding an existing user.
            </small>
            <label>
              Workspace role
              <select name="role">
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <button className="button secondary" disabled={busy}>
              Save access
            </button>
          </form>
        </details>
      )}
      <details>
        <summary>Create a workspace</summary>
        <form
          className="setup-form"
          onSubmit={(event) => void submit(event, "/auth/workspaces")}
        >
          <label>
            Workspace name
            <input name="name" required minLength={3} maxLength={80} />
          </label>
          <button className="button secondary" disabled={busy}>
            Create workspace
          </button>
        </form>
      </details>
      <details>
        <summary>Change your password</summary>
        <form
          className="setup-form"
          onSubmit={(event) => void submit(event, "/auth/password")}
        >
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={14}
              maxLength={256}
            />
          </label>
          <p className="form-help">
            Changing your password signs out all your sessions.
          </p>
          <button className="button secondary" disabled={busy}>
            Change password
          </button>
        </form>
      </details>
    </div>
  );
}

type Member = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
};
function MembershipList({ session }: { session: AuthSession }) {
  const [members, setMembers] = useState<Member[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setMembers((await api("/auth/members")).members);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.email} from this workspace?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/auth/members/${member.id}`, {}, undefined, "DELETE");
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Review workspace access</summary>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {members ? (
        <ul className="workspace-members">
          {members.map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span>
                  {member.email} · {member.role}
                </span>
              </div>
              <button
                className="text-button"
                disabled={busy || member.id === session.user?.id}
                onClick={() => void remove(member)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No access list loaded.</p>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Loading…" : "Refresh access list"}
      </button>
    </details>
  );
}
