import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  AccentPreferenceContext,
  accentPalettes,
  accentPaletteList,
  applyAccentPalette,
  readStoredAccentPalette,
  seedAccentStorage,
} from "./accent-preference";

export function AccentPreferenceProvider({ children }: PropsWithChildren) {
  const [accentPaletteId, setAccentPaletteId] = useState(
    readStoredAccentPalette,
  );

  const accentPalette = accentPalettes[accentPaletteId];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    applyAccentPalette(accentPalette);
    seedAccentStorage(accentPaletteId);
  }, [accentPalette, accentPaletteId]);

  const value = useMemo(
    () => ({
      accentPaletteId,
      accentPalette,
      accentPalettes: accentPaletteList,
      setAccentPaletteId,
    }),
    [accentPalette, accentPaletteId],
  );

  return (
    <AccentPreferenceContext.Provider value={value}>
      {children}
    </AccentPreferenceContext.Provider>
  );
}
