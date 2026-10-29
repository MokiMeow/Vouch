-- Durable provider execution, reservations and isolated-caller cleanup.
CREATE TABLE IF NOT EXISTS live_executions (
      run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL,
      state text NOT NULL DEFAULT 'prepared',
      request_key uuid NOT NULL UNIQUE,
      caller_agent_id text,
      provider_execution_id text UNIQUE,
      currency text NOT NULL DEFAULT 'USD',
      reserved_cents integer NOT NULL CHECK (reserved_cents >= 0),
      settled_cents integer CHECK (settled_cents >= 0),
      cancel_requested boolean NOT NULL DEFAULT false,
      dispatch_started_at timestamptz,
      deadline_at timestamptz,
      carrier_limit_set_at timestamptz,
      terminal_at timestamptz,
      next_poll_at timestamptz NOT NULL DEFAULT now(),
      last_snapshot jsonb,
      last_error text,
      cleanup_state text NOT NULL DEFAULT 'not_required',
      cleanup_attempts integer NOT NULL DEFAULT 0,
      cleanup_next_at timestamptz,
      cleanup_error text,
      caller_deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS deadline_at timestamptz;
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS carrier_limit_set_at timestamptz;
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS cleanup_state text NOT NULL DEFAULT 'not_required';
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0;
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS cleanup_next_at timestamptz;
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS cleanup_error text;
    ALTER TABLE live_executions ADD COLUMN IF NOT EXISTS caller_deleted_at timestamptz;
    UPDATE live_executions SET cleanup_state='pending',cleanup_next_at=now()
      WHERE caller_agent_id IS NOT NULL AND caller_deleted_at IS NULL AND cleanup_state='not_required'
        AND state IN ('completed','cancelled','failed') AND settled_cents IS NOT NULL;

    CREATE INDEX IF NOT EXISTS live_execution_state ON live_executions(state,next_poll_at);

-- Keep Supabase's HTTP Data API outside the application trust boundary even
-- between separate migration transactions.
DO $access$
DECLARE relation_name text; exposed_role text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['live_executions'] LOOP
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation_name);
    FOREACH exposed_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=exposed_role) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I',relation_name,exposed_role);
      END IF;
    END LOOP;
  END LOOP;
END
$access$;
