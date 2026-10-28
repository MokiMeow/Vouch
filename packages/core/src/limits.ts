import type { Scope } from "./schemas";
export function assertScope(
  scope: Scope,
  now: number,
  usedCalls: number,
  reservedCostCents: number = 0,
) {
  if (now < Date.parse(scope.startsAt) || now >= Date.parse(scope.endsAt))
    throw new Error("Outside the authorized time window");
  if (usedCalls >= scope.maxCalls)
    throw new Error("Maximum call count reached");
  if (reservedCostCents > scope.budgetCents)
    throw new Error("Monetary budget exceeded");
}
