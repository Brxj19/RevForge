import { A, useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { NotFoundPage } from "~/features/errors";
import { Button } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { CopyButton } from "~/ui/CopyButton";
import { InputGroup } from "~/ui/Field";
import { Icon } from "~/ui/icons";
import { Table, Td, Th } from "~/ui/Table";
import { showToast } from "~/ui/Toast";
import { Pane, Panes, Workspace, WsBody } from "~/ui/WorkspaceLayout";
import {
  DOC_GROUPS,
  DOCS_BY_SLUG,
  DOCS_FLAT,
  type DocBlock,
  type InlineSpan,
} from "./docs-data";
import styles from "./docs.module.css";

function renderSpans(spans: readonly InlineSpan[]) {
  return (
    <For each={spans}>
      {(span) => {
        if (typeof span === "string") return span;
        if (span.kind === "code") return <code>{span.text}</code>;
        return <strong>{span.text}</strong>;
      }}
    </For>
  );
}

function CodeTabsBlock(props: {
  id: string;
  tabs: readonly { id: string; label: string; code: string }[];
}) {
  // eslint-disable-next-line solid/reactivity
  const [selected, setSelected] = createSignal(props.tabs[0]?.id ?? "");
  const active = () =>
    props.tabs.find((t) => t.id === selected()) ??
    props.tabs[0] ?? { id: "", label: "", code: "" };

  return (
    <div>
      <div
        class={styles.tabs}
        role="tablist"
        aria-label="Code example language"
      >
        <For each={props.tabs}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              id={`${props.id}-tab-${tab.id}`}
              aria-selected={selected() === tab.id}
              aria-controls={`${props.id}-panel-${tab.id}`}
              class={styles.tabBtn}
              onClick={() => setSelected(tab.id)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <div
        role="tabpanel"
        id={`${props.id}-panel-${active().id}`}
        aria-labelledby={`${props.id}-tab-${active().id}`}
        class={`${styles.codeBlock} ${styles.tabCode}`}
      >
        <pre>
          <code>{active().code}</code>
        </pre>
        <span class={styles.codeCopy}>
          <CopyButton
            text={active().code}
            label={`Copy ${active().label} snippet`}
          />
        </span>
      </div>
    </div>
  );
}

function DocBlockView(props: { block: DocBlock }) {
  return (
    <Switch>
      <Match when={props.block.kind === "p"}>
        <p class={styles.p}>
          {renderSpans(
            (props.block as Extract<DocBlock, { kind: "p" }>).content,
          )}
        </p>
      </Match>
      <Match when={props.block.kind === "h2"}>
        {(() => {
          const b = props.block as Extract<DocBlock, { kind: "h2" }>;
          return (
            <h2 id={b.id} class={styles.h2}>
              {b.text}
            </h2>
          );
        })()}
      </Match>
      <Match when={props.block.kind === "code"}>
        {(() => {
          const b = props.block as Extract<DocBlock, { kind: "code" }>;
          return (
            <div class={styles.codeBlock}>
              <pre>
                <code>{b.code}</code>
              </pre>
              <span class={styles.codeCopy}>
                <CopyButton text={b.code} label={b.label ?? "Copy code"} />
              </span>
            </div>
          );
        })()}
      </Match>
      <Match when={props.block.kind === "codeTabs"}>
        {(() => {
          const b = props.block as Extract<DocBlock, { kind: "codeTabs" }>;
          return <CodeTabsBlock id={b.id} tabs={b.tabs} />;
        })()}
      </Match>
      <Match when={props.block.kind === "callout"}>
        {(() => {
          const b = props.block as Extract<DocBlock, { kind: "callout" }>;
          return (
            <div class={styles.blockGap}>
              <Callout tone={b.tone} title={b.title}>
                {b.text}
              </Callout>
            </div>
          );
        })()}
      </Match>
      <Match when={props.block.kind === "table"}>
        {(() => {
          const b = props.block as Extract<DocBlock, { kind: "table" }>;
          return (
            <div class={styles.blockGap}>
              <Table caption={b.caption}>
                <Show when={b.headers}>
                  <thead>
                    <tr>
                      <For each={b.headers}>
                        {(h, i) => (
                          <Th
                            class={
                              b.rows[0]?.[i()]?.center
                                ? styles.tableCellCenter
                                : undefined
                            }
                          >
                            {h}
                          </Th>
                        )}
                      </For>
                    </tr>
                  </thead>
                </Show>
                <tbody>
                  <For each={b.rows}>
                    {(row) => (
                      <tr>
                        <For each={row}>
                          {(cell) => (
                            <Td
                              class={
                                [
                                  cell.mono ? "mono" : "",
                                  cell.muted ? "muted" : "",
                                  cell.center ? styles.tableCellCenter : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined
                              }
                            >
                              {cell.text}
                            </Td>
                          )}
                        </For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </Table>
            </div>
          );
        })()}
      </Match>
      <Match when={props.block.kind === "endpoints"}>
        {(() => {
          const b = props.block as Extract<DocBlock, { kind: "endpoints" }>;
          return (
            <div class={styles.endpoints}>
              <For each={b.items}>
                {(ep) => (
                  <div class={styles.endpoint}>
                    <span class={styles.method}>{ep.method}</span>
                    <span>{ep.path}</span>
                  </div>
                )}
              </For>
            </div>
          );
        })()}
      </Match>
    </Switch>
  );
}

export default function DocsPage() {
  const params = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams<{ q?: string }>();

  const slug = () => params.slug ?? "intro";
  const page = createMemo(() => DOCS_BY_SLUG.get(slug()));

  const query = () =>
    typeof searchParams.q === "string" ? searchParams.q : "";

  const [feedback, setFeedback] = createSignal<"yes" | "no" | null>(null);

  createEffect(() => {
    // Reset recorded feedback when switching pages.
    slug();
    setFeedback(null);
  });

  const filteredGroups = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return DOC_GROUPS;
    return DOC_GROUPS.map((g) => ({
      ...g,
      pages: g.pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.group.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q),
      ),
    })).filter((g) => g.pages.length > 0);
  });

  const pageIndex = createMemo(() =>
    DOCS_FLAT.findIndex((d) => d.slug === slug()),
  );
  const prevPage = () =>
    pageIndex() > 0 ? DOCS_FLAT[pageIndex() - 1] : undefined;
  const nextPage = () =>
    pageIndex() >= 0 && pageIndex() < DOCS_FLAT.length - 1
      ? DOCS_FLAT[pageIndex() + 1]
      : undefined;

  const tocItems = createMemo(() => {
    const p = page();
    if (!p) return [];
    return p.blocks.filter(
      (b): b is Extract<DocBlock, { kind: "h2" }> => b.kind === "h2",
    );
  });

  const onSearch = (value: string) => {
    setSearchParams(
      { q: value ? value : undefined },
      { replace: true, scroll: false },
    );
  };

  const docHref = (targetSlug: string) => {
    const q = query();
    return q
      ? `/docs/${targetSlug}?q=${encodeURIComponent(q)}`
      : `/docs/${targetSlug}`;
  };

  const recordFeedback = (choice: "yes" | "no") => {
    setFeedback(choice);
    showToast({
      message:
        choice === "yes"
          ? "Thanks for the feedback"
          : "Thanks, we’ll improve it",
      tone: "info",
    });
  };

  return (
    <Show when={page()} fallback={<NotFoundPage />}>
      {(doc) => (
        <Workspace>
          <WsBody>
            <Panes
              columns="230px minmax(0, 1fr) 190px"
              class={styles.panes}
            >
              <Pane as="nav" aria-label="Developer docs" class={styles.nav}>
                <div class={styles.searchWrap}>
                  <InputGroup
                    prefix={<Icon name="search" size={14} />}
                    placeholder="Search docs"
                    aria-label="Search docs"
                    value={query()}
                    onInput={(e) => onSearch(e.currentTarget.value)}
                  />
                </div>
                <Show
                  when={filteredGroups().length > 0}
                  fallback={<p class={styles.emptyFilter}>No pages match.</p>}
                >
                  <For each={filteredGroups()}>
                    {(group) => (
                      <div>
                        <h4 class={styles.groupTitle}>{group.title}</h4>
                        <For each={group.pages}>
                          {(item) => (
                            <A
                              href={docHref(item.slug)}
                              class={styles.navLink}
                              aria-current={
                                item.slug === doc().slug ? "page" : undefined
                              }
                            >
                              {item.title}
                            </A>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </Show>
              </Pane>

              <Pane as="section" aria-label={doc().title}>
                <article class={styles.prose}>
                  <div class={styles.eyebrow}>{doc().group}</div>
                  <h1 class={styles.title}>{doc().title}</h1>
                  <For each={doc().blocks}>
                    {(block) => <DocBlockView block={block} />}
                  </For>
                  <nav class={styles.prevNext} aria-label="Previous and next page">
                    <Show when={prevPage()} fallback={<span />}>
                      {(prev) => (
                        <A href={docHref(prev().slug)} class={styles.pnCard}>
                          <small>Previous</small>
                          <span>{prev().title}</span>
                        </A>
                      )}
                    </Show>
                    <Show when={nextPage()}>
                      {(next) => (
                        <A
                          href={docHref(next().slug)}
                          class={`${styles.pnCard} ${styles.pnNext}`}
                        >
                          <small>Next</small>
                          <span>{next().title}</span>
                        </A>
                      )}
                    </Show>
                  </nav>
                  <div class={styles.feedback}>
                    <Show
                      when={feedback()}
                      fallback={
                        <>
                          <span>Was this page helpful?</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => recordFeedback("yes")}
                          >
                            Yes
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => recordFeedback("no")}
                          >
                            No
                          </Button>
                        </>
                      }
                    >
                      <span role="status">Thanks for the feedback.</span>
                    </Show>
                  </div>
                </article>
              </Pane>

              <Pane as="aside" aria-label="On this page" class={styles.toc}>
                <Show when={tocItems().length > 0}>
                  <div class={styles.tocTitle}>On this page</div>
                  <For each={tocItems()}>
                    {(item) => (
                      <a
                        href={`#${item.id}`}
                        class={styles.tocLink}
                        onClick={(e) => {
                          e.preventDefault();
                          document
                            .getElementById(item.id)
                            ?.scrollIntoView?.({ behavior: "smooth" });
                        }}
                      >
                        {item.text}
                      </a>
                    )}
                  </For>
                </Show>
              </Pane>
            </Panes>
          </WsBody>
        </Workspace>
      )}
    </Show>
  );
}
