import { foldAll, syntaxTree, unfoldAll } from "@codemirror/language";
import { gotoLine, openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { loadLanguage } from "~/lib/codemirror/languages";
import { revealLineRange, type LineRange } from "~/lib/codemirror/line-range";
import {
  Compartment,
  viewerState,
  type CursorStatus,
} from "~/lib/codemirror/setup";
import {
  foldLevel,
  foldRanges,
  outline,
  stickyScopes,
  type OutlineItem,
  type Scope,
} from "~/lib/codemirror/structure";
import { Button } from "~/ui/Button";
import { Icon } from "~/ui/icons";
import { Menu, type MenuGroupDef } from "~/ui/Menu";
import styles from "./code.module.css";

/** Shared state between the toolbar (in the sticky file header), the editor and the status bar. */
export function createCodeViewer() {
  const [view, setView] = createSignal<EditorView>();
  const [wrap, setWrap] = createSignal(false);
  const [status, setStatus] = createSignal<CursorStatus | null>(null);
  const [symbols, setSymbols] = createSignal<OutlineItem[]>([]);
  const [folds, setFolds] = createSignal(0);
  return {
    view,
    setView,
    wrap,
    setWrap,
    status,
    setStatus,
    symbols,
    setSymbols,
    folds,
    setFolds,
    find: () => {
      const v = view();
      if (v) openSearchPanel(v);
    },
    goto: () => {
      const v = view();
      if (v) gotoLine(v);
    },
  };
}
export type CodeViewer = ReturnType<typeof createCodeViewer>;

/** Editor toolbar (prototype editorBar): Outline, Fold, Unfold all, Find, Go to line, Wrap. */
export function CodeToolbar(props: {
  viewer: CodeViewer;
  onJump: (line: number) => void;
}) {
  const withView = (run: (view: EditorView) => unknown) => {
    const view = props.viewer.view();
    if (view) run(view);
  };
  const outlineGroups = (): MenuGroupDef[] => [
    {
      label: "Symbols",
      count: props.viewer.symbols().length,
      items: props.viewer
        .symbols()
        .slice(0, 200)
        .map((s) => ({
          id: `${s.line}`,
          label: `${"  ".repeat(Math.min(s.depth, 4))}${s.label}`,
          hint: undefined,
          kbd: `L${s.line}`,
          onSelect: () => props.onJump(s.line),
        })),
    },
  ];
  const foldGroups = (): MenuGroupDef[] => [
    {
      items: [
        { label: "Fold all", onSelect: () => withView(foldAll) },
        { label: "Unfold all", onSelect: () => withView(unfoldAll) },
      ],
    },
    {
      label: "Fold level",
      items: [1, 2, 3].map((n) => ({
        label: `Level ${n}`,
        onSelect: () => withView((view) => foldLevel(view, n)),
      })),
    },
  ];
  return (
    <div class={styles.edBar} role="toolbar" aria-label="Code viewer">
      <Menu
        groups={outlineGroups()}
        trigger={(p: Record<string, unknown>) => (
          <Button
            {...p}
            variant="ghost"
            size="sm"
            disabled={!props.viewer.symbols().length}
            title="Go to symbol (⌘⇧O)"
          >
            <Icon name="list" size={13} />
            Outline
            <span class={styles.edCount}>{props.viewer.symbols().length}</span>
          </Button>
        )}
      />
      <Menu
        groups={foldGroups()}
        trigger={(p: Record<string, unknown>) => (
          <Button
            {...p}
            variant="ghost"
            size="sm"
            disabled={!props.viewer.folds()}
            title="Fold regions (⌘⇧[ / ⌘⇧])"
          >
            <Icon name="collapse" size={13} />
            Fold
            <span class={styles.edCount}>{props.viewer.folds()}</span>
          </Button>
        )}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={!props.viewer.folds()}
        onClick={() => withView(unfoldAll)}
      >
        Unfold all
      </Button>
      <span class={styles.edSep} aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => props.viewer.find()}
        title="Find in file (⌘F)"
      >
        <Icon name="search" size={13} />
        Find
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => props.viewer.goto()}
        title="Go to line (⌘G)"
      >
        Go to line
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={props.viewer.wrap()}
        class={props.viewer.wrap() ? styles.edPressed : undefined}
        onClick={() => props.viewer.setWrap((w) => !w)}
        title="Word wrap (⌥Z)"
      >
        Wrap
      </Button>
    </div>
  );
}

export interface CodeEditorProps {
  viewer: CodeViewer;
  doc: string;
  /** Grammar id from file-kinds (lazy-loaded). */
  langId: string;
  /** Selected line range from ?L=. */
  range: LineRange | null;
  onRange: (range: LineRange) => void;
}

/**
 * CodeMirror 6 configured as a read-only viewer (code-viewer.md). Created on mount, rebuilt when the
 * document changes, destroyed on cleanup.
 */
export function CodeEditor(props: CodeEditorProps) {
  let host!: HTMLDivElement;
  let stickyBox!: HTMLDivElement;
  const wrapC = new Compartment();
  const langC = new Compartment();
  const [scopes, setScopes] = createSignal<Scope[]>([]);
  let structureTimer: ReturnType<typeof setTimeout> | undefined;

  const refreshStructure = (view: EditorView) => {
    clearTimeout(structureTimer);
    structureTimer = setTimeout(() => {
      props.viewer.setSymbols(outline(view.state));
      props.viewer.setFolds(foldRanges(view.state).length);
    }, 250);
  };

  const makeState = (doc: string) =>
    viewerState({
      doc,
      language: null,
      wrap: props.viewer.wrap(),
      wrapCompartment: wrapC,
      languageCompartment: langC,
      onSelectRange: (r) => props.onRange(r),
      onStatus: (s) => props.viewer.setStatus(s),
      onToggleWrap: () => props.viewer.setWrap((w) => !w),
    });

  const applyLanguage = async (view: EditorView, id: string) => {
    const lang = await loadLanguage(id);
    if (props.viewer.view() !== view) return;
    view.dispatch({ effects: langC.reconfigure(lang ?? []) });
  };

  onMount(() => {
    const view = new EditorView({
      state: makeState(props.doc),
      parent: host,
      dispatchTransactions: (trs, v) => {
        v.update(trs);
        if (trs.some((t) => syntaxTree(t.state) !== syntaxTree(t.startState)))
          refreshStructure(v);
      },
    });
    props.viewer.setView(view);
    refreshStructure(view);
    void applyLanguage(view, props.langId);
    if (props.range) revealLineRange(view, props.range);
  });

  createEffect(
    on(
      () => [props.doc, props.langId] as const,
      ([doc, id]) => {
        const view = props.viewer.view();
        if (!view) return;
        view.setState(makeState(doc));
        refreshStructure(view);
        void applyLanguage(view, id);
        revealLineRange(view, props.range);
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      () => props.range,
      (range) => {
        const view = props.viewer.view();
        if (view) revealLineRange(view, range);
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      () => props.viewer.wrap(),
      (w) => {
        props.viewer.view()?.dispatch({
          effects: wrapC.reconfigure(w ? EditorView.lineWrapping : []),
        });
      },
      { defer: true },
    ),
  );

  // Sticky scroll: enclosing scopes of the first visible line, pinned under the file header.
  let frame = 0;
  const onScroll = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const view = props.viewer.view();
      if (!view || !stickyBox.isConnected) return;
      const top = stickyBox.getBoundingClientRect().top;
      if (top <= view.documentTop) {
        setScopes([]);
        return;
      }
      const block = view.lineBlockAtHeight(top - view.documentTop);
      const line = view.state.doc.lineAt(block.from).number;
      setScopes(stickyScopes(view.state, line + 1));
    });
  };
  onMount(() => document.addEventListener("scroll", onScroll, true));

  // ⌘F / ⌘G / ⌘⇧O / ⌥Z work anywhere on the code page, not only with focus in the editor.
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('[aria-modal="true"]')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && k === "f") {
      e.preventDefault();
      props.viewer.find();
    } else if (mod && !e.shiftKey && k === "g") {
      e.preventDefault();
      props.viewer.goto();
    } else if (e.altKey && e.code === "KeyZ") {
      e.preventDefault();
      props.viewer.setWrap((w) => !w);
    }
  };
  onMount(() => document.addEventListener("keydown", onKey, true));

  onCleanup(() => {
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("keydown", onKey, true);
    cancelAnimationFrame(frame);
    clearTimeout(structureTimer);
    props.viewer.view()?.destroy();
    props.viewer.setView(undefined);
  });

  const jump = (line: number) => {
    const view = props.viewer.view();
    if (view) revealLineRange(view, [line, line]);
    props.onRange([line, line]);
  };

  return (
    <>
      <div
        ref={stickyBox}
        class={styles.sticky2}
        style={{ top: "var(--sticky-top, 0px)" }}
        hidden={!scopes().length}
        aria-label="Enclosing scopes"
        role="navigation"
      >
        <For each={scopes()}>
          {(s) => (
            <button type="button" onClick={() => jump(s.line)}>
              <span class={styles.stickyLn}>{s.line}</span>
              <span class={styles.stickyText}>{s.text}</span>
            </button>
          )}
        </For>
      </div>
      <div ref={host} class={styles.editor} />
    </>
  );
}

/** Status bar (prototype .ed-status): Ln, Col · selection · indentation · encoding · EOL · language. */
export function CodeStatus(props: {
  viewer: CodeViewer;
  doc: string;
  language: string;
}) {
  const lines = () => props.doc.split("\n").length;
  const indent = () => {
    const sample = props.doc.split("\n").slice(0, 400);
    if (sample.some((l) => l.startsWith("\t"))) return "Tabs";
    const widths = sample
      .map((l) => /^( +)\S/.exec(l)?.[1]?.length ?? 0)
      .filter((n) => n > 0);
    const min = widths.length ? Math.min(...widths) : 4;
    return `Spaces: ${min === 2 || min === 8 ? min : 4}`;
  };
  const eol = () => (props.doc.includes("\r\n") ? "CRLF" : "LF");
  return (
    <div class={styles.status} aria-live="polite">
      <span>
        <Show
          when={props.viewer.status()}
          fallback={`${lines()} ${lines() === 1 ? "line" : "lines"}`}
        >
          {(s) => (
            <>
              Ln {s().line}, Col {s().col}
              <Show when={s().selectedLines > 0}>
                {" "}
                ({s().selectedLines}{" "}
                {s().selectedLines === 1 ? "line" : "lines"} selected)
              </Show>
            </>
          )}
        </Show>
      </span>
      <span>{indent()}</span>
      <span>UTF-8</span>
      <span>{eol()}</span>
      <span class={styles.statusLang}>{props.language}</span>
    </div>
  );
}
