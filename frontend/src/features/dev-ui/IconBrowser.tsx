import { createMemo, createSignal, For, Show } from "solid-js";
import { copyText } from "~/lib/clipboard";
import { EmptyState } from "~/ui/EmptyState";
import { InputGroup } from "~/ui/Field";
import { Segmented } from "~/ui/Segmented";
import { Select } from "~/ui/Select";
import { showToast } from "~/ui/Toast";
import {
  FileIcon,
  FolderIcon,
  Icon,
  ICON_COUNTS,
  iconCatalogue,
  fileIconSvg,
  folderIconSvg,
  type IconCatalogueEntry,
} from "~/ui/icons";
import styles from "./dev-ui.module.css";

const svgFile = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${inner}</svg>`;

/** Searchable catalogue of every file and folder icon; click to copy its SVG (prototype drawIconGrid). */
export function IconBrowser() {
  const catalogue = iconCatalogue();
  const categories = [
    ...new Set([...catalogue.folders, ...catalogue.files].map((x) => x.cat)),
  ];
  const [q, setQ] = createSignal("");
  const [kind, setKind] = createSignal<"all" | "folders" | "files">("all");
  const [cat, setCat] = createSignal("all");

  const ok = (it: IconCatalogueEntry) => {
    const query = q().trim().toLowerCase();
    return (
      (cat() === "all" || it.cat === cat()) &&
      (!query ||
        it.label.toLowerCase().includes(query) ||
        it.cat.toLowerCase().includes(query))
    );
  };
  const folders = createMemo(() =>
    kind() === "files" ? [] : catalogue.folders.filter(ok),
  );
  const files = createMemo(() =>
    kind() === "folders" ? [] : catalogue.files.filter(ok),
  );
  const groups = (arr: IconCatalogueEntry[]) =>
    [...new Set(arr.map((x) => x.cat))].map((c) => ({
      cat: c,
      items: arr.filter((x) => x.cat === c),
    }));

  const copy = async (it: IconCatalogueEntry) => {
    const svg =
      it.kind === "folder"
        ? `${svgFile(folderIconSvg(it.name))}${svgFile(folderIconSvg(it.name, true))}`
        : svgFile(fileIconSvg(it.name));
    await copyText(svg);
    showToast({ message: `Copied ${it.name} SVG` });
  };

  const Tile = (p: { it: IconCatalogueEntry }) => (
    <button
      type="button"
      class={styles.tile}
      title={p.it.label}
      onClick={() => void copy(p.it)}
      aria-label={`Copy ${p.it.name} icon SVG`}
    >
      <Show
        when={p.it.kind === "folder"}
        fallback={<FileIcon name={p.it.name} size={18} />}
      >
        <FolderIcon name={p.it.name} size={18} />
        <FolderIcon name={p.it.name} open size={18} />
      </Show>
      <span class={styles.tileTx}>
        <span>{p.it.name}</span>
        <small>{p.it.label.split(" ").slice(1, 4).join(" ")}</small>
      </span>
    </button>
  );

  return (
    <div class={styles.browser}>
      <p class={styles.note}>
        {ICON_COUNTS.folderDesigns} folder designs covering{" "}
        {ICON_COUNTS.folderNames} folder names, and {ICON_COUNTS.fileDesigns}{" "}
        file designs covering {ICON_COUNTS.fileNames} extensions and file names.
        Click any icon to copy its SVG.
      </p>
      <div class={styles.row}>
        <InputGroup
          wrapClass={styles.grow}
          prefix={<Icon name="search" size={14} />}
          placeholder="Search: tsx, docker, migrations, .hgignore…"
          aria-label="Search icons"
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
        />
        <Segmented
          label="Icon kind"
          value={kind()}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "folders", label: "Folders" },
            { value: "files", label: "Files" },
          ]}
        />
        <Select
          label="Category"
          value={cat()}
          onChange={setCat}
          class={styles.w200}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>
      <Show when={folders().length}>
        <h3 class="h3">
          Folders <span class="subtle">{folders().length}</span>
        </h3>
        <For each={groups(folders())}>
          {(g) => (
            <>
              <div class={styles.label}>
                {g.cat} <span class="subtle">{g.items.length}</span>
              </div>
              <div class={styles.gal}>
                <For each={g.items}>{(it) => <Tile it={it} />}</For>
              </div>
            </>
          )}
        </For>
      </Show>
      <Show when={files().length}>
        <h3 class="h3">
          Files <span class="subtle">{files().length}</span>
        </h3>
        <For each={groups(files())}>
          {(g) => (
            <>
              <div class={styles.label}>
                {g.cat} <span class="subtle">{g.items.length}</span>
              </div>
              <div class={styles.gal}>
                <For each={g.items}>{(it) => <Tile it={it} />}</For>
              </div>
            </>
          )}
        </For>
      </Show>
      <Show when={!folders().length && !files().length}>
        <EmptyState
          art="no-results"
          compact
          level={3}
          title={`No icons match “${q()}”`}
          body="Unknown types fall back to the plain document icon."
        />
      </Show>
    </div>
  );
}
