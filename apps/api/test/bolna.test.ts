import { MockAgent } from "undici";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BolnaRuntime } from "../src/bolna";
let mock: MockAgent;
beforeEach(() => {
  mock = new MockAgent();
  mock.disableNetConnect();
});
afterEach(async () => {
  await mock.close();
  vi.unstubAllEnvs();
});
const client = () =>
  new BolnaRuntime({ apiKey: "test-only-credential", dispatcher: mock });
it("fails closed instead of placing an unenforced live call", async () => {
  await expect(
    client().start({ agentId: "unverified", phone: "+12025550199" }),
  ).rejects.toThrow("Live dispatch is disabled");
});
it("advertises only the documented capabilities", () => {
  expect(client().capabilities()).toMatchObject({
    targetToolEvents: false,
    cancellation: false,
    finalizedCost: false,
  });
});
it("lists hosted v2 agents without needing a caller ID", async () => {
  vi.stubEnv("BOLNA_AGENT_ID", "");
  mock
    .get("https://api.bolna.ai")
    .intercept({
      path: "/v2/agent/all",
      method: "GET",
      headers: { authorization: "Bearer test-only-credential" },
    })
    .reply(200, [{ id: "agent-1", agent_name: "Authorized test caller" }]);
  expect(await client().checkConnection()).toEqual({
    agentCount: 1,
    agentId: null,
  });
});
it("checks the configured caller rather than choosing a different agent", async () => {
  vi.stubEnv("BOLNA_AGENT_ID", "caller-1");
  mock
    .get("https://api.bolna.ai")
    .intercept({ path: "/v2/agent/caller-1" })
    .reply(200, { id: "caller-1" });
  expect(await client().checkConnection()).toEqual({
    agentId: "caller-1",
    agentCount: 1,
  });
});
it("retrieves the actual execution document via the pinned endpoint", async () => {
  mock
    .get("https://api.bolna.ai")
    .intercept({ path: "/executions/execution-1" })
    .reply(200, {
      id: "execution-1",
      status: "completed",
      transcript: "Actual provider transcript",
    });
  expect(await client().getExecution("execution-1")).toMatchObject({
    id: "execution-1",
    transcript: "Actual provider transcript",
  });
});
it("does not expose provider error bodies or credentials", async () => {
  mock
    .get("https://api.bolna.ai")
    .intercept({ path: "/v2/agent/all" })
    .reply(401, "sensitive provider response");
  await expect(client().listAgents()).rejects.toThrow(
    /^Bolna returned HTTP 401$/,
  );
});
it("rejects malformed provider documents at the boundary", async () => {
  mock
    .get("https://api.bolna.ai")
    .intercept({ path: "/v2/agent/all" })
    .reply(200, { unexpected: "shape" });
  await expect(client().listAgents()).rejects.toThrow();
});
it("fails before any request when credentials are missing", async () => {
  vi.stubEnv("BOLNA_API_KEY", "");
  await expect(
    new BolnaRuntime({ dispatcher: mock }).listAgents(),
  ).rejects.toThrow("not configured");
});
it("reports network failures without logging authentication data", async () => {
  mock
    .get("https://api.bolna.ai")
    .intercept({ path: "/v2/agent/all" })
    .replyWithError(new Error("proxy denied"));
  await expect(client().listAgents()).rejects.toThrow(
    "Unable to reach Bolna through the configured network",
  );
});
it("does not echo unreadable provider JSON into the UI", async () => {
  mock
    .get("https://api.bolna.ai")
    .intercept({ path: "/v2/agent/all" })
    .reply(200, "private upstream response");
  await expect(client().listAgents()).rejects.toThrow(
    /^Bolna returned an unreadable JSON response$/,
  );
});
