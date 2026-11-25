import { A } from "@solidjs/router";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { useAuth } from "~/app/auth";
import { Avatar } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { Card } from "~/ui/Card";
import { CopyButton } from "~/ui/CopyButton";
import { Icon, type IconName } from "~/ui/icons";
import { Pill, type PillTone } from "~/ui/Pill";
import { Ref } from "~/ui/Ref";
import styles from "./landing.module.css";

interface MiniRow {
  msg: string;
  lane: number;
  color: string;
  hash: string;
  age: string;
  merge?: boolean;
}

const MINI_ROWS: readonly MiniRow[] = [
  {
    msg: "Merge feature/ui into default",
    lane: 0,
    color: "var(--accent)",
    hash: "1c7450e1",
    age: "17h",
    merge: true,
  },
  {
    msg: "Add graph view",
    lane: 1,
    color: "var(--green)",
    hash: "0b486fec",
    age: "17h",
  },
  {
    msg: "Refactor repository browser",
    lane: 1,
    color: "var(--green)",
    hash: "628371ad",
    age: "18h",
  },
  {
    msg: "Fix clone command state",
    lane: 0,
    color: "var(--accent)",
    hash: "e0c8db2d",
    age: "18h",
  },
  {
    msg: "Pin reviews to a revision",
    lane: 2,
    color: "var(--purple)",
    hash: "e7930bb0",
    age: "19h",
  },
  {
    msg: "Add bookmarks view",
    lane: 0,
    color: "var(--accent)",
    hash: "b2b5a019",
    age: "1d",
  },
];

type TourKey = "history" | "code" | "reviews" | "access";

interface TourTab {
  key: TourKey;
  title: string;
  lead: string;
  docHref: string;
}

const TOUR_TABS: readonly [TourTab, ...TourTab[]] = [
  {
    key: "history",
    title: "A graph you can trust",
    lead: "Parallel heads get their own lanes, merges read left to right, and hovering any changeset shows its full message, stats and refs.",
    docHref: "/docs/graph",
  },
  {
    key: "code",
    title: "Code at any revision",
    lead: "Switch branch, bookmark or tag from the revision bar. Every link pins the revision, so permalinks never drift.",
    docHref: "/docs/refs",
  },
  {
    key: "reviews",
    title: "Reviews that actually gate merges",
    lead: "Required reviewers, change requests that block, no self-approval, and reviews pinned to the exact revision that was approved.",
    docHref: "/docs/pulls",
  },
  {
    key: "access",
    title: "Access you can explain",
    lead: "Organization roles, per-repository grants and public, internal or private visibility. Every change lands in the audit log.",
    docHref: "/docs/roles",
  },
];

const BUILT_FOR_HG: readonly [string, string][] = [
  [
    "Named branches stay named",
    "Every changeset keeps the branch it was made on, and the graph shows it.",
  ],
  [
    "Bookmarks and phases",
    "Movable pointers and draft/public phases appear where you’d expect.",
  ],
  [
    "Real server-side merges",
    "Approved pull requests merge on the server under Mercurial’s own locks.",
  ],
  [
    "hg-native transport",
    "Clone and push over SSH or HTTPS with wire protocol checks, not hooks alone.",
  ],
  [
    "Short hashes everywhere",
    "Paste any 12-character hash into the revision bar or the command palette.",
  ],
  [
    "Fast history",
    "One hg call per page of history, with stats for every changeset.",
  ],
];

const SECURITY_CHECKS: readonly string[] = [
  "Per-account and per-IP sign-in limits",
  "Tokens scoped to one organization, with expiry",
  "Webhooks signed with HMAC and blocked from private networks",
  "Sessions end after inactivity",
];

const AUDIT_FEED: readonly {
  icon: IconName;
  text: string;
  high: boolean;
  age: string;
}[] = [
  {
    icon: "shield",
    text: "Brxj19 made design-tokens public",
    high: true,
    age: "3w",
  },
  {
    icon: "lock",
    text: "Sign-in paused for akhil@sigma.dev",
    high: true,
    age: "1d",
  },
  {
    icon: "user",
    text: "Tatwa changed Bhuvnesh to write",
    high: false,
    age: "2d",
  },
  {
    icon: "merge",
    text: "Brxj19 merged #4 as 1c7450e1",
    high: false,
    age: "17h",
  },
];

const ACCESS_PREVIEW: readonly {
  name: string;
  role: string;
  tone: PillTone;
}[] = [
  { name: "Rishik Rohan", role: "owner", tone: "purple" },
  { name: "Meera Iyer", role: "admin", tone: "blue" },
  { name: "Priya Sharma", role: "write", tone: "green" },
  { name: "Arjun Nair", role: "read", tone: "neutral" },
];

const FAQS: readonly [string, string][] = [
  [
    "Which Mercurial versions are supported?",
    "RevForge pins Mercurial 7.x on the server. Clients from 6.0 onward can clone and push.",
  ],
  [
    "Can I import from hgweb or Heptapod?",
    "Push any existing repository to an empty RevForge repository. History, branches, bookmarks and tags come across intact.",
  ],
  [
    "Does it support evolve and topics?",
    "Obsolescence markers are stored and served. Topic-aware views are on the roadmap.",
  ],
  [
    "How do backups work?",
    "Back up the Postgres database and the repository volume. The docs have a tested script.",
  ],
  [
    "Is there a hosted version?",
    "Not yet. RevForge is self-hosted so your code stays on your network.",
  ],
];

const SELF_HOST_COPY = [
  "curl -O https://revforge.dev/compose.yml",
  "export REVFORGE_SESSION_SECRET_KEY=$(openssl rand -hex 32)",
  "docker compose up -d",
  "docker compose exec api revforge create-admin you@example.com",
].join("\n");

function MiniGraphPreview() {
  return (
    <div class={styles.shot}>
      <div class={styles.shotHead}>
        <Icon name="graph" size={14} />
        <span>acme / payments-api</span>
        <span class={styles.shotHeadRight}>
          <Ref kind="branch" name="default" />
        </span>
      </div>
      <div class={styles.miniGraph}>
        <For each={MINI_ROWS}>
          {(row) => (
            <div class={styles.miniRow}>
              <span />
              <div class={styles.miniMsg}>
                <span>{row.msg}</span>
                <span class={styles.miniHash}>{row.hash}</span>
              </div>
              <span class={styles.miniAge}>{row.age}</span>
            </div>
          )}
        </For>
        <svg class={styles.miniSvg} width="70" height="264" aria-hidden="true">
          <path d="M20 22V242" stroke="var(--accent)" stroke-width="2" />
          <path
            d="M20 22C20 44 38 40 38 66V110C38 128 20 124 20 154"
            stroke="var(--green)"
            stroke-width="2"
            fill="none"
          />
          <path
            d="M20 154C20 176 56 172 56 198C56 222 20 216 20 242"
            stroke="var(--purple)"
            stroke-width="2"
            fill="none"
          />
          <For each={MINI_ROWS}>
            {(row, idx) => (
              <circle
                cx={20 + row.lane * 18}
                cy={22 + idx() * 44}
                r="5"
                fill={row.merge ? "var(--bg)" : row.color}
                stroke={row.color}
                stroke-width="2"
              />
            )}
          </For>
        </svg>
      </div>
    </div>
  );
}

function CodePreview() {
  return (
    <div class={styles.shot}>
      <div class={styles.rail}>
        <span class={styles.railPart}>
          <Icon name="branch" size={13} />
          default
        </span>
        <span class={`${styles.railPart} ${styles.railRev}`}>@ 1c7450e1</span>
        <span class={styles.railPath}>
          payments-api / <strong>ledger.go</strong>
        </span>
      </div>
      <div class={styles.codePreview}>
        <table>
          <tbody>
            <tr>
              <td class={styles.codeLn}>1</td>
              <td>
                <span class={styles.tokKw}>package</span> ledger
              </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>2</td>
              <td> </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>3</td>
              <td>
                <span class={styles.tokCom}>
                  {"// Post records a balanced entry."}
                </span>
              </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>4</td>
              <td>
                <span class={styles.tokKw}>func</span> Post(e Entry) error {"{"}
              </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>5</td>
              <td>
                {"    "}
                <span class={styles.tokKw}>if</span> e.Debit != e.Credit {"{"}
              </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>6</td>
              <td>
                {"        "}
                <span class={styles.tokKw}>return</span> ErrUnbalanced
              </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>7</td>
              <td>{"    }"}</td>
            </tr>
            <tr>
              <td class={styles.codeLn}>8</td>
              <td>
                {"    "}
                <span class={styles.tokKw}>return</span> store.Append(e)
              </td>
            </tr>
            <tr>
              <td class={styles.codeLn}>9</td>
              <td>{"}"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewsPreview() {
  const checks = [
    "No outstanding change requests",
    "2 of 2 required reviewers approved",
    "No conflicts with default",
  ];
  return (
    <div class={styles.shot}>
      <div class={styles.gate}>
        <For each={checks}>
          {(label) => (
            <div class={styles.gateRow}>
              <span class={styles.gateOk}>
                <Icon name="check" size={16} />
              </span>
              <span>{label}</span>
            </div>
          )}
        </For>
      </div>
      <div class={styles.gateFoot}>
        <Button variant="primary" class={styles.mergeBtn} tabindex={-1}>
          <Icon name="merge" size={14} />
          Merge
        </Button>
      </div>
    </div>
  );
}

function AccessPreview() {
  return (
    <div class={styles.shot}>
      <For each={ACCESS_PREVIEW}>
        {(person) => (
          <div class={styles.accessRow}>
            <Avatar name={person.name} size={26} decorative />
            <span class={styles.accessName}>{person.name}</span>
            <Pill tone={person.tone}>{person.role}</Pill>
          </div>
        )}
      </For>
    </div>
  );
}

export default function LandingPage() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = createSignal<TourKey>("history");

  const currentTab = () =>
    TOUR_TABS.find((t) => t.key === activeTab()) ?? TOUR_TABS[0];

  const scrollTo = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth" });
  };

  const onTabKeyDown = (e: KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TOUR_TABS.length;
    else if (e.key === "ArrowLeft")
      nextIdx = (idx - 1 + TOUR_TABS.length) % TOUR_TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TOUR_TABS.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const target = TOUR_TABS[nextIdx];
    if (!target) return;
    setActiveTab(target.key);
    document.getElementById(`tour-tab-${target.key}`)?.focus();
  };

  return (
    <div class={styles.lnd}>
      <header class={styles.nav}>
        <div class={`${styles.inner} ${styles.navInner}`}>
          <A href="/welcome" class={styles.brand}>
            <Icon name="logo" size={20} />
            <span>RevForge</span>
          </A>
          <nav class={styles.navLinks} aria-label="Landing navigation">
            <a href="#lnd-tour" onClick={scrollTo("lnd-tour")}>
              Product
            </a>
            <a href="#lnd-sec" onClick={scrollTo("lnd-sec")}>
              Security
            </a>
            <a href="#lnd-host" onClick={scrollTo("lnd-host")}>
              Self-host
            </a>
            <A href="/docs">Docs</A>
            <A href="/explore">Explore</A>
          </nav>
          <div class={styles.navActions}>
            <Show
              when={auth.status() === "authenticated"}
              fallback={
                <>
                  <ButtonLink href="/login" variant="ghost">
                    Sign in
                  </ButtonLink>
                  <ButtonLink href="/register" variant="primary">
                    Get started
                  </ButtonLink>
                </>
              }
            >
              <ButtonLink href="/" variant="primary">
                Open RevForge
              </ButtonLink>
            </Show>
          </div>
        </div>
      </header>

      <div class={styles.inner}>
        <section class={styles.hero}>
          <div class={`${styles.grid} ${styles.heroGrid}`}>
            <div>
              <Pill tone="blue" class={styles.heroPill}>
                <Icon name="zap" size={12} />
                Mercurial 6.x and 7.x
              </Pill>
              <h1 class={styles.heroTitle}>
                The forge for teams that chose Mercurial.
              </h1>
              <p class={styles.heroLead}>
                Host repositories on your own servers, browse history the way hg
                models it, and review changes with merge rules that actually
                hold.
              </p>
              <div class={styles.heroCtas}>
                <ButtonLink
                  href="#lnd-host"
                  variant="primary"
                  size="lg"
                  onClick={scrollTo("lnd-host")}
                >
                  Install in 5 minutes
                </ButtonLink>
                <ButtonLink href="/explore" size="lg">
                  See a live repository
                </ButtonLink>
              </div>
              <div class={styles.heroChecks}>
                <span>
                  <Icon name="check" size={13} />
                  Open source
                </span>
                <span>
                  <Icon name="check" size={13} />
                  SSH and HTTPS
                </span>
                <span>
                  <Icon name="check" size={13} />
                  No data leaves your network
                </span>
              </div>
            </div>
            <MiniGraphPreview />
          </div>
        </section>

        <section id="lnd-tour" class={styles.section}>
          <div class={styles.kick}>Product</div>
          <h2 class={styles.sh}>Everything in one quiet interface.</h2>
          <p class="lead">
            Built around how Mercurial works: named branches, bookmarks, phases
            and tags stay what they are.
          </p>
          <div class={styles.tourTabs} role="tablist" aria-label="Product tour">
            <For each={TOUR_TABS}>
              {(tab, idx) => (
                <button
                  type="button"
                  id={`tour-tab-${tab.key}`}
                  role="tab"
                  aria-selected={activeTab() === tab.key}
                  aria-controls={`tour-panel-${tab.key}`}
                  tabindex={activeTab() === tab.key ? 0 : -1}
                  class={styles.tourTab}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(e) => onTabKeyDown(e, idx())}
                >
                  {tab.title}
                </button>
              )}
            </For>
          </div>
          <div
            id={`tour-panel-${currentTab().key}`}
            role="tabpanel"
            aria-labelledby={`tour-tab-${currentTab().key}`}
            class={`${styles.grid} ${styles.tourGrid}`}
          >
            <div>
              <h3 class={styles.tourTitle}>{currentTab().title}</h3>
              <p class="lead">{currentTab().lead}</p>
              <A href={currentTab().docHref} class={`link ${styles.tourLink}`}>
                Read how it works →
              </A>
            </div>
            <Switch>
              <Match when={activeTab() === "history"}>
                <MiniGraphPreview />
              </Match>
              <Match when={activeTab() === "code"}>
                <CodePreview />
              </Match>
              <Match when={activeTab() === "reviews"}>
                <ReviewsPreview />
              </Match>
              <Match when={activeTab() === "access"}>
                <AccessPreview />
              </Match>
            </Switch>
          </div>
        </section>

        <section class={styles.section}>
          <div class={styles.kick}>Built for hg</div>
          <h2 class={styles.sh}>Not git with the labels changed.</h2>
          <div class={styles.feat}>
            <For each={BUILT_FOR_HG}>
              {([heading, body]) => (
                <div class={styles.featItem}>
                  <h3>{heading}</h3>
                  <p>{body}</p>
                </div>
              )}
            </For>
          </div>
        </section>

        <section id="lnd-sec" class={styles.section}>
          <div class={`${styles.grid} ${styles.secGrid}`}>
            <div>
              <div class={styles.kick}>Security</div>
              <h2 class={styles.sh}>Designed to be audited.</h2>
              <p class="lead">
                Every access change, merge and sign-in attempt is an immutable
                audit event. Platform admins get break-glass access that owners
                can see.
              </p>
              <div class={styles.secChecks}>
                <For each={SECURITY_CHECKS}>
                  {(line) => (
                    <span class={styles.secCheck}>
                      <Icon
                        name="check"
                        size={15}
                        class={styles.secCheckIcon}
                      />
                      {line}
                    </span>
                  )}
                </For>
              </div>
            </div>
            <div class={styles.shot}>
              <For each={AUDIT_FEED}>
                {(item) => (
                  <div class={styles.feedRow}>
                    <span
                      class={
                        item.high
                          ? `${styles.feedIcon} ${styles.feedIconHigh}`
                          : styles.feedIcon
                      }
                    >
                      <Icon name={item.icon} size={14} />
                    </span>
                    <span>{item.text}</span>
                    <span class={styles.feedAge}>{item.age}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </section>

        <section id="lnd-host" class={styles.section}>
          <div class={styles.kick}>Self-host</div>
          <h2 class={styles.sh}>Running in five minutes.</h2>
          <p class="lead">
            One compose file brings up the API, web app, SSH gateway, worker and
            Postgres.
          </p>
          <div class={`${styles.grid} ${styles.hostGrid}`}>
            <ol class={styles.steps}>
              <li>Download the compose file</li>
              <li>Set two secrets and your hostname</li>
              <li>Start it and create the first admin</li>
              <li>Clone over SSH or HTTPS</li>
            </ol>
            <Card class={styles.term}>
              <div>
                <span class={styles.termPrompt}>$ </span>
                curl -O https://revforge.dev/compose.yml
              </div>
              <div>
                <span class={styles.termPrompt}>$ </span>
                export REVFORGE_SESSION_SECRET_KEY=$(openssl rand -hex 32)
              </div>
              <div>
                <span class={styles.termPrompt}>$ </span>
                docker compose up -d
              </div>
              <div>
                <span class={styles.termPrompt}>$ </span>
                docker compose exec api revforge create-admin you@example.com
              </div>
              <div class={styles.termOk}>
                ✓ RevForge is running at https://forge.example.com
              </div>
              <span class={styles.termCopy}>
                <CopyButton
                  text={SELF_HOST_COPY}
                  label="Copy self-host commands"
                />
              </span>
            </Card>
          </div>
        </section>

        <section class={styles.section}>
          <div class={styles.kick}>FAQ</div>
          <h2 class={styles.sh}>Questions</h2>
          <div class={styles.faqList}>
            <For each={FAQS}>
              {([question, answer]) => (
                <details class={styles.faqItem}>
                  <summary class={styles.faqSummary}>
                    <span>{question}</span>
                    <Icon name="chev" size={16} class={styles.faqChev} />
                  </summary>
                  <p class={styles.faqAnswer}>{answer}</p>
                </details>
              )}
            </For>
          </div>
        </section>

        <section class={styles.ctaSection}>
          <h2 class={styles.sh}>Give your hg history a proper home.</h2>
          <div class={styles.ctaButtons}>
            <ButtonLink href="/register" variant="primary" size="lg">
              Get started
            </ButtonLink>
            <ButtonLink href="/docs" size="lg">
              Read the docs
            </ButtonLink>
          </div>
        </section>

        <footer class={styles.foot}>
          <div>
            <span class={styles.brand}>
              <Icon name="logo" size={18} />
              <span>RevForge</span>
            </span>
            <p class={styles.footBlurb}>
              Mercurial-native repository hosting for teams that care about
              revision history.
            </p>
          </div>
          <div class={styles.footCol}>
            <h4>Product</h4>
            <A href="/explore">Explore</A>
            <A href="/docs/pulls">Pull requests</A>
            <A href="/docs/security">Security</A>
            <A href="/docs/intro">Overview</A>
          </div>
          <div class={styles.footCol}>
            <h4>Docs</h4>
            <A href="/docs/quickstart">Quick start</A>
            <A href="/docs/ssh">SSH keys</A>
            <A href="/docs/webhooks">Webhooks</A>
            <A href="/docs/api">REST API</A>
          </div>
          <div class={styles.footCol}>
            <h4>Account</h4>
            <A href="/login">Sign in</A>
            <A href="/register">Create account</A>
            <A href="/docs/config">Configuration</A>
            <A href="/docs/trouble">Troubleshooting</A>
          </div>
        </footer>
      </div>
    </div>
  );
}
