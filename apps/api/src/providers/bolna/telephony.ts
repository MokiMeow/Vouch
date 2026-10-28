import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import {
  bolnaDocument,
  readProviderJson,
  type ExecutionSnapshot,
} from "./model";

const proxy = new EnvHttpProxyAgent();
const phone = /^\+[1-9]\d{7,14}$/;
const terminalStatuses = [
  "completed",
  "canceled",
  "failed",
  "busy",
  "no-answer",
];
function terminalCall(status: unknown) {
  return terminalStatuses.includes(String(status));
}
export function twilioConfigured(): boolean {
  return (
    /^AC[0-9a-f]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID ?? "") &&
    Boolean(process.env.TWILIO_AUTH_TOKEN)
  );
}
export class TwilioCallControl {
  constructor(private readonly dispatcher?: Dispatcher) {}
  private async request(sid: string, body?: URLSearchParams) {
    const account = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioConfigured() || !account || !token)
      throw new Error("Twilio call-control credentials are not configured");
    if (!/^CA[0-9a-f]{32}$/i.test(sid))
      throw new Error("The execution has no supported Twilio call identifier");
    let response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${account}/Calls/${sid}.json`,
        {
          method: body ? "POST" : "GET",
          dispatcher: this.dispatcher ?? proxy,
          headers: {
            Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
            Accept: "application/json",
            ...(body
              ? { "Content-Type": "application/x-www-form-urlencoded" }
              : {}),
          },
          body: body?.toString(),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new Error("Twilio call control could not be reached");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Twilio call control returned HTTP ${response.status}`);
    }
    try {
      return bolnaDocument.parse(await readProviderJson(response, 1024 * 1024));
    } catch {
      throw new Error("Twilio returned an invalid call document");
    }
  }
  private async owned(snapshot: ExecutionSnapshot, targetPhone: string) {
    if (!snapshot.telephonyCallId || !phone.test(targetPhone))
      throw new Error(
        "Call control requires a correlated execution and target",
      );
    const call = await this.request(snapshot.telephonyCallId);
    if (
      call.sid !== snapshot.telephonyCallId ||
      call.account_sid !== process.env.TWILIO_ACCOUNT_SID ||
      call.to !== targetPhone ||
      (snapshot.targetPhone !== null && snapshot.targetPhone !== targetPhone)
    )
      throw new Error(
        "Twilio call ownership or target correlation did not match",
      );
    return call;
  }
  async setLimit(
    snapshot: ExecutionSnapshot,
    input: { phone: string; maxDurationSeconds: number },
  ) {
    if (
      !Number.isInteger(input.maxDurationSeconds) ||
      input.maxDurationSeconds < 1
    )
      throw new Error("A positive integer call duration is required");
    const call = await this.owned(snapshot, input.phone);
    if (terminalCall(call.status)) return;
    await this.request(
      snapshot.telephonyCallId!,
      new URLSearchParams({ TimeLimit: String(input.maxDurationSeconds) }),
    );
  }
  async cancel(snapshot: ExecutionSnapshot, input: { phone: string }) {
    const call = await this.owned(snapshot, input.phone);
    if (terminalCall(call.status)) return;
    const status =
      call.status === "queued" || call.status === "ringing"
        ? "canceled"
        : call.status === "in-progress"
          ? "completed"
          : null;
    if (!status)
      throw new Error("Twilio returned an unsupported call lifecycle state");
    try {
      await this.request(
        snapshot.telephonyCallId!,
        new URLSearchParams({ Status: status }),
      );
    } catch (error) {
      // The carrier can answer between the owned read and cancellation. Re-read
      // identity before completing a newly active call; do not guess its state.
      const latest = await this.owned(snapshot, input.phone);
      if (terminalCall(latest.status)) return;
      if (status === "canceled" && latest.status === "in-progress") {
        await this.request(
          snapshot.telephonyCallId!,
          new URLSearchParams({ Status: "completed" }),
        );
        return;
      }
      throw error;
    }
  }
}
