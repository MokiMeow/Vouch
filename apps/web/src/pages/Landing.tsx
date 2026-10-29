import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CopyIcon,
  FingerprintIcon,
  GitBranchIcon,
  LockSimpleIcon,
  MinusIcon,
  PlusIcon,
  TerminalIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Navigate } from "../shared/types";
import { Brand, CreditsLink, Link } from "../shared/ui/Primitives";
import "../styles/landing.css";

function useLandingReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = "Vouch | Voice agent security";
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("lv-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08 },
    );
    root.current?.querySelectorAll(".lv-reveal").forEach((element) => {
      element.classList.add("lv-will-reveal");
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);
  return root;
}
function SiteHeader({ navigate }: { navigate: Navigate }) {
  return (
    <header className="site-header lv-header">
      <Brand navigate={navigate} />
      <nav className="lv-nav" aria-label="Website navigation">
        <a href="#approach" className="lv-section-link">
          Approach
        </a>
        <a href="#evidence" className="lv-section-link">
          Evidence
        </a>
        <Link
          to="/docs"
          target="_blank"
          rel="noopener noreferrer"
          navigate={navigate}
        >
          Docs <ArrowUpRightIcon size={13} />
        </Link>
      </nav>
      <Link to="/app" navigate={navigate} className="button header-cta">
        Open workspace <ArrowUpRightIcon size={16} />
      </Link>
    </header>
  );
}
function LaunchCommand({ navigate }: { navigate: Navigate }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText("pnpm dev");
      setMessage("Command copied");
    } catch {
      setMessage("Select the command to copy it manually");
    }
  }
  return (
    <div className="lv-launch">
      <div className="lv-command">
        <TerminalIcon size={17} />
        <code>pnpm dev</code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy development command"
        >
          <CopyIcon size={16} />
        </button>
      </div>
      <Link
        to="/docs/quickstart"
        target="_blank"
        rel="noopener noreferrer"
        navigate={navigate}
      >
        Read the setup guide <ArrowRightIcon size={14} />
      </Link>
      {message && (
        <span role="status" className="lv-copy-note">
          {message}
        </span>
      )}
    </div>
  );
}
function Hero({ navigate }: { navigate: Navigate }) {
  return (
    <section className="lv-hero">
      <div className="lv-container lv-hero-grid">
        <div className="hero-inner lv-hero-copy">
          <span className="lv-eyebrow">
            <span className="lv-signal-dot" /> THE VOICE AGENT TEST LAB
          </span>
          <h1 tabIndex={-1}>
            Confidence.
            <br />
            <span>On the line.</span>
          </h1>
          <p className="lv-hero-description">
            Put your voice agent under pressure.
            <br />
            Keep the evidence. Fix the boundary.
          </p>
          <div className="lv-hero-actions">
            <Link to="/app" navigate={navigate} className="button primary">
              Enter the workspace <ArrowUpRightIcon size={18} />
            </Link>
            <a href="#approach" className="lv-text-link">
              See the workflow <ArrowDownIcon size={17} />
            </a>
          </div>
          <LaunchCommand navigate={navigate} />
        </div>
        <div className="lv-hero-aside" aria-hidden="true">
          <span className="lv-hero-coordinate">
            VOUCH / VOICE AGENT SECURITY
          </span>
          <p>
            Follow the
            <br />
            <span>actual signal.</span>
          </p>
          <span className="lv-hero-coordinate">SCOPE → CAPTURE → REVIEW</span>
        </div>
      </div>
      <div className="lv-container lv-hero-rail">
        <span>
          <LockSimpleIcon size={14} /> Authorized testing
        </span>
        <span>Explicit scope</span>
        <span>Backend evidence</span>
        <span className="lv-rail-end">
          BUILT FOR THE PEOPLE BUILDING AGENTS
        </span>
      </div>
    </section>
  );
}
const steps = [
  {
    number: "01",
    icon: FingerprintIcon,
    title: "Set the boundaries",
    text: "Choose an approved target, a test window and firm call limits.",
  },
  {
    number: "02",
    icon: WaveformIcon,
    title: "Apply a little pressure",
    text: "Run a false-authority case beside a legitimate verified control.",
  },
  {
    number: "03",
    icon: GitBranchIcon,
    title: "Turn proof into a regression",
    text: "Inspect the backend outcome, review the finding and export the case.",
  },
];
function Approach() {
  return (
    <section id="approach" className="lv-container lv-approach lv-reveal">
      <div className="lv-section-heading">
        <span className="lv-eyebrow">01 / THE WORKFLOW</span>
        <h2>
          Less guesswork.
          <br />
          <span>More ground truth.</span>
        </h2>
      </div>
      <div className="lv-steps">
        {steps.map(({ number, icon: Icon, title, text }) => (
          <article className="lv-step" key={number}>
            <span className="lv-step-number">{number}</span>
            <Icon size={25} weight="regular" />
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
            <ArrowUpRightIcon size={18} />
          </article>
        ))}
      </div>
    </section>
  );
}
function Evidence({ navigate }: { navigate: Navigate }) {
  return (
    <section id="evidence" className="lv-evidence">
      <div className="lv-container lv-evidence-grid">
        <div className="lv-evidence-copy lv-reveal">
          <span className="lv-eyebrow">02 / FOLLOW THE ACTION</span>
          <h2>
            A convincing answer
            <br />
            <span>isn’t the final answer.</span>
          </h2>
          <p>
            Trace what the caller asked, what the tool executed and what changed
            in the backend.
          </p>
          <Link to="/app/findings" navigate={navigate} className="lv-text-link">
            Explore findings <ArrowUpRightIcon size={17} />
          </Link>
        </div>
        <div className="lv-evidence-map lv-reveal">
          <span className="lv-eyebrow">THE EVIDENCE CHAIN</span>
          {[
            {
              title: "Conversation",
              text: "What was said",
              icon: WaveformIcon,
            },
            {
              title: "Tool activity",
              text: "What actually executed",
              icon: GitBranchIcon,
            },
            {
              title: "Backend state",
              text: "What the trusted system recorded",
              icon: LockSimpleIcon,
            },
          ].map(({ title, text, icon: Icon }) => (
            <div className="lv-evidence-node" key={title}>
              <Icon size={23} />
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <ArrowDownIcon size={18} />
            </div>
          ))}
          <p className="lv-evidence-boundary">
            Missing evidence stays unknown. A spoken claim never becomes a
            backend fact.
          </p>
        </div>
      </div>
    </section>
  );
}
const questions = [
  {
    q: "What do I need to get started?",
    a: "An authorized target, a configured caller and a trusted evidence connector. Read the setup guide to configure credentials and readiness gates. Your workspace shows only records captured from your connected systems.",
  },
  {
    q: "Are live Bolna calls available?",
    a: "The live PSTN path is implemented for a configured Twilio-backed Bolna caller. Dispatch requires explicit authorization, duration and cancellation controls, confirmed billing limits and signed evidence settings. Your team still needs to verify the account and run voice acceptance tests.",
  },
  {
    q: "What counts as a verified finding?",
    a: "Trusted backend events must establish what executed and whether the policy precondition was met. Vouch reports tool execution and observed state separately. Spoken claims alone are not proof.",
  },
  {
    q: "Who can I test?",
    a: "Only agents you own or have explicit permission to test. Phone registration requires an operator-managed allowlist and an authorization reference.",
  },
];
function Questions() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="questions" className="lv-container lv-questions lv-reveal">
      <div className="lv-section-heading">
        <span className="lv-eyebrow">03 / GOOD QUESTIONS</span>
        <h2>
          A little clarity
          <br />
          <span>before you launch.</span>
        </h2>
      </div>
      <div className="lv-faq-list">
        {questions.map(({ q, a }, index) => (
          <div
            className={`lv-faq ${open === index ? "lv-faq-open" : ""}`}
            key={q}
          >
            <h3>
              <button
                type="button"
                aria-expanded={open === index}
                aria-controls={`landing-answer-${index}`}
                onClick={() => setOpen(open === index ? null : index)}
              >
                {q}
                {open === index ? (
                  <MinusIcon size={18} />
                ) : (
                  <PlusIcon size={18} />
                )}
              </button>
            </h3>
            <div id={`landing-answer-${index}`} hidden={open !== index}>
              <p>{a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function Closing({ navigate }: { navigate: Navigate }) {
  return (
    <section className="lv-container lv-closing lv-reveal">
      <span className="lv-eyebrow">YOUR NEXT GOOD QUESTION STARTS HERE</span>
      <div>
        <h2>
          Build trust.
          <br />
          <span>Bring receipts.</span>
        </h2>
        <div className="lv-closing-actions">
          <Link to="/app" navigate={navigate} className="button primary">
            Open your workspace <ArrowUpRightIcon size={18} />
          </Link>
          <Link
            to="/docs"
            target="_blank"
            rel="noopener noreferrer"
            navigate={navigate}
            className="lv-text-link"
          >
            <BookOpenIcon size={18} /> Read the docs
          </Link>
          <p>Configure your systems. Capture your evidence.</p>
        </div>
      </div>
    </section>
  );
}
function SiteFooter({ navigate }: { navigate: Navigate }) {
  return (
    <footer className="lv-container lv-footer">
      <Brand navigate={navigate} />
      <p>Voice agent testing. Evidence included.</p>
      <nav aria-label="Footer navigation">
        <Link
          to="/docs"
          target="_blank"
          rel="noopener noreferrer"
          navigate={navigate}
        >
          Docs
        </Link>
        <CreditsLink navigate={navigate} size={13} />
      </nav>
      <span>AUTHORIZED TESTING, ALWAYS</span>
    </footer>
  );
}
export function Landing({ navigate }: { navigate: Navigate }) {
  const root = useLandingReveal();
  return (
    <div className="landing landing-v2" ref={root}>
      <a href="#landing-main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader navigate={navigate} />
      <main id="landing-main">
        <Hero navigate={navigate} />
        <Approach />
        <Evidence navigate={navigate} />
        <Questions />
        <Closing navigate={navigate} />
      </main>
      <SiteFooter navigate={navigate} />
    </div>
  );
}
function CreditLinks({
  source,
  children,
}: {
  source: string;
  children: ReactNode;
}) {
  return (
    <div className="lv-credit-links">
      <a href={source} target="_blank" rel="noreferrer">
        Creator and source <ArrowUpRightIcon size={15} />
      </a>
      {children}
    </div>
  );
}
export function Credits({ navigate }: { navigate: Navigate }) {
  useEffect(() => {
    document.title = "Credits and assets | Vouch";
  }, []);
  return (
    <div className="credits-page credits-v2">
      <header className="lv-credits-header">
        <Brand navigate={navigate} />
        <nav aria-label="Credits navigation">
          <Link
            to="/docs"
            target="_blank"
            rel="noopener noreferrer"
            navigate={navigate}
          >
            Docs
          </Link>
          <Link to="/app" navigate={navigate} className="button secondary">
            Workspace <ArrowUpRightIcon size={16} />
          </Link>
        </nav>
      </header>
      <main className="lv-credits-content">
        <span className="lv-eyebrow">THE PEOPLE AND THE DETAILS</span>
        <h1>Credits & assets.</h1>
        <p>
          Original artwork and carefully chosen open-source tools give Vouch its
          character.
        </p>
        <section>
          <span className="lv-credit-number">01</span>
          <div>
            <h2>Original Vouch artwork</h2>
            <p>
              The Vouch symbol and ice-current background were generated for
              this project. They are original decorative assets. Product records
              and interface text remain separate, selectable and accessible.
            </p>
          </div>
        </section>
        <section>
          <span className="lv-credit-number">02</span>
          <div>
            <h2>Phosphor Icons</h2>
            <p>
              Icons by the Phosphor Icons team, distributed under the MIT
              license.
            </p>
            <CreditLinks source="https://github.com/phosphor-icons/react">
              <a href="/licenses/phosphor-MIT.txt">
                Read the license <ArrowUpRightIcon size={15} />
              </a>
            </CreditLinks>
          </div>
        </section>
        <section>
          <span className="lv-credit-number">03</span>
          <div>
            <h2>Geist and Geist Mono</h2>
            <p>
              Typefaces by the Geist Project Authors and Vercel, distributed
              under the SIL Open Font License 1.1. Fonts are self-hosted.
            </p>
            <CreditLinks source="https://github.com/vercel/geist-font">
              <a href="/licenses/geist-OFL.txt">
                Geist license <ArrowUpRightIcon size={15} />
              </a>
              <a href="/licenses/geist-mono-OFL.txt">
                Geist Mono license <ArrowUpRightIcon size={15} />
              </a>
            </CreditLinks>
          </div>
        </section>
        <section>
          <span className="lv-credit-number">04</span>
          <div>
            <h2>OpenCode design reference</h2>
            <p>
              The compact developer-oriented spacing references OpenCode’s
              published design tokens. Vouch’s blue palette, original artwork
              and product flows are independently designed.
            </p>
            <CreditLinks source="https://github.com/anomalyco/opencode/tree/8d083cb64d165b4784e4bddebdd8aad30b3fe50b">
              <a href="/licenses/opencode-MIT.txt">
                Read the MIT license <ArrowUpRightIcon size={15} />
              </a>
            </CreditLinks>
          </div>
        </section>
      </main>
    </div>
  );
}
