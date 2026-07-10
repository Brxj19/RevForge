import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth } from "../app/use-auth";
import { getOrganization, getRepository } from "../lib/api";
import { CloneDialog } from "./clone-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CommandPalette } from "./ui/command-palette";
import { IconButton } from "./ui/icon-button";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("revforge-theme");
    if (stored === "dark" || stored === "light") return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );
    localStorage.setItem("revforge-theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((current) => !current) };
}

function useOutsideClick(handler: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [handler]);

  return ref;
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M2.5 2.5l1.5 1.5M12 12l1.5 1.5M2.5 13.5l1.5-1.5M12 4l1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 11l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 5h14M2 9h14M2 13h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4l10 10M14 4L4 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusBadgeVariant(
  state: "unprovisioned" | "provisioning" | "ready" | "failed",
) {
  switch (state) {
    case "ready":
      return "success";
    case "provisioning":
      return "info";
    case "failed":
      return "danger";
    default:
      return "warning";
  }
}

function UserMenu() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate("/login")}>
          Sign in
        </Button>
        <Button onClick={() => navigate("/register")}>Register</Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary hover:bg-surface-subtle"
        onClick={() => setOpen((current) => !current)}
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          {user?.display_name?.slice(0, 1).toUpperCase() ?? "?"}
        </span>
        <span className="hidden max-w-32 truncate md:inline">
          {user?.display_name}
        </span>
        <ChevronDownIcon />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-border bg-surface py-1 shadow-dropdown"
          role="menu"
        >
          <div className="border-b border-border px-3 py-2 text-xs text-text-muted">
            Signed in as{" "}
            <span className="font-medium text-text-primary">{user?.email}</span>
          </div>
          {[
            { label: "Profile", to: "/settings" },
            { label: "SSH keys", to: "/settings?tab=ssh-keys" },
            { label: "Access tokens", to: "/settings?tab=tokens" },
            { label: "Sessions", to: "/settings?tab=sessions" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-subtle"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
            >
              {item.label}
            </button>
          ))}
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              className="flex w-full items-center px-3 py-2 text-left text-sm text-danger hover:bg-danger-subtle"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout().then(() => navigate("/login"));
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const repositoryTabs = [
  { label: "Overview", path: "" },
  { label: "Code", path: "/code" },
  { label: "History", path: "/history" },
  { label: "Branches", path: "/branches" },
  { label: "Bookmarks", path: "/bookmarks" },
  { label: "Tags", path: "/tags" },
  { label: "Settings", path: "/settings", adminOnly: true },
];

function RepositoryContextHeader() {
  const { organizationSlug, repositorySlug } = useParams();
  const location = useLocation();
  const [cloneOpen, setCloneOpen] = useState(false);

  const organizationQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug ?? ""),
    enabled: Boolean(organizationSlug),
  });

  const repositoryQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug ?? "", repositorySlug ?? ""),
    enabled: Boolean(organizationSlug && repositorySlug),
  });

  if (!organizationSlug || !repositorySlug) {
    return null;
  }

  if (
    organizationQuery.isLoading ||
    repositoryQuery.isLoading ||
    organizationQuery.isError ||
    repositoryQuery.isError ||
    !organizationQuery.data ||
    !repositoryQuery.data
  ) {
    return null;
  }

  const organization = organizationQuery.data;
  const repository = repositoryQuery.data;
  const basePath = `/organizations/${organization.slug}/repositories/${repository.slug}`;

  return (
    <div className="border-b border-border bg-surface">
      <div className="px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <nav
              className="flex items-center gap-1 text-sm text-text-muted"
              aria-label="Repository breadcrumb"
            >
              <NavLink to="/organizations" className="hover:text-text-primary">
                Organizations
              </NavLink>
              <span>/</span>
              <NavLink
                to={`/organizations/${organization.slug}`}
                className="hover:text-text-primary"
              >
                {organization.display_name}
              </NavLink>
              <span>/</span>
              <span className="font-medium text-text-primary">
                {repository.display_name}
              </span>
            </nav>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
                {repository.display_name}
              </h1>
              <Badge
                variant={
                  repository.visibility === "public"
                    ? "success"
                    : repository.visibility === "internal"
                      ? "warning"
                      : "default"
                }
              >
                {repository.visibility}
              </Badge>
              <Badge
                variant={statusBadgeVariant(repository.provisioning_state)}
              >
                {repository.provisioning_state}
              </Badge>
              <Badge variant="primary">
                Role: {repository.viewer_role ?? "metadata"}
              </Badge>
              {repository.archived_at ? (
                <Badge variant="neutral">Archived</Badge>
              ) : null}
            </div>
            <p className="mt-2 max-w-4xl text-sm text-text-secondary">
              {repository.description ??
                "Mercurial-native repository browsing, history inspection, and controlled clone access."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {repository.is_browsable ? (
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.assign(`${basePath}/code${location.search}`);
                }}
              >
                Browse code
              </Button>
            ) : null}
            <Button onClick={() => setCloneOpen(true)}>Clone</Button>
            {repository.can_manage ? (
              <Button
                variant="secondary"
                onClick={() => window.location.assign(`${basePath}/settings`)}
              >
                Settings
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto border-t border-border px-2">
        <nav
          className="flex min-w-max items-center gap-1"
          aria-label="Repository sections"
        >
          {repositoryTabs
            .filter((tab) => !tab.adminOnly || repository.can_manage)
            .map((tab) => {
              const to = `${basePath}${tab.path}`;
              const active =
                tab.path === ""
                  ? location.pathname === basePath
                  : tab.path === "/history"
                    ? location.pathname === `${basePath}/history` ||
                      location.pathname === `${basePath}/commits` ||
                      location.pathname.startsWith(`${basePath}/changesets/`)
                    : location.pathname.startsWith(to);

              return (
                <NavLink
                  key={tab.label}
                  to={to}
                  end={tab.path === ""}
                  className={clsx(
                    "border-b-2 px-3 py-2.5 text-sm font-medium",
                    active
                      ? "border-accent text-text-primary"
                      : "border-transparent text-text-muted hover:text-text-primary",
                  )}
                >
                  {tab.label}
                </NavLink>
              );
            })}
        </nav>
      </div>
      <CloneDialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        organizationSlug={organization.slug}
        repositorySlug={repository.slug}
      />
    </div>
  );
}

const primaryNav = [
  {
    label: "Dashboard",
    to: "/",
    keywords: ["home", "overview"],
    description: "Continue working and check repository health",
  },
  {
    label: "Organizations",
    to: "/organizations",
    keywords: ["teams", "members", "repos"],
    description: "Browse organization workspaces and repository catalogs",
  },
  {
    label: "Repositories",
    to: "/organizations",
    keywords: ["code", "catalog"],
    description: "Open repository tables and repository-level actions",
  },
  {
    label: "Reviews",
    to: "/reviews",
    keywords: ["change requests"],
    description: "Review placeholders and upcoming collaborative flows",
  },
  {
    label: "Activity",
    to: "/activity",
    keywords: ["audit", "events"],
    description: "Inspect operational and authorization activity",
  },
  {
    label: "Settings",
    to: "/settings",
    keywords: ["profile", "keys", "tokens"],
    description: "Manage user preferences, SSH keys, and access tokens",
  },
];

export function AppShell() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationSlug, repositorySlug } = useParams();
  const { dark, toggle } = useDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const isRepositoryRoute = Boolean(organizationSlug && repositorySlug);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const interactive =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }

      if (!interactive && event.key === "/") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const paletteItems = useMemo(() => {
    const baseItems = primaryNav.map((item) => ({
      id: item.label,
      label: item.label,
      detail: item.description,
      keywords: item.keywords,
      to: item.to,
    }));

    if (!organizationSlug || !repositorySlug) {
      return baseItems;
    }

    const basePath = `/organizations/${organizationSlug}/repositories/${repositorySlug}`;

    return [
      ...baseItems,
      {
        id: "repo-code",
        label: "Browse repository code",
        detail: `${organizationSlug}/${repositorySlug} code browser`,
        keywords: ["repository", "code", "worktree"],
        to: `${basePath}/code${location.search}`,
      },
      {
        id: "repo-history",
        label: "Open repository history",
        detail: `${organizationSlug}/${repositorySlug} changesets`,
        keywords: ["changesets", "history", "revision"],
        to: `${basePath}/history`,
      },
      {
        id: "repo-settings",
        label: "Open repository settings",
        detail: `${organizationSlug}/${repositorySlug} configuration`,
        keywords: ["access", "transport", "danger zone"],
        to: `${basePath}/settings`,
      },
    ];
  }, [location.search, organizationSlug, repositorySlug]);

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          <IconButton
            aria-label={
              mobileNavOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="lg:hidden"
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            {mobileNavOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>

          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md border border-border bg-ink-950 text-[11px] font-bold tracking-[0.2em] text-white">
              RF
            </div>
            <div className="hidden sm:block">
              <div className="text-[13px] font-semibold text-text-primary">
                RevForge
              </div>
              <div className="text-[11px] text-text-muted">
                Mercurial hosting and review
              </div>
            </div>
          </NavLink>

          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <button
              type="button"
              className="flex h-9 min-w-[280px] max-w-[420px] flex-1 items-center justify-between rounded-md border border-border bg-canvas px-3 text-sm text-text-muted hover:border-border-strong hover:text-text-primary"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <span className="flex items-center gap-2">
                <SearchIcon />
                Search repositories, revisions, and actions
              </span>
              <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-text-muted">
                {navigator.platform.includes("Mac") ? "⌘K" : "Ctrl+K"}
              </kbd>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate("/organizations")}
                >
                  New repository
                </Button>
                <IconButton
                  aria-label={
                    dark ? "Switch to light mode" : "Switch to dark mode"
                  }
                  onClick={toggle}
                >
                  {dark ? <SunIcon /> : <MoonIcon />}
                </IconButton>
              </>
            ) : null}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside
          className={clsx(
            "fixed inset-y-14 left-0 z-30 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-56px)]",
            mobileNavOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="border-b border-border px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">
              Workspace
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Serious repository browsing, history inspection, and controlled
              access flows.
            </p>
          </div>
          <nav
            className="flex-1 overflow-y-auto px-3 py-4"
            aria-label="Primary navigation"
          >
            <div className="grid gap-1">
              {primaryNav.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    clsx(
                      "rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-accent-subtle font-medium text-text-primary"
                        : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
                    )
                  }
                >
                  <span className="block">{item.label}</span>
                  <span className="mt-1 block text-[11px] text-text-muted">
                    {item.description}
                  </span>
                </NavLink>
              ))}
            </div>
          </nav>
          <div className="border-t border-border px-4 py-3 text-[11px] text-text-muted">
            Repository paths, revisions, and filters stay URL-addressable by
            default.
          </div>
        </aside>

        {mobileNavOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <main className="min-w-0 flex-1">
          {isRepositoryRoute ? <RepositoryContextHeader /> : null}
          <div
            className={clsx(
              "px-4 py-5 md:px-5",
              isRepositoryRoute ? "pt-5" : "pt-6",
            )}
          >
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        items={paletteItems}
      />
    </div>
  );
}
