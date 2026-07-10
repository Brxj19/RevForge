import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type AccentPaletteId = "professional" | "tech" | "luxury";

export interface AccentPalette {
  id: AccentPaletteId;
  label: string;
  description: string;
  swatches: [string, string, string];
  primary: string;
  hover: string;
  active: string;
  subtle: string;
  border: string;
}

const accentStorageKey = "revforge.preferences.accent";
const accentPreferenceMemoryStorage = new Map<string, string>();
const canUseBrowserStorage = import.meta.env.MODE !== "test";

export const accentPalettes: Record<AccentPaletteId, AccentPalette> = {
  tech: {
    id: "tech",
    label: "Tech & Cyber",
    description: "Electric cyan with cyber green and neon purple accents.",
    swatches: ["#00E5FF", "#39FF14", "#A020F0"],
    primary: "#00E5FF",
    hover: "#39FF14",
    active: "#A020F0",
    subtle: "rgba(0, 229, 255, 0.14)",
    border: "rgba(0, 229, 255, 0.38)",
  },
  professional: {
    id: "professional",
    label: "Professional & Clean",
    description: "Vibrant blue with mint green and soft lavender accents.",
    swatches: ["#2563EB", "#10B981", "#8B5CF6"],
    primary: "#2563EB",
    hover: "#10B981",
    active: "#8B5CF6",
    subtle: "rgba(37, 99, 235, 0.14)",
    border: "rgba(37, 99, 235, 0.38)",
  },
  luxury: {
    id: "luxury",
    label: "Premium & Luxury",
    description: "Golden amber with champagne gold and warm coral accents.",
    swatches: ["#F59E0B", "#D4AF37", "#FF6B6B"],
    primary: "#F59E0B",
    hover: "#D4AF37",
    active: "#FF6B6B",
    subtle: "rgba(245, 158, 11, 0.14)",
    border: "rgba(245, 158, 11, 0.38)",
  },
};

export const accentPaletteList = Object.values(accentPalettes);
export const defaultAccentPaletteId: AccentPaletteId = "professional";

export interface AccentPreferenceContextValue {
  accentPaletteId: AccentPaletteId;
  accentPalette: AccentPalette;
  accentPalettes: AccentPalette[];
  setAccentPaletteId: Dispatch<SetStateAction<AccentPaletteId>>;
}

export const AccentPreferenceContext =
  createContext<AccentPreferenceContextValue | null>(null);

function isAccentPaletteId(value: string | null): value is AccentPaletteId {
  return value !== null && value in accentPalettes;
}

export function readStoredAccentPalette(): AccentPaletteId {
  const storedPalette = readAccentStorageItem();
  return isAccentPaletteId(storedPalette)
    ? storedPalette
    : defaultAccentPaletteId;
}

export function applyAccentPalette(palette: AccentPalette) {
  const root = document.documentElement;

  root.dataset.accent = palette.id;
  root.style.setProperty("--rf-accent", palette.primary);
  root.style.setProperty("--rf-accent-hover", palette.hover);
  root.style.setProperty("--rf-accent-active", palette.active);
  root.style.setProperty("--rf-accent-subtle", palette.subtle);
  root.style.setProperty("--rf-accent-border", palette.border);
  root.style.setProperty("--rf-accent-secondary", palette.hover);
  root.style.setProperty("--rf-accent-tertiary", palette.active);
}

function readAccentStorageItem() {
  if (canUseBrowserStorage && typeof window !== "undefined") {
    try {
      const storedPalette = window.localStorage.getItem(accentStorageKey);
      if (storedPalette !== null) {
        return storedPalette;
      }
    } catch {
      // Fallback to in-memory storage when browser storage is not available.
    }
  }

  return accentPreferenceMemoryStorage.get(accentStorageKey) ?? null;
}

function writeAccentStorageItem(value: AccentPaletteId) {
  if (canUseBrowserStorage && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(accentStorageKey, value);
      return;
    } catch {
      // Fallback to in-memory storage when browser storage is not available.
    }
  }

  accentPreferenceMemoryStorage.set(accentStorageKey, value);
}

export function clearAccentStorage() {
  if (canUseBrowserStorage && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(accentStorageKey);
    } catch {
      // Ignore storage cleanup failures in tests and browser environments.
    }
  }

  accentPreferenceMemoryStorage.delete(accentStorageKey);
}

export function seedAccentStorage(value: AccentPaletteId) {
  writeAccentStorageItem(value);
}

export function useAccentPreference() {
  const context = useContext(AccentPreferenceContext);

  if (!context) {
    throw new Error(
      "useAccentPreference must be used within AccentPreferenceProvider.",
    );
  }

  return context;
}
