-- Applied migrations are immutable. The runner verifies every recorded digest.
CREATE TABLE IF NOT EXISTS vouch_schema_migrations (
  version integer PRIMARY KEY CHECK (version >= 0),
  name text NOT NULL UNIQUE,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Keep Supabase's HTTP Data API outside the application trust boundary even
-- between separate migration transactions.
DO $access$
DECLARE relation_name text; exposed_role text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['vouch_schema_migrations'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation_name);
    FOREACH exposed_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=exposed_role) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I',relation_name,exposed_role);
      END IF;
    END LOOP;
  END LOOP;
END
$access$;
