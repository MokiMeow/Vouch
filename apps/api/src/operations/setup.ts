import type {
  SetupCheck,
  SetupStatus,
} from "../../../../packages/core/src/setup";
import {
  isAuthorizedPhoneListConfigured,
  isConfiguredSetting,
} from "../../../../packages/core/src/setup";
import {
  databaseConnectionConfig,
  db,
  withSystemDatabase,
} from "../database/client";
import { liveReadiness } from "../execution/live";
import { readWorkerHealth, type WorkerHealth } from "./health";

export type DatabaseSetupProbe = {
  state: "ready" | "action_required" | "unavailable";
  detail: string;
  worker: WorkerHealth;
  fields: string[];
  command?: string;
};
type Readiness = { enabled: boolean; missing: string[] };
type SetupDependencies = {
  probeDatabase?: () => Promise<DatabaseSetupProbe>;
  readiness?: () => Readiness;
  authorization?: () => boolean;
  now?: () => Date;
  timeoutMs?: number;
};
const notCheckedWorker: WorkerHealth = {
  state: "not_checked",
  detail: "Configure and connect the database before checking the worker",
};
const requiredTables = [
  "targets",
  "campaigns",
  "runs",
  "events",
  "reviews",
  "live_executions",
  "evidence_streams",
  "evidence_receipts",
  "provider_evidence_cursors",
  "artifacts",
  "vouch_users",
  "vouch_sessions",
  "vouch_workspaces",
  "vouch_memberships",
  "service_heartbeats",
  "vouch_schema_migrations",
];
function databaseUnavailable(detail: string): DatabaseSetupProbe {
  return {
    state: "unavailable",
    detail,
    fields: ["DATABASE_URL"],
    worker: notCheckedWorker,
  };
}
function schemaRequired(): DatabaseSetupProbe {
  return {
    state: "action_required",
    detail:
      "The database is reachable but the required schema is not installed. Apply the pending migrations",
    fields: ["DATABASE_MIGRATION_URL"],
    command: "pnpm db:migrate",
    worker: notCheckedWorker,
  };
}
async function probeConfiguredDatabase(): Promise<DatabaseSetupProbe> {
  if (!isConfiguredSetting(process.env.DATABASE_URL))
    return {
      state: "action_required",
      detail:
        "Add the actual Supabase PostgreSQL connection settings. Placeholders cannot connect to a database",
      fields: ["DATABASE_URL"],
      worker: notCheckedWorker,
    };
  try {
    databaseConnectionConfig(process.env.DATABASE_URL);
  } catch {
    return {
      state: "action_required",
      detail:
        "Correct the PostgreSQL connection settings. Use a direct or session-pooler connection with verified TLS",
      fields: ["DATABASE_URL", "DATABASE_SSL_CA_FILE"],
      worker: notCheckedWorker,
    };
  }
  try {
    const tables = (
      await withSystemDatabase(() =>
        db.query<{ ready: boolean }>(
          "SELECT bool_and(to_regclass('public.'||name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS name",
          [requiredTables],
        ),
      )
    ).rows[0];
    if (tables?.ready !== true) return schemaRequired();
    // The migration ledger is intentionally unavailable to the workspace role.
    // This read exposes only whether the required schema version is installed.
    const version = (
      await withSystemDatabase(() =>
        db.query<{ version: number | null }>(
          "SELECT max(version)::integer AS version FROM vouch_schema_migrations",
        ),
      )
    ).rows[0]?.version;
    if (version === null || version === undefined || version < 6)
      return schemaRequired();
    const worker = await readWorkerHealth();
    return {
      state: "ready",
      detail:
        "The database is reachable and the required application schema is installed",
      fields: [],
      worker,
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (["42P01", "42703", "42704"].includes(code)) return schemaRequired();
    if (["28P01", "28000", "3D000"].includes(code))
      return {
        state: "action_required",
        detail:
          "The configured database credentials or database name were rejected. Update the private connection settings",
        fields: ["DATABASE_URL"],
        worker: notCheckedWorker,
      };
    if (/CERT|TLS|SSL/.test(code))
      return {
        state: "action_required",
        detail:
          "Database TLS verification failed. Configure the trusted project CA without disabling certificate verification",
        fields: ["DATABASE_SSL_CA_FILE"],
        worker: notCheckedWorker,
      };
    if (code === "42501")
      return {
        state: "action_required",
        detail:
          "The database is reachable but the application role lacks required access. Apply migrations using the authorized schema owner",
        fields: ["DATABASE_MIGRATION_URL", "DATABASE_RUNTIME_ROLE"],
        command: "pnpm db:migrate",
        worker: notCheckedWorker,
      };
    return databaseUnavailable(
      "The database could not be reached. Check the configured credentials, TLS trust and database network access",
    );
  }
}
// Coalesce probes so a stalled database cannot consume one pool connection for
// every refresh. A timed-out request never turns into a ready result later.
let pendingProbe: Promise<DatabaseSetupProbe> | null = null;
function sharedDatabaseProbe() {
  if (!pendingProbe)
    pendingProbe = probeConfiguredDatabase().finally(() => {
      pendingProbe = null;
    });
  return pendingProbe;
}
async function boundedProbe(
  probe: () => Promise<DatabaseSetupProbe>,
  timeoutMs: number,
): Promise<DatabaseSetupProbe> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(probe),
      new Promise<DatabaseSetupProbe>((resolve) => {
        timer = setTimeout(
          () =>
            resolve(
              databaseUnavailable(
                "The database check timed out. Verify database reachability and try again",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } catch {
    return databaseUnavailable(
      "Database status is unavailable. Check server configuration and try again",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Group = {
  id:
    | "caller"
    | "carrier"
    | "authorization"
    | "evidence"
    | "billing"
    | "dispatch";
  title: string;
  fields: string[];
  aliases?: Record<string, string[]>;
  docsPath: string;
  ready: string;
  blocked: string;
};
const groups: Group[] = [
  {
    id: "caller",
    title: "Caller configuration",
    fields: ["BOLNA_API_KEY", "BOLNA_AGENT_ID", "VOUCH_SYNTHETIC_CHALLENGE"],
    docsPath: "/docs/integrations",
    ready:
      "Caller settings are present. Provider authentication has not been checked",
    blocked:
      "Configure the Bolna caller and the authorized backend challenge before preparing a campaign",
  },
  {
    id: "carrier",
    title: "Carrier controls",
    fields: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    aliases: {
      VALID_TWILIO_CALL_CONTROL: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    },
    docsPath: "/docs/integrations",
    ready:
      "Carrier control settings are present. Call ownership and cancellation still require provider verification",
    blocked:
      "Configure supported Twilio credentials for hard duration and cancellation controls",
  },
  {
    id: "authorization",
    title: "Target authorization",
    fields: ["AUTHORIZED_PHONE_NUMBERS"],
    docsPath: "/docs/first-campaign#choose-a-target",
    ready:
      "An operator-managed phone allowlist is configured. Register only targets you are authorized to test",
    blocked:
      "Configure at least one authorized E.164 target number in the server allowlist",
  },
  {
    id: "evidence",
    title: "Evidence and recordings",
    fields: [
      "VOUCH_EVIDENCE_SIGNING_KEY",
      "VOUCH_ARTIFACT_KEY",
      "VOUCH_RECORDING_HOSTS",
    ],
    docsPath: "/docs/evidence",
    ready:
      "Signing, encryption and recording-host settings are present. Customer connector delivery is not verified",
    blocked:
      "Configure independent evidence keys and the actual approved recording hosts",
  },
  {
    id: "billing",
    title: "Billing limits",
    fields: [
      "BOLNA_COST_UNIT",
      "BOLNA_COST_CURRENCY",
      "BOLNA_FINAL_COST_VERIFIED",
      "VOUCH_BOLNA_MAX_CENTS_PER_MINUTE",
      "VOUCH_BOLNA_SETUP_CENTS",
      "VOUCH_RATE_CEILING_CONFIRMED",
    ],
    aliases: {
      VALID_CONFIRMED_RATE_CEILING: [
        "VOUCH_BOLNA_MAX_CENTS_PER_MINUTE",
        "VOUCH_BOLNA_SETUP_CENTS",
        "VOUCH_RATE_CEILING_CONFIRMED",
      ],
    },
    docsPath: "/docs/integrations",
    ready:
      "Billing settings are present. The operator must verify actual all-component pricing and finalized cost semantics",
    blocked:
      "Set and confirm the actual all-component rate ceiling, setup charge and provider cost format",
  },
  {
    id: "dispatch",
    title: "Live dispatch",
    fields: ["VOUCH_LIVE_ENABLED"],
    docsPath: "/docs/integrations",
    ready:
      "The live dispatch switch is enabled. No connection check or outbound call was performed by this setup check",
    blocked:
      "Enable live dispatch only after confirming authorization, resource controls and actual account settings",
  },
];
function groupedChecks(
  readiness: Readiness,
  authorization: boolean,
): SetupCheck[] {
  const missing = new Set(readiness.missing);
  if (!authorization) missing.add("AUTHORIZED_PHONE_NUMBERS");
  const known = new Set(
    groups.flatMap((group) => [
      ...group.fields,
      ...Object.keys(group.aliases ?? {}),
    ]),
  );
  const unknown = readiness.missing.some((field) => !known.has(field));
  return groups.map((group) => {
    const fields = new Set(group.fields.filter((field) => missing.has(field)));
    for (const [alias, related] of Object.entries(group.aliases ?? {}))
      if (missing.has(alias)) for (const field of related) fields.add(field);
    const blocked = fields.size > 0 || (group.id === "dispatch" && unknown);
    return {
      id: group.id,
      title: group.title,
      state: blocked ? "action_required" : "ready",
      detail: blocked ? group.blocked : group.ready,
      fields: [...fields],
      docsPath: group.docsPath,
      ...(group.id === "evidence" &&
      ["VOUCH_EVIDENCE_SIGNING_KEY", "VOUCH_ARTIFACT_KEY"].some((field) =>
        fields.has(field),
      )
        ? { command: "pnpm setup:secrets" }
        : {}),
    };
  });
}
export async function getSetupStatus(
  dependencies: SetupDependencies = {},
): Promise<SetupStatus> {
  const now = dependencies.now ?? (() => new Date());
  const readiness = (dependencies.readiness ?? liveReadiness)();
  const authorization = (
    dependencies.authorization ??
    (() =>
      isAuthorizedPhoneListConfigured(process.env.AUTHORIZED_PHONE_NUMBERS))
  )();
  const database = await boundedProbe(
    dependencies.probeDatabase ?? sharedDatabaseProbe,
    dependencies.timeoutMs ?? 2500,
  );
  const databaseReady = database.state === "ready";
  return {
    checkedAt: now().toISOString(),
    databaseReady,
    canRegisterTarget: databaseReady && authorization,
    liveConfigurationReady: readiness.enabled,
    checks: [
      {
        id: "database",
        title: "Database connection",
        state: database.state,
        detail: database.detail,
        fields: database.fields,
        docsPath: "/docs/quickstart#apply-migrations",
        ...(database.command ? { command: database.command } : {}),
      },
      ...groupedChecks(readiness, authorization),
      {
        id: "worker",
        title: "Campaign worker",
        state: databaseReady ? database.worker.state : "not_checked",
        detail: databaseReady
          ? database.worker.detail
          : notCheckedWorker.detail,
        fields: [],
        docsPath: "/docs/quickstart#start-the-workspace",
        ...(databaseReady && database.worker.state !== "ready"
          ? { command: "pnpm dev:worker" }
          : {}),
      },
    ],
  };
}
