import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Show,
  type JSX,
} from "solid-js";
import type { RepositoryRefs } from "~/lib/api";
import { fuzzy } from "~/lib/fuzzy";
import { InputGroup } from "~/ui/Field";
import { Icon, type IconName } from "~/ui/icons";
import { Highlight, menuStyles } from "~/ui/Menu";
import { Popover } from "~/ui/Popover";
import styles from "./repo.module.css";

export interface RefChoice {
  /** Value for ?rev ("" = repository default). */
  rev: string;
  label: string;
  kind: "branch" | "bookmark" | "tag" | "changeset";
  hint?: string;
}

const HEX = /^[0-9a-f]{6,40}$/i;

/** Choices grouped like the prototype's ref menu: branches, bookmarks, tags (true case, U1). */
export function refChoices(refs: RepositoryRefs | undefined) {
  if (!refs) return [];
  const group = (
    label: string,
    kind: RefChoice["kind"],
    list: RepositoryRefs["branches"],
  ) => ({
    label,
    items: list.map((r): RefChoice => ({
      rev: kind === "branch" && r.name === "default" ? "" : r.name,
      label: r.name,
      kind,
      hint: r.short_node.slice(0, 12),
    })),
  });
  return [
    // Closed branches never appear in the picker, even from an include_closed response.
    group(
      "Branches",
      "branch",
      refs.branches.filter((b) => b.state !== "closed"),
    ),
    group("Bookmarks", "bookmark", refs.bookmarks),
    group("Tags", "tag", refs.tags),
  ].filter((g) => g.items.length);
}

const ICON: Record<RefChoice["kind"], IconName> = {
  branch: "branch",
  bookmark: "bookmark",
  tag: "tag",
  changeset: "commit",
};

/**
 * Ref picker (DESIGN.md §2.3): searchable branches, bookmarks and tags, plus "go to changeset" for
 * a short hash of at least 6 hex digits (I11). Arrows move, Enter picks, Esc closes.
 */
export function RefPicker(props: {
  refs: RepositoryRefs | undefined;
  loading: boolean;
  current: string;
  onPick: (rev: string) => void;
  trigger: JSX.Element;
}) {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal(0);
  const groups = createMemo(() =>
    refChoices(props.refs)
      .map((g) => ({
        ...g,
        items: g.items.filter((c) => fuzzy(c.label, q().trim()).ok),
      }))
      .filter((g) => g.items.length),
  );
  const flat = createMemo<RefChoice[]>(() => {
    const items = groups().flatMap((g) => g.items);
    const t = q().trim();
    if (HEX.test(t) && !items.some((c) => c.label === t))
      items.push({
        rev: t.toLowerCase(),
        label: t.toLowerCase(),
        kind: "changeset",
        hint: "Go to changeset",
      });
    return items;
  });
  const pick = (c: RefChoice | undefined) => {
    if (!c) return;
    setOpen(false);
    props.onPick(c.rev);
  };
  const onKey = (e: KeyboardEvent) => {
    const n = flat().length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, n - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(flat()[sel()]);
    }
  };
  const optionId = (c: RefChoice) => `${id}-${c.kind}-${c.label}`;
  const isCurrent = (c: RefChoice) =>
    c.rev === props.current ||
    (c.kind === "branch" && c.label === props.current);

  const Option = (p: { c: RefChoice }) => {
    const index = () => flat().indexOf(p.c);
    return (
      <div
        id={optionId(p.c)}
        role="option"
        aria-selected={index() === sel()}
        class={menuStyles.mi}
        data-highlighted={index() === sel() ? "" : undefined}
        onMouseMove={() => setSel(index())}
        onClick={() => pick(p.c)}
      >
        <span class={menuStyles.ck} aria-hidden="true">
          <Show when={isCurrent(p.c)}>
            <Icon name="check" size={14} />
          </Show>
        </span>
        <span class={menuStyles.lead}>
          <Icon name={ICON[p.c.kind]} size={15} />
        </span>
        <span class={menuStyles.tx}>
          <span>
            <Highlight
              text={p.c.label}
              parts={
                q().trim() ? fuzzy(p.c.label, q().trim()).parts : undefined
              }
            />
          </span>
        </span>
        <Show when={p.c.hint}>
          <span class={`${menuStyles.k} mono`}>{p.c.hint}</span>
        </Show>
      </div>
    );
  };

  return (
    <Popover
      open={open()}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQ("");
          setSel(0);
        }
      }}
      trigger="button"
      triggerProps={{
        class: styles.refBtn,
        "aria-label": `Switch branch, bookmark or tag (current: ${props.current || "default"})`,
        title: "Switch branch, bookmark or tag",
      }}
      triggerContent={props.trigger}
      title="Switch revision"
      hideTitle
      placement="bottom-start"
      flush
    >
      <div class={styles.picker}>
        <div class={styles.pickerSearch}>
          <InputGroup
            prefix={<Icon name="search" size={14} />}
            placeholder="Find a branch, tag or short hash"
            aria-label="Find a branch, bookmark, tag or changeset"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={((c) => (c ? optionId(c) : undefined))(
              flat()[sel()],
            )}
            autocomplete="off"
            spellcheck={false}
            value={q()}
            onInput={(e) => {
              setQ(e.currentTarget.value);
              setSel(0);
            }}
            onKeyDown={onKey}
          />
        </div>
        <div
          id={`${id}-list`}
          class={styles.pickerList}
          role="listbox"
          aria-label="Revisions"
        >
          <Show
            when={!props.loading}
            fallback={<div class={styles.pickerNone}>Loading refs…</div>}
          >
            <For each={groups()}>
              {(g) => (
                <div role="group" aria-label={g.label}>
                  <div class={menuStyles.grp} aria-hidden="true">
                    <span>{g.label}</span>
                    <span>{g.items.length}</span>
                  </div>
                  <For each={g.items}>{(c) => <Option c={c} />}</For>
                </div>
              )}
            </For>
            <Show when={flat().find((c) => c.kind === "changeset")}>
              {(c) => (
                <div role="group" aria-label="Changeset">
                  <div class={menuStyles.grp} aria-hidden="true">
                    <span>Changeset</span>
                  </div>
                  <Option c={c()} />
                </div>
              )}
            </Show>
            <Show when={!flat().length}>
              <div class={styles.pickerNone}>
                Nothing matches “{q()}”. Type at least 6 hex digits to open a
                changeset.
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Popover>
  );
}
