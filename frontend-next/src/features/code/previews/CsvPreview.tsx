import { createMemo, createSignal, For, Index, Show } from "solid-js";
import { plural } from "~/lib/format";
import { Icon } from "~/ui/icons";
import styles from "../code.module.css";
import { isNumeric, parseCsv } from "./csv";

/** Rendered rows cap (code-viewer.md: cap at 5,000 rows with a note). */
export const CSV_MAX_ROWS = 5000;
const MAX_COLS = 200;
const MAX_CELL = 2000;
const DURATION = /^(ms|duration|time|elapsed|secs?|seconds?)$|_(ms|secs?)$/i;

/** Sortable table: numeric alignment, row numbers, inline bars for duration columns. Text only. */
export function CsvPreview(props: { source: string; path: string }) {
  const parsed = createMemo(() =>
    parseCsv(
      props.source,
      CSV_MAX_ROWS + 1,
      /\.tsv$/i.test(props.path) ? "\t" : ",",
    ),
  );
  const head = () => (parsed().rows[0] ?? []).slice(0, MAX_COLS);
  const body = createMemo(() =>
    parsed()
      .rows.slice(1, CSV_MAX_ROWS + 1)
      .map((r) => r.slice(0, MAX_COLS).map((c) => c.slice(0, MAX_CELL))),
  );
  const truncated = () =>
    parsed().truncated || parsed().rows.length - 1 > CSV_MAX_ROWS;
  const numeric = createMemo(() =>
    head().map(
      (_, c) =>
        body().length > 0 &&
        body().every((r) => !!r[c] && isNumeric(r[c] ?? "")),
    ),
  );
  const max = createMemo(() =>
    head().map((_, c) =>
      numeric()[c] ? Math.max(...body().map((r) => Math.abs(Number(r[c])))) : 0,
    ),
  );
  const [sort, setSort] = createSignal<{ c: number; d: 1 | -1 } | null>(null);
  const rows = createMemo(() => {
    const s = sort();
    if (!s) return body();
    const asNumber = numeric()[s.c];
    return [...body()].sort((a, b) => {
      const x = a[s.c] ?? "";
      const y = b[s.c] ?? "";
      const v = asNumber ? Number(x) - Number(y) : x.localeCompare(y);
      return s.d * v;
    });
  });
  const toggle = (c: number) =>
    setSort((s) =>
      s && s.c === c ? { c, d: s.d === 1 ? -1 : 1 } : { c, d: 1 },
    );

  return (
    <>
      <div class={styles.csvv}>
        <table>
          <caption class="visually-hidden">{props.path}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span class="visually-hidden">Row</span>
              </th>
              <Index each={head()}>
                {(h, c) => (
                  <th
                    scope="col"
                    data-numeric={numeric()[c] || undefined}
                    aria-sort={
                      sort()?.c === c
                        ? sort()?.d === 1
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button type="button" onClick={() => toggle(c)}>
                      {h()}
                      <Show when={sort()?.c === c}>
                        <span aria-hidden="true">
                          {sort()?.d === 1 ? "↑" : "↓"}
                        </span>
                      </Show>
                      <Show when={sort()?.c !== c}>
                        <Icon name="sort" size={11} />
                      </Show>
                    </button>
                  </th>
                )}
              </Index>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(r, i) => (
                <tr>
                  <td class={styles.rn}>{i() + 1}</td>
                  <Index each={head()}>
                    {(h, c) => (
                      <td data-numeric={numeric()[c] || undefined}>
                        <Show
                          when={
                            numeric()[c] &&
                            DURATION.test(h().trim()) &&
                            max()[c]
                          }
                        >
                          <span
                            class={styles.cbar}
                            style={{
                              width: `${Math.max(2, Math.round((60 * Math.abs(Number(r[c]))) / (max()[c] || 1)))}px`,
                            }}
                            aria-hidden="true"
                          />
                        </Show>
                        {r[c] ?? ""}
                      </td>
                    )}
                  </Index>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class={styles.imgBar}>
        {plural(body().length, "row")}, {plural(head().length, "column")}. Click
        a column to sort.
        <Show when={truncated()}>
          {" "}
          Showing the first {CSV_MAX_ROWS.toLocaleString("en-GB")} rows; view
          the code or download the file for the rest.
        </Show>
      </div>
    </>
  );
}
