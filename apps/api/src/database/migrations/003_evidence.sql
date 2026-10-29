-- Correlated signed evidence streams and encrypted recording metadata.
CREATE TABLE IF NOT EXISTS evidence_streams(
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    role text NOT NULL CHECK(role IN ('backend','provider')), next_seq integer NOT NULL DEFAULT 1,
    complete boolean NOT NULL DEFAULT false, complete_at integer,
    PRIMARY KEY(run_id,role));
    CREATE TABLE IF NOT EXISTS evidence_receipts(
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    role text NOT NULL, batch_id uuid NOT NULL, nonce text NOT NULL,
    digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(run_id,role,batch_id), UNIQUE(run_id,role,nonce));
    CREATE TABLE IF NOT EXISTS provider_evidence_cursors(
    run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    transcript_digest text, snapshot_digest text, recording_failure text,
    recording_redacted boolean NOT NULL DEFAULT false,
    transcript_redacted boolean NOT NULL DEFAULT false);
    ALTER TABLE provider_evidence_cursors ADD COLUMN IF NOT EXISTS recording_redacted boolean NOT NULL DEFAULT false;
    ALTER TABLE provider_evidence_cursors ADD COLUMN IF NOT EXISTS transcript_redacted boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS artifacts(
    id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK(kind='recording'), content_type text NOT NULL,
    byte_length integer NOT NULL CHECK(byte_length>0), sha256 text NOT NULL,
    iv text NOT NULL, auth_tag text NOT NULL, provider_execution_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
    redacted_at timestamptz, UNIQUE(run_id,provider_execution_id,kind));
    CREATE INDEX IF NOT EXISTS artifact_retention ON artifacts(expires_at);

-- Keep Supabase's HTTP Data API outside the application trust boundary even
-- between separate migration transactions.
DO $access$
DECLARE relation_name text; exposed_role text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['evidence_streams','evidence_receipts','provider_evidence_cursors','artifacts'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation_name);
    FOREACH exposed_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=exposed_role) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I',relation_name,exposed_role);
      END IF;
    END LOOP;
  END LOOP;
END
$access$;
