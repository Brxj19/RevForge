import { useNavigate } from "@solidjs/router";
import {
  createContext,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import type { OrganizationSummary, OrgRepository } from "~/lib/api";
import { useShortcut } from "~/lib/keyboard";
import { buildActions, type ActionContext } from "./actions";
import { CommandPalette } from "./CommandPalette";
import type { PaletteModeId } from "./modes";
import { createRepoSources, repoItems } from "./sources";

interface PaletteContextValue {
  open: (prefix?: string) => void;
  close: () => void;
  isOpen: Accessor<boolean>;
}

const PaletteContext = createContext<PaletteContextValue>();

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used inside <PaletteProvider>");
  return ctx;
}

export interface PaletteProviderProps {
  children: JSX.Element;
  anonymous: boolean;
  isPlatformAdmin: boolean;
  repos: Accessor<readonly OrgRepository[]>;
  orgs: Accessor<readonly OrganizationSummary[]>;
  repoContext: Accessor<{ org: string; repo: string; rev?: string } | null>;
  actions: Pick<ActionContext, "copyPermalink" | "showShortcuts" | "signOut">;
}

/** Owns palette state and its global shortcuts (⌘K, /, T in a repository). */
export function PaletteProvider(props: PaletteProviderProps) {
  const navigate = useNavigate();
  const [isOpen, setOpen] = createSignal(false);
  const [initial, setInitial] = createSignal("");
  const [mode, setMode] = createSignal<PaletteModeId>("default");
  const [term, setTerm] = createSignal("");

  const open = (prefix = "") => {
    setInitial(prefix);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const repoSources = createRepoSources(
    () => (isOpen() ? props.repoContext() : null),
    mode,
    term,
    (to) => navigate(to),
  );
  const items = createMemo(() => [
    ...buildActions({
      navigate: (to) => navigate(to),
      signedIn: !props.anonymous,
      isPlatformAdmin: props.isPlatformAdmin,
      repo: props.repoContext(),
      ...props.actions,
    }),
    ...repoItems(props.repos(), props.orgs(), (to) => navigate(to)),
    ...repoSources.items(),
  ]);

  useShortcut({
    keys: "mod+k",
    description: "Command palette",
    group: "General",
    allowInInputs: true,
    run: () => (isOpen() ? close() : open()),
  });
  useShortcut({
    keys: "/",
    description: "Search",
    group: "General",
    run: () => open(),
  });
  useShortcut({
    keys: "t",
    description: "Go to file (in a repository)",
    group: "Repository",
    scope: "repo",
    run: () => {
      if (props.repoContext()) open("~");
    },
  });

  const scope = () => {
    const r = props.repoContext();
    return r ? `${r.org} / ${r.repo}${r.rev ? ` @ ${r.rev}` : ""}` : null;
  };

  return (
    <PaletteContext.Provider value={{ open, close, isOpen }}>
      {props.children}
      <CommandPalette
        open={isOpen()}
        onOpenChange={setOpen}
        initial={initial()}
        items={items}
        anonymous={props.anonymous}
        scope={scope()}
        inRepo={!!props.repoContext()}
        loading={repoSources.loading()}
        codeSearch={repoSources.codeSearch()}
        onQueryChange={(m, t) => {
          setMode(m);
          setTerm(t);
        }}
      />
    </PaletteContext.Provider>
  );
}
