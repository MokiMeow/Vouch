import type { Express, Request } from "express";
import { randomUUID } from "node:crypto";

export function publicOrigin() {
  const configured = process.env.PUBLIC_ORIGIN;
  if (!configured) return null;
  const url = new URL(configured);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("PUBLIC_ORIGIN must contain only a scheme and host");
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("PUBLIC_ORIGIN must be an HTTP or HTTPS origin");
  return url.origin;
}

function trustedHost(req: Request, origin: string | null) {
  if (origin) return req.headers.host === new URL(origin).host;
  return ["127.0.0.1", "localhost", "[::1]"].includes(req.hostname);
}

function trustedOrigin(req: Request, origin: string | null) {
  const received = req.headers.origin;
  if (!received) return true;
  if (origin) return received === origin;
  return [
    `http://${req.headers.host}`,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ].includes(received);
}

export function installHttpSecurity(app: Express) {
  const origin = publicOrigin();
  const production = process.env.NODE_ENV === "production";
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (production) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      );
      if (origin?.startsWith("https://"))
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    const started = performance.now();
    res.on("finish", () => {
      if (production)
        console.log(
          JSON.stringify({
            event: "http_request",
            requestId,
            method: req.method,
            route:
              req.route?.path ??
              (req.path.startsWith("/api/") ? "/api" : "/web"),
            status: res.statusCode,
            durationMs: Math.round(performance.now() - started),
          }),
        );
    });
    if (!trustedHost(req, origin))
      return res.status(403).json({ error: "Untrusted request host" });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !trustedOrigin(req, origin)
    )
      return res.status(403).json({ error: "Untrusted request origin" });
    next();
  });
}

export function listenHost() {
  const host = process.env.HOST ?? "127.0.0.1";
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!local && (process.env.VOUCH_AUTH_MODE !== "session" || !publicOrigin()))
    throw new Error(
      "External listeners require session authentication and PUBLIC_ORIGIN",
    );
  return host;
}
