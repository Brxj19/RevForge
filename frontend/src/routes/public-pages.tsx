import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Surface } from "../components/ui/surface";

const landingBackdropStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(5, 8, 13, 0.82) 0%, rgba(5, 8, 13, 0.6) 38%, rgba(5, 8, 13, 0.9) 100%), url('/revforge-landing-bg-vector-traced-accurate.svg')",
  backgroundPosition: "center top",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% auto",
};

function ShellBackdrop({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-canvas text-text-primary"
      style={landingBackdropStyle}
    >
      <div className="absolute inset-0 bg-black/12" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.5 3.5L5 7l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={clsx(
        "block object-contain",
        size === "sm" && "h-8 w-8",
        size === "md" && "h-11 w-11",
        size === "lg" && "h-14 w-14",
        className,
      )}
      src="/revforge-logo.png"
    />
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-text-primary md:text-3xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary md:text-base">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Surface className="grid gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <Badge variant="default">Feature</Badge>
      </div>
      <p className="text-sm leading-6 text-text-secondary">{description}</p>
    </Surface>
  );
}

const featureCards = [
  {
    title: "Mercurial-native changesets",
    description:
      "Keep revisions, bookmarks, branches, and tags in the vocabulary of Mercurial instead of flattening history into generic commits.",
  },
  {
    title: "Repository code browsing",
    description:
      "Read files, inspect history, and move through paths without losing context or hiding state behind broad dashboards.",
  },
  {
    title: "Graph and history visibility",
    description:
      "Surface revision lines, changeset summaries, and branch structure so teams can trace work with confidence.",
  },
  {
    title: "Clone and access workflows",
    description:
      "Guide HTTPS and SSH clone flows, tokens, and key management with explicit actions and clear labels.",
  },
  {
    title: "Self-hosted control",
    description:
      "Present permissions, repository readiness, and operational state in a way that supports on-premise teams.",
  },
  {
    title: "Audit-ready operations",
    description:
      "Keep changes, access, and repository actions visible enough for review and troubleshooting without cluttering the interface.",
  },
];

const workflowRows = [
  {
    title: "1. Clone",
    detail: "Use SSH or HTTPS with explicit credentials and stable URLs.",
    delta: "hg clone ssh://revforge/acme/payments-api",
  },
  {
    title: "2. Inspect",
    detail: "Read changesets, branches, and file history from one place.",
    delta: "hg log --graph --limit 5",
  },
  {
    title: "3. Push",
    detail: "Share changes through Mercurial-native transport and policy.",
    delta: "hg push",
  },
];

const landingHeadline =
  "A focused repository forge for browsing changesets, managing access, and understanding revision history with clarity.";

function TypingHeadline({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setDisplayText(text);
      return undefined;
    }

    setDisplayText("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayText(text.slice(0, index));

      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 35);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <span className="block whitespace-normal">
      <span aria-live="polite">{displayText}</span>
      <span
        aria-hidden="true"
        className="ml-1 inline-block h-[1em] w-[2px] animate-pulse bg-text-primary align-[-0.08em]"
      />
    </span>
  );
}

export function LandingPage() {
  return (
    <ShellBackdrop>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-canvas/96 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link className="flex items-center gap-3" to="/">
            <LogoMark size="sm" />
            <span className="flex flex-col">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
                RevForge
              </span>
              <span className="text-xs text-text-secondary">
                Mercurial forge
              </span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-5 text-sm text-text-secondary md:flex">
            <a className="hover:text-text-primary" href="#workflow">
              Workflow
            </a>
            <a className="hover:text-text-primary" href="#features">
              Features
            </a>
            <a className="hover:text-text-primary" href="#security">
              Security
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link to="/login">
              <Button size="sm" variant="ghost">
                Sign in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-4 pb-16 pt-24 md:pt-28">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <LogoMark size="lg" />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Self-hosted Mercurial forge
                </p>
                <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-text-primary">
                  RevForge
                </p>
              </div>
            </div>

            <div className="max-w-2xl space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-accent">
                Mercurial hosting, code review, and repository operations.
              </p>
              <h1
                aria-label={landingHeadline}
                className="relative max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-text-primary md:text-5xl"
              >
                <span aria-hidden="true" className="invisible block">
                  {landingHeadline}
                </span>
                <span className="absolute inset-0">
                  <TypingHeadline text={landingHeadline} />
                </span>
              </h1>
              <p className="max-w-xl text-sm leading-7 text-text-secondary md:text-base">
                RevForge keeps revision history, code browsing, and transport
                workflows in one calm, dark interface built for teams that want
                Mercurial to stay precise.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/register">
                <Button>Get started</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
            </div>

            <Surface className="max-w-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
                    Quick command flow
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Terminal-oriented workflows stay visible.
                  </p>
                </div>
                <Badge variant="info">Mercurial</Badge>
              </div>
              <pre className="mt-4 overflow-x-auto font-mono text-sm leading-7 text-text-primary">
                {`hg clone ssh://revforge/acme/payments-api
hg log --graph --limit 5
hg push`}
              </pre>
            </Surface>
          </div>

          <Surface className="overflow-hidden border border-border bg-surface p-0">
            <div className="border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
                    Repository workflow preview
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-text-primary">
                    acme / payments-api
                  </h3>
                </div>
                <Badge variant="primary">Preview</Badge>
              </div>
            </div>
            <div className="border-b border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Code | History | Graph | Branches | Bookmarks | Tags
            </div>
            <pre className="overflow-x-auto px-4 py-5 font-mono text-sm leading-7 text-text-primary">
              {`●──╮ Add graph view                   +340 -120
│  ● Refactor repository browser       +80  -22
╰──● Fix clone command state           +12   -4

default@a18f3cd · write access · ready
branches: default · feature/ui · hotfix/edge`}
            </pre>
          </Surface>
        </section>

        <section
          id="workflow"
          className="grid gap-6 border-y border-border py-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]"
        >
          <SectionHeading
            eyebrow="Workflow"
            title="Repository flow that stays readable from clone to push."
            description="The interface keeps the revision path, file tree, and transport actions close together so people can move through a Mercurial repository without losing context."
          />
          <div className="grid gap-3">
            {workflowRows.map((row) => (
              <Surface
                key={row.title}
                className="flex flex-col gap-3 border border-border bg-surface p-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {row.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    {row.detail}
                  </p>
                </div>
                <code className="rounded-sm border border-border bg-canvas px-3 py-2 font-mono text-xs text-text-primary">
                  {row.delta}
                </code>
              </Surface>
            ))}
          </div>
        </section>

        <section id="features" className="grid gap-6">
          <SectionHeading
            eyebrow="Features"
            title="A small, deliberate set of capabilities."
            description="RevForge emphasizes repository work, not marketing-style panels, so the important functions stay easy to scan."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature) => (
              <FeatureCard
                key={feature.title}
                description={feature.description}
                title={feature.title}
              />
            ))}
          </div>
        </section>

        <section
          id="security"
          className="grid gap-6 border-y border-border py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
        >
          <SectionHeading
            eyebrow="Security"
            title="Designed for self-hosted teams and controlled access."
            description="Public entry points stay simple, while repository actions, credentials, and audit concerns remain explicit in the product."
          />
          <div className="grid gap-3">
            {[
              "Repository URLs, clone commands, and permissions stay visible and copyable.",
              "Authentication flows stay focused on local credentials and team-managed access.",
              "Operational state is presented with the same dark, precise styling as the rest of the forge.",
            ].map((item) => (
              <Surface
                key={item}
                className="border border-border bg-surface p-4"
              >
                <p className="text-sm leading-6 text-text-secondary">{item}</p>
              </Surface>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <Surface className="grid gap-4 border border-border bg-surface p-5 md:p-6">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
                Get started
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-text-primary md:text-3xl">
                Start using RevForge.
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary md:text-base">
                Browse repositories, inspect changesets, and manage Mercurial
                workflows from one focused interface.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/register">
                <Button>Create account</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
            </div>
          </Surface>
        </section>

        <footer className="flex flex-col gap-2 border-t border-border pt-4 text-xs text-text-muted md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <LogoMark size="sm" />
            <span>RevForge</span>
          </div>
          <p>
            Mercurial-native repository hosting for teams that care about
            revision history.
          </p>
        </footer>
      </main>
    </ShellBackdrop>
  );
}

interface AuthPageLayoutProps {
  children: ReactNode;
  description: string;
  mode: "login" | "register";
  panelTitle: string;
  title: string;
}

export function AuthPageLayout({
  children,
  description,
  mode,
  panelTitle,
  title,
}: AuthPageLayoutProps) {
  const bullets =
    mode === "login"
      ? [
          "Reach organizations, repositories, and change history from one workspace.",
          "Keep clone commands, tokens, and SSH setup in clear sight.",
          "Continue into the same dark developer shell used across RevForge.",
        ]
      : [
          "Create a local account that fits self-hosted deployments.",
          "Keep repository access and revision history organized from the start.",
          "Use the same calm, dark interface without changing the app theme.",
        ];

  return (
    <ShellBackdrop>
      <header className="sticky top-0 z-50 border-b border-border bg-canvas/96 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <BackIcon />
            Back
          </Link>
          <Link className="flex items-center gap-3" to="/">
            <LogoMark size="sm" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
              RevForge
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:py-10">
        <section className="order-2 grid gap-5 lg:order-1">
          <div className="flex items-center gap-3">
            <LogoMark size="lg" />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
                RevForge
              </p>
              <h1 className="mt-1 text-lg font-semibold text-text-primary">
                {mode === "login"
                  ? "Sign in to your repository forge"
                  : "Create your RevForge account"}
              </h1>
            </div>
          </div>
          <div className="max-w-xl space-y-4">
            <p className="text-2xl font-semibold tracking-[-0.03em] text-text-primary md:text-4xl">
              {title}
            </p>
            <p className="text-sm leading-7 text-text-secondary md:text-base">
              {description}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {bullets.map((bullet) => (
              <Surface
                key={bullet}
                className="border border-border bg-surface p-4"
              >
                <p className="text-sm leading-6 text-text-secondary">
                  {bullet}
                </p>
              </Surface>
            ))}
          </div>
        </section>

        <Surface className="order-1 grid gap-5 border border-border bg-surface p-5 lg:order-2 lg:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="info">
                  {mode === "login" ? "Sign in" : "Register"}
                </Badge>
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Secure access
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-text-primary">
                {panelTitle}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {mode === "login"
                  ? "Use your RevForge identity to reach repositories, changesets, and team workflows."
                  : "Create a local account for your RevForge workspace and keep repository access explicit."}
              </p>
            </div>
          </div>
          {children}
        </Surface>
      </main>
    </ShellBackdrop>
  );
}
