import type { z } from "zod";
const fields: Record<string, string> = {
  name: "Name",
  targetId: "Target",
  id: "Run ID",
  limit: "Page size",
  offset: "Page offset",
  search: "Search",
  outcome: "Outcome filter",
  note: "Review rationale",
  phone: "Phone number",
  authorizationReference: "Authorization reference",
  maxCalls: "Maximum calls",
  maxDurationSeconds: "Call duration",
  budgetCents: "Budget",
  startsAt: "Window start",
  endsAt: "Window end",
  scope: "Test window",
  email: "Email",
  password: "Password",
};
function fieldName(key: string) {
  return (
    fields[key] ??
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
function requiredFormat(format: string, key: string) {
  if (format === "uuid") return "a valid UUID";
  if (format === "email") return "a valid email address";
  return key === "phone"
    ? "an E.164 phone number such as +12025550199"
    : "in the required format";
}
function asSentence(message: string) {
  return message.endsWith(".") ? message : `${message}.`;
}
export function validationMessage(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const key = String(issue.path.at(-1) ?? "value");
      const field = fieldName(key);
      if (issue.code === "too_small")
        return `${field} must ${issue.origin === "string" ? `contain at least ${issue.minimum} characters` : `be at least ${issue.minimum}`}.`;
      if (issue.code === "too_big")
        return `${field} must ${issue.origin === "string" ? `contain no more than ${issue.maximum} characters` : `be no more than ${issue.maximum}`}.`;
      if (issue.code === "invalid_format")
        return `${field} must be ${requiredFormat(issue.format, key)}.`;
      if (issue.code === "custom") return asSentence(issue.message);
      if (issue.code === "unrecognized_keys")
        return "The request contains unsupported fields.";
      return `${field} is required and must have a valid value.`;
    })
    .join(" ");
}
