-- Worker liveness is shared between containers and never seeded.
CREATE TABLE service_heartbeats (
  service text NOT NULL CHECK(service='worker'),
  instance_id uuid NOT NULL,
  state text NOT NULL CHECK(state IN ('healthy','failed')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  CHECK(state <> 'healthy' OR last_success_at IS NOT NULL),
  PRIMARY KEY(service,instance_id)
);
CREATE INDEX service_heartbeats_status ON service_heartbeats(service,state,checked_at DESC);
ALTER TABLE service_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_heartbeats FORCE ROW LEVEL SECURITY;
CREATE POLICY service_health_read ON service_heartbeats FOR SELECT USING (true);
CREATE POLICY service_health_system ON service_heartbeats FOR ALL
  USING (current_setting('vouch.system',true)='on')
  WITH CHECK (current_setting('vouch.system',true)='on');
GRANT SELECT ON service_heartbeats TO vouch_runtime;
REVOKE ALL ON service_heartbeats FROM PUBLIC;
DO $access$
DECLARE exposed_role text;
BEGIN
  FOREACH exposed_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=exposed_role) THEN
      EXECUTE format('REVOKE ALL ON service_heartbeats FROM %I',exposed_role);
    END IF;
  END LOOP;
END
$access$;
