// Spot illustrations for empty, status and error states (DESIGN.md §4), ported verbatim from the
// prototype (GLY, IL, ART). 200×140 canvas drawn from a small set of primitives; colours come from
// CSS classes in illustration.css so the accent follows the user's Appearance setting.
// All markup is built from the static data below — never from user or repository content.

export type IllustrationCategory =
  "First run" | "No results" | "Selection" | "Status" | "Errors";

export interface ArtSpec {
  cat: IllustrationCategory;
  title: string;
  body: string;
  /** Suggested actions, for the illustration kit. */
  acts: readonly string[];
  /** Where it is used, for the illustration kit. */
  used: string;
  draw: () => string;
}

export const GLY = {
  plus: "M-1 0H1M0-1V1",
  minus: "M-1 0H1",
  check: "M-1 .05L-.3.75L1-.7",
  x: "M-.75-.75L.75.75M.75-.75L-.75.75",
  bang: "M0-1V.35",
  q: "M-.62-.42A.64.64 0 1 1 .3.16C.06.3 0 .4 0 .52",
  up: "M0 1V-1M-.75-.3L0-1L.75-.3",
  down: "M0-1V1M-.75.3L0 1L.75.3",
  clock: "M0-.55V0L.45.3M.98 0A.98.98 0 1 1-.98 0A.98.98 0 1 1 .98 0",
  lock: "M-.7-.05H.7V.95H-.7ZM-.42-.05V-.42A.42.42 0 0 1 .42-.42V-.05",
  search: "M.25.25L.95.95M.55-.2A.75.75 0 1 1-.95-.2A.75.75 0 1 1 .55-.2",
  link: "M-.2.2L.2-.2M-.05-.55L.2-.8A.5.5 0 0 1 .8-.2L.55.05M.05.55L-.2.8A.5.5 0 0 1-.8.2L-.55-.05",
} as const;

export type Glyph = keyof typeof GLY;
type Num = number | undefined;

export const IL = {
  glow: (x: number, y: number, r: number) =>
    `<circle class="gl" cx="${x}" cy="${y}" r="${r}"/>`,
  floor: (x: number, y: number, rx: number) =>
    `<ellipse class="fl" cx="${x}" cy="${y}" rx="${rx}" ry="${(rx * 0.14).toFixed(1)}"/>`,
  win: (x: number, y: number, w: number, h: number, c = "pn") =>
    `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/><path class="hr" d="M${x} ${y + 14}H${x + w}"/>${[9, 15, 21].map((d) => `<circle class="dt" cx="${x + d}" cy="${y + 7}" r="1.8"/>`).join("")}`,
  bars: (x: number, y: number, ws: readonly Num[], c = "ln", gap = 9, h = 4) =>
    ws
      .map((w, i) =>
        w
          ? `<rect class="${c}" x="${x}" y="${y + i * gap}" width="${w}" height="${h}" rx="2"/>`
          : "",
      )
      .join(""),
  badge: (x: number, y: number, r: number, g: Glyph, c = "ac") =>
    `<circle class="${c} halo" cx="${x}" cy="${y}" r="${r + 5}"/><circle class="${c}" cx="${x}" cy="${y}" r="${r}"/><g transform="translate(${x} ${y}) scale(${(r * 0.42).toFixed(2)})"><path class="gly" d="${GLY[g]}"/>${g === "bang" || g === "q" ? '<circle class="glyd" cx="0" cy=".95" r=".2"/>' : ""}</g>`,
  spark: (x: number, y: number, s = 5, c = "acs") =>
    `<path class="${c} spk" d="M${x} ${y - s}V${y + s}M${x - s} ${y}H${x + s}"/>`,
  person: (x: number, y: number, c = "pn2", s = 1) =>
    `<circle class="${c}" cx="${x}" cy="${y - 9 * s}" r="${7 * s}"/><path class="${c}" d="M${x - 13 * s} ${y + 13 * s}a${13 * s} ${11 * s} 0 0 1 ${26 * s} 0z"/>`,
  node: (x: number, y: number, r = 4.5, c = "ac") =>
    `<circle class="${c}" cx="${x}" cy="${y}" r="${r}"/>`,
  ring: (x: number, y: number, r = 4.5, c = "acs") =>
    `<circle class="${c} bgk" cx="${x}" cy="${y}" r="${r}"/>`,
  cursor: (x: number, y: number) =>
    `<path class="cur" d="M${x} ${y}l0 18l5-4.5l3.5 7.5l3-1.4l-3.5-7.3l6.5-.3z"/>`,
  doc: (x: number, y: number, w: number, h: number, c = "pn") =>
    `<path class="${c}" d="M${x + 4} ${y}H${x + w - 12}L${x + w} ${y + 12}V${y + h - 4}a4 4 0 0 1-4 4H${x + 4}a4 4 0 0 1-4-4V${y + 4}a4 4 0 0 1 4-4z"/><path class="fold" d="M${x + w - 12} ${y}V${y + 8}a4 4 0 0 0 4 4H${x + w}"/>`,
  rack: (
    x: number,
    y: number,
    w: number,
    h: number,
    leds: readonly string[],
    c = "pn2",
  ) =>
    `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>${leds.map((l, i) => `<circle class="${l}" cx="${x + 10 + i * 7}" cy="${y + h / 2}" r="2.2"/>`).join("")}<rect class="ln" x="${x + w - 34}" y="${y + h / 2 - 2}" width="24" height="4" rx="2"/>`,
};

export const ART = {
  "no-repos": {
    cat: "First run",
    title: "No repositories yet",
    body: "Create a repository, then push your first changeset to it.",
    acts: ["New repository", "Read the guide"],
    used: "Home, Repositories, Organization overview",
    draw: () =>
      IL.glow(100, 68, 62) +
      IL.floor(100, 124, 64) +
      IL.win(40, 24, 116, 90) +
      IL.bars(52, 48, [48, 30]) +
      `<rect class="dsf" x="52" y="68" width="92" height="34" rx="5"/><path class="ds" d="M68 74V96"/>` +
      IL.ring(68, 76, 3.5, "ds bgk") +
      IL.ring(68, 94, 3.5, "ds bgk") +
      IL.bars(82, 76, [44, 28], "ln2", 9) +
      IL.badge(152, 28, 12, "plus") +
      IL.spark(28, 46, 5) +
      IL.spark(172, 98, 4),
  },
  "no-orgs": {
    cat: "First run",
    title: "No organizations yet",
    body: "Organizations hold repositories, members and settings. Create one to get started.",
    acts: ["Create organization"],
    used: "Organizations",
    draw: () =>
      IL.glow(100, 68, 60) +
      IL.floor(100, 124, 70) +
      `<rect class="pn" x="70" y="30" width="60" height="88" rx="7"/><rect class="ac" x="82" y="42" width="16" height="16" rx="4"/>` +
      [0, 1, 2]
        .map((r) =>
          [0, 1, 2]
            .map(
              (c) =>
                `<rect class="ln${(r + c) % 2 ? "2" : ""}" x="${82 + c * 13}" y="${68 + r * 13}" width="9" height="8" rx="2"/>`,
            )
            .join(""),
        )
        .join("") +
      IL.person(46, 92, "dsf", 0.85) +
      IL.person(154, 92, "dsf", 0.85) +
      IL.badge(132, 32, 11, "plus") +
      IL.spark(30, 52, 4),
  },
  "empty-repo": {
    cat: "First run",
    title: "No changesets yet",
    body: "This repository is ready. Push from your machine and history appears here.",
    acts: ["Copy clone command"],
    used: "Repository overview, Code, History",
    draw: () =>
      IL.glow(96, 68, 60) +
      IL.floor(100, 124, 70) +
      IL.win(26, 28, 118, 84, "pn") +
      `<rect class="term" x="27" y="43" width="116" height="68" rx="0"/>` +
      `<rect class="ac" x="36" y="54" width="5" height="4" rx="1"/>` +
      IL.bars(46, 54, [56]) +
      `<rect class="ac" x="36" y="66" width="5" height="4" rx="1"/>` +
      IL.bars(46, 66, [38], "ln2") +
      `<rect class="ac" x="36" y="78" width="5" height="4" rx="1"/><rect class="ac" x="46" y="76" width="6" height="9" rx="1"/>` +
      `<path class="ds" d="M168 52V96"/>` +
      IL.node(168, 100, 5) +
      `<circle class="dsf" cx="168" cy="44" r="8"/>` +
      IL.badge(168, 44, 8, "up") +
      IL.spark(186, 74, 4),
  },
  "empty-folder": {
    cat: "First run",
    title: "This folder is empty",
    body: "Empty folders aren’t tracked by Mercurial, so this one only appears while a file is being added.",
    acts: ["Go up a level"],
    used: "Code (folder view)",
    draw: () =>
      IL.glow(100, 66, 58) +
      IL.floor(100, 124, 66) +
      `<path class="pn2" d="M50 42h28l6 7h62a4 4 0 0 1 4 4v58a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4z"/>` +
      `<rect class="dsf" x="74" y="22" width="30" height="40" rx="3" transform="rotate(-8 89 42)"/><rect class="dsf" x="96" y="26" width="30" height="40" rx="3" transform="rotate(7 111 46)"/>` +
      `<path class="pn" d="M42 66h116l-8 46a4 4 0 0 1-4 3H54a4 4 0 0 1-4-3z"/><rect class="ac" x="88" y="84" width="24" height="5" rx="2.5"/>` +
      IL.spark(34, 40, 4) +
      IL.spark(166, 46, 5),
  },
  "no-ssh-keys": {
    cat: "First run",
    title: "No SSH keys yet",
    body: "Add your public key to clone and push over SSH without typing a password.",
    acts: ["Add SSH key", "How to create a key"],
    used: "Your settings › SSH keys",
    draw: () =>
      IL.glow(108, 68, 60) +
      IL.floor(100, 124, 70) +
      IL.win(24, 34, 104, 74) +
      `<rect class="term" x="25" y="49" width="102" height="58"/>` +
      IL.bars(34, 58, [18, 0, 0], "ac") +
      IL.bars(56, 58, [60, 0, 0]) +
      IL.bars(34, 70, [78, 52, 64], "ln2", 10) +
      `<g transform="translate(148 60) rotate(38)"><circle class="ac" r="17"/><circle class="bgk" r="6"/><rect class="ac" x="12" y="-4" width="40" height="8" rx="2"/><rect class="ac" x="38" y="3" width="6" height="9" rx="1.5"/><rect class="ac" x="46" y="3" width="5" height="6" rx="1.5"/></g>` +
      IL.spark(172, 34, 5) +
      IL.spark(132, 112, 4),
  },
  "no-tokens": {
    cat: "First run",
    title: "No access tokens yet",
    body: "Create a token to clone, pull or push over HTTPS. Use it as the password when Mercurial asks.",
    acts: ["Create token"],
    used: "Your settings › Access tokens",
    draw: () =>
      IL.glow(100, 66, 60) +
      IL.floor(100, 124, 64) +
      `<rect class="dsf" x="58" y="26" width="104" height="66" rx="9"/><rect class="pn2" x="42" y="38" width="108" height="70" rx="9"/>` +
      `<rect class="acf" x="54" y="52" width="20" height="15" rx="3"/><path class="acs" d="M54 59.5h20M64 52v15" style="stroke-width:1"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7]
        .map(
          (i) => `<circle class="ln2" cx="${58 + i * 9}" cy="${82}" r="2.6"/>`,
        )
        .join("") +
      IL.bars(54, 94, [44]) +
      IL.badge(150, 40, 12, "lock") +
      IL.spark(30, 64, 4),
  },
  "no-webhooks": {
    cat: "First run",
    title: "No webhooks yet",
    body: "Send push and tag events to CI or chat. RevForge retries failed deliveries for 24 hours.",
    acts: ["Add webhook"],
    used: "Repository settings › Webhooks",
    draw: () =>
      IL.glow(100, 70, 62) +
      IL.floor(100, 124, 74) +
      `<rect class="pn" x="24" y="46" width="52" height="48" rx="8"/><path class="acs" d="M40 60V80"/>` +
      IL.node(40, 60, 3.5) +
      IL.node(40, 80, 3.5) +
      `<path class="acs" d="M40 68c0 4 12 2 12 8"/>` +
      IL.node(52, 78, 3) +
      `<rect class="dsf" x="124" y="46" width="52" height="48" rx="8"/>` +
      IL.bars(136, 60, [28, 20, 24], "ln", 8) +
      `<path class="acs" d="M76 70H92"/><rect class="ac" x="92" y="62" width="12" height="16" rx="3"/><path class="acs" d="M104 66h6M104 74h6"/><path class="ds" d="M114 70H124"/>` +
      IL.spark(118, 52, 4) +
      IL.spark(98, 96, 3),
  },
  "no-deliveries": {
    cat: "First run",
    title: "No deliveries yet",
    body: "Deliveries show up here after this webhook’s first event fires.",
    acts: ["Send a test event"],
    used: "Webhook detail",
    draw: () =>
      IL.glow(100, 68, 58) +
      IL.floor(100, 124, 74) +
      `<path class="st" d="M24 94H176"/>` +
      [40, 76, 112]
        .map(
          (x) =>
            `<rect class="dsf" x="${x}" y="${72}" width="24" height="22" rx="4"/><path class="ds" d="M${x + 5} ${78}l7 5l7-5"/>`,
        )
        .join("") +
      `<path class="acs" d="M150 94l8-6m-8 6l8 6"/>` +
      IL.badge(150, 50, 12, "clock") +
      IL.spark(34, 54, 4),
  },
  "no-members": {
    cat: "First run",
    title: "It’s just you here",
    body: "Invite teammates and choose what each of them can see and change.",
    acts: ["Invite member"],
    used: "Organization › Members",
    draw: () =>
      IL.glow(100, 64, 58) +
      IL.floor(100, 124, 70) +
      IL.person(60, 92, "dsf", 0.8) +
      IL.person(140, 92, "dsf", 0.8) +
      `<circle class="ac" cx="100" cy="58" r="13"/><path class="ac" d="M76 112a24 20 0 0 1 48 0z" style="opacity:.85"/>` +
      IL.badge(152, 58, 10, "plus") +
      IL.spark(34, 50, 4) +
      IL.spark(168, 96, 3),
  },
  "no-permissions": {
    cat: "First run",
    title: "No direct permissions yet",
    body: "Everyone here gets access from their organization role. Add a person to give them more.",
    acts: ["Add person"],
    used: "Repository settings › Access",
    draw: () =>
      IL.glow(100, 66, 58) +
      IL.floor(100, 124, 56) +
      `<path class="pn" d="M100 22l38 13v30c0 26-19 41-38 50c-19-9-38-24-38-50V35z"/>` +
      IL.person(100, 74, "dsf", 0.9) +
      IL.badge(136, 34, 10, "plus") +
      IL.spark(52, 40, 4),
  },
  "no-activity": {
    cat: "First run",
    title: "Nothing has happened yet",
    body: "Pushes, clones and access changes are recorded here as they happen.",
    acts: [],
    used: "Activity, Repository settings › Audit log",
    draw: () =>
      IL.glow(100, 66, 60) +
      IL.floor(100, 124, 70) +
      `<rect class="pn" x="30" y="32" width="140" height="78" rx="8"/>` +
      IL.bars(42, 44, [40, 0], "ln2") +
      IL.bars(140, 44, [18], "ln") +
      `<path class="st" d="M42 84H170" style="stroke:#222"/><path class="acs" d="M42 84H88l6-12l8 22l6-10H158"/>` +
      IL.node(158, 84, 3.5) +
      IL.spark(178, 30, 4),
  },
  "reviews-off": {
    cat: "First run",
    title: "Reviews aren’t switched on yet",
    body: "Until they are, compare revisions from a repository’s history and open the diff.",
    acts: ["Open history"],
    used: "Reviews",
    draw: () =>
      IL.glow(100, 70, 62) +
      IL.floor(100, 124, 74) +
      `<rect class="pn" x="24" y="40" width="72" height="72" rx="7"/><rect class="pn" x="104" y="40" width="72" height="72" rx="7"/>` +
      [0, 1, 2, 3, 4]
        .map(
          (i) =>
            `<rect class="${i === 2 ? "rdf" : "ln"}" x="32" y="${52 + i * 11}" width="${[48, 36, 52, 30, 42][i]}" height="5" rx="2"/><rect class="${i === 2 || i === 3 ? "grf" : "ln"}" x="112" y="${52 + i * 11}" width="${[48, 36, 46, 40, 42][i]}" height="5" rx="2"/>`,
        )
        .join("") +
      `<path class="ac" d="M80 14h40a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8h-14l-6 7l-6-7H80a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z"/>` +
      [90, 100, 110]
        .map((x) => `<circle class="glyd" cx="${x}" cy="28" r="2.2"/>`)
        .join(""),
  },
  "no-tags": {
    cat: "First run",
    title: "No tags yet",
    body: "Tags pin a name such as v1.0 to one changeset for good. Create one with hg tag.",
    acts: ["Copy hg tag command"],
    used: "Branches & tags › Tags",
    draw: () =>
      IL.glow(100, 68, 58) +
      IL.floor(100, 124, 64) +
      `<path class="acs" d="M66 26V114"/>` +
      IL.node(66, 38) +
      IL.node(66, 70, 5.5) +
      IL.node(66, 102) +
      `<path class="ds" d="M72 70H80"/>` +
      `<path class="dsf" d="M82 70l11-12h46a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H93z"/><circle class="ds" cx="96" cy="70" r="3"/>` +
      IL.bars(106, 68, [26], "ln") +
      IL.badge(146, 54, 10, "plus") +
      IL.spark(40, 52, 4),
  },
  "no-bookmarks": {
    cat: "First run",
    title: "No bookmarks yet",
    body: "Bookmarks are movable pointers that follow your latest commit. Create one with hg bookmark.",
    acts: ["Copy hg bookmark command"],
    used: "Branches & tags › Bookmarks",
    draw: () =>
      IL.glow(100, 68, 58) +
      IL.floor(100, 124, 64) +
      `<path class="acs" d="M66 26V114"/>` +
      IL.node(66, 38) +
      IL.node(66, 70, 5.5) +
      IL.node(66, 102) +
      `<path class="ds" d="M72 70H90"/>` +
      `<path class="dsf" d="M92 42h30v50l-15-11l-15 11z"/>` +
      IL.badge(132, 44, 10, "plus") +
      IL.spark(42, 86, 4) +
      IL.spark(150, 96, 3),
  },
  "no-sessions": {
    cat: "First run",
    title: "No other sessions",
    body: "You’re only signed in here. Other browsers and devices appear in this list.",
    acts: [],
    used: "Your settings › Sessions",
    draw: () =>
      IL.glow(96, 64, 58) +
      IL.floor(100, 124, 70) +
      `<rect class="pn" x="30" y="30" width="96" height="64" rx="6"/><path class="pn2" d="M70 94h16l4 14H66z"/><rect class="pn2" x="58" y="108" width="40" height="5" rx="2.5"/>` +
      `<rect class="ac" x="40" y="42" width="24" height="5" rx="2.5"/>` +
      IL.bars(40, 54, [64, 48, 56], "ln", 9) +
      `<rect class="dsf" x="138" y="50" width="34" height="60" rx="6"/><path class="ds" d="M150 102h10"/>` +
      IL.spark(172, 36, 4),
  },
  "no-results": {
    cat: "No results",
    title: "No results",
    body: "Try fewer words, a different spelling, or clear the filters.",
    acts: ["Clear filters"],
    used: "Repositories filter, command palette, any search",
    draw: () =>
      IL.glow(108, 70, 58) +
      IL.floor(100, 124, 66) +
      `<rect class="pn" x="34" y="26" width="100" height="88" rx="8"/>` +
      [0, 1, 2, 3]
        .map(
          (i) =>
            `<rect class="dsf" x="46" y="${38 + i * 18}" width="76" height="11" rx="3"/>`,
        )
        .join("") +
      `<circle class="bgk" cx="132" cy="80" r="20"/><circle class="acf" cx="132" cy="80" r="20" style="stroke-width:5"/><path class="acs" d="M146 95l16 16" style="stroke-width:7"/><path class="acs" d="M125 80h14" style="stroke-width:2.5"/>` +
      IL.spark(164, 40, 5),
  },
  "no-changesets-match": {
    cat: "No results",
    title: "No changesets match",
    body: "Nothing on this branch matches your search. Clear the filters to see the full graph.",
    acts: ["Clear filters"],
    used: "History",
    draw: () =>
      IL.glow(110, 66, 58) +
      IL.floor(100, 124, 70) +
      `<path class="st" d="M48 26V114M48 48c0 12 22 10 22 22V96c0 8-22 6-22 14"/>` +
      [
        [48, 36],
        [48, 60],
        [70, 78],
        [70, 92],
        [48, 106],
      ]
        .map(([x, y]) => `<circle class="ln2" cx="${x}" cy="${y}" r="4.5"/>`)
        .join("") +
      IL.bars(84, 34, [44, 30], "ln", 9) +
      `<path class="acf" d="M112 46h56l-20 24v26l-16 8V70z"/>` +
      IL.spark(178, 96, 4),
  },
  "no-files-match": {
    cat: "No results",
    title: "No files match",
    body: "Nothing at this revision matches that name.",
    acts: ["Clear filter"],
    used: "Code explorer filter, go-to-file",
    draw: () =>
      IL.glow(100, 68, 56) +
      IL.floor(100, 124, 60) +
      [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const d = ([0, 1, 1, 0, 1, 0][i] ?? 0) * 12;
          return `<rect class="${i % 3 === 0 ? "ln2" : "ln"}" x="${46 + d}" y="${36 + i * 13}" width="9" height="8" rx="2"/><rect class="ln" x="${60 + d}" y="${38 + i * 13}" width="${[36, 44, 30, 40, 26, 34][i]}" height="4" rx="2"/>`;
        })
        .join("") +
      `<circle class="bgk" cx="134" cy="74" r="18"/><circle class="acf" cx="134" cy="74" r="18" style="stroke-width:4.5"/><path class="acs" d="M147 87l14 14" style="stroke-width:6"/>` +
      IL.badge(134, 74, 8, "x", "mu"),
  },
  "select-changeset": {
    cat: "Selection",
    title: "Pick a changeset",
    body: "Select a node in the graph to see its files, parents and refs.",
    acts: [],
    used: "History details panel",
    draw: () =>
      IL.glow(100, 70, 58) +
      IL.floor(100, 124, 66) +
      `<path class="acs" d="M46 22V118"/>` +
      [34, 70, 106]
        .map(
          (y, i) =>
            `<rect class="${i === 1 ? "acf" : "pn"}" x="${60}" y="${y - 12}" width="${104}" height="24" rx="6" ${i === 1 ? 'style="fill-opacity:.1"' : ""}/>` +
            IL.node(46, y, i === 1 ? 6 : 4.5) +
            IL.bars(
              70,
              y - 5,
              [i === 1 ? 56 : 48, i === 1 ? 34 : 28],
              i === 1 ? "ln2" : "ln",
              7,
            ),
        )
        .join("") +
      IL.cursor(128, 72),
  },
  "select-file": {
    cat: "Selection",
    title: "Pick a file",
    body: "Choose a file from the explorer to read it at this revision.",
    acts: [],
    used: "Code (no file open)",
    draw: () =>
      IL.glow(90, 66, 58) +
      IL.floor(100, 124, 66) +
      `<rect class="pn" x="30" y="24" width="64" height="92" rx="7"/>` +
      [0, 1, 2, 3, 4, 5]
        .map(
          (i) =>
            `<rect class="${i === 3 ? "acf" : ""}" x="34" y="${32 + i * 13}" width="56" height="11" rx="3" ${i === 3 ? "" : 'style="display:none"'}/><rect class="${i === 3 ? "ac" : "ln2"}" x="${38 + (i % 3 ? 6 : 0)}" y="${35 + i * 13}" width="6" height="5" rx="1.5"/><rect class="ln" x="${48 + (i % 3 ? 6 : 0)}" y="${36 + i * 13}" width="${[28, 22, 30, 24, 20, 26][i]}" height="3.5" rx="1.75"/>`,
        )
        .join("") +
      `<rect class="dsf" x="104" y="24" width="68" height="92" rx="7"/>` +
      IL.bars(114, 38, [40, 30, 46, 26], "ln", 10) +
      IL.cursor(80, 72),
  },
  provisioning: {
    cat: "Status",
    title: "Setting up storage",
    body: "Mercurial storage for this repository is being created. Usually under a minute.",
    acts: ["Check again"],
    used: "Repository (provisioning)",
    draw: () =>
      IL.glow(100, 64, 58) +
      IL.floor(100, 124, 58) +
      IL.rack(62, 32, 76, 22, ["gr", "am"]) +
      IL.rack(62, 58, 76, 22, ["gr", "gr"]) +
      `<rect class="pn2" x="62" y="84" width="76" height="22" rx="5"/><rect class="ln" x="72" y="93" width="56" height="4" rx="2"/><rect class="ac" x="72" y="93" width="30" height="4" rx="2"/>` +
      IL.badge(144, 32, 11, "clock", "am") +
      IL.spark(46, 54, 4) +
      IL.spark(158, 98, 3),
  },
  archived: {
    cat: "Status",
    title: "This repository is archived",
    body: "It’s read-only. Clones still work; pushes are rejected until an admin unarchives it.",
    acts: ["Unarchive"],
    used: "Archived repository banner",
    draw: () =>
      IL.glow(100, 68, 56) +
      IL.floor(100, 124, 60) +
      `<rect class="pn" x="58" y="58" width="84" height="56" rx="5"/><rect class="pn2" x="50" y="40" width="100" height="20" rx="5"/><rect class="ln2" x="86" y="72" width="28" height="7" rx="3.5"/>` +
      IL.doc(70, 22, 26, 30, "pn") +
      IL.badge(146, 42, 11, "lock", "mu"),
  },
  "all-caught-up": {
    cat: "Status",
    title: "Nothing needs attention",
    body: "Pushes, webhooks and storage all look healthy.",
    acts: [],
    used: "Home › Needs attention",
    draw: () =>
      IL.glow(100, 66, 58) +
      IL.floor(100, 124, 60) +
      `<rect class="pn" x="52" y="24" width="88" height="90" rx="8"/>` +
      [0, 1, 2, 3]
        .map(
          (i) =>
            `<circle class="grf" cx="66" cy="${42 + i * 18}" r="5"/><path class="grs" d="M63.5 ${42 + i * 18}l2 2l3.5-3.5"/>` +
            IL.bars(78, 40 + i * 18, [[44, 32, 40, 28][i]], "ln"),
        )
        .join("") +
      IL.badge(142, 98, 13, "check", "gr") +
      IL.spark(40, 42, 4) +
      IL.spark(162, 40, 5),
  },
  "clean-merge": {
    cat: "Status",
    title: "Clean merge",
    body: "This merge didn’t change any files compared with its first parent.",
    acts: ["Compare with second parent"],
    used: "Changeset (merge with no changes)",
    draw: () =>
      IL.glow(100, 66, 56) +
      IL.floor(100, 124, 60) +
      `<path class="acs" d="M76 20V116"/><path class="pus" d="M120 26V54C120 74 76 70 76 90"/>` +
      IL.node(76, 36) +
      IL.node(120, 34, 4.5, "pu") +
      IL.node(120, 54, 4.5, "pu") +
      `<circle class="acs bgk" cx="76" cy="90" r="7" style="stroke-width:2.4"/>` +
      IL.node(76, 110) +
      IL.badge(130, 94, 11, "check", "gr"),
  },
  "binary-file": {
    cat: "Status",
    title: "Binary file not shown",
    body: "Download it to inspect it locally.",
    acts: ["Download"],
    used: "Code (binary file)",
    draw: () =>
      IL.glow(100, 66, 56) +
      IL.floor(100, 124, 52) +
      IL.doc(66, 22, 68, 92) +
      [0, 1, 2, 3, 4]
        .map((r) =>
          [0, 1, 2, 3]
            .map(
              (c) =>
                `<rect class="${(r * 3 + c * 5) % 4 ? "ln" : "ln2"}" x="${78 + c * 12}" y="${44 + r * 12}" width="${(r + c) % 3 ? 8 : 4}" height="8" rx="2"/>`,
            )
            .join(""),
        )
        .join("") +
      IL.badge(134, 104, 12, "down"),
  },
  "too-large": {
    cat: "Status",
    title: "This file is too large to preview",
    body: "Files over 1 MB aren’t rendered inline. View the raw file or download it instead.",
    acts: ["View raw", "Download"],
    used: "Code (large file)",
    draw: () =>
      IL.glow(96, 66, 56) +
      IL.floor(96, 124, 56) +
      IL.doc(70, 40, 56, 72, "pn2") +
      IL.doc(62, 30, 56, 80, "pn2") +
      IL.doc(54, 20, 56, 92) +
      IL.bars(64, 40, [34, 28, 36, 22, 30, 26, 32], "ln", 9) +
      `<path class="ams" d="M140 20V112"/>` +
      [20, 38, 56, 74, 92, 112]
        .map((y) => `<path class="ams" d="M140 ${y}h8"/>`)
        .join("") +
      IL.badge(148, 60, 10, "bang", "am"),
  },
  "not-found": {
    cat: "Errors",
    title: "No page at this address",
    body: "The link may be from an older version of RevForge, or the repository was renamed.",
    acts: ["Go home"],
    used: "404",
    draw: () =>
      IL.glow(100, 62, 62) +
      IL.floor(100, 124, 72) +
      `<text class="txt" x="100" y="78" text-anchor="middle" font-size="58">404</text>` +
      `<path class="acs" d="M24 104H90"/>` +
      IL.node(40, 104) +
      IL.node(76, 104) +
      `<path class="ds" d="M96 104H124"/>` +
      `<circle class="dsf" cx="150" cy="96" r="9"/>` +
      IL.badge(150, 96, 9, "q", "mu") +
      IL.spark(176, 40, 4),
  },
  "permission-denied": {
    cat: "Errors",
    title: "You don’t have access to this",
    body: "Ask an admin of the organization to give you a role on this repository.",
    acts: ["Request access", "Go home"],
    used: "403",
    draw: () =>
      IL.glow(100, 66, 56) +
      IL.floor(100, 124, 66) +
      IL.win(34, 26, 132, 88) +
      IL.bars(46, 50, [60, 44, 70, 38], "ln", 11) +
      `<path class="st" d="M88 70V60a12 12 0 0 1 24 0v10" style="stroke:#5a5a5a;stroke-width:5"/><rect class="pn2" x="80" y="68" width="40" height="32" rx="6" style="stroke:var(--red)"/><circle class="rd" cx="100" cy="81" r="3.5"/><rect class="rd" x="98.5" y="83" width="3" height="8" rx="1.5"/>` +
      IL.badge(158, 30, 9, "x", "rd"),
  },
  "load-error": {
    cat: "Errors",
    title: "Couldn’t load this",
    body: "The forge returned an error. Your data is safe; try again in a moment.",
    acts: ["Try again"],
    used: "Any failed request (5xx)",
    draw: () =>
      IL.glow(90, 66, 56) +
      IL.floor(96, 124, 62) +
      IL.rack(46, 34, 76, 22, ["rd", "mu"]) +
      IL.rack(46, 60, 76, 22, ["gr", "gr"]) +
      IL.rack(46, 86, 76, 22, ["gr", "am"]) +
      `<path class="ds" d="M122 71h18"/><path class="acs" d="M150 71h22"/><rect class="ac" x="140" y="64" width="10" height="14" rx="2"/>` +
      IL.badge(126, 32, 10, "x", "rd") +
      IL.spark(168, 46, 4, "rds"),
  },
  offline: {
    cat: "Errors",
    title: "Can’t reach the forge",
    body: "Check your connection or VPN. RevForge reconnects automatically when it’s back.",
    acts: ["Retry now"],
    used: "Network lost",
    draw: () =>
      IL.glow(100, 70, 56) +
      IL.floor(100, 124, 74) +
      `<path class="acs" d="M20 70H52"/><rect class="ac" x="52" y="58" width="22" height="24" rx="5"/><path class="acs" d="M74 64h10M74 76h10" style="stroke-width:3"/>` +
      `<rect class="pn2" x="122" y="56" width="24" height="28" rx="5"/><circle class="bgk" cx="132" cy="64" r="2"/><circle class="bgk" cx="132" cy="76" r="2"/><path class="st" d="M146 70H180"/>` +
      `<path class="ams spk" d="M100 56l4 8h-8l4 8M110 76l-3 6M92 82l3-5"/>`,
  },
  "session-expired": {
    cat: "Errors",
    title: "Your session has expired",
    body: "Sign in again to keep going. Unsaved changes on this page are kept.",
    acts: ["Sign in"],
    used: "Session timeout",
    draw: () =>
      IL.glow(100, 66, 56) +
      IL.floor(100, 124, 52) +
      `<path class="pn2" d="M76 22h48M76 116h48"/><path class="pn" d="M80 26h40c0 22-14 28-14 44c0 16 14 22 14 44H80c0-22 14-28 14-44c0-16-14-22-14-44z"/><path class="ac" d="M88 40h24c-2 10-10 14-12 22c-2-8-10-12-12-22zM84 108c4-10 10-14 16-18c6 4 12 8 16 18z"/>` +
      `<rect class="pn2" x="72" y="20" width="56" height="6" rx="3"/><rect class="pn2" x="72" y="112" width="56" height="6" rx="3"/>` +
      IL.badge(138, 44, 10, "lock", "am"),
  },
} satisfies Record<string, ArtSpec>;
export type IllustrationId = keyof typeof ART;

export const IL_CATS: readonly IllustrationCategory[] = [
  "First run",
  "No results",
  "Selection",
  "Status",
  "Errors",
];

export const ILLUSTRATION_IDS = Object.keys(ART) as IllustrationId[];

export function artOf(id: IllustrationId): ArtSpec {
  return ART[id] as ArtSpec;
}
