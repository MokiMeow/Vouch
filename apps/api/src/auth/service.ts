import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  db,
  transaction,
  withSystemDatabase,
  withWorkspaceDatabase,
} from "../database/client";

export const LOCAL_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
const sessionHours = () =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .parse(process.env.VOUCH_SESSION_HOURS ?? 12);
const loopback = () =>
  ["127.0.0.1", "localhost"].includes(process.env.HOST ?? "127.0.0.1");
export function getAuthMode(): "local" | "session" {
  const mode =
    process.env.VOUCH_AUTH_MODE ??
    (process.env.NODE_ENV === "production" ? "session" : "local");
  if (mode !== "local" && mode !== "session")
    throw new Error("VOUCH_AUTH_MODE must be local or session");
  if (
    mode === "local" &&
    (process.env.NODE_ENV === "production" || !loopback())
  )
    throw new Error(
      "Local authentication mode is allowed only for nonproduction loopback development",
    );
  return mode;
}
const secureCookie = () =>
  process.env.NODE_ENV === "production" ||
  process.env.VOUCH_COOKIE_SECURE === "true";
const cookieName = () =>
  secureCookie() ? "__Host-vouch_session" : "vouch_session";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const csrfFor = (token: string) =>
  createHmac("sha256", token).update("vouch-csrf-v1").digest("base64url");
function equalSecret(a: string, b: string) {
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
export function isTrustedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const configured = process.env.PUBLIC_ORIGIN;
  if (configured && origin === configured) return true;
  return (
    process.env.NODE_ENV !== "production" &&
    [
      "http://127.0.0.1:4000",
      "http://localhost:4000",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ].includes(origin)
  );
}
export function assertAuthConfiguration() {
  getAuthMode();
  sessionHours();
  if (process.env.PUBLIC_ORIGIN) {
    const url = new URL(process.env.PUBLIC_ORIGIN);
    if (
      url.origin !== process.env.PUBLIC_ORIGIN ||
      url.username ||
      url.password
    )
      throw new Error(
        "PUBLIC_ORIGIN must be an origin without credentials or a path",
      );
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      throw new Error("Production PUBLIC_ORIGIN must use HTTPS");
  } else if (process.env.NODE_ENV === "production")
    throw new Error("PUBLIC_ORIGIN is required in production");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}
async function verifyPassword(password: string, stored: string) {
  const [version, salt, hash] = stored.split("$");
  if (
    version !== "scrypt-v1" ||
    !salt ||
    !hash ||
    !/^[a-f0-9]{128}$/.test(hash)
  )
    return false;
  const key = await deriveKey(password, salt);
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}
const passwordSchema = z.string().min(14).max(256);
const emailSchema = z.email().trim().toLowerCase().max(254);
const workspaceSchema = z
  .object({ name: z.string().trim().min(2).max(100) })
  .strict();
export type Workspace = { id: string; name: string; role: "owner" | "member" };
export type User = { id: string; email: string; name: string };
export type AuthSession = {
  mode: "local" | "session";
  authenticated: boolean;
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  csrfToken: string | null;
};
type SessionRecord = {
  token_hash: string;
  user_id: string;
  workspace_id: string;
  email: string;
  name: string;
};
function rawSession(req: Request) {
  const entry = req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName()}=`));
  const token = entry?.slice(cookieName().length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}
function setSessionCookie(res: Response, token: string) {
  res.cookie(cookieName(), token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: sessionHours() * 3600000,
  });
}
function clearSessionCookie(res: Response) {
  res.clearCookie(cookieName(), {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "strict",
    path: "/",
  });
}
function localSession(): AuthSession {
  const workspace: Workspace = {
    id: LOCAL_WORKSPACE_ID,
    name: "Development workspace",
    role: "owner",
  };
  return {
    mode: "local",
    authenticated: true,
    user: null,
    workspace,
    workspaces: [workspace],
    csrfToken: null,
  };
}
const anonymousSession = (): AuthSession => ({
  mode: "session",
  authenticated: false,
  user: null,
  workspace: null,
  workspaces: [],
  csrfToken: null,
});
async function resolveSession(req: Request): Promise<AuthSession> {
  if (getAuthMode() === "local") return localSession();
  const token = rawSession(req);
  if (!token) return anonymousSession();
  return withSystemDatabase(async () => {
    const record = (
      await db.query<SessionRecord>(
        "SELECT s.token_hash,s.user_id,s.workspace_id,u.email,u.name FROM vouch_sessions s JOIN vouch_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled=false",
        [digest(token)],
      )
    ).rows[0];
    if (!record) return anonymousSession();
    const workspaces = (
      await db.query<Workspace>(
        "SELECT w.id,w.name,m.role FROM vouch_memberships m JOIN vouch_workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.created_at,w.id",
        [record.user_id],
      )
    ).rows;
    const workspace = workspaces.find(
      (value) => value.id === record.workspace_id,
    );
    if (!workspace) return anonymousSession();
    return {
      mode: "session",
      authenticated: true,
      user: { id: record.user_id, email: record.email, name: record.name },
      workspace,
      workspaces,
      csrfToken: csrfFor(token),
    };
  });
}
function rejectMutation(req: Request, res: Response, auth: AuthSession) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  if (!isTrustedOrigin(req.headers.origin)) {
    res.status(403).json({ error: "A trusted request origin is required" });
    return true;
  }
  const received = req.headers["x-vouch-csrf"];
  if (
    auth.mode === "session" &&
    (!auth.csrfToken ||
      typeof received !== "string" ||
      !equalSecret(received, auth.csrfToken))
  ) {
    res
      .status(403)
      .json({ error: "A valid session request token is required" });
    return true;
  }
  return false;
}
export async function requireWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = await resolveSession(req);
  if (!auth.authenticated || !auth.workspace) {
    res.status(401).json({ error: "Sign in to continue" });
    return;
  }
  if (auth.mode === "session" && rejectMutation(req, res, auth)) return;
  res.locals.auth = auth;
  withWorkspaceDatabase(auth.workspace.id, () => next());
}
async function requireSession(req: Request, res: Response, next: NextFunction) {
  const auth = await resolveSession(req);
  if (!auth.authenticated || auth.mode !== "session") {
    res.status(401).json({ error: "A signed-in session is required" });
    return;
  }
  if (rejectMutation(req, res, auth)) return;
  res.locals.auth = auth;
  next();
}
function principal(res: Response): AuthSession {
  return res.locals.auth;
}
function isOwner(res: Response) {
  if (principal(res).workspace?.role !== "owner") {
    res.status(403).json({ error: "Workspace owner access is required" });
    return false;
  }
  return true;
}
export function requireOwner(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.auth?.authenticated) {
    res.status(401).json({ error: "Sign in to continue" });
    return;
  }
  if (!isOwner(res)) return;
  next();
}
const attempts = new Map<string, { count: number; until: number }>();
function allowLogin(req: Request, email: string) {
  const now = Date.now();
  if (attempts.size > 4000)
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
  const limits = [
    { key: digest(`source|${req.ip}`), max: 40 },
    { key: digest(`account|${req.ip}|${email}`), max: 8 },
  ];
  if (attempts.size >= 5000) return false;
  for (const { key, max } of limits) {
    const value = attempts.get(key);
    if (value && value.until > now && value.count >= max) return false;
  }
  for (const { key } of limits) {
    const value = attempts.get(key);
    if (value && value.until > now) value.count++;
    else attempts.set(key, { count: 1, until: now + 15 * 60000 });
  }
  return true;
}
export const authRouter = express.Router();
authRouter.get("/session", async (req, res) => {
  res.json(await resolveSession(req));
});
authRouter.post("/login", async (req, res) => {
  if (getAuthMode() === "local") {
    res.json(localSession());
    return;
  }
  if (!isTrustedOrigin(req.headers.origin)) {
    res.status(403).json({ error: "A trusted request origin is required" });
    return;
  }
  const body = z
    .object({ email: emailSchema, password: z.string().min(1).max(256) })
    .strict()
    .parse(req.body);
  if (!allowLogin(req, body.email)) {
    res.setHeader("Retry-After", "900");
    res
      .status(429)
      .json({ error: "Too many sign-in attempts. Try again later" });
    return;
  }
  const output = await withSystemDatabase(async () => {
    const user = (
      await db.query<{ id: string; password_hash: string }>(
        "SELECT id,password_hash FROM vouch_users WHERE email=$1 AND disabled=false",
        [body.email],
      )
    ).rows[0];
    const dummy =
      "scrypt-v1$00000000000000000000000000000000$" + "0".repeat(128);
    const valid = await verifyPassword(
      body.password,
      user?.password_hash ?? dummy,
    );
    if (!user || !valid) return null;
    const membership = (
      await db.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM vouch_memberships WHERE user_id=$1 ORDER BY created_at,workspace_id LIMIT 1",
        [user.id],
      )
    ).rows[0];
    if (!membership) return null;
    const token = randomBytes(32).toString("base64url");
    await db.query("DELETE FROM vouch_sessions WHERE expires_at<=now()");
    await db.query(
      "INSERT INTO vouch_sessions(token_hash,user_id,workspace_id,expires_at) VALUES($1,$2,$3,now()+($4::integer*interval '1 hour'))",
      [digest(token), user.id, membership.workspace_id, sessionHours()],
    );
    return token;
  });
  if (!output) {
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }
  attempts.delete(digest(`account|${req.ip}|${body.email}`));
  setSessionCookie(res, output);
  req.headers.cookie = `${cookieName()}=${output}`;
  res.json(await resolveSession(req));
});
authRouter.use(requireSession);
authRouter.post("/logout", async (req, res) => {
  await withSystemDatabase(() =>
    db.query("DELETE FROM vouch_sessions WHERE token_hash=$1", [
      digest(rawSession(req)),
    ]),
  );
  clearSessionCookie(res);
  res.json({ ok: true });
});
authRouter.post("/workspace", async (req, res) => {
  const { workspaceId } = z
    .object({ workspaceId: z.uuid() })
    .strict()
    .parse(req.body);
  const auth = principal(res);
  if (!auth.workspaces.some((value) => value.id === workspaceId)) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  await withSystemDatabase(() =>
    db.query("UPDATE vouch_sessions SET workspace_id=$2 WHERE token_hash=$1", [
      digest(rawSession(req)),
      workspaceId,
    ]),
  );
  res.json(await resolveSession(req));
});
authRouter.post("/workspaces", async (req, res) => {
  const { name } = workspaceSchema.parse(req.body);
  const id = randomUUID();
  const auth = principal(res);
  await withSystemDatabase(() =>
    transaction(async (c) => {
      await c.query("INSERT INTO vouch_workspaces(id,name) VALUES($1,$2)", [
        id,
        name,
      ]);
      await c.query(
        "INSERT INTO vouch_memberships(user_id,workspace_id,role) VALUES($1,$2,'owner')",
        [auth.user!.id, id],
      );
      await c.query(
        "UPDATE vouch_sessions SET workspace_id=$2 WHERE token_hash=$1",
        [digest(rawSession(req)), id],
      );
    }),
  );
  res.status(201).json(await resolveSession(req));
});
authRouter.get("/members", async (_req, res) => {
  if (!isOwner(res)) return;
  const rows = await withSystemDatabase(() =>
    db.query(
      "SELECT u.id,u.email,u.name,m.role,m.created_at FROM vouch_memberships m JOIN vouch_users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY m.created_at",
      [principal(res).workspace!.id],
    ),
  );
  res.json({ members: rows.rows });
});
authRouter.post("/members", async (req, res) => {
  if (!isOwner(res)) return;
  const body = z
    .object({
      email: emailSchema,
      name: z.string().trim().min(1).max(100).optional(),
      password: passwordSchema.optional(),
      role: z.enum(["owner", "member"]).default("member"),
    })
    .strict()
    .parse(req.body);
  const newHash = body.password ? await hashPassword(body.password) : null;
  const userId = await withSystemDatabase(() =>
    transaction(async (c) => {
      let user = (
        await c.query<{ id: string }>(
          "SELECT id FROM vouch_users WHERE email=$1",
          [body.email],
        )
      ).rows[0];
      if (!user) {
        if (!newHash)
          throw new Error(
            "A password of at least fourteen characters is required for a new member",
          );
        user = { id: randomUUID() };
        await c.query(
          "INSERT INTO vouch_users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
          [user.id, body.email, body.name ?? body.email.split("@")[0], newHash],
        );
      }
      const existing = (
        await c.query(
          "SELECT role FROM vouch_memberships WHERE user_id=$1 AND workspace_id=$2 FOR UPDATE",
          [user.id, principal(res).workspace!.id],
        )
      ).rows[0];
      if (existing) throw new Error("This user is already a member");
      await c.query(
        "INSERT INTO vouch_memberships(user_id,workspace_id,role) VALUES($1,$2,$3)",
        [user.id, principal(res).workspace!.id, body.role],
      );
      return user.id;
    }),
  );
  res.status(201).json({ id: userId });
});
authRouter.delete("/members/:userId", async (req, res) => {
  if (!isOwner(res)) return;
  const userId = z.uuid().parse(req.params.userId);
  const workspaceId = principal(res).workspace!.id;
  const removed = await withSystemDatabase(() =>
    transaction(async (c) => {
      await c.query("SELECT id FROM vouch_workspaces WHERE id=$1 FOR UPDATE", [
        workspaceId,
      ]);
      const membership = (
        await c.query(
          "SELECT role FROM vouch_memberships WHERE user_id=$1 AND workspace_id=$2",
          [userId, workspaceId],
        )
      ).rows[0];
      if (!membership) return false;
      if (membership.role === "owner") {
        const count = (
          await c.query(
            "SELECT count(*)::integer AS count FROM vouch_memberships WHERE workspace_id=$1 AND role='owner'",
            [workspaceId],
          )
        ).rows[0].count;
        if (count <= 1)
          throw new Error("The last workspace owner cannot be removed");
      }
      await c.query(
        "DELETE FROM vouch_memberships WHERE user_id=$1 AND workspace_id=$2",
        [userId, workspaceId],
      );
      await c.query(
        "DELETE FROM vouch_sessions WHERE user_id=$1 AND workspace_id=$2",
        [userId, workspaceId],
      );
      return true;
    }),
  );
  res
    .status(removed ? 200 : 404)
    .json(removed ? { ok: true } : { error: "Member not found" });
});
authRouter.post("/password", async (req, res) => {
  const body = z
    .object({
      currentPassword: z.string().min(1).max(256),
      newPassword: passwordSchema,
    })
    .strict()
    .parse(req.body);
  const userId = principal(res).user!.id;
  const hash = await hashPassword(body.newPassword);
  const changed = await withSystemDatabase(() =>
    transaction(async (c) => {
      const user = (
        await c.query(
          "SELECT password_hash FROM vouch_users WHERE id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0];
      if (
        !user ||
        !(await verifyPassword(body.currentPassword, user.password_hash))
      )
        return false;
      await c.query("UPDATE vouch_users SET password_hash=$2 WHERE id=$1", [
        userId,
        hash,
      ]);
      await c.query("DELETE FROM vouch_sessions WHERE user_id=$1", [userId]);
      return true;
    }),
  );
  if (!changed) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

export async function bootstrapAuth() {
  assertAuthConfiguration();
  if (getAuthMode() === "local") return;
  await withSystemDatabase(() =>
    transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(864210)");
      const count = (
        await c.query("SELECT count(*)::integer AS count FROM vouch_users")
      ).rows[0].count;
      if (count > 0) return;
      const email = emailSchema.parse(process.env.VOUCH_BOOTSTRAP_EMAIL);
      const password = passwordSchema.parse(
        process.env.VOUCH_BOOTSTRAP_PASSWORD,
      );
      const id = randomUUID();
      const hash = await hashPassword(password);
      await c.query("UPDATE vouch_workspaces SET name=$2 WHERE id=$1", [
        LOCAL_WORKSPACE_ID,
        process.env.VOUCH_BOOTSTRAP_WORKSPACE ?? "Vouch workspace",
      ]);
      await c.query(
        "INSERT INTO vouch_users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
        [id, email, email.split("@")[0], hash],
      );
      await c.query(
        "INSERT INTO vouch_memberships(user_id,workspace_id,role) VALUES($1,$2,'owner')",
        [id, LOCAL_WORKSPACE_ID],
      );
    }),
  );
}

export async function purgeExpiredSessions(): Promise<number> {
  return withSystemDatabase(async () => {
    const result = await db.query(
      "DELETE FROM vouch_sessions WHERE expires_at<=now()",
    );
    return result.rowCount ?? 0;
  });
}
