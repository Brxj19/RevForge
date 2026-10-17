// Accent palettes (DESIGN.md §3.1, Appearance). Preferences API is API-GAP until Phase 4
// (GET/PUT /me/preferences); until then the choice is kept per user in localStorage.
export type AccentId = "default" | "tech" | "professional" | "luxury";

export const ACCENTS: Record<
  AccentId,
  { label: string; hex: string; swatch: [string, string, string] }
> = {
  default: {
    label: "Forge blue",
    hex: "#58a6ff",
    swatch: ["#58a6ff", "#3fb950", "#bc8cff"],
  },
  tech: {
    label: "Tech & cyber",
    hex: "#00E5FF",
    swatch: ["#00E5FF", "#39FF14", "#A020F0"],
  },
  professional: {
    label: "Professional",
    hex: "#2563EB",
    swatch: ["#2563EB", "#10B981", "#8B5CF6"],
  },
  luxury: {
    label: "Amber",
    hex: "#F59E0B",
    swatch: ["#F59E0B", "#D4AF37", "#FF6B6B"],
  },
};

const key = (userId: string | undefined) =>
  `revforge.accent.${userId ?? "anonymous"}`;

export function applyAccent(
  id: AccentId,
  root: HTMLElement = document.documentElement,
) {
  const { hex } = ACCENTS[id] ?? ACCENTS.default;
  if (id === "default") {
    for (const p of ["--accent", "--accent-bg", "--accent-line"])
      root.style.removeProperty(p);
    return;
  }
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-bg", `${hex}22`);
  root.style.setProperty("--accent-line", `${hex}66`);
}

export function storedAccent(userId: string | undefined): AccentId {
  try {
    const v = localStorage.getItem(key(userId));
    return v && v in ACCENTS ? (v as AccentId) : "default";
  } catch {
    return "default";
  }
}

export function storeAccent(userId: string | undefined, id: AccentId) {
  try {
    localStorage.setItem(key(userId), id);
  } catch {
    // Storage blocked: the accent still applies for this page view.
  }
  applyAccent(id);
}
