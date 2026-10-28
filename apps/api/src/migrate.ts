import { db } from "./db";
export async function migrate() {
  await db.query(`
CREATE TABLE IF NOT EXISTS targets(id uuid PRIMARY KEY, name text NOT NULL, transport text NOT NULL CHECK(transport IN ('fixture','pstn')), phone text, authorization_reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS campaigns(id uuid PRIMARY KEY, name text NOT NULL, target_id uuid NOT NULL REFERENCES targets(id), mode text NOT NULL, scope jsonb NOT NULL, config jsonb NOT NULL, config_hash text NOT NULL, status text NOT NULL DEFAULT 'queued', calls_used integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS runs(id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES campaigns(id), scenario text NOT NULL, status text NOT NULL DEFAULT 'queued', synthetic boolean NOT NULL DEFAULT true, config jsonb NOT NULL, verdict jsonb, review text NOT NULL DEFAULT 'pending' CHECK(review IN ('pending','confirmed','dismissed')), review_note text, error text, started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS events(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES runs(id),seq integer NOT NULL,kind text NOT NULL,source text NOT NULL,at integer NOT NULL,data jsonb NOT NULL,UNIQUE(run_id,seq));
CREATE TABLE IF NOT EXISTS accounts(run_id uuid PRIMARY KEY REFERENCES runs(id),account_id text NOT NULL DEFAULT 'SYN-1042',phone text NOT NULL,verified boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS reviews(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES runs(id),decision text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS runs_queue ON runs(status,created_at);
`);
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await migrate();
  await db.end();
  console.log("Database migration complete");
}
