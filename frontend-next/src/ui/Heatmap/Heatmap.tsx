import { createMemo, createSignal, For, Index, Show, type JSX } from "solid-js";
import { plural } from "~/lib/format";
import { IconButton } from "../IconButton";
import {
  buildCells,
  heatmapStats,
  type HeatmapCell,
  type HeatmapDay,
} from "./heatmap-data";
import styles from "./Heatmap.module.css";

export interface HeatmapProps {
  days: readonly HeatmapDay[];
  today?: Date;
  weeks?: number;
  /** Content of the pinned-day panel; defaults to per-repository counts. */
  renderDay?: (day: HeatmapCell) => JSX.Element;
  /** Noun for counts. */
  unit?: [one: string, many: string];
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const fmtShort = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

/**
 * Contribution heatmap (DESIGN.md §6): weeks × 7, month/day labels, tooltip on hover and focus,
 * click or Enter pins a day, arrow keys move (↑↓ day, ←→ week).
 */
export function Heatmap(props: HeatmapProps) {
  const unit = () => props.unit ?? ["changeset", "changesets"];
  const cells = createMemo(() =>
    buildCells(props.days, props.today ?? new Date(), props.weeks ?? 30),
  );
  const stats = createMemo(() => heatmapStats(cells()));
  const [active, setActive] = createSignal<number | null>(null);
  const [hover, setHover] = createSignal<number | null>(null);
  const [pinned, setPinned] = createSignal<number | null>(null);
  const [tipPos, setTipPos] = createSignal<{
    left: number;
    top: number;
  } | null>(null);
  let gridEl!: HTMLDivElement;

  const weeks = () => props.weeks ?? 30;
  const rows = createMemo(() => {
    const all = cells();
    return Array.from({ length: 7 }, (_, d) =>
      all.filter((c) => c.weekday === d),
    );
  });
  const months = createMemo(() => {
    const out: { label: string; col: number }[] = [];
    let prev = -1;
    for (let w = 0; w < weeks(); w++) {
      const c = cells()[w * 7];
      if (!c) continue;
      const m = new Date(`${c.date}T00:00:00`).getMonth();
      if (m !== prev && w < weeks() - 1)
        out.push({
          label: new Date(`${c.date}T00:00:00`).toLocaleDateString("en-GB", {
            month: "short",
          }),
          col: w,
        });
      prev = m;
    }
    return out;
  });
  const lastLive = () => {
    const i = cells().findIndex((c) => c.future);
    return i < 0 ? cells().length - 1 : i - 1;
  };
  const shown = () => hover() ?? active();
  const cellAt = (i: number | null) => (i === null ? undefined : cells()[i]);
  const pinnedCell = () => cellAt(pinned());
  const tipCell = () => (tipPos() ? cellAt(shown()) : undefined);
  const describe = (c: HeatmapCell) =>
    `${c.count ? plural(c.count, unit()[0], unit()[1]) : `No ${unit()[1]}`} on ${fmtDay(c.date)}`;

  const place = (i: number | null) => {
    if (i === null) return setTipPos(null);
    const el = gridEl?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!el) return setTipPos(null);
    const r = el.getBoundingClientRect();
    setTipPos({
      left: Math.max(
        8,
        Math.min(r.left + r.width / 2 - 110, window.innerWidth - 228),
      ),
      top: r.top - 8,
    });
  };
  const move = (delta: number) => {
    const cur = active() ?? lastLive();
    let n = cur + delta;
    if (n < 0 || n >= cells().length || cells()[n]?.future) n = cur;
    setActive(n);
    gridEl
      .querySelector<HTMLElement>(`[data-i="${n}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    place(n);
  };
  const togglePin = (i: number) => {
    if (cells()[i]?.future) return;
    setPinned((p) => (p === i ? null : i));
  };
  const onKey = (e: KeyboardEvent) => {
    const d = (
      { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 } as Record<
        string,
        number
      >
    )[e.key];
    if (d !== undefined) {
      e.preventDefault();
      move(d);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePin(active() ?? lastLive());
    } else if (e.key === "Escape" && pinned() !== null) {
      e.preventDefault();
      setPinned(null);
    }
  };

  return (
    <div class={styles.root}>
      <div class={styles.wrap}>
        <div class={styles.days} aria-hidden="true">
          <span />
          <For each={DAY_LABELS}>{(d) => <span>{d}</span>}</For>
        </div>
        <div class={styles.scroll} onScroll={() => setTipPos(null)}>
          <div class={styles.months} aria-hidden="true">
            <For each={months()}>
              {(m) => (
                <span style={{ left: `${m.col * 13}px` }}>{m.label}</span>
              )}
            </For>
          </div>
          <div
            ref={gridEl}
            class={styles.grid}
            style={{ "grid-template-columns": `repeat(${weeks()}, 10px)` }}
            role="grid"
            tabindex="0"
            aria-label={`${unit()[1][0]?.toUpperCase()}${unit()[1].slice(1)} per day for the last ${weeks()} weeks. Use arrow keys to move between days, Enter to pin a day.`}
            aria-activedescendant={
              active() === null ? undefined : `heat-${active()}`
            }
            onFocus={() => move(0)}
            onBlur={() => {
              setActive(null);
              setTipPos(null);
            }}
            onKeyDown={onKey}
            onMouseLeave={() => {
              setHover(null);
              place(active());
            }}
          >
            <Index each={rows()}>
              {(row) => (
                <div role="row" class={styles.row}>
                  <For each={row()}>
                    {(c) => {
                      const i = c.week * 7 + c.weekday;
                      return (
                        <i
                          id={`heat-${i}`}
                          role="gridcell"
                          data-i={i}
                          data-l={c.level}
                          data-future={c.future || undefined}
                          data-active={active() === i || undefined}
                          data-pinned={pinned() === i || undefined}
                          aria-label={c.future ? undefined : describe(c)}
                          aria-selected={pinned() === i}
                          style={{
                            "grid-row": c.weekday + 1,
                            "grid-column": c.week + 1,
                          }}
                          onMouseEnter={() => {
                            if (c.future) return;
                            setHover(i);
                            place(i);
                          }}
                          onClick={() => togglePin(i)}
                        />
                      );
                    }}
                  </For>
                </div>
              )}
            </Index>
          </div>
        </div>
      </div>

      <div class={styles.footer}>
        <div class={styles.stats}>
          <Show when={stats().busiest}>
            {(b) => (
              <span>
                Busiest day <b>{fmtShort(b().date)}</b>,{" "}
                {plural(b().count, unit()[0], unit()[1])}
              </span>
            )}
          </Show>
          <span>
            Longest streak <b>{plural(stats().longestStreak, "day")}</b>
          </span>
          <span>
            Current streak <b>{plural(stats().currentStreak, "day")}</b>
          </span>
          <span>
            Active on <b>{stats().activeDays}</b> of {stats().days} days
          </span>
        </div>
        <div class={styles.legend} aria-hidden="true">
          Less
          <span class={styles.legendCells}>
            <For each={[0, 1, 2, 3, 4]}>{(l) => <i data-l={l} />}</For>
          </span>
          More
        </div>
      </div>

      <Show when={pinnedCell()}>
        {(day) => (
          <div
            class={styles.panel}
            role="region"
            aria-label={fmtDay(day().date)}
          >
            <div class={styles.panelHead}>
              <b>{fmtDay(day().date)}</b>
              <IconButton
                icon="x"
                label="Close day"
                size="xs"
                tooltip={false}
                onClick={() => setPinned(null)}
              />
            </div>
            <Show
              when={props.renderDay}
              keyed
              fallback={
                <Show
                  when={day().count}
                  fallback={<p class={styles.none}>No {unit()[1]} this day.</p>}
                >
                  <ul class={styles.repoList}>
                    <For each={day().byRepo ?? []}>
                      {(r) => (
                        <li>
                          <span class={styles.repo}>
                            <i
                              style={{ background: r.color }}
                              aria-hidden="true"
                            />
                            {r.name}
                          </span>
                          <span class="muted">
                            {plural(r.count, unit()[0], unit()[1])}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              }
            >
              {(render) => render(day())}
            </Show>
          </div>
        )}
      </Show>

      <Show when={tipCell()}>
        {(c) => (
          <div
            class={styles.tip}
            style={{
              left: `${tipPos()?.left ?? 0}px`,
              top: `${tipPos()?.top ?? 0}px`,
            }}
            aria-hidden="true"
          >
            <b>
              {c().count
                ? plural(c().count, unit()[0], unit()[1])
                : `No ${unit()[1]}`}
            </b>{" "}
            <span class="muted">on {fmtDay(c().date)}</span>
            <Show when={c().count}>
              <For each={c().byRepo ?? []}>
                {(r) => (
                  <div class={styles.tipRow}>
                    <i style={{ background: r.color }} />
                    <span>{r.name}</span>
                    <span>{r.count}</span>
                  </div>
                )}
              </For>
              <Show when={c().additions !== undefined}>
                <div class={`${styles.tipRow} ${styles.tipLines}`}>
                  <span>Lines</span>
                  <span>
                    <span class="add">+{c().additions}</span>{" "}
                    <span class="del">−{c().deletions ?? 0}</span>
                  </span>
                </div>
              </Show>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
