import { For, Show, type Component } from "solid-js";
import { ApiError } from "~/lib/api/client";
import type { AccentPalette } from "~/lib/api/types";
import { Button } from "~/ui/Button";
import { Card, CardHeader } from "~/ui/Card";
import { EmptyState } from "~/ui/EmptyState";
import { SkeletonText } from "~/ui/Skeleton";
import { Switch } from "~/ui/Switch";
import { showToast } from "~/ui/Toast";
import { usePreferences, useSavePreferences } from "./queries";
import styles from "./settings.module.css";

interface PaletteDef {
  id: AccentPalette;
  name: string;
  swatches: [string, string, string];
}

const PALETTES: PaletteDef[] = [
  {
    id: "default",
    name: "Forge blue",
    swatches: ["#58a6ff", "#3fb950", "#bc8cff"],
  },
  {
    id: "tech",
    name: "Tech & cyber",
    swatches: ["#00E5FF", "#39FF14", "#A020F0"],
  },
  {
    id: "professional",
    name: "Professional",
    swatches: ["#2563EB", "#10B981", "#8B5CF6"],
  },
  { id: "luxury", name: "Amber", swatches: ["#F59E0B", "#D4AF37", "#FF6B6B"] },
];

function applyAccent(hex: string) {
  const r = document.documentElement.style;
  r.setProperty("--accent", hex);
  r.setProperty("--accent-bg", hex + "22");
  r.setProperty("--accent-line", hex + "66");
}

const PreferencesPage: Component = () => {
  const prefs = usePreferences();
  const save = useSavePreferences();

  const handleAccent = (palette: PaletteDef) => {
    applyAccent(palette.swatches[0]);
    save.mutate({ accent: palette.id });
    showToast({ message: "Accent updated" });
  };

  const handleToggle = (
    key: "graph_default" | "compact" | "reduce_motion",
    value: boolean,
  ) => {
    save.mutate({ [key]: value });
    showToast({ message: "Preference saved" });
  };

  return (
    <Show
      when={!prefs.isPending}
      fallback={
        <div
          style={{ display: "flex", "flex-direction": "column", gap: "16px" }}
        >
          <Card>
            <CardHeader>
              <h2 class="h2">Accent colour</h2>
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <SkeletonText lines={["40%"]} label="Loading preferences" />
            </div>
          </Card>
          <Card>
            <div style={{ padding: "16px" }}>
              <SkeletonText lines={["60%", "60%", "60%"]} />
            </div>
          </Card>
        </div>
      }
    >
      <Show
        when={!prefs.isError}
        fallback={
          <EmptyState
            art="load-error"
            title="Couldn't load preferences"
            body="Check your connection and try again."
            requestId={
              prefs.error instanceof ApiError
                ? prefs.error.requestId
                : undefined
            }
            actions={
              <Button onClick={() => void prefs.refetch()}>Try again</Button>
            }
          />
        }
      >
        <div
          style={{ display: "flex", "flex-direction": "column", gap: "16px" }}
        >
          <Card>
            <CardHeader>
              <h2 class="h2">Accent colour</h2>
            </CardHeader>
            <div style={{ padding: "16px" }}>
              <div
                class={styles.palGrid}
                role="radiogroup"
                aria-label="Accent colour"
              >
                <For each={PALETTES}>
                  {(pal) => (
                    <button
                      type="button"
                      class={styles.palBtn}
                      data-active={
                        prefs.data?.accent === pal.id ? "" : undefined
                      }
                      role="radio"
                      aria-checked={prefs.data?.accent === pal.id}
                      aria-label={pal.name}
                      onClick={() => handleAccent(pal)}
                    >
                      <span class={styles.palSwatches}>
                        <For each={pal.swatches}>
                          {(color) => (
                            <span
                              class={styles.palSwatch}
                              style={{ background: color }}
                            />
                          )}
                        </For>
                      </span>
                      <span class={styles.palName}>{pal.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Card>

          <Card>
            <div class={styles.settingsRow}>
              <div class={styles.rowInfo}>
                <span class={styles.rowTitle}>
                  Show the graph in History by default
                </span>
                <p class={styles.rowDesc}>
                  Turn off to open History as a plain list
                </p>
              </div>
              <Switch
                label="Graph default"
                checked={prefs.data?.graph_default ?? true}
                onChange={(v) => handleToggle("graph_default", v)}
              />
            </div>
            <div class={styles.settingsRow}>
              <div class={styles.rowInfo}>
                <span class={styles.rowTitle}>Compact rows</span>
                <p class={styles.rowDesc}>Fit more changesets on screen</p>
              </div>
              <Switch
                label="Compact rows"
                checked={prefs.data?.compact ?? false}
                onChange={(v) => handleToggle("compact", v)}
              />
            </div>
            <div class={styles.settingsRow}>
              <div class={styles.rowInfo}>
                <span class={styles.rowTitle}>Reduce motion</span>
                <p class={styles.rowDesc}>Turn off non-essential animation</p>
              </div>
              <Switch
                label="Reduce motion"
                checked={prefs.data?.reduce_motion ?? false}
                onChange={(v) => handleToggle("reduce_motion", v)}
              />
            </div>
          </Card>
        </div>
      </Show>
    </Show>
  );
};

export default PreferencesPage;
