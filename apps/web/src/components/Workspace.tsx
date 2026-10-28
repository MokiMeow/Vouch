import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RadioIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SpinnerGapIcon,
  StopIcon,
  TerminalIcon,
  WarningCircleIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api, dateLabel, label, titleForRun, when } from "../lib";
import type { Action, Campaign, Navigate, Overview, Run } from "../types";
import { SetupForm } from "./CampaignForm";
import {
  ArrowLink,
  Badge,
  Brand,
  Empty,
  Link,
  Modal,
  Notice,
} from "./Primitives";
import { RunDetail } from "./RunDetail";
const navigation = [
  { name: "Overview", path: "/app" },
  { name: "Campaigns", path: "/app/campaigns" },
  { name: "Findings", path: "/app/findings" },
  { name: "Targets", path: "/app/targets" },
  { name: "Integrations", path: "/app/integrations" },
];

function pendingFindings(runs: Run[]) {
  return runs.filter(
    (r) => r.verdict?.outcome === "violation" && r.review === "pending",
  );
}
function pageFor(path: string) {
  return navigation.find((n) => n.path === path)?.name ?? "Overview";
}
function pillFor(nav: HTMLElement | null, path: string) {
  if (!nav) return { left: 0, width: 0 };
  const item = nav.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (!item) return { left: 0, width: 0 };
  return { left: item.offsetLeft, width: item.offsetWidth };
}
function WorkspaceNav({
  path,
  navigate,
  count,
}: {
  path: string;
  navigate: Navigate;
  count: number;
}) {
  const ref = useRef<HTMLElement>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [pill, setPill] = useState({ left: 0, width: 0 });
  const current = path.includes("/runs/") ? "/app/findings" : path;
  useLayoutEffect(() => {
    const update = () => setPill(pillFor(ref.current, hovered ?? current));
    update();
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [current, hovered, count]);
  return (
    <nav
      className="workspace-nav"
      aria-label="Main navigation"
      ref={ref}
      onMouseLeave={() => setHovered(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setHovered(null);
      }}
    >
      <span
        aria-hidden="true"
        className="nav-glider"
        style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
      />
      {navigation.map((item) => (
        <NavItem
          item={item}
          current={current}
          count={count}
          setHovered={setHovered}
          navigate={navigate}
          key={item.path}
        />
      ))}
    </nav>
  );
}
function NavItem({
  item,
  current,
  count,
  setHovered,
  navigate,
}: {
  item: { name: string; path: string };
  current: string;
  count: number;
  setHovered: (path: string | null) => void;
  navigate: Navigate;
}) {
  return (
    <Link
      to={item.path}
      navigate={navigate}
      data-path={item.path}
      aria-current={current === item.path ? "page" : undefined}
      onMouseEnter={() => setHovered(item.path)}
      onFocus={() => setHovered(item.path)}
    >
      {item.name}
      {item.name === "Findings" && count > 0 && <span>{count}</span>}
    </Link>
  );
}
function shouldPoll(pending: boolean, stopped: boolean) {
  return !pending && !stopped && document.visibilityState !== "hidden";
}
function useOverview(onError: (message: string) => void) {
  const [data, setData] = useState<Overview | null>(null);
  const refresh = useCallback(async () => {
    try {
      setData(await api("/overview"));
    } catch (error) {
      onError((error as Error).message);
    }
  }, [onError]);
  useEffect(() => {
    let stopped = false,
      pending = false;
    async function update() {
      if (!shouldPoll(pending, stopped)) return;
      pending = true;
      try {
        const next = await api("/overview");
        if (!stopped) setData(next);
      } catch (error) {
        if (!stopped) onError((error as Error).message);
      } finally {
        pending = false;
      }
    }
    void update();
    const timer = setInterval(update, 2500);
    document.addEventListener("visibilitychange", update);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [onError]);
  return { data, refresh };
}
function useEvidence(path: string, onError: (message: string) => void) {
  const [run, setRun] = useState<Run | null>(null);
  const runId = path.startsWith("/app/runs/") ? path.split("/")[3] : null;
  const refresh = useCallback(async () => {
    if (!runId) return;
    try {
      setRun(await api(`/runs/${runId}`));
    } catch (error) {
      onError((error as Error).message);
    }
  }, [runId, onError]);
  useEffect(() => {
    setRun(null);
    if (!runId) return;
    const controller = new AbortController();
    api(`/runs/${runId}`, undefined, controller.signal)
      .then(setRun)
      .catch((error) => {
        if (error.name !== "AbortError") onError(error.message);
      });
    return () => controller.abort();
  }, [runId, onError]);
  return { run, runId, refresh };
}
function useTimedNotice() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  return { notice, setNotice };
}
type ModalSettings = { type: "campaign" | "target"; targetId?: string } | null;
export function Workspace({
  path,
  navigate,
}: {
  path: string;
  navigate: Navigate;
}) {
  const [error, setError] = useState(""),
    [modal, setModal] = useState<ModalSettings>(null);
  const { notice, setNotice } = useTimedNotice();
  const { data, refresh } = useOverview(setError);
  const evidence = useEvidence(path, setError);
  const page = pageFor(path);
  useEffect(() => {
    document.title = `${evidence.runId ? "Evidence" : page} — Vouch`;
  }, [page, evidence.runId]);
  async function action(endpoint: string, body: unknown, message: string) {
    try {
      const value = await api(endpoint, body);
      setNotice(message);
      await refresh();
      return value;
    } catch (error) {
      setError((error as Error).message);
      return null;
    }
  }
  return (
    <div className="workspace-app">
      <a href="#workspace-main" className="skip-link">
        Skip to content
      </a>
      <div className="workspace-atmosphere" aria-hidden="true" />
      <header className="workspace-header">
        <Brand navigate={navigate} />
        <WorkspaceNav
          path={path}
          navigate={navigate}
          count={pendingFindings(data?.runs ?? []).length}
        />
        <div className="workspace-identity">
          <span className="workspace-mode">
            <span className="status-dot" />
            Synthetic workspace
          </span>
          <span className="avatar" title="Northstar · local development">
            N
          </span>
        </div>
      </header>
      <main id="workspace-main" className="workspace-main">
        {error && (
          <Notice kind="error" message={error} close={() => setError("")} />
        )}{" "}
        {notice && (
          <Notice kind="success" message={notice} close={() => setNotice("")} />
        )}
        {data ? (
          <WorkspaceContent
            data={data}
            evidence={evidence}
            page={page}
            navigate={navigate}
            setModal={setModal}
            action={action}
          />
        ) : (
          <WorkspaceLoading refresh={refresh} />
        )}
        <WorkspaceFooter navigate={navigate} />
      </main>
      <WorkspaceDialog
        settings={modal}
        data={data}
        onClose={() => setModal(null)}
        onSuccess={async (message) => {
          setModal(null);
          setNotice(message);
          await refresh();
        }}
      />
    </div>
  );
}
function WorkspaceLoading({ refresh }: { refresh: () => void }) {
  return (
    <div className="loading-state" role="status">
      <SpinnerGapIcon className="spin" size={24} />
      <h1>Opening your workspace.</h1>
      <p>Connecting to the evidence store…</p>
      <button className="text-button" onClick={refresh}>
        Try again <ArrowClockwiseIcon size={17} />
      </button>
    </div>
  );
}
function WorkspaceDialog({
  settings,
  data,
  onClose,
  onSuccess,
}: {
  settings: ModalSettings;
  data: Overview | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  if (!settings) return null;
  const title =
    settings.type === "campaign"
      ? "Set a test in motion."
      : "Make the scope explicit.";
  return (
    <Modal title={title} onClose={onClose}>
      <SetupForm
        type={settings.type}
        targets={data?.targets ?? []}
        targetId={settings.targetId}
        onSuccess={onSuccess}
      />
    </Modal>
  );
}
function WorkspaceFooter({ navigate }: { navigate: Navigate }) {
  return (
    <footer className="workspace-footer">
      <span>
        <ShieldCheckIcon size={16} />
        Evidence-led. Scope-bound. Vouch.
      </span>
      <Link to="/credits" navigate={navigate}>
        Credits & assets <ArrowUpRightIcon size={14} />
      </Link>
      <span>Northstar · local development</span>
    </footer>
  );
}
type ContentProps = {
  data: Overview;
  evidence: ReturnType<typeof useEvidence>;
  page: string;
  navigate: Navigate;
  setModal: (settings: ModalSettings) => void;
  action: Action;
};
function WorkspaceContent(props: ContentProps) {
  const { evidence, navigate, action } = props;
  if (!evidence.runId) return <WorkspacePage {...props} />;
  if (evidence.run)
    return (
      <RunDetail
        key={evidence.run.id}
        run={evidence.run}
        back={() => navigate("/app")}
        onUpdate={evidence.refresh}
        action={action}
      />
    );
  return (
    <div className="loading-state" role="status">
      <SpinnerGapIcon className="spin" size={23} />
      <p>Loading the evidence trail…</p>
      <button className="text-button" onClick={() => navigate("/app")}>
        Back to workspace
      </button>
    </div>
  );
}
const headings: Record<
  string,
  { title: string; description: string; eyebrow: string }
> = {
  Overview: {
    title: "Your testing, in focus.",
    description:
      "Follow every conversation from caller claim to verified outcome.",
    eyebrow: "NORTHSTAR / WORKSPACE",
  },
  Campaigns: {
    title: "Intentional tests. Clear outcomes.",
    description:
      "Every campaign starts with an approved target and a bounded scope.",
    eyebrow: "WORKSPACE / CAMPAIGNS",
  },
  Findings: {
    title: "Let the evidence speak.",
    description:
      "Review what was attempted, what executed, and what actually changed.",
    eyebrow: "WORKSPACE / FINDINGS",
  },
  Targets: {
    title: "The right target. The right scope.",
    description:
      "Register only the agents you own or have explicit permission to test.",
    eyebrow: "WORKSPACE / TARGETS",
  },
  Integrations: {
    title: "Connected, with intention.",
    description:
      "Keep your caller, target transport, and backend evidence distinct.",
    eyebrow: "WORKSPACE / INTEGRATIONS",
  },
};
function PageHeading({
  page,
  setModal,
}: {
  page: string;
  setModal: (settings: ModalSettings) => void;
}) {
  const heading = headings[page];
  const target = page === "Targets";
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{heading.eyebrow}</span>
        <h1 tabIndex={-1}>{heading.title}</h1>
        <p>{heading.description}</p>
      </div>
      {page !== "Integrations" && (
        <button
          className="button primary"
          onClick={() => setModal({ type: target ? "target" : "campaign" })}
        >
          <PlusIcon size={18} />
          {target ? "Register target" : "New campaign"}
          <ArrowUpRightIcon size={17} />
        </button>
      )}
    </div>
  );
}
function WorkspacePage({
  data,
  page,
  navigate,
  setModal,
  action,
}: ContentProps) {
  const openRun = (id: string) => navigate(`/app/runs/${id}`);
  const campaign = () => setModal({ type: "campaign" });
  const views: Record<string, React.ReactNode> = {
    Overview: (
      <OverviewView
        data={data}
        navigate={navigate}
        openRun={openRun}
        campaign={campaign}
        action={action}
      />
    ),
    Campaigns: (
      <CampaignsView
        data={data}
        openRun={openRun}
        campaign={campaign}
        action={action}
      />
    ),
    Findings: (
      <FindingsView data={data} openRun={openRun} campaign={campaign} />
    ),
    Targets: <TargetsView data={data} setModal={setModal} />,
    Integrations: (
      <IntegrationsView data={data} action={action} campaign={campaign} />
    ),
  };
  return (
    <div className="page-enter" key={page}>
      <div className="workspace-date">
        <span>{dateLabel()}</span>
        <span>
          <span className="status-dot" />
          Local fixture mode · no live calls
        </span>
      </div>
      <PageHeading page={page} setModal={setModal} />
      {views[page]}
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  warning = false,
}: {
  title: string;
  value: number;
  note: string;
  warning?: boolean;
}) {
  return (
    <div className={`metric ${warning ? "warning" : ""}`}>
      <span>{title}</span>
      <strong>{String(value).padStart(2, "0")}</strong>
      <p>{note}</p>
    </div>
  );
}
function FingerprintVisual() {
  return (
    <svg
      width="74"
      height="74"
      viewBox="0 0 74 74"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M19 46V33a18 18 0 0 1 36 0v11M25 50V34a12 12 0 0 1 24 0v14M31 55V35a6 6 0 0 1 12 0v21M37 38v22M13 37v-4a24 24 0 0 1 48 0v8M19 53v5M55 51v5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CampaignList({
  campaigns,
  runs,
  openRun,
  create,
  stop,
  expanded = false,
}: {
  campaigns: Campaign[];
  runs: Run[];
  openRun: (id: string) => void;
  create: () => void;
  stop: (id: string) => void;
  expanded?: boolean;
}) {
  return !campaigns.length ? (
    <Empty
      title="Your first campaign starts here."
      text="Test a false-authority claim alongside a legitimate verified contact change."
      button="Create a campaign"
      action={create}
    />
  ) : (
    <div className={`campaign-list ${expanded ? "expanded" : ""}`}>
      <div className="campaign-list-header" aria-hidden="true">
        <span>CAMPAIGN / TARGET</span>
        <span>STATUS</span>
        <span>CONVERSATIONS</span>
        {expanded && <span>CREATED · IST</span>}
        <span />
      </div>
      {campaigns.map((c) => (
        <CampaignRow
          key={c.id}
          campaign={c}
          cases={runs.filter((r) => r.campaign_id === c.id)}
          openRun={openRun}
          stop={stop}
          expanded={expanded}
        />
      ))}
    </div>
  );
}
const findingStates = {
  violation: {
    tone: "red",
    style: "warning",
    caption: "Violation",
    icon: WarningCircleIcon,
  },
  pass: { tone: "violet", style: "", caption: "Pass", icon: ShieldCheckIcon },
  unknown: {
    tone: "neutral",
    style: "",
    caption: "Unknown",
    icon: ShieldCheckIcon,
  },
};
function findingPresentation(run: Run) {
  if (!run.verdict)
    return {
      tone: "neutral",
      style: "",
      caption: label(run.status),
      icon: ShieldCheckIcon,
    };
  return findingStates[run.verdict.outcome];
}
function FindingRow({ run, open }: { run: Run; open: () => void }) {
  const view = findingPresentation(run),
    Icon = view.icon;
  return (
    <button className="finding-row" onClick={open}>
      <span className={`finding-symbol ${view.style}`}>
        <Icon size={26} weight="light" />
      </span>
      <span className="finding-description">
        <strong>{titleForRun(run)}</strong>
        <span>
          {run.campaign_name} <span>·</span> {run.target_name}
          <span>· Synthetic</span>
        </span>
      </span>
      <Badge tone={view.tone}>{view.caption}</Badge>
      <span className="finding-review">{label(run.review)}</span>
      <ArrowUpRightIcon size={20} />
    </button>
  );
}
function OverviewView({
  data,
  navigate,
  openRun,
  campaign,
  action,
}: CommonView) {
  const findings = data.runs.filter((r) => r.verdict?.outcome === "violation");
  const pending = findings.filter((r) => r.review === "pending");
  return (
    <>
      <div className="metric-strip" aria-label="Workspace activity">
        <Metric
          title="Campaigns"
          value={data.campaigns.length}
          note="Within your authorized scope"
        />
        <Metric
          title="Conversations tested"
          value={data.runs.filter((r) => r.status === "completed").length}
          note="Attack scenarios + benign controls"
        />
        <Metric
          title="Candidate findings"
          value={findings.length}
          note={`${pending.length} awaiting your review`}
          warning
        />
        <Metric
          title="Backend verified"
          value={
            data.runs.filter((r) => r.verdict?.tier === "backend_verified")
              .length
          }
          note="Observed state, beyond spoken claims"
        />
      </div>
      <div className="overview-grid">
        <section className="activity-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE LATEST SIGNAL</span>
              <h2>Recent campaigns</h2>
            </div>
            <ArrowLink action={() => navigate("/app/campaigns")}>
              View all
            </ArrowLink>
          </div>
          <CampaignList
            campaigns={data.campaigns.slice(0, 5)}
            runs={data.runs}
            openRun={openRun}
            create={campaign}
            stop={(id) =>
              action(
                `/campaigns/${id}/stop`,
                {},
                "Campaign stopped. Queued calls cancelled.",
              )
            }
          />
        </section>
        <section className="baseline-section">
          <span className="eyebrow">YOUR CURRENT BASELINE</span>
          <span className="baseline-icon">
            <FingerprintVisual />
          </span>
          <h2>
            Verification.
            <br />
            <span>Before action.</span>
          </h2>
          <p>
            The contact-change policy requires a trusted backend verification
            event. A persuasive caller isn’t enough.
          </p>
          <div className="baseline-path">
            <span>Caller claim</span>
            <ArrowRightIcon size={15} />
            <span>Identity event</span>
            <ArrowRightIcon size={15} />
            <span>Tool outcome</span>
          </div>
          <div className="baseline-footer">
            <Badge tone="violet">Policy v1</Badge>
            <button className="text-button" onClick={campaign}>
              Test the boundary <ArrowUpRightIcon size={17} />
            </button>
          </div>
        </section>
      </div>
      <section className="review-queue">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A HUMAN IN THE LOOP</span>
            <h2>
              Ready for a closer look{" "}
              <span className="count">{pending.length}</span>
            </h2>
          </div>
          <ArrowLink action={() => navigate("/app/findings")}>
            All findings
          </ArrowLink>
        </div>
        {pending.length ? (
          pending
            .slice(0, 3)
            .map((r) => (
              <FindingRow run={r} key={r.id} open={() => openRun(r.id)} />
            ))
        ) : (
          <div className="quiet-empty">
            <ShieldCheckIcon size={23} weight="light" />
            <div>
              <strong>No findings awaiting review.</strong>
              <p>
                {findings.length
                  ? "Your existing candidates have a recorded reviewer decision."
                  : "Run a campaign to start collecting evidence."}
              </p>
            </div>
          </div>
        )}
      </section>
      <div className="fixture-footnote">
        <TerminalIcon size={17} />
        <p>
          A proving ground, without the risk. Fixture runs use fictional
          identities and an instrumented local target. No real calls or costs.
        </p>
      </div>
    </>
  );
}

function CampaignsView({
  data,
  openRun,
  campaign,
  action,
}: Omit<CommonView, "navigate">) {
  return (
    <section className="campaigns-view">
      <div className="section-heading">
        <h2>
          Campaign history{" "}
          <span className="count">{data.campaigns.length}</span>
        </h2>
        <Badge>Concurrency · 1</Badge>
      </div>
      <CampaignList
        campaigns={data.campaigns}
        runs={data.runs}
        openRun={openRun}
        create={campaign}
        stop={(id) =>
          action(
            `/campaigns/${id}/stop`,
            {},
            "Campaign stopped. Queued calls cancelled.",
          )
        }
        expanded
      />
    </section>
  );
}

function FindingsView({
  data,
  openRun,
  campaign,
}: {
  data: Overview;
  openRun: (id: string) => void;
  campaign: () => void;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const visibleRuns = filterRuns(data.runs, search, filter);
  return (
    <section className="findings-view">
      <div className="list-toolbar">
        <label className="search-field">
          <MagnifyingGlassIcon size={19} />
          <span className="sr-only">Search findings</span>
          <input
            placeholder="Search conversations, campaigns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-field">
          <SlidersHorizontalIcon size={17} />
          <label className="sr-only" htmlFor="outcome-filter">
            Filter outcomes
          </label>
          <select
            id="outcome-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All outcomes</option>
            <option value="violation">Candidate findings</option>
            <option value="pass">Passed controls</option>
            <option value="unknown">Unknown evidence</option>
          </select>
        </div>
        <span className="result-count">{visibleRuns.length} conversations</span>
      </div>
      {visibleRuns.length ? (
        visibleRuns.map((r) => (
          <FindingRow run={r} open={() => openRun(r.id)} key={r.id} />
        ))
      ) : (
        <Empty
          title="Nothing in this view."
          text={
            data.runs.length
              ? "Try another search or outcome filter."
              : "Start a campaign to collect conversations and policy evidence."
          }
          button={data.runs.length ? undefined : "New campaign"}
          action={campaign}
        />
      )}
    </section>
  );
}

function TargetsView({
  data,
  setModal,
}: {
  data: Overview;
  setModal: (value: { type: "campaign" | "target"; targetId?: string }) => void;
}) {
  return (
    <section className="targets-view">
      <div className="section-heading">
        <h2>
          Approved targets <span className="count">{data.targets.length}</span>
        </h2>
        <span className="muted small">Authorization required, always.</span>
      </div>
      {data.targets.length ? (
        data.targets.map((t) => (
          <article className="target-row" key={t.id}>
            <span className="target-symbol">
              <RadioIcon size={27} weight="light" />
            </span>
            <div className="target-description">
              <div>
                <h2>{t.name}</h2>
                <Badge tone={t.transport === "fixture" ? "violet" : "amber"}>
                  {t.transport === "fixture"
                    ? "Synthetic target"
                    : "PSTN · live unverified"}
                </Badge>
              </div>
              <p>
                {t.transport === "fixture"
                  ? "Fictional accounts. Instrumented contact-change tool. Full backend visibility."
                  : t.phone}
              </p>
              <details>
                <summary>
                  <LockSimpleIcon size={15} />
                  Authorization & policy
                </summary>
                <p>{t.authorization_reference}</p>
                <span>Contact verification · v1</span>
              </details>
            </div>
            <button
              className="button secondary"
              disabled={t.transport !== "fixture"}
              title={
                t.transport === "fixture"
                  ? "Start a campaign for this target"
                  : "Live dispatch is disabled"
              }
              onClick={() => setModal({ type: "campaign", targetId: t.id })}
            >
              Create campaign <ArrowUpRightIcon size={17} />
            </button>
          </article>
        ))
      ) : (
        <Empty
          title="Start with an approved target."
          text="Use the local synthetic support agent, or register an operator-allowlisted number for future integration work."
          button="Register target"
          action={() => setModal({ type: "target" })}
        />
      )}
      <button
        className="add-target-line"
        onClick={() => setModal({ type: "target" })}
      >
        <PlusIcon size={21} />
        Register another approved target <ArrowUpRightIcon size={18} />
      </button>
    </section>
  );
}

function IntegrationsView({
  data,
  action,
  campaign,
}: Pick<CommonView, "data" | "action" | "campaign">) {
  return (
    <section className="integrations-view">
      <article className="integration-row">
        <span className="integration-monogram">b.</span>
        <div className="integration-content">
          <div className="integration-title">
            <h2>Bolna</h2>
            <Badge tone="amber">Live unverified</Badge>
          </div>
          <p>
            Adversarial spoken conversations through the hosted voice-agent
            runtime.
          </p>
          <dl>
            <div>
              <dt>Credentials</dt>
              <dd>{data.live.configured ? "Configured" : "Not configured"}</dd>
            </div>
            <div>
              <dt>Caller agent</dt>
              <dd>
                {data.live.agentConfigured ? "Configured" : "Not configured"}
              </dd>
            </div>
            <div>
              <dt>API flavor</dt>
              <dd>Hosted REST · agent v2</dd>
            </div>
            <div>
              <dt>Live dispatch</dt>
              <dd>Disabled</dd>
            </div>
          </dl>
          <div className="connection-boundary">
            <WarningCircleIcon size={19} />
            <p>{data.live.reason} No successful live call has been verified.</p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              action(
                "/integrations/bolna/check",
                {},
                "Bolna read-only connection verified. Live dispatch remains disabled.",
              )
            }
          >
            Check connection <ArrowUpRightIcon size={17} />
          </button>
        </div>
      </article>
      <article className="integration-row">
        <span className="integration-monogram fixture-monogram">
          <TerminalIcon size={29} weight="light" />
        </span>
        <div className="integration-content">
          <div className="integration-title">
            <h2>Synthetic fixture</h2>
            <Badge tone="violet">Available locally</Badge>
          </div>
          <p>
            The complete evidence workflow with a deterministic caller, a mock
            target, and a real PostgreSQL backend.
          </p>
          <dl>
            <div>
              <dt>Caller</dt>
              <dd>State machine · v1</dd>
            </div>
            <div>
              <dt>Telephony</dt>
              <dd>None · no live call</dd>
            </div>
            <div>
              <dt>Backend events</dt>
              <dd>Instrumented</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>$0.00</dd>
            </div>
          </dl>
          <button className="button secondary" onClick={campaign}>
            Run a fixture campaign <ArrowUpRightIcon size={17} />
          </button>
        </div>
      </article>
      <div className="integration-note">
        <LockSimpleIcon size={22} weight="light" />
        <div>
          <h3>Before going live.</h3>
          <p>
            Set BOLNA_API_KEY and BOLNA_AGENT_ID securely in environment
            settings. Only register operator-allowlisted numbers with an
            authorization reference. Provider duration, cancellation and budget
            controls still need implementation and validation.
          </p>
          <p>
            This unauthenticated local workspace must stay on loopback until
            authentication and tenant isolation are added.
          </p>
        </div>
      </div>
    </section>
  );
}

function filterRuns(runs: Run[], search: string, filter: string) {
  return runs.filter(
    (run) =>
      matchesOutcome(run, filter) &&
      `${run.campaign_name} ${run.target_name} ${run.scenario} ${run.review}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
}
function matchesOutcome(run: Run, filter: string) {
  return filter === "all" || run.verdict?.outcome === filter;
}

function firstCase(cases: Run[]) {
  return cases.find((r) => r.verdict?.outcome === "violation") ?? cases[0];
}
function violationCount(cases: Run[]) {
  return cases.filter((r) => r.verdict?.outcome === "violation").length;
}
function campaignTone(status: string) {
  const tones: Record<string, string> = { completed: "violet", failed: "red" };
  return tones[status] ?? "neutral";
}
function CampaignRow({
  campaign: c,
  cases,
  openRun,
  stop,
  expanded,
}: {
  campaign: Campaign;
  cases: Run[];
  openRun: (id: string) => void;
  stop: (id: string) => void;
  expanded: boolean;
}) {
  const first = firstCase(cases),
    violations = violationCount(cases);
  const open = () => {
    if (first) openRun(first.id);
  };
  return (
    <article className="campaign-row">
      <div className="campaign-name">
        <span className="campaign-symbol">
          <WaveformIcon size={23} weight="light" />
        </span>
        <div>
          <button className="row-title" onClick={open} disabled={!first}>
            {c.name}
          </button>
          <p>
            {c.target_name}
            <span>· Synthetic</span>
          </p>
          {violations > 0 && (
            <span className="campaign-findings">
              {violations} candidate {violations === 1 ? "finding" : "findings"}
            </span>
          )}
        </div>
      </div>
      <div className="campaign-status">
        <Badge tone={campaignTone(c.status)}>{label(c.status)}</Badge>
      </div>
      <div className="campaign-count">
        <span>
          {cases.filter((r) => r.status === "completed").length}
          <span className="muted"> / {cases.length}</span>
        </span>
        <small>
          {c.calls_used} of {c.scope.maxCalls} call slots reserved
        </small>
      </div>
      {expanded && <time className="campaign-time">{when(c.created_at)}</time>}
      <div className="campaign-actions">
        <button
          className="icon-button"
          disabled={!first}
          aria-label={`Open ${c.name}`}
          onClick={open}
        >
          <ArrowUpRightIcon size={20} />
        </button>
        {["queued", "running"].includes(c.status) && (
          <button
            className="icon-button"
            aria-label={`Stop ${c.name}`}
            onClick={() => stop(c.id)}
          >
            <StopIcon size={17} />
          </button>
        )}
      </div>
    </article>
  );
}
type CommonView = {
  data: Overview;
  navigate: Navigate;
  openRun: (id: string) => void;
  campaign: () => void;
  action: Action;
};
