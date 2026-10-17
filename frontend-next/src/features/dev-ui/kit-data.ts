// Sample data for the UI kit, from the prototype's demo set (fictional).
export const KIT_MEMBERS = [
  { name: "Brxj19", role: "owner", last: "now" },
  { name: "Tatwa Prasad", role: "admin", last: "2h" },
  { name: "Bhuvnesh Kumar", role: "member", last: "1d" },
  { name: "Kushwah Dheeraj", role: "member", last: "3d" },
  { name: "Akhil Goyal", role: "member", last: "2w" },
] as const;

export const KIT_SPARKS = [
  {
    slug: "sigma-reckitt",
    color: "#58a6ff",
    values: [1, 0, 3, 2, 6, 9, 4, 12, 7, 10, 8, 14],
  },
  {
    slug: "payments-api",
    color: "#3fb950",
    values: [4, 6, 3, 8, 5, 7, 6, 4, 9, 7, 8, 6],
  },
  {
    slug: "infra-scripts",
    color: "#e3b341",
    values: [0, 0, 1, 0, 2, 0, 0, 1, 0, 3, 1, 0],
  },
  {
    slug: "design-tokens",
    color: "#bc8cff",
    values: [2, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  },
];

export const KIT_ICON_NAMES = [
  "main.cpp",
  "graph.hpp",
  "util.c",
  "README.md",
  "notes.md",
  "presets.json",
  "settings.yaml",
  "pyproject.toml",
  "build.sh",
  "bench.py",
  "index.ts",
  "App.tsx",
  "app.js",
  "theme.css",
  "index.html",
  "diagram.png",
  "logo.svg",
  "notes.txt",
  "Cargo.lock",
  "fix.patch",
  "server.log",
  "Makefile",
  "CMakeLists.txt",
  "Dockerfile",
  "LICENSE",
  ".hgignore",
  ".clang-format",
  ".env",
  "main",
];

/** Deterministic demo heatmap ending on `today` (prototype HEAT generator). */
export function kitHeatDays(today: Date) {
  const repos = [
    ["sigma-reckitt", "#58a6ff"],
    ["payments-api", "#3fb950"],
    ["infra-scripts", "#e3b341"],
    ["design-tokens", "#bc8cff"],
  ] as const;
  const out = [];
  for (let i = 0; i < 210; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (209 - i));
    const x = Math.sin(i * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const k = Math.floor(r * 1000);
    let n =
      r > 0.86
        ? 8 + (k % 5)
        : r > 0.72
          ? 5 + (k % 3)
          : r > 0.55
            ? 3 + (k % 2)
            : r > 0.38
              ? 1 + (k % 2)
              : 0;
    if (d.getDay() === 0 || d.getDay() === 6) n = Math.floor(n / 3);
    const byRepo = [];
    let left = n;
    for (const [j, [name, color]] of repos.entries()) {
      if (!left) break;
      const take =
        j === repos.length - 1
          ? left
          : Math.min(left, Math.ceil(left * ([0.55, 0.6, 0.7, 1][j] ?? 1)));
      byRepo.push({ name, color, count: take });
      left -= take;
    }
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      date: iso,
      count: n,
      byRepo,
      additions: n * (11 + (k % 37)),
      deletions: n * (2 + (k % 9)),
    });
  }
  return out;
}
