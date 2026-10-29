-- Core records without seeded targets, campaigns, runs or fixture accounts.
CREATE TABLE IF NOT EXISTS targets(id uuid PRIMARY KEY, name text NOT NULL, transport text NOT NULL CHECK(transport='pstn'), phone text, authorization_reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS campaigns(id uuid PRIMARY KEY, name text NOT NULL, target_id uuid NOT NULL REFERENCES targets(id), mode text NOT NULL CHECK(mode='live'), scope jsonb NOT NULL, config jsonb NOT NULL, config_hash text NOT NULL, status text NOT NULL DEFAULT 'queued', calls_used integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS runs(id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES campaigns(id), scenario text NOT NULL, status text NOT NULL DEFAULT 'queued', synthetic boolean NOT NULL DEFAULT false, config jsonb NOT NULL, verdict jsonb, review text NOT NULL DEFAULT 'pending' CHECK(review IN ('pending','confirmed','dismissed')), review_note text, error text, started_at timestamptz, finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS events(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES runs(id),seq integer NOT NULL,kind text NOT NULL,source text NOT NULL,at integer NOT NULL,data jsonb NOT NULL,UNIQUE(run_id,seq));
CREATE TABLE IF NOT EXISTS reviews(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES runs(id),decision text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS runs_queue ON runs(status,created_at);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS config_hash_algorithm text NOT NULL DEFAULT 'sha256-json-stringify-v1';
ALTER TABLE targets ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE runs ALTER COLUMN synthetic SET DEFAULT false;

-- Keep Supabase's HTTP Data API outside the application trust boundary even
-- between separate migration transactions.
DO $access$
DECLARE relation_name text; exposed_role text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['targets','campaigns','runs','events','reviews'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation_name);
    FOREACH exposed_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=exposed_role) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I',relation_name,exposed_role);
      END IF;
    END LOOP;
  END LOOP;
END
$access$;
