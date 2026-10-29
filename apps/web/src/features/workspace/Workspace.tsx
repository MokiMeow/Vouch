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
import { api, dateLabel, label, titleForRun, when } from "../../shared/lib";
import {
  useEvidence,
  useOverview,
  useFindings,
  useSetup,
} from "../../shared/hooks/data";
import {
  readView,
  updateView,
  runHref,
  returnPath,
} from "../../shared/navigation";
import type {
  Action,
  AuthSession,
  Campaign,
  Navigate,
  Overview,
  RunSummary as Run,
} from "../../shared/types";
import { SetupForm } from "../campaigns/CampaignForm";
import type { SetupResult } from "../campaigns/CampaignForm";
import { StopCampaign } from "../campaigns/StopCampaign";
import {
  FirstRunGuide,
  WorkspaceSetup,
  CallerConnectionCheck,
} from "./WorkspaceSetup";
import {
  ArrowLink,
  Badge,
  Brand,
  CreditsLink,
  Empty,
  Link,
  Modal,
  Notice,
} from "../../shared/ui/Primitives";
import { RunDetail } from "../evidence/RunDetail";
import { SessionControls } from "../auth/Auth";
import "../../styles/workspace.css";
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
type ModalSettings =
  | { type: "campaign" | "target"; targetId?: string }
  | { type: "stop"; campaign: Campaign }
  | null;
export function Workspace({
  path,
  location,
  navigate,
  session,
  onSessionChange,
}: {
  path: string;
  location: string;
  navigate: Navigate;
  session: AuthSession;
  onSessionChange: (session: AuthSession) => void;
}) {
  const [error, setError] = useState(""),
    [modal, setModal] = useState<ModalSettings>(null);
  const { notice, setNotice } = useTimedNotice();
  const view = readView(location);
  const historyOffset = path === "/app/campaigns" ? (view.page - 1) * 50 : 0;
  const overview = useOverview(undefined, historyOffset);
  const setup = useSetup();
  const { data, refresh } = overview;
  const arrival = useRef<{ path: string; message: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentLocation = useRef(location);
  currentLocation.current = location;
  useEffect(() => {
    setModal(null);
    setError("");
    setNotice(
      arrival.current?.path === location ? arrival.current.message : "",
    );
    arrival.current = null;
  }, [location, setNotice]);
  const evidence = useEvidence(path);
  const page = pageFor(path);
  useEffect(() => {
    document.title = `${evidence.runId ? "Evidence" : page} · Vouch`;
  }, [page, evidence.runId]);
  async function action(endpoint: string, body: unknown, message: string) {
    const source = currentLocation.current;
    try {
      const value = await api(endpoint, body);
      if (currentLocation.current === source) setNotice(message);
      await refresh();
      return value;
    } catch (error) {
      if (currentLocation.current === source)
        setError((error as Error).message);
      return null;
    }
  }
  function openDialog(settings: ModalSettings) {
    if (
      settings?.type === "target" &&
      setup.data &&
      !setup.data.canRegisterTarget
    ) {
      arrival.current = {
        path: "/app/integrations",
        message:
          "Finish the database and target authorization setup before registering a phone target.",
      };
      navigate("/app/integrations");
      return;
    }
    if (settings?.type === "campaign") {
      if (!data) return navigate("/app/integrations");
      if (!data?.targets.length) return openDialog({ type: "target" });
      if (!data.live.enabled) return navigate("/app/integrations");
    }
    setModal(settings);
  }
  async function saved(message: string, result?: SetupResult) {
    if (!mounted.current || currentLocation.current !== location) return;
    setModal(null);
    await refresh();
    if (!mounted.current || currentLocation.current !== location) return;
    if (!result) return setNotice(message);
    const next =
      result.type === "target"
        ? `/app/targets?created=${encodeURIComponent(result.id)}`
        : result.initialRunId
          ? runHref(result.initialRunId, "/app/campaigns")
          : "/app/campaigns";
    arrival.current = { path: next, message };
    navigate(next);
  }
  async function stopCampaign(campaign: Campaign) {
    const source = currentLocation.current;
    await api(`/campaigns/${campaign.id}/stop`, {});
    await refresh();
    if (currentLocation.current === source)
      setNotice(
        "Stop requested. Queued calls cancelled and active calls marked for cancellation.",
      );
  }
  function checkSetup() {
    void setup.refresh();
    void refresh();
  }
  return (
    <div className="workspace-app">
      <a href="#workspace-main" className="skip-link">
        Skip to content
      </a>
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
        {data && overview.error && !evidence.runId && (
          <div className="notice error" role="alert">
            Activity could not be refreshed. Showing the last fetched records.
            <button className="text-button" onClick={() => void refresh()}>
              Retry update
            </button>
          </div>
        )}
        {evidence.runId ? (
          <EvidenceContent
            evidence={evidence}
            navigate={navigate}
            action={action}
            location={location}
          />
        ) : page === "Integrations" ? (
          <>
            <WorkspaceSetup
              status={setup.data}
              error={setup.error}
              checking={setup.loading}
              onCheck={checkSetup}
            />
            <CallerConnectionCheck
              configured={
                setup.data?.checks.find((check) => check.id === "caller")
                  ?.state === "ready"
              }
              owner={session.workspace?.role === "owner"}
            />
          </>
        ) : page === "Findings" ? (
          <div className="page-enter">
            <PageHeading page={page} setModal={openDialog} />
            <FindingsView
              location={location}
              navigate={navigate}
              campaign={() => openDialog({ type: "campaign" })}
              openRun={(id) => navigate(runHref(id, location))}
            />
          </div>
        ) : data ? (
          <WorkspacePage
            data={data}
            evidence={evidence}
            page={page}
            location={location}
            navigate={navigate}
            setModal={openDialog}
            action={action}
          />
        ) : overview.error || setup.data?.databaseReady === false ? (
          <WorkspaceSetup
            status={setup.data}
            error={setup.error}
            checking={setup.loading}
            onCheck={checkSetup}
            title={
              page === "Overview"
                ? "Connect your workspace"
                : `${page} need a database connection`
            }
          />
        ) : (
          <WorkspaceLoading refresh={refresh} />
        )}
        {data?.pagination && page === "Campaigns" && !evidence.runId && (
          <HistoryPagination
            pagination={data.pagination}
            onPage={(offset) =>
              navigate(updateView(location, { page: offset / 50 + 1 }), {
                scroll: false,
              })
            }
          />
        )}
        <WorkspaceFooter navigate={navigate} />
      </main>
      <WorkspaceDialog
        settings={modal}
        data={data}
        onClose={() => setModal(null)}
        onSuccess={saved}
        onStop={stopCampaign}
        onRegisterTarget={() => setModal({ type: "target" })}
        onOpenIntegrations={() => navigate("/app/integrations")}
      />
    </div>
  );
}
function WorkspaceLoading({ refresh }: { refresh: () => void }) {
  return (
    <div className="loading-state" role="status">
      <SpinnerGapIcon className="spin" size={24} />
      <h1>Opening your workspace.</h1>
      <p>Loading your stored activity and connection status…</p>
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
  onStop,
  onRegisterTarget,
  onOpenIntegrations,
}: {
  settings: ModalSettings;
  data: Overview | null;
  onClose: () => void;
  onSuccess: (message: string, result?: SetupResult) => void;
  onStop: (campaign: Campaign) => Promise<void>;
  onRegisterTarget: () => void;
  onOpenIntegrations: () => void;
}) {
  if (!settings) return null;
  if (settings.type === "stop")
    return (
      <StopCampaign
        campaign={settings.campaign}
        onCancel={onClose}
        onStop={() => onStop(settings.campaign)}
      />
    );
  const title =
    settings.type === "campaign"
      ? "Set a test in motion."
      : "Make the scope explicit.";
  return (
    <Modal title={title} onClose={onClose}>
      <SetupForm
        key={settings.type}
        type={settings.type}
        targets={data?.targets ?? []}
        targetId={settings.targetId}
        live={data?.live}
        onSuccess={onSuccess}
        onRegisterTarget={onRegisterTarget}
        onOpenIntegrations={onOpenIntegrations}
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
  location: string;
  navigate: Navigate;
  setModal: (settings: ModalSettings) => void;
  action: Action;
};
function EvidenceContent(
  props: Pick<ContentProps, "evidence" | "navigate" | "action" | "location">,
) {
  const { evidence, navigate, action } = props;
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
          back={() => navigate(returnPath(props.location), { replace: true })}
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
  location,
  navigate,
  setModal,
}: ContentProps) {
  const openRun = (id: string) => navigate(runHref(id, location));
  const campaign = () => setModal({ type: "campaign" });
  const stop = (id: string) => {
    const selected = data.campaigns.find((entry) => entry.id === id);
    if (selected) setModal({ type: "stop", campaign: selected });
  };
  const views: Record<string, React.ReactNode> = {
    Overview: (
      <OverviewView
        data={data}
        navigate={navigate}
        openRun={openRun}
        campaign={campaign}
        stop={stop}
        register={() => setModal({ type: "target" })}
      />
    ),
    Campaigns: (
      <CampaignsView
        data={data}
        openRun={openRun}
        campaign={campaign}
        stop={stop}
      />
    ),
    Targets: <TargetsView data={data} setModal={setModal} />,
  };
  return (
    <div className="page-enter" key={page}>
      <div className="workspace-date">
        <span>{dateLabel()}</span>
        <span>
          <span className="status-dot" />
          {data.live.enabled
            ? "Authorized provider campaigns"
            : "Provider setup required"}
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
    <Link className="finding-row" to={runHref(run.id)} navigate={open}>
      <span className={`finding-symbol ${view.style}`}>
        <Icon size={26} weight="light" />
      </span>
      <span className="finding-description">
        <strong>{titleForRun(run)}</strong>
        <span>
          {run.campaign_name} <span>·</span> {run.target_name}
          <span>{"· Provider evidence"}</span>
        </span>
      </span>
      <Badge tone={view.tone}>{view.caption}</Badge>
      <span className="finding-review">
        {run.verdict?.outcome === "violation" ? label(run.review) : ""}
      </span>
      <ArrowUpRightIcon size={20} />
    </Link>
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
      <div
        className="mission-trace"
        role="region"
        tabIndex={0}
        aria-label="Policy sequence"
      >
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
  stop,
  register,
}: CommonView & { register: () => void }) {
  if ((data.summary?.campaigns ?? data.campaigns.length) === 0)
    return (
      <FirstRunGuide
        data={data}
        register={register}
        setup={() => navigate("/app/integrations")}
        campaign={campaign}
      />
    );
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
            stop={stop}
          />
        </section>
        <OverviewReviews
          runs={data.runs}
          openRun={openRun}
          navigate={navigate}
          totalPending={data.summary?.pendingFindings}
        />
      </div>
      <div className="provider-footnote">
        <TerminalIcon size={16} />
        <p>
          {data.live.enabled
            ? "Calls consume your authorized provider budget. Evidence comes from actual runs."
            : "Connect your provider and authorized target to collect real call evidence."}
        </p>
      </div>
    </>
  );
}

function CampaignsView({
  data,
  openRun,
  campaign,
  stop,
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
        stop={stop}
        expanded
      />
    </section>
  );
}

function FindingsView({
  openRun,
  campaign,
  location,
  navigate,
}: {
  openRun: (id: string) => void;
  campaign: () => void;
  location: string;
  navigate: Navigate;
}) {
  const { search, outcome, page } = readView(location);
  const [query, setQuery] = useState(search.trim());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useFindings(query, outcome, page);
  const data = result.data;
  return (
    <section className="findings-view">
      <div className="list-toolbar">
        <label className="search-field">
          <MagnifyingGlassIcon size={19} />
          <span className="sr-only">Search all findings</span>
          <input
            placeholder="Search all findings…"
            maxLength={300}
            value={search}
            onChange={(e) =>
              navigate(
                updateView(location, { search: e.target.value, page: 1 }),
                { replace: true, scroll: false },
              )
            }
          />
        </label>
        <div className="filter-field">
          <SlidersHorizontalIcon size={17} />
          <label className="sr-only" htmlFor="outcome-filter">
            Filter outcomes
          </label>
          <select
            id="outcome-filter"
            value={outcome}
            onChange={(e) =>
              navigate(
                updateView(location, { outcome: e.target.value, page: 1 }),
                { scroll: false },
              )
            }
          >
            <option value="all">All outcomes</option>
            <option value="violation">Candidate findings</option>
            <option value="pass">Passed controls</option>
            <option value="unknown">Unknown evidence</option>
          </select>
        </div>
        <span className="result-count" role="status">
          {data
            ? `${data.pagination.totalRuns} ${data.pagination.totalRuns === 1 ? "conversation" : "conversations"}`
            : "Searching…"}
        </span>
      </div>
      {result.error ? (
        <div className="notice error" role="alert">
          {result.error}
          <button className="text-button" onClick={() => void result.refresh()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status">Searching conversations…</p>
      ) : data.runs.length ? (
        data.runs.map((r) => (
          <FindingRow key={r.id} run={r} open={() => openRun(r.id)} />
        ))
      ) : (
        <Empty
          title="Nothing in this view."
          text={
            search.trim() || outcome !== "all" || page > 1
              ? "Try another search or outcome filter."
              : "Register an authorized target and launch a call to collect evidence."
          }
          button={
            search.trim() || outcome !== "all" || page > 1
              ? "Clear filters"
              : "New campaign"
          }
          action={
            search.trim() || outcome !== "all" || page > 1
              ? () =>
                  navigate(
                    updateView(location, {
                      search: "",
                      outcome: "all",
                      page: 1,
                    }),
                    { scroll: false },
                  )
              : campaign
          }
        />
      )}
      {data && (
        <HistoryPagination
          pagination={data.pagination}
          noun="conversation"
          onPage={(offset) =>
            navigate(updateView(location, { page: offset / 50 + 1 }), {
              scroll: false,
            })
          }
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
                <Badge tone="violet">Approved PSTN target</Badge>
              </div>
              <p>{t.phone}</p>
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
              title={
                data.live.enabled
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
          text="Register a phone number you own or are explicitly authorized to test."
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
  const active = ["queued", "running", "awaiting_evidence"].includes(c.status);
  const content = (
    <>
      <div className="campaign-name">
        <span className="campaign-symbol">
          <WaveformIcon size={23} weight="light" />
        </span>
        <div>
          <strong className="row-title">{c.name}</strong>
          <p>
            {c.target_name}
            <span>· Provider evidence</span>
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
        <small>{Math.max(0, c.scope.maxCalls - c.calls_used)} slots left</small>
      </div>
      {expanded && <time className="campaign-time">{when(c.created_at)}</time>}
      <span className="campaign-actions" aria-hidden="true">
        <ArrowUpRightIcon size={20} />
      </span>
    </>
  );
  return (
    <div className="campaign-entry">
      {first ? (
        <Link
          className="campaign-row"
          to={runHref(first.id)}
          navigate={() => openRun(first.id)}
          aria-label={`Open ${c.name}`}
        >
          {content}
        </Link>
      ) : (
        <article className="campaign-row">{content}</article>
      )}
      {active && (
        <button
          type="button"
          className="campaign-stop"
          onClick={() => stop(c.id)}
          aria-label={`Stop ${c.name}`}
        >
          <StopIcon size={15} />
          Stop
        </button>
      )}
    </div>
  );
}
type CommonView = {
  data: Overview;
  navigate: Navigate;
  openRun: (id: string) => void;
  campaign: () => void;
  stop: (id: string) => void;
};

function HistoryPagination({
  pagination,
  onPage,
  noun = "campaign",
}: {
  pagination: {
    offset: number;
    limit: number;
    totalCampaigns?: number;
    totalRuns?: number;
    hasMore: boolean;
  };
  onPage: (offset: number) => void;
  noun?: string;
}) {
  const { offset, limit, hasMore } = pagination;
  const totalCampaigns = pagination.totalCampaigns ?? pagination.totalRuns ?? 0;
  return (
    <nav className="history-pagination" aria-label={`${noun} pages`}>
      <span>
        {totalCampaigns
          ? offset >= totalCampaigns
            ? `No ${noun}s on this page`
            : `${offset + 1}–${Math.min(offset + limit, totalCampaigns)} of ${totalCampaigns} ${noun}${totalCampaigns === 1 ? "" : "s"}`
          : `No ${noun}s yet`}
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
