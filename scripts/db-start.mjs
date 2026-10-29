import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function localDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.port ||
      !url.username ||
      !url.password ||
      !/^\/[A-Za-z0-9_]+$/.test(url.pathname)
    )
      throw new Error();
    return url;
  } catch {
    throw new Error(
      "Configure DATABASE_URL with local database credentials and an explicit loopback port before starting the development container.",
    );
  }
}
function docker(args, options = {}) {
  return execFileSync("docker", args, { stdio: "ignore", ...options });
}
function exists(name) {
  try {
    docker(["inspect", name]);
    return true;
  } catch {
    return false;
  }
}
function startDatabase(url) {
  const name = "vouch-postgres";
  if (exists(name)) return docker(["start", name]);
  const directory = resolve(".data/postgres");
  mkdirSync(directory, { recursive: true });
  docker(
    [
      "run",
      "-d",
      "--name",
      name,
      "-p",
      `127.0.0.1:${url.port}:5432`,
      "-e",
      "POSTGRES_USER",
      "-e",
      "POSTGRES_PASSWORD",
      "-e",
      "POSTGRES_DB",
      "--mount",
      `type=bind,source=${directory},target=/var/lib/postgresql/data`,
      "postgres:17-alpine",
    ],
    {
      env: {
        ...process.env,
        POSTGRES_USER: decodeURIComponent(url.username),
        POSTGRES_PASSWORD: decodeURIComponent(url.password),
        POSTGRES_DB: url.pathname.slice(1),
      },
    },
  );
}
async function waitForDatabase() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end();
  }
}
async function main() {
  const configured = process.env.DATABASE_URL;
  if (
    !configured ||
    /YOUR_|REPLACE_|CHANGE_ME|PLACEHOLDER|\[|<|%5B/i.test(configured)
  )
    throw new Error(
      "Database setup requires actual Supabase connection settings rather than placeholders",
    );
  const selected = new URL(configured);
  if (!["postgres:", "postgresql:"].includes(selected.protocol))
    throw new Error("A PostgreSQL connection is required");
  if (selected.port === "6543")
    throw new Error(
      "Use a direct or session-pooler database connection rather than transaction pooling",
    );
  if (!["127.0.0.1", "localhost"].includes(selected.hostname)) {
    console.log(
      "External PostgreSQL selected. This command does not create or verify a Supabase project; apply migrations after configuring credentials and network access.",
    );
    return;
  }
  startDatabase(localDatabase());
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await waitForDatabase()) {
      console.log("Vouch PostgreSQL ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    "The local database did not accept the configured credentials. Existing containers and retained data are never reconfigured automatically.",
  );
}
main().catch(() => {
  console.error(
    "Database setup did not complete. Configure actual Supabase direct/session connection settings, or an explicit loopback test database with Docker available. Existing containers and retained data are not reset.",
  );
  process.exitCode = 1;
});
