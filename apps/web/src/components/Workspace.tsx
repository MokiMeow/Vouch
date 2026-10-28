import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenTextIcon,
  CrosshairIcon,
  FlagCheckeredIcon,
  HouseLineIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PlugsIcon,
  PulseIcon,
  RadioIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SpinnerGapIcon,
  StopIcon,
  TerminalIcon,
  WarningCircleIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, dateLabel, label, titleForRun, when } from "../lib";
import { useEvidence, useOverview } from "../hooks/data";
import type {
  Action,
  AuthSession,
  Campaign,
  Navigate,
  Overview,
  RunSummary as Run,
} from "../types";
import { SetupForm } from "./CampaignForm";
import {
  ArrowLink,
  Badge,
  Brand,
  CreditsLink,
  Empty,
  Link,
  Modal,
  Notice,
} from "./Primitives";
import { RunDetail } from "./RunDetail";
import { SessionControls } from "./Auth";
import "../workspace-v2.css";
const navigation = [
  { name: "Overview", path: "/app", icon: HouseLineIcon },
  { name: "Campaigns", path: "/app/campaigns", icon: FlagCheckeredIcon },
  { name: "Findings", path: "/app/findings", icon: PulseIcon },
  { name: "Targets", path: "/app/targets", icon: CrosshairIcon },
  { name: "Integrations", path: "/app/integrations", icon: PlugsIcon },
  { name: "Docs", path: "/docs", icon: BookOpenTextIcon },
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
  item: (typeof navigation)[number];
  current: string;
  count: number;
  setHovered: (path: string | null) => void;
  navigate: Navigate;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon size={17} aria-hidden="true" />
      <span className="nav-label">{item.name}</span>
      {item.name === "Findings" && count > 0 && (
        <span className="nav-count">{count}</span>
      )}
    </>
  );
  const hover = {
    "data-path": item.path,
    onMouseEnter: () => setHovered(item.path),
    onFocus: () => setHovered(item.path),
  };
  if (item.path === "/docs")
    return (
      <a
        href="/docs"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Docs opens in a new tab"
        {...hover}
      >
        {content}
        <ArrowUpRightIcon
          className="docs-external"
          size={12}
          aria-hidden="true"
        />
      </a>
    );
  return (
    <Link
      to={item.path}
      navigate={navigate}
      {...hover}
      aria-current={current === item.path ? "page" : undefined}
    >
      {content}
    </Link>
  );
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
  session,
  onSessionChange,
}: {
  path: string;
  navigate: Navigate;
  session: AuthSession;
  onSessionChange: (session: AuthSession) => void;
}) {
  const [error, setError] = useState(""),
    [modal, setModal] = useState<ModalSettings>(null);
  const { notice, setNotice } = useTimedNotice();
  const [historyOffset, setHistoryOffset] = useState(0);
  const { data, refresh } = useOverview(setError, historyOffset);
  useEffect(() => setHistoryOffset(0), [path]);
  const evidence = useEvidence(path);
  const page = pageFor(path);
  useEffect(() => {
    document.title = `${evidence.runId ? "Evidence" : page} · Vouch`;
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
          count={
            data?.summary?.pendingFindings ??
            pendingFindings(data?.runs ?? []).length
          }
        />
        <div className="workspace-identity">
          <SessionControls
            session={session}
            onChange={(next) => {
              if (next.workspace?.id !== session.workspace?.id)
                navigate("/app");
              onSessionChange(next);
            }}
          />
          <a
            className="avatar workspace-docs-shortcut"
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open documentation in a new tab"
            title="Documentation"
          >
            <BookOpenTextIcon size={17} aria-hidden="true" />
          </a>
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
        {data?.pagination && ["Campaigns", "Findings"].includes(page) && (
          <HistoryPagination
            pagination={data.pagination}
            onPage={setHistoryOffset}
          />
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
        live={data?.live}
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
        Scoped runs. Traceable evidence.
      </span>
      <CreditsLink navigate={navigate} />
      <span>v0.1 · Evidence workspace</span>
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
  if (evidence.error && !evidence.run)
    return (
      <div className="loading-state" role="alert">
        <WarningCircleIcon size={23} />
        <h1>Evidence unavailable.</h1>
        <p>{evidence.error}</p>
        <button className="text-button" onClick={() => void evidence.refresh()}>
          Try again <ArrowClockwiseIcon size={17} />
        </button>
        <button className="text-button" onClick={() => navigate("/app")}>
          Back to workspace
        </button>
      </div>
    );
  if (evidence.run)
    return (
      <>
        {evidence.error && (
          <div className="notice error" role="alert">
            <WarningCircleIcon size={20} />
            <span>{evidence.error}</span>
            <span>Showing the last fetched evidence.</span>
            <button
              className="text-button"
              onClick={() => void evidence.refresh()}
            >
              Retry update
            </button>
          </div>
        )}
        <RunDetail
          key={evidence.run.id}
          run={evidence.run}
          back={() => navigate("/app")}
          onUpdate={evidence.refresh}
          action={action}
        />
      </>
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
    description: "Launch a test. Follow the evidence.",
    eyebrow: "WORKSPACE / OVERVIEW",
  },
  Campaigns: {
    title: "Every run has a purpose.",
    description: "Approved targets. Bounded campaigns.",
    eyebrow: "WORKSPACE / CAMPAIGNS",
  },
  Findings: {
    title: "Let the evidence speak.",
    description: "From attempted action to verified outcome.",
    eyebrow: "WORKSPACE / FINDINGS",
  },
  Targets: {
    title: "Know your test surface.",
    description: "Register agents you own or are authorized to test.",
    eyebrow: "WORKSPACE / TARGETS",
  },
  Integrations: {
    title: "Your runtime, connected.",
    description: "Caller runtime and evidence sources, in one place.",
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
          {data.live.enabled
            ? "Scoped fixture and live campaigns"
            : "Synthetic mode · live prerequisites pending"}
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
  const byCampaign = useMemo(() => {
    const grouped = new Map<string, Run[]>();
    for (const run of runs) {
      const group = grouped.get(run.campaign_id) ?? [];
      group.push(run);
      grouped.set(run.campaign_id, group);
    }
    return grouped;
  }, [runs]);
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
        {expanded && <span>CREATED · LOCAL TIME</span>}
        <span />
      </div>
      {campaigns.map((c) => (
        <CampaignRow
          key={c.id}
          campaign={c}
          cases={byCampaign.get(c.id) ?? []}
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
          <span>{run.synthetic ? "· Synthetic" : "· Provider evidence"}</span>
        </span>
      </span>
      <Badge tone={view.tone}>{view.caption}</Badge>
      <span className="finding-review">{label(run.review)}</span>
      <ArrowUpRightIcon size={20} />
    </button>
  );
}
function MissionIntro({
  campaign,
  version,
  compact,
}: {
  campaign: () => void;
  version: number;
  compact: boolean;
}) {
  return (
    <section
      className={`mission-intro ${compact ? "is-compact" : ""}`}
      aria-label="Start a baseline"
    >
      <div className="mission-copy">
        <span className="mission-eyebrow">
          <TerminalIcon size={15} aria-hidden="true" /> YOUR NEXT COMMIT, WITH
          CONFIDENCE
        </span>
        <h2>
          Test the boundary.
          <br />
          <span>Keep the proof.</span>
        </h2>
        <div className="mission-actions">
          <button className="button primary" onClick={campaign}>
            Run a baseline <ArrowUpRightIcon size={17} />
          </button>
          <a
            className="mission-guide"
            href="/docs/first-campaign"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the guide <BookOpenTextIcon size={16} />
          </a>
        </div>
        <div className="mission-spec">
          <span>POLICY v{version}</span>
          <span>2 SCENARIOS</span>
          <span>FICTIONAL ACCOUNTS</span>
        </div>
      </div>
      <div className="mission-art" aria-hidden="true">
        <span className="mission-orbit orbit-one" />
        <span className="mission-orbit orbit-two" />
        <img
          src="/brand/vouch-scout.webp"
          width="220"
          height="220"
          alt=""
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
        <span className="mission-coordinate coordinate-one">OBSERVE</span>
        <span className="mission-coordinate coordinate-two">VERIFY</span>
      </div>
      <div className="mission-trace" aria-label="Policy sequence">
        <code>identity.verified</code>
        <ArrowRightIcon size={14} />
        <code>change_contact_phone</code>
        <ArrowRightIcon size={14} />
        <code>backend.state</code>
      </div>
    </section>
  );
}
function OverviewMetrics({ data }: { data: Overview }) {
  const findings = data.runs.filter(
    (run) => run.verdict?.outcome === "violation",
  );
  return (
    <div className="metric-strip" aria-label="Workspace activity">
      <Metric
        title="Campaigns"
        value={data.summary?.campaigns ?? data.campaigns.length}
        note="In this workspace"
      />
      <Metric
        title="Conversations tested"
        value={
          data.summary?.runs ??
          data.runs.filter((run) => run.status === "completed").length
        }
        note="Completed runs"
      />
      <Metric
        title="Candidate findings"
        value={data.summary?.candidates ?? findings.length}
        note={`${data.summary?.pendingFindings ?? pendingFindings(data.runs).length} awaiting review`}
        warning
      />
      <Metric
        title="Backend verified"
        value={
          data.summary?.backendVerified ??
          data.runs.filter((run) => run.verdict?.tier === "backend_verified")
            .length
        }
        note="With state evidence"
      />
    </div>
  );
}
function OverviewReviews({
  runs,
  openRun,
  navigate,
  totalPending,
}: {
  runs: Run[];
  openRun: (id: string) => void;
  navigate: Navigate;
  totalPending?: number;
}) {
  const pending = pendingFindings(runs);
  return (
    <section className="review-queue">
      <div className="section-heading">
        <div>
          <span className="eyebrow">HUMAN CHECKPOINT</span>
          <h2>
            Needs your review{" "}
            <span className="count">{totalPending ?? pending.length}</span>
          </h2>
        </div>
        <ArrowLink action={() => navigate("/app/findings")}>
          All findings
        </ArrowLink>
      </div>
      {pending.length ? (
        pending
          .slice(0, 3)
          .map((run) => (
            <FindingRow run={run} key={run.id} open={() => openRun(run.id)} />
          ))
      ) : (
        <div className="quiet-empty">
          <ShieldCheckIcon size={26} weight="light" />
          <div>
            <strong>
              {totalPending
                ? "Earlier findings need review."
                : "All clear for now."}
            </strong>
            <p>
              {totalPending
                ? "Browse campaign history to review findings from earlier campaigns."
                : "No findings awaiting review."}
            </p>
          </div>
        </div>
      )}
      <a
        className="review-doc-link"
        href="/docs/evidence"
        target="_blank"
        rel="noopener noreferrer"
      >
        <BookOpenTextIcon size={16} />
        How to read the evidence <ArrowUpRightIcon size={15} />
      </a>
    </section>
  );
}
function OverviewView({
  data,
  navigate,
  openRun,
  campaign,
  action,
}: CommonView) {
  return (
    <>
      <MissionIntro
        campaign={campaign}
        version={data.policy.version}
        compact={data.campaigns.length > 0}
      />
      <OverviewMetrics data={data} />
      <div className="overview-grid">
        <section className="activity-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LATEST ACTIVITY</span>
              <h2>Recent campaigns</h2>
            </div>
            <ArrowLink action={() => navigate("/app/campaigns")}>
              View all
            </ArrowLink>
          </div>
          <CampaignList
            campaigns={data.campaigns.slice(0, 3)}
            runs={data.runs}
            openRun={openRun}
            create={campaign}
            stop={(id) =>
              action(
                `/campaigns/${id}/stop`,
                {},
                "Stop requested. Queued calls cancelled and active calls marked for cancellation.",
              )
            }
          />
        </section>
        <OverviewReviews
          runs={data.runs}
          openRun={openRun}
          navigate={navigate}
          totalPending={data.summary?.pendingFindings}
        />
      </div>
      <div className="fixture-footnote">
        <TerminalIcon size={16} />
        <p>
          {data.live.enabled
            ? "Live campaigns consume your authorized provider budget. Fixtures remain free."
            : "Fixture campaigns are synthetic. Live calls require configured resource controls."}
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
          <span className="count">
            {data.pagination?.totalCampaigns ?? data.campaigns.length}
          </span>
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
            "Stop requested. Queued calls cancelled and active calls marked for cancellation.",
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
            placeholder="Search this history page…"
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
        <span className="result-count">
          {visibleRuns.length} conversations on this page
        </span>
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
        <span className="muted small">Approved targets only</span>
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
                    : "Approved PSTN target"}
                </Badge>
              </div>
              <p>
                {t.transport === "fixture"
                  ? "Fictional accounts with instrumented backend evidence."
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
              disabled={t.transport !== "fixture" && !data.live.enabled}
              title={
                t.transport === "fixture"
                  ? "Start a campaign for this target"
                  : data.live.enabled
                    ? "Start an authorized live campaign"
                    : data.live.reason
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
          text="Add a synthetic agent or an approved phone number."
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
            <Badge tone={data.live.enabled ? "violet" : "amber"}>
              {data.live.enabled ? "Configuration ready" : "Setup required"}
            </Badge>
          </div>
          <p>
            Hosted caller runtime with bounded dispatch and recorded evidence.
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
              <dd>
                {data.live.enabled
                  ? "Configuration ready"
                  : "Blocked by prerequisites"}
              </dd>
            </div>
          </dl>
          <div className="connection-boundary">
            <WarningCircleIcon size={19} />
            <p>
              {data.live.reason} Provider configuration readiness is separate
              from a verified live call.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              action(
                "/integrations/bolna/check",
                {},
                "Bolna read-only connection verified. Campaign launch still checks every resource control.",
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
          <p>Deterministic calls with real backend state checks.</p>
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
            Live calls require provider controls for duration, cancellation and
            budget. Keep credentials in the server environment and use only
            approved targets.
          </p>
          <p>
            Workspace access and provider setup are managed independently. Never
            put provider credentials into browser settings.
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
            <span>{c.mode === "live" ? "· Live" : "· Synthetic"}</span>
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

function HistoryPagination({
  pagination,
  onPage,
}: {
  pagination: NonNullable<Overview["pagination"]>;
  onPage: (offset: number) => void;
}) {
  const { offset, limit, totalCampaigns, hasMore } = pagination;
  return (
    <nav className="history-pagination" aria-label="Campaign history pages">
      <span>
        {totalCampaigns
          ? `${offset + 1}–${Math.min(offset + limit, totalCampaigns)} of ${totalCampaigns} campaigns`
          : "No campaigns yet"}
      </span>
      <div>
        <button
          className="button secondary"
          disabled={offset === 0}
          onClick={() => onPage(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <button
          className="button secondary"
          disabled={!hasMore}
          onClick={() => onPage(offset + limit)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
