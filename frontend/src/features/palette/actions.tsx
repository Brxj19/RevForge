import type { PaletteItem } from "./types";

export interface ActionContext {
  navigate: (to: string) => void;
  signedIn: boolean;
  isPlatformAdmin: boolean;
  repo: { org: string; repo: string } | null;
  copyPermalink: () => void;
  showShortcuts: () => void;
  signOut: () => void;
}

/** Commands for the `>` mode, ported from the prototype's ACTIONS (only those whose screens exist as routes). */
export function buildActions(ctx: ActionContext): PaletteItem[] {
  const go = (to: string) => () => ctx.navigate(to);
  const r = ctx.repo
    ? `/${encodeURIComponent(ctx.repo.org)}/${encodeURIComponent(ctx.repo.repo)}`
    : null;
  const name = ctx.repo ? `${ctx.repo.org}/${ctx.repo.repo}` : "";
  const items: (PaletteItem | false)[] = [
    ctx.signedIn && {
      id: "a:new",
      group: "Actions",
      label: "Create repository",
      icon: "plus",
      kbd: "N R",
      run: go("/new"),
    },
    !!r && {
      id: "a:code",
      group: "Actions",
      label: "Browse repository code",
      detail: name,
      icon: "file",
      kbd: "G C",
      run: go(`${r}/code`),
    },
    !!r && {
      id: "a:hist",
      group: "Actions",
      label: "Open repository history",
      detail: name,
      icon: "clock",
      run: go(`${r}/history`),
    },
    !!r &&
      ctx.signedIn && {
        id: "a:set",
        group: "Actions",
        label: "Open repository settings",
        detail: name,
        icon: "gear",
        run: go(`${r}/settings`),
      },
    {
      id: "a:perma",
      group: "Actions",
      label: "Copy link to this page",
      detail: "Includes revision and path",
      icon: "link",
      kbd: "Y",
      run: ctx.copyPermalink,
    },
    ctx.signedIn && {
      id: "a:home",
      group: "Actions",
      label: "Go home",
      icon: "home",
      kbd: "G H",
      run: go("/"),
    },
    ctx.signedIn && {
      id: "a:repos",
      group: "Actions",
      label: "Open repositories",
      icon: "repo",
      kbd: "G R",
      run: go("/repos"),
    },
    ctx.signedIn && {
      id: "a:act",
      group: "Actions",
      label: "Open activity log",
      detail: "Pushes, clones, access",
      icon: "pulse",
      kbd: "G A",
      run: go("/activity"),
    },
    {
      id: "a:explore",
      group: "Actions",
      label: "Explore repositories",
      icon: "compass",
      run: go("/explore"),
    },
    ctx.signedIn && {
      id: "a:ssh",
      group: "Actions",
      label: "Add SSH key",
      detail: "Your settings",
      icon: "key",
      run: go("/settings/ssh-keys"),
    },
    ctx.signedIn && {
      id: "a:token",
      group: "Actions",
      label: "Create access token",
      detail: "Your settings",
      icon: "lock",
      run: go("/settings/tokens"),
    },
    ctx.signedIn && {
      id: "a:accent",
      group: "Actions",
      label: "Change accent colour",
      detail: "Appearance",
      icon: "palette",
      run: go("/settings/preferences"),
    },
    ctx.isPlatformAdmin && {
      id: "a:admin",
      group: "Actions",
      label: "Open forge admin",
      icon: "shield",
      run: go("/admin"),
    },
    {
      id: "a:keys",
      group: "Actions",
      label: "Show keyboard shortcuts",
      icon: "keyboard",
      kbd: "?",
      run: ctx.showShortcuts,
    },
    {
      id: "a:docs",
      group: "Actions",
      label: "Open developer docs",
      icon: "book",
      run: go("/docs"),
    },
    {
      id: "a:kit",
      group: "Actions",
      label: "Open UI kit",
      detail: "Design-system components",
      icon: "kit",
      run: go("/dev/ui"),
    },
    ctx.signedIn && {
      id: "a:out",
      group: "Actions",
      label: "Sign out",
      icon: "logout",
      run: ctx.signOut,
    },
  ];
  return items.filter((x): x is PaletteItem => Boolean(x));
}
