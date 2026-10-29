-- Application identity is managed by the Node API, not Supabase anonymous JWTs.
CREATE TABLE IF NOT EXISTS vouch_workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vouch_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vouch_memberships (
  user_id uuid NOT NULL REFERENCES vouch_users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES vouch_workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('owner','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,workspace_id)
);
CREATE TABLE IF NOT EXISTS vouch_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES vouch_users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES vouch_workspaces(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vouch_sessions_expiry ON vouch_sessions(expires_at);

DO $migration$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vouch_runtime') THEN
    CREATE ROLE vouch_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vouch_runtime'
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin OR rolinherit)) THEN
    RAISE EXCEPTION 'vouch_runtime must be a restricted NOLOGIN NOINHERIT role without administrative privileges';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='vouch_runtime')) THEN
    RAISE EXCEPTION 'vouch_runtime cannot be a member of another database role';
  END IF;
  IF NOT pg_has_role(current_user,'vouch_runtime','MEMBER') THEN
    EXECUTE format('GRANT vouch_runtime TO %I', current_user);
  END IF;
END
$migration$;

-- Keep existing records in their prior workspace. An empty workspace is
-- identity/setup metadata, not a seeded target, campaign, run or customer.
INSERT INTO vouch_workspaces(id,name)
VALUES('00000000-0000-4000-8000-000000000001','Vouch workspace')
ON CONFLICT(id) DO NOTHING;

ALTER TABLE targets ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE targets SET workspace_id='00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
UPDATE campaigns c SET workspace_id=t.workspace_id FROM targets t WHERE t.id=c.target_id AND c.workspace_id IS NULL;
UPDATE runs r SET workspace_id=c.workspace_id FROM campaigns c WHERE c.id=r.campaign_id AND r.workspace_id IS NULL;
UPDATE live_executions e SET workspace_id=r.workspace_id FROM runs r WHERE r.id=e.run_id AND e.workspace_id IS NULL;

DO $migration$
DECLARE
  relation_name text;
  policy_expression text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['targets','campaigns','runs','live_executions'] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id SET NOT NULL, ALTER COLUMN workspace_id SET DEFAULT NULLIF(current_setting(''vouch.workspace_id'',true),'''')::uuid',relation_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(workspace_id)',relation_name||'_workspace',relation_name);
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=relation_name||'_workspace_fk' AND conrelid=to_regclass(relation_name)) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(workspace_id) REFERENCES vouch_workspaces(id)',relation_name,relation_name||'_workspace_fk');
    END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_boundary ON %I',relation_name);
    policy_expression := 'current_setting(''vouch.system'',true)=''on'' OR workspace_id=NULLIF(current_setting(''vouch.workspace_id'',true),'''')::uuid';
    EXECUTE format('CREATE POLICY workspace_boundary ON %I USING (%s) WITH CHECK (%s)',relation_name,policy_expression,policy_expression);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO vouch_runtime',relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['events','accounts','reviews','evidence_streams','evidence_receipts','provider_evidence_cursors','artifacts'] LOOP
    -- Historical fixture accounts are retained if present, never newly created.
    IF to_regclass(relation_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',relation_name);
    EXECUTE format('DROP POLICY IF EXISTS workspace_boundary ON %I',relation_name);
    policy_expression := format('current_setting(''vouch.system'',true)=''on'' OR EXISTS(SELECT 1 FROM runs r WHERE r.id=%I.run_id AND r.workspace_id=NULLIF(current_setting(''vouch.workspace_id'',true),'''')::uuid)',relation_name);
    EXECUTE format('CREATE POLICY workspace_boundary ON %I USING (%s) WITH CHECK (%s)',relation_name,policy_expression,policy_expression);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO vouch_runtime',relation_name);
  END LOOP;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS targets_id_workspace ON targets(id,workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_id_workspace ON campaigns(id,workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS runs_id_workspace ON runs(id,workspace_id);
DO $migration$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='campaign_target_workspace' AND conrelid='campaigns'::regclass) THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaign_target_workspace FOREIGN KEY(target_id,workspace_id) REFERENCES targets(id,workspace_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='run_campaign_workspace' AND conrelid='runs'::regclass) THEN
    ALTER TABLE runs ADD CONSTRAINT run_campaign_workspace FOREIGN KEY(campaign_id,workspace_id) REFERENCES campaigns(id,workspace_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='execution_run_workspace' AND conrelid='live_executions'::regclass) THEN
    ALTER TABLE live_executions ADD CONSTRAINT execution_run_workspace FOREIGN KEY(run_id,workspace_id) REFERENCES runs(id,workspace_id);
  END IF;
END
$migration$;
GRANT USAGE ON SCHEMA public TO vouch_runtime;
REVOKE ALL ON vouch_users,vouch_sessions,vouch_memberships,vouch_workspaces,vouch_schema_migrations FROM vouch_runtime;

-- Supabase's HTTP Data API is not this application's authentication boundary.
-- Remove inherited/public table grants even when a project's default privileges
-- would otherwise expose newly created public-schema tables through PostgREST.
DO $migration$
DECLARE
  relation_name text;
  exposed_role text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['targets','campaigns','runs','live_executions','events','accounts','reviews','evidence_streams','evidence_receipts','provider_evidence_cursors','artifacts','vouch_users','vouch_sessions','vouch_memberships','vouch_workspaces','vouch_schema_migrations'] LOOP
    IF to_regclass(relation_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',relation_name);
    FOREACH exposed_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=exposed_role) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I',relation_name,exposed_role);
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;
