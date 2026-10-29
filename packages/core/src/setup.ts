export type SetupCheckId =
  | "database"
  | "caller"
  | "carrier"
  | "authorization"
  | "evidence"
  | "billing"
  | "dispatch"
  | "worker";
export type SetupCheckState =
  "ready" | "action_required" | "unavailable" | "not_checked";
export type SetupCheck = {
  id: SetupCheckId;
  title: string;
  state: SetupCheckState;
  detail: string;
  fields: string[];
  docsPath: string;
  command?: string;
};
export type SetupStatus = {
  checkedAt: string;
  databaseReady: boolean;
  canRegisterTarget: boolean;
  liveConfigurationReady: boolean;
  checks: SetupCheck[];
};

/** Reports configuration presence without exposing or validating a provider secret. */
export function isConfiguredSetting(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return !/(?:\[[A-Z_ ]+\]|<[^>]+>|YOUR_|REPLACE_(?:ME|THIS)|CHANGE_ME|PLACEHOLDER)/i.test(
    value,
  );
}
export function isAuthorizedPhoneListConfigured(
  value: string | undefined,
): boolean {
  const entries =
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  return (
    entries.length > 0 &&
    entries.every((item) => /^\+[1-9]\d{7,14}$/.test(item))
  );
}
