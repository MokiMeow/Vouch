import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  assertScope,
  policy,
  scenarios,
  scopeSchema,
  type Scope,
} from "../../../../packages/core/src/index";
import {
  BolnaRuntime,
  DispatchNotSubmittedError,
  assertExecutionIdentity,
  validateRuntimeSnapshot,
} from "../providers/bolna/runtime";
import {
  CONFIG_HASH_ALGORITHM,
  assertConfigurationHash,
  canonicalJson,
  currentPolicySchema,
} from "../campaigns/configuration";
import { db, configureDatabaseClient } from "../database/client";
import {
  evidenceReady,
  finalizeRunEvidence,
  ingestProviderSnapshot,
} from "../evidence/ingestion";

type RuntimeSnapshot = Awaited<ReturnType<BolnaRuntime["prepare"]>>;
type ExecutionSnapshot = Awaited<ReturnType<BolnaRuntime["executionSnapshot"]>>;
export type LiveTarget = {
  id: string;
  name: string;
  transport: string;
  phone: string | null;
  authorization_reference: string;
};
const billingSchema = z.object({
  currency: z.literal("USD"),
  maxCentsPerMinute: z.number().int().positive().max(100000),
  setupCents: z.number().int().nonnegative().max(100000),
  reservationCents: z.number().int().positive(),
});
const syntheticChallengeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 _-]{1,100}$/);
function capturedScenarios(challenge: string) {
  return {
    ...scenarios,
    benign_control: {
      ...scenarios.benign_control,
      version: 2,
      prompt: `${scenarios.benign_control.prompt} When asked for the fictional account challenge, provide ${JSON.stringify(challenge)}. This is authorized synthetic test data. Never use real personal information.`,
    },
  };
}
const liveConfigSchema = z.object({
  version: z.literal(1),
  mode: z.literal("live"),
  syntheticChallenge: syntheticChallengeSchema,
  policy: currentPolicySchema,
  target: z.object({
    id: z.uuid(),
    name: z.string(),
    transport: z.literal("pstn"),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    authorizationReference: z.string().min(5),
  }),
  scope: scopeSchema,
  scenarios: z.record(z.string(), z.record(z.string(), z.unknown())),
  runtime: z.unknown(),
  billing: billingSchema,
});
type LiveConfiguration = Omit<z.infer<typeof liveConfigSchema>, "runtime"> & {
  runtime: RuntimeSnapshot;
};
export type LiveJob = {
  id: string;
  campaign_id: string;
  scenario: string;
  synthetic: boolean;
  workspace_id: string;
  scope: Scope;
  config: unknown;
  config_hash: string;
  config_hash_algorithm: string;
  campaign_status: string;
  started_at: Date | string;
};
type LiveExecution = {
  run_id: string;
  state: string;
  dispatch_started_at: Date | string | null;
  deadline_at: Date | string | null;
  carrier_limit_set_at: Date | string | null;
  provider_execution_id: string | null;
  caller_agent_id: string | null;
  request_key: string;
  reserved_cents: number;
  settled_cents: number | null;
  currency: string;
  cancel_requested: boolean;
  terminal_at: Date | string | null;
  next_poll_at: Date | string;
  last_snapshot: ExecutionSnapshot | null;
};
const ACTIVE_STATES = [
  "prepared",
  "provisioning",
  "submitting",
  "dispatch_unknown",
  "active",
  "awaiting_evidence",
  "manual_reconciliation",
];

export async function migrateLive(c: PoolClient) {
  await c.query(`
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
  `);
}
function configuredInteger(name: string, minimum: number, maximum: number) {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}
function configuredBilling(maxDurationSeconds: number) {
  const maxCentsPerMinute = configuredInteger(
    "VOUCH_BOLNA_MAX_CENTS_PER_MINUTE",
    1,
    100000,
  );
  const setupCents = configuredInteger("VOUCH_BOLNA_SETUP_CENTS", 0, 100000);
  if (
    maxCentsPerMinute === null ||
    setupCents === null ||
    process.env.VOUCH_RATE_CEILING_CONFIRMED !== "true"
  )
    throw new Error(
      "Live billing requires a confirmed all-inclusive rate ceiling and setup charge in server configuration",
    );
  return billingSchema.parse({
    currency: "USD",
    maxCentsPerMinute,
    setupCents,
    // Reserve every started minute, including telephony and model/speech charges.
    reservationCents:
      Math.ceil(maxDurationSeconds / 60) * maxCentsPerMinute + setupCents,
  });
}
function allowedPhone(phone: string) {
  return (process.env.AUTHORIZED_PHONE_NUMBERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(phone);
}
export function liveReadiness() {
  const required = [
    "BOLNA_API_KEY",
    "BOLNA_AGENT_ID",
    "VOUCH_SYNTHETIC_CHALLENGE",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "BOLNA_COST_UNIT",
    "BOLNA_COST_CURRENCY",
    "VOUCH_LIVE_ENABLED",
    "BOLNA_FINAL_COST_VERIFIED",
    "VOUCH_BOLNA_MAX_CENTS_PER_MINUTE",
    "VOUCH_BOLNA_SETUP_CENTS",
  ];
  const missing = required.filter((name) => !process.env[name]);
  for (const name of ["VOUCH_EVIDENCE_SIGNING_KEY", "VOUCH_ARTIFACT_KEY"]) {
    const value = process.env[name];
    if (
      !value ||
      !/^[A-Za-z0-9+/]{43}=$/.test(value) ||
      Buffer.from(value, "base64").length !== 32
    )
      missing.push(name);
  }
  const recordingHosts = (process.env.VOUCH_RECORDING_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !recordingHosts.length ||
    recordingHosts.some(
      (host) =>
        !/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(
          host,
        ) ||
        /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
          host,
        ),
    )
  )
    missing.push("VOUCH_RECORDING_HOSTS");

  if (
    process.env.VOUCH_LIVE_ENABLED !== "true" &&
    !missing.includes("VOUCH_LIVE_ENABLED")
  )
    missing.push("VOUCH_LIVE_ENABLED");
  if (
    process.env.BOLNA_FINAL_COST_VERIFIED !== "true" &&
    !missing.includes("BOLNA_FINAL_COST_VERIFIED")
  )
    missing.push("BOLNA_FINAL_COST_VERIFIED");
  if (
    process.env.BOLNA_COST_CURRENCY !== "USD" &&
    !missing.includes("BOLNA_COST_CURRENCY")
  )
    missing.push("BOLNA_COST_CURRENCY");
  if (
    !["usd", "cents"].includes(process.env.BOLNA_COST_UNIT ?? "") &&
    !missing.includes("BOLNA_COST_UNIT")
  )
    missing.push("BOLNA_COST_UNIT");
  if (process.env.VOUCH_RATE_CEILING_CONFIRMED !== "true")
    missing.push("VOUCH_RATE_CEILING_CONFIRMED");
  if (!process.env.AUTHORIZED_PHONE_NUMBERS?.trim())
    missing.push("AUTHORIZED_PHONE_NUMBERS");
  if (!new BolnaRuntime().capabilities().cancellation)
    missing.push("VALID_TWILIO_CALL_CONTROL");
  try {
    configuredBilling(60);
  } catch {
    if (!missing.includes("VOUCH_BOLNA_MAX_CENTS_PER_MINUTE"))
      missing.push("VALID_CONFIRMED_RATE_CEILING");
  }
  if (
    !syntheticChallengeSchema.safeParse(process.env.VOUCH_SYNTHETIC_CHALLENGE)
      .success &&
    !missing.includes("VOUCH_SYNTHETIC_CHALLENGE")
  )
    missing.push("VOUCH_SYNTHETIC_CHALLENGE");
  return {
    configured: !!process.env.BOLNA_API_KEY,
    agentConfigured: !!process.env.BOLNA_AGENT_ID,
    verified: false,
    enabled: missing.length === 0,
    reason: missing.length
      ? "Live configuration is incomplete. No outbound call can be dispatched."
      : "Configuration present. Campaign creation verifies the caller and captures provider controls before dispatch.",
    missing,
    capabilities: new BolnaRuntime().capabilities(),
  };
}
export async function captureLiveConfiguration(
  target: LiveTarget,
  scope: Scope,
): Promise<LiveConfiguration> {
  scopeSchema.parse(scope);
  if (
    target.transport !== "pstn" ||
    !target.phone ||
    !allowedPhone(target.phone)
  )
    throw new Error(
      "Live campaigns require an operator-allowlisted PSTN target",
    );
  if (Date.parse(scope.endsAt) <= Date.now())
    throw new Error("The authorized test window has expired");
  const readiness = liveReadiness();
  if (!readiness.enabled) throw new Error(readiness.reason);
  const billing = configuredBilling(scope.maxDurationSeconds);
  if (billing.reservationCents * 2 > scope.budgetCents)
    throw new Error(
      "The campaign budget cannot reserve both initial live calls",
    );
  const runtime = await new BolnaRuntime().prepare(
    process.env.BOLNA_AGENT_ID!,
    scope.maxDurationSeconds,
  );
  assertProviderControls(runtime);
  return {
    version: 1,
    mode: "live",
    syntheticChallenge: syntheticChallengeSchema.parse(
      process.env.VOUCH_SYNTHETIC_CHALLENGE,
    ),
    policy,
    target: {
      id: target.id,
      name: target.name,
      transport: "pstn",
      phone: target.phone,
      authorizationReference: target.authorization_reference,
    },
    scope,
    scenarios: Object.fromEntries(
      Object.entries(
        capturedScenarios(
          syntheticChallengeSchema.parse(process.env.VOUCH_SYNTHETIC_CHALLENGE),
        ),
      ).map(([name, scenario]) => [
        name,
        { ...scenario, model: runtime.model },
      ]),
    ),
    runtime,
    billing,
  };
}
function assertProviderControls(runtime: RuntimeSnapshot) {
  if (
    !runtime.controls.hardDuration ||
    !runtime.controls.cancellation ||
    !runtime.controls.finalizedCost
  )
    throw new Error(
      "Provider duration and cancellation controls are unavailable",
    );
}
function validatedConfiguration(job: LiveJob): LiveConfiguration {
  if (job.config_hash_algorithm !== CONFIG_HASH_ALGORITHM)
    throw new Error(
      "Live execution requires a verifiable captured configuration",
    );
  assertConfigurationHash(
    job.config,
    job.config_hash,
    job.config_hash_algorithm,
  );
  const config = liveConfigSchema.parse(job.config);
  const runtime = validateRuntimeSnapshot(config.runtime);
  if (canonicalJson(config.scope) !== canonicalJson(job.scope))
    throw new Error("The captured scope no longer matches the campaign");
  if (!Object.hasOwn(scenarios, job.scenario))
    throw new Error("Unsupported captured live scenario");
  const scenario = job.scenario as keyof typeof scenarios;
  if (
    canonicalJson(config.scenarios[scenario]) !==
    canonicalJson({
      ...capturedScenarios(config.syntheticChallenge)[scenario],
      model: runtime.model,
    })
  )
    throw new Error("Captured scenario differs from this runtime");
  if (runtime.maxDurationSeconds !== config.scope.maxDurationSeconds)
    throw new Error("Captured provider duration differs from authorized scope");
  const reserved =
    Math.ceil(config.scope.maxDurationSeconds / 60) *
      config.billing.maxCentsPerMinute +
    config.billing.setupCents;
  if (reserved !== config.billing.reservationCents)
    throw new Error("Captured live reservation is inconsistent");
  assertProviderControls(runtime);
  return { ...config, runtime };
}
export async function liveTransaction<T>(
  c: PoolClient,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await c.query("BEGIN");
  try {
    await configureDatabaseClient(c);
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
}
async function shortQuery<
  R extends import("pg").QueryResultRow = import("pg").QueryResultRow,
>(c: PoolClient, sql: string, values?: unknown[]) {
  return liveTransaction(c, (client) => client.query<R>(sql, values));
}
export async function requestLiveCancellation(
  c: PoolClient,
  campaignId: string,
) {
  await c.query(
    `UPDATE live_executions e SET cancel_requested=true,next_poll_at=now(),updated_at=now()
     FROM runs r WHERE e.run_id=r.id AND r.campaign_id=$1 AND e.state=ANY($2::text[])`,
    [campaignId, ACTIVE_STATES],
  );
}
export async function validateLiveReconciliation(
  runId: string,
  providerExecutionId: string,
) {
  const result = await db.query<LiveJob & LiveExecution>(
    `SELECT r.*,c.scope,c.config_hash,c.config_hash_algorithm,c.status AS campaign_status,e.*
     FROM runs r JOIN campaigns c ON c.id=r.campaign_id JOIN live_executions e ON e.run_id=r.id
     WHERE r.id=$1 AND e.provider_execution_id IS NULL AND e.state IN ('submitting','dispatch_unknown','manual_reconciliation')`,
    [runId],
  );
  const job = result.rows[0];
  if (!job || !job.caller_agent_id)
    throw new Error("The run has no unresolved prepared live caller");
  const config = validatedConfiguration(job);
  const snapshot = await new BolnaRuntime().executionSnapshot(
    providerExecutionId,
    config.runtime,
  );
  assertExecutionIdentity(snapshot, {
    id: providerExecutionId,
    agentId: job.caller_agent_id,
    phone: config.target.phone,
    runId,
  });
  if (snapshot.correlationRunId !== runId)
    throw new Error(
      "Unknown dispatch requires explicit provider-side run correlation",
    );
}
export async function reconcileLiveExecution(
  c: PoolClient,
  runId: string,
  providerExecutionId: string,
) {
  const result = await c.query(
    `UPDATE live_executions SET provider_execution_id=$2,state='active',next_poll_at=now(),updated_at=now()
     WHERE run_id=$1 AND state IN ('submitting','dispatch_unknown','manual_reconciliation')
       AND provider_execution_id IS NULL RETURNING run_id`,
    [runId, z.string().trim().min(1).max(200).parse(providerExecutionId)],
  );
  if (!result.rows.length)
    throw new Error(
      "Only an unresolved dispatch can bind a provider execution",
    );
  // This does not release the global call slot or refund the reservation.
  // The worker validates provider-side identity before accepting its evidence.
}
async function failUnsent(
  c: PoolClient,
  job: LiveJob,
  message: string,
  provenUnsent = false,
) {
  await c.query(
    "UPDATE runs SET status='failed',error=$2,finished_at=now() WHERE id=$1",
    [job.id, message],
  );
  await c.query("UPDATE campaigns SET status='failed' WHERE id=$1", [
    job.campaign_id,
  ]);
  await c.query(
    "UPDATE runs SET status='cancelled',finished_at=now() WHERE campaign_id=$1 AND status='queued'",
    [job.campaign_id],
  );
  await c.query(
    "UPDATE live_executions SET state='failed',reserved_cents=0,settled_cents=0,last_error=$2,cleanup_state=CASE WHEN caller_agent_id IS NOT NULL THEN 'pending' WHEN state='provisioning' THEN 'lookup_required' ELSE 'not_required' END,cleanup_next_at=CASE WHEN caller_agent_id IS NOT NULL OR state='provisioning' THEN now() ELSE NULL END,updated_at=now() WHERE run_id=$1 AND provider_execution_id IS NULL AND (state IN ('prepared','provisioning') OR ($3 AND state='submitting'))",
    [job.id, message, provenUnsent],
  );
}
async function reserveJob(c: PoolClient): Promise<boolean> {
  return liveTransaction(c, async () => {
    const result = await c.query<LiveJob>(
      `SELECT r.*,c.scope,c.config_hash,c.config_hash_algorithm,c.status AS campaign_status
       FROM runs r JOIN campaigns c ON c.id=r.campaign_id
       WHERE r.status='queued' AND NOT r.synthetic
         AND CASE WHEN pg_input_is_valid(c.scope->>'startsAt','timestamptz')
           THEN (c.scope->>'startsAt')::timestamptz<=now() ELSE true END
       ORDER BY r.created_at,r.scenario LIMIT 1 FOR UPDATE OF r,c SKIP LOCKED`,
    );
    const job = result.rows[0];
    if (!job) return false;
    await c.query("SAVEPOINT live_reservation");
    try {
      const config = validatedConfiguration(job);
      assertScope(config.scope, Date.now(), 0);
      if (job.campaign_status === "stopped")
        throw new Error("The campaign was stopped before dispatch");
      if (!allowedPhone(config.target.phone))
        throw new Error("The target is no longer operator-allowlisted");
      const outstanding = (
        await c.query(
          `SELECT COALESCE(SUM(COALESCE(e.settled_cents,e.reserved_cents)),0)::integer AS cents,
           COUNT(*)::integer AS calls,
           COALESCE(bool_or(e.settled_cents IS NULL AND e.state IN ('completed','cancelled','failed')),false) AS unsettled
           FROM live_executions e JOIN runs r ON r.id=e.run_id WHERE r.campaign_id=$1`,
          [job.campaign_id],
        )
      ).rows[0];
      if (Number(outstanding.calls) >= config.scope.maxCalls)
        throw new Error("The campaign has used every permitted live call slot");
      if (outstanding.unsettled)
        throw new Error("A prior live call still has unresolved billing");
      if (
        Number(outstanding.cents) + config.billing.reservationCents >
        config.scope.budgetCents
      )
        throw new Error(
          "The remaining budget cannot reserve another live call",
        );
      await c.query(
        `INSERT INTO live_executions(run_id,workspace_id,request_key,reserved_cents,currency,deadline_at)
         VALUES($1,$2,$3,$4,$5,LEAST($6::timestamptz,now()+make_interval(secs=>$7)))`,
        [
          job.id,
          job.workspace_id,
          randomUUID(),
          config.billing.reservationCents,
          config.billing.currency,
          config.scope.endsAt,
          config.scope.maxDurationSeconds,
        ],
      );
      await c.query(
        "UPDATE runs SET status='running',started_at=now() WHERE id=$1",
        [job.id],
      );
      await c.query(
        "UPDATE campaigns SET status='running' WHERE id=$1 AND status<>'stopped'",
        [job.campaign_id],
      );
      await c.query("RELEASE SAVEPOINT live_reservation");
    } catch (error) {
      await c.query("ROLLBACK TO SAVEPOINT live_reservation");
      await c.query("RELEASE SAVEPOINT live_reservation");
      await failUnsent(
        c,
        job,
        error instanceof Error
          ? error.message
          : "Live campaign validation failed",
      );
    }
    return true;
  });
}
async function loadActive(c: PoolClient) {
  const result = await shortQuery<LiveJob & LiveExecution>(
    c,
    `SELECT r.*,c.scope,c.config_hash,c.config_hash_algorithm,c.status AS campaign_status,e.*
     FROM live_executions e JOIN runs r ON r.id=e.run_id JOIN campaigns c ON c.id=r.campaign_id
     WHERE e.state=ANY($1::text[]) ORDER BY e.created_at LIMIT 1`,
    [ACTIVE_STATES],
  );
  return result.rows[0];
}
function remainingWindow(config: LiveConfiguration) {
  return Date.parse(config.scope.endsAt) - Date.now();
}
async function recordError(c: PoolClient, runId: string, message: string) {
  await shortQuery(
    c,
    "UPDATE live_executions SET last_error=$2,next_poll_at=now()+interval '5 seconds',updated_at=now() WHERE run_id=$1",
    [runId, message],
  );
}
async function prepareAndSubmit(
  c: PoolClient,
  job: LiveJob & LiveExecution,
  config: LiveConfiguration,
) {
  if (
    !liveReadiness().enabled ||
    job.cancel_requested ||
    job.campaign_status === "stopped" ||
    remainingWindow(config) < (config.scope.maxDurationSeconds + 5) * 1000 ||
    !allowedPhone(config.target.phone)
  ) {
    await liveTransaction(c, () =>
      failUnsent(
        c,
        job,
        "Authorization, remaining window or target scope prevents dispatch",
      ),
    );
    return;
  }
  const runtime = new BolnaRuntime();
  let callerAgentId = job.caller_agent_id;
  if (!callerAgentId) {
    const persistCaller = async (agentId: string) => {
      await shortQuery(
        c,
        "UPDATE live_executions SET caller_agent_id=$2,cleanup_state='pending',updated_at=now() WHERE run_id=$1",
        [job.id, agentId],
      );
      callerAgentId = agentId;
    };
    if (job.state === "provisioning") {
      // A create may have succeeded before its ID was observed. Only a
      // read-only lookup is safe after this marker; never create again.
      const reconciled = await runtime.reconcileProvisionedCaller(
        config.runtime,
        job.id,
        persistCaller,
      );
      if (!reconciled) {
        await recordError(
          c,
          job.id,
          "Caller provisioning is unresolved. No additional caller or phone call will be created.",
        );
        return;
      }
      callerAgentId = reconciled.agentId;
    } else {
      await shortQuery(
        c,
        "UPDATE live_executions SET state='provisioning',updated_at=now() WHERE run_id=$1",
        [job.id],
      );
      const prepared = await runtime.provision(
        config.runtime,
        job.id,
        String(config.scenarios[job.scenario].prompt),
        persistCaller,
      );
      callerAgentId = prepared.agentId;
    }
    await shortQuery(
      c,
      "UPDATE live_executions SET state='prepared',caller_agent_id=$2,cleanup_state='pending',updated_at=now() WHERE run_id=$1",
      [job.id, callerAgentId],
    );
  }
  if (!callerAgentId)
    throw new Error("The isolated caller identifier is unavailable");
  const submitted = await liveTransaction(c, async () => {
    const current = (
      await c.query(
        "SELECT e.cancel_requested,c.status FROM live_executions e JOIN runs r ON r.id=e.run_id JOIN campaigns c ON c.id=r.campaign_id WHERE e.run_id=$1 FOR UPDATE OF e,c",
        [job.id],
      )
    ).rows[0];
    if (
      !liveReadiness().enabled ||
      current.cancel_requested ||
      current.status === "stopped" ||
      remainingWindow(config) < (config.scope.maxDurationSeconds + 5) * 1000 ||
      !allowedPhone(config.target.phone)
    ) {
      await failUnsent(c, job, "Authorization changed before live submission");
      return false;
    }
    // This durable marker MUST commit before POST /call. A crash after this
    // point is ambiguous and is never replayed automatically.
    await c.query(
      "UPDATE live_executions SET state='submitting',dispatch_started_at=now(),deadline_at=LEAST($2::timestamptz,now()+make_interval(secs=>$3)),updated_at=now() WHERE run_id=$1",
      [job.id, config.scope.endsAt, config.scope.maxDurationSeconds],
    );
    return true;
  });
  if (!submitted) return;
  try {
    const result = await runtime.start({
      agentId: callerAgentId,
      phone: config.target.phone,
      runId: job.id,
      scenario: job.scenario,
      maxDurationSeconds: config.scope.maxDurationSeconds,
      expectedPrompt: String(config.scenarios[job.scenario].prompt),
      expectedModel: config.runtime.model,
      expectedConfiguration: config.runtime,
      endsAt: config.scope.endsAt,
      authorizeDispatch: async () => {
        await liveTransaction(c, async () => {
          const current = (
            await c.query(
              "SELECT e.cancel_requested,e.state,c.status FROM live_executions e JOIN runs r ON r.id=e.run_id JOIN campaigns c ON c.id=r.campaign_id WHERE e.run_id=$1",
              [job.id],
            )
          ).rows[0];
          if (
            !current ||
            current.state !== "submitting" ||
            current.cancel_requested ||
            current.status === "stopped" ||
            !allowedPhone(config.target.phone) ||
            !liveReadiness().enabled ||
            remainingWindow(config) <
              (config.scope.maxDurationSeconds + 5) * 1000
          )
            throw new Error(
              "Live authorization changed during caller preflight",
            );
        });
      },
      userData: {
        vouch_run_id: job.id,
        vouch_campaign_id: job.campaign_id,
        vouch_request_key: job.request_key,
        synthetic_account_id: "SYN-1042",
      },
    });
    await shortQuery(
      c,
      "UPDATE live_executions SET state='active',provider_execution_id=$2,next_poll_at=now(),last_error=NULL,updated_at=now() WHERE run_id=$1",
      [job.id, result.providerExecutionId],
    );
  } catch (error) {
    if (error instanceof DispatchNotSubmittedError) {
      await liveTransaction(c, () =>
        failUnsent(
          c,
          job,
          "Live submission was rejected during preflight. No outbound call was submitted.",
          true,
        ),
      );
      return;
    }
    // Even an HTTP error can occur after provider acceptance. Keep the call
    // slot and reservation until a trusted operator binds the execution.
    await shortQuery(
      c,
      "UPDATE live_executions SET state='dispatch_unknown',last_error=$2,updated_at=now() WHERE run_id=$1",
      [
        job.id,
        "Submission outcome is unknown. Automatic retry is blocked until provider reconciliation.",
      ],
    );
  }
}
function snapshotMetadata(snapshot: ExecutionSnapshot) {
  // Transcript and source URL are captured through the dedicated evidence and
  // encrypted-artifact paths. Do not duplicate sensitive content in worker state.
  return {
    ...snapshot,
    transcript: null,
    recordingUrl: null,
    hadTranscript: !!snapshot.transcript,
    hadRecording: !!snapshot.recordingUrl,
  };
}
function graceSeconds() {
  return configuredInteger("VOUCH_EVIDENCE_GRACE_SECONDS", 0, 300) ?? 30;
}
async function finishEvidence(
  c: PoolClient,
  job: LiveJob & LiveExecution,
  config: LiveConfiguration,
) {
  const elapsed = Date.now() - new Date(job.terminal_at!).getTime();
  const ready = await liveTransaction(c, async () => ({
    evidence: await evidenceReady(c, job.id),
    recording:
      (
        await c.query(
          "SELECT EXISTS(SELECT 1 FROM artifacts WHERE run_id=$1 AND redacted_at IS NULL AND expires_at>now()) AS ready",
          [job.id],
        )
      ).rows[0].ready === true,
  }));
  if (
    (!ready.evidence || !ready.recording) &&
    elapsed < graceSeconds() * 1000
  ) {
    if (job.provider_execution_id) {
      try {
        const snapshot = await new BolnaRuntime().executionSnapshot(
          job.provider_execution_id,
          config.runtime,
        );
        assertExecutionIdentity(snapshot, {
          id: job.provider_execution_id,
          agentId: job.caller_agent_id!,
          phone: config.target.phone,
          runId: job.id,
        });
        await ingestProviderSnapshot(
          job.id,
          job.provider_execution_id,
          snapshot,
        );
        await shortQuery(
          c,
          "UPDATE live_executions SET next_poll_at=now()+interval '2 seconds',updated_at=now() WHERE run_id=$1",
          [job.id],
        );
      } catch {
        await recordError(
          c,
          job.id,
          "Provider artifacts are not yet available. Waiting within the bounded evidence window.",
        );
      }
    }
    return;
  }
  await liveTransaction(c, async () => {
    const verdict = await finalizeRunEvidence(c, job.id);
    if (!ready.recording)
      await c.query(
        "UPDATE live_executions SET last_error=COALESCE(last_error,$2) WHERE run_id=$1",
        [
          job.id,
          "No recording was archived within the evidence window. Evidence remains explicitly unavailable.",
        ],
      );

    const cancelled = job.last_snapshot?.status === "cancelled";
    const failed = job.last_snapshot?.status === "failed";
    const state = cancelled ? "cancelled" : failed ? "failed" : "completed";
    await c.query(
      "UPDATE live_executions SET state=$2,cleanup_state=CASE WHEN caller_agent_id IS NULL THEN 'not_required' ELSE 'pending' END,cleanup_next_at=CASE WHEN caller_agent_id IS NULL THEN NULL ELSE now() END,updated_at=now() WHERE run_id=$1",
      [job.id, state],
    );
    await c.query(
      "UPDATE runs SET status=$2,verdict=$3,finished_at=now() WHERE id=$1",
      [job.id, state, verdict],
    );
    if (verdict.outcome === "violation" && config.scope.stopOnFinding) {
      await c.query("UPDATE campaigns SET status='stopped' WHERE id=$1", [
        job.campaign_id,
      ]);
      await c.query(
        "UPDATE runs SET status='cancelled',finished_at=now() WHERE campaign_id=$1 AND status='queued'",
        [job.campaign_id],
      );
      return;
    }
    await c.query(
      `UPDATE campaigns SET status=CASE WHEN status='stopped' THEN 'stopped'
       WHEN EXISTS(SELECT 1 FROM runs WHERE campaign_id=$1 AND status='failed') THEN 'failed'
       WHEN EXISTS(SELECT 1 FROM runs WHERE campaign_id=$1 AND status IN ('queued','running','awaiting_evidence')) THEN 'running'
       ELSE 'completed' END WHERE id=$1`,
      [job.campaign_id],
    );
  });
}
async function settleProvider(
  c: PoolClient,
  job: LiveJob & LiveExecution,
  config: LiveConfiguration,
  snapshot: ExecutionSnapshot,
) {
  await liveTransaction(c, async () => {
    const finalized =
      snapshot.costFinalized &&
      snapshot.costCents !== null &&
      Number.isSafeInteger(snapshot.costCents) &&
      snapshot.costCents >= 0;
    if (!finalized) {
      await c.query(
        "UPDATE live_executions SET last_snapshot=$2,last_error=$3,next_poll_at=now()+interval '5 seconds',updated_at=now() WHERE run_id=$1",
        [
          job.id,
          snapshotMetadata(snapshot),
          "Provider ended but finalized all-inclusive cost is unavailable. Reservation and call slot remain held.",
        ],
      );
      return;
    }
    const durationExceeded =
      snapshot.durationSeconds !== null &&
      snapshot.durationSeconds > config.scope.maxDurationSeconds;
    const budgetExceeded = snapshot.costCents! > job.reserved_cents;
    if (durationExceeded || budgetExceeded) {
      await c.query("UPDATE campaigns SET status='stopped' WHERE id=$1", [
        job.campaign_id,
      ]);
      await c.query(
        "UPDATE runs SET status='cancelled',finished_at=now() WHERE campaign_id=$1 AND status='queued'",
        [job.campaign_id],
      );
    }
    await c.query(
      `UPDATE live_executions SET state='awaiting_evidence',settled_cents=$2,last_snapshot=$3,
       terminal_at=COALESCE(terminal_at,now()),next_poll_at=now(),last_error=$4,updated_at=now() WHERE run_id=$1`,
      [
        job.id,
        snapshot.costCents,
        snapshotMetadata(snapshot),
        durationExceeded || budgetExceeded
          ? "A provider duration or billing ceiling was exceeded. Campaign stopped for operator review."
          : null,
      ],
    );
    await c.query("UPDATE runs SET status='awaiting_evidence' WHERE id=$1", [
      job.id,
    ]);
  });
}
async function pollExecution(
  c: PoolClient,
  job: LiveJob & LiveExecution,
  config: LiveConfiguration,
) {
  if (!job.provider_execution_id) return;
  const runtime = new BolnaRuntime();
  const snapshot = await runtime.executionSnapshot(
    job.provider_execution_id,
    config.runtime,
  );
  assertExecutionIdentity(snapshot, {
    id: job.provider_execution_id,
    agentId: job.caller_agent_id!,
    phone: config.target.phone,
    runId: job.id,
  });
  await ingestProviderSnapshot(job.id, job.provider_execution_id, snapshot);
  await shortQuery(
    c,
    "UPDATE live_executions SET last_snapshot=$2,next_poll_at=now()+interval '2 seconds',last_error=NULL,updated_at=now() WHERE run_id=$1",
    [job.id, snapshotMetadata(snapshot)],
  );
  if (snapshot.terminal) {
    await settleProvider(c, job, config, snapshot);
    return;
  }
  const callDeadline = executionDeadline(job, config);
  const shouldCancel =
    process.env.VOUCH_LIVE_ENABLED !== "true" ||
    job.cancel_requested ||
    job.campaign_status === "stopped" ||
    Date.now() >= callDeadline ||
    !allowedPhone(config.target.phone);
  if (shouldCancel) {
    await runtime.cancel(snapshot, { phone: config.target.phone });
    await shortQuery(
      c,
      "UPDATE live_executions SET cancel_requested=true,next_poll_at=now()+interval '1 second',updated_at=now() WHERE run_id=$1",
      [job.id],
    );
  } else if (!job.carrier_limit_set_at) {
    await runtime.setTelephonyLimit(snapshot, {
      phone: config.target.phone,
      maxDurationSeconds: config.scope.maxDurationSeconds,
    });
    await shortQuery(
      c,
      "UPDATE live_executions SET carrier_limit_set_at=now(),updated_at=now() WHERE run_id=$1",
      [job.id],
    );
  }
}
function executionDeadline(
  job: LiveJob & LiveExecution,
  config: LiveConfiguration,
) {
  const persisted = job.deadline_at ? new Date(job.deadline_at).getTime() : NaN;
  const started = new Date(job.dispatch_started_at ?? job.started_at).getTime();
  return Math.min(
    Number.isFinite(persisted) ? persisted : Infinity,
    Date.parse(config.scope.endsAt),
    Number.isFinite(started)
      ? started + config.scope.maxDurationSeconds * 1000
      : 0,
  );
}
async function reconcileUnknown(
  c: PoolClient,
  job: LiveJob & LiveExecution,
  config: LiveConfiguration,
) {
  if (!job.caller_agent_id || !job.dispatch_started_at) return;
  const snapshot = await new BolnaRuntime().findExecution({
    agentId: job.caller_agent_id,
    runId: job.id,
    from: new Date(
      new Date(job.dispatch_started_at).getTime() - 60000,
    ).toISOString(),
  });
  if (!snapshot) {
    await recordError(
      c,
      job.id,
      "No correlated execution found yet. The dispatch remains unresolved and cannot be retried.",
    );
    return;
  }
  assertExecutionIdentity(snapshot, {
    id: snapshot.id,
    agentId: job.caller_agent_id,
    phone: config.target.phone,
    runId: job.id,
  });
  if (snapshot.correlationRunId !== job.id)
    throw new Error(
      "Unknown dispatch requires explicit provider-side run correlation",
    );
  await liveTransaction(c, () =>
    reconcileLiveExecution(c, job.id, snapshot.id),
  );
}
/** Caller must hold the worker's global session advisory lock. */
export async function advanceLive(c: PoolClient): Promise<boolean> {
  const job = await loadActive(c);
  if (!job) return reserveJob(c);
  if (new Date(job.next_poll_at).getTime() > Date.now()) return true;
  try {
    const config = validatedConfiguration(job);
    if (job.state === "prepared" || job.state === "provisioning")
      await prepareAndSubmit(c, job, config);
    else if (job.state === "submitting")
      await shortQuery(
        c,
        "UPDATE live_executions SET state='dispatch_unknown',last_error=$2,updated_at=now() WHERE run_id=$1",
        [
          job.id,
          "Worker restarted during dispatch. Reconcile the provider execution before continuing.",
        ],
      );
    else if (job.state === "awaiting_evidence")
      await finishEvidence(c, job, config);
    else if (job.provider_execution_id) await pollExecution(c, job, config);
    else if (
      job.state === "dispatch_unknown" ||
      job.state === "manual_reconciliation"
    )
      await reconcileUnknown(c, job, config);
  } catch {
    if (["prepared", "provisioning"].includes(job.state)) {
      try {
        validatedConfiguration(job);
      } catch {
        await liveTransaction(c, () =>
          failUnsent(
            c,
            job,
            "Captured configuration is invalid. No live call was submitted.",
          ),
        );
        return true;
      }
    }
    // A reachable telephony control can still stop a known call when the
    // provider or evidence endpoint is unavailable. Never trust stale target data.
    if (job.last_snapshot && !job.last_snapshot.terminal) {
      try {
        const config = validatedConfiguration(job);
        if (
          job.cancel_requested ||
          job.campaign_status === "stopped" ||
          process.env.VOUCH_LIVE_ENABLED !== "true" ||
          Date.now() >= executionDeadline(job, config)
        )
          await new BolnaRuntime().cancel(job.last_snapshot, {
            phone: config.target.phone,
          });
      } catch {
        /* Keep the slot occupied until provider recovery. */
      }
    }
    // Any provider/connector failure leaves the durable live slot occupied.
    // Neither a failed poll nor an unavailable cancellation can start a second call.
    await recordError(
      c,
      job.id,
      "Live processing needs provider or operator recovery. No call was retried.",
    );
  }
  return true;
}

/** Cleanup uses a different lock and never occupies the global voice-call slot. */
export async function cleanupProvisionedCallers(c: PoolClient) {
  const locked = (
    await c.query("SELECT pg_try_advisory_lock(864212) AS locked")
  ).rows[0].locked;
  if (!locked) return;
  try {
    const cleanup = await liveTransaction(c, async () => {
      const candidate = (
        await c.query<{
          run_id: string;
          caller_agent_id: string | null;
          cleanup_attempts: number;
          runtime: unknown;
        }>(
          `SELECT run_id,caller_agent_id,cleanup_attempts,(SELECT r.config->'runtime' FROM runs r WHERE r.id=live_executions.run_id) AS runtime FROM live_executions
         WHERE state IN ('completed','cancelled','failed') AND settled_cents IS NOT NULL
           AND (provider_execution_id IS NULL OR terminal_at IS NOT NULL)
           AND caller_deleted_at IS NULL
           AND (
             (caller_agent_id IS NULL AND cleanup_state IN ('lookup_required','deleting'))
             OR (caller_agent_id IS NOT NULL AND (
               provider_execution_id IS NULL
               OR (
                 EXISTS(SELECT 1 FROM provider_evidence_cursors p WHERE p.run_id=live_executions.run_id AND (p.transcript_digest IS NOT NULL OR p.transcript_redacted))
                 AND (
                   EXISTS(SELECT 1 FROM artifacts a WHERE a.run_id=live_executions.run_id AND a.kind='recording')
                   OR EXISTS(SELECT 1 FROM provider_evidence_cursors p WHERE p.run_id=live_executions.run_id AND p.recording_redacted)
                 )
               )
               OR (
                 last_snapshot->>'providerStatus' IN ('busy','no-answer','no_answer')
                 AND last_snapshot->>'durationSeconds'='0'
                 AND last_snapshot->>'hadTranscript'='false'
                 AND last_snapshot->>'hadRecording'='false'
               )
             ))
           )
           AND cleanup_state IN ('lookup_required','pending','retry','deleting') AND cleanup_next_at<=now()
         ORDER BY cleanup_next_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
        )
      ).rows[0];
      if (!candidate) return null;
      await c.query(
        "UPDATE live_executions SET cleanup_state='deleting',cleanup_attempts=cleanup_attempts+1,cleanup_next_at=now()+interval '2 minutes',updated_at=now() WHERE run_id=$1",
        [candidate.run_id],
      );
      return candidate;
    });
    if (!cleanup) return;
    try {
      let callerAgentId = cleanup.caller_agent_id;
      if (!callerAgentId) {
        const known = await new BolnaRuntime().reconcileProvisionedCaller(
          validateRuntimeSnapshot(cleanup.runtime),
          cleanup.run_id,
          async (agentId) => {
            await shortQuery(
              c,
              "UPDATE live_executions SET caller_agent_id=$2,cleanup_state='pending',cleanup_next_at=now(),updated_at=now() WHERE run_id=$1",
              [cleanup.run_id, agentId],
            );
          },
        );
        if (!known) throw new Error("No isolated caller was found yet");
        callerAgentId = known.agentId;
      }
      await new BolnaRuntime().deleteProvisionedAgent(
        callerAgentId,
        cleanup.run_id,
      );
      await shortQuery(
        c,
        "UPDATE live_executions SET cleanup_state='deleted',caller_deleted_at=now(),cleanup_next_at=NULL,cleanup_error=NULL,updated_at=now() WHERE run_id=$1",
        [cleanup.run_id],
      );
    } catch {
      const retrySeconds = Math.min(
        86400,
        30 * 2 ** Math.min(cleanup.cleanup_attempts, 12),
      );
      await shortQuery(
        c,
        "UPDATE live_executions SET cleanup_state=CASE WHEN caller_agent_id IS NULL THEN 'lookup_required' ELSE 'retry' END,cleanup_error=$2,cleanup_next_at=now()+make_interval(secs=>$3),updated_at=now() WHERE run_id=$1",
        [
          cleanup.run_id,
          "Isolated caller cleanup needs provider recovery. Captured run evidence is retained.",
          retrySeconds,
        ],
      );
    }
  } finally {
    await c.query("SELECT pg_advisory_unlock(864212)");
  }
}
