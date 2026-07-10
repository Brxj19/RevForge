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
import { CommandPalette, type CommandPaletteItem } from "./ui/command-palette";
import { IconButton } from "./ui/icon-button";

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

function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 3.5L5.5 8L10 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 3.5L10.5 8L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 6.5L8 2.5L13.5 6.5V13a.5.5 0 0 1-.5.5h-3v-4h-4v4H3a.5.5 0 0 1-.5-.5V6.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OrganizationIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 13.5V3.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v10"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M6 5.5h1M9 5.5h1M6 8.5h1M9 8.5h1M2 13.5h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RepositoryIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v8A1.5 1.5 0 0 1 12 13.5H4A1.5 1.5 0 0 1 2.5 12V4z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5 5.5h6M5 8h6M5 10.5h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3.5h10v7H6l-3 2v-9z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 6h5M5.5 8.5h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 10h2l1.5-4 2.5 6 1.5-4H13.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5zm5 2.5l-1 .4a4.9 4.9 0 0 1-.3 1l.6.9l-1.4 1.4l-.9-.6a4.9 4.9 0 0 1-1 .3l-.4 1H7.4l-.4-1a4.9 4.9 0 0 1-1-.3l-.9.6l-1.4-1.4l.6-.9a4.9 4.9 0 0 1-.3-1l-1-.4V7.4l1-.4c.1-.3.2-.7.3-1l-.6-.9l1.4-1.4l.9.6c.3-.1.7-.2 1-.3l.4-1h1.2l.4 1c.3.1.7.2 1 .3l.9-.6l1.4 1.4l-.6.9c.1.3.2.7.3 1l1 .4V8z"
        stroke="currentColor"
        strokeWidth="1.2"
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
        className="flex items-center gap-2 rounded-sm border border-border bg-surface px-2.5 py-2 text-sm text-text-primary shadow-panel hover:border-border-strong hover:bg-surface-hover"
        onClick={() => setOpen((current) => !current)}
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 place-items-center rounded-sm border border-border-strong bg-surface-muted font-mono text-xs font-semibold text-text-primary">
          {user?.display_name?.slice(0, 1).toUpperCase() ?? "?"}
        </span>
        <span className="hidden max-w-40 truncate md:inline">
          {user?.display_name}
        </span>
        <ChevronDownIcon />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-dropdown"
          role="menu"
        >
          <div className="border-b border-border px-3 py-3 text-xs text-text-muted">
            Signed in as{" "}
            <span className="font-mono text-text-primary">{user?.email}</span>
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
              className="flex w-full items-center px-3 py-2.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
            >
              {item.label}
            </button>
          ))}
          <div className="border-t border-border py-1">
            <button
              type="button"
              className="flex w-full items-center px-3 py-2.5 text-left text-sm text-danger hover:bg-danger-subtle"
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
  const navigate = useNavigate();
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

  if (
    !organizationSlug ||
    !repositorySlug ||
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
    <div className="border-b border-border">
      <div className="border-b border-border bg-surface px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <nav
              className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-text-muted"
              aria-label="Repository breadcrumb"
            >
              <NavLink to="/organizations" className="hover:text-text-primary">
                organizations
              </NavLink>
              <span>/</span>
              <NavLink
                to={`/organizations/${organization.slug}`}
                className="hover:text-text-primary"
              >
                {organization.slug}
              </NavLink>
              <span>/</span>
              <span className="text-text-primary">{repository.slug}</span>
            </nav>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary">
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
                Role {repository.viewer_role ?? "metadata"}
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
                onClick={() => navigate(`${basePath}/code${location.search}`)}
              >
                Browse code
              </Button>
            ) : null}
            <Button onClick={() => setCloneOpen(true)}>Clone</Button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-canvas px-3">
        <nav
          className="flex min-w-max items-center gap-1 py-2"
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
                    "rounded-sm border px-3 py-2 text-sm",
                    active
                      ? "border-border-strong bg-surface-muted text-text-primary"
                      : "border-transparent text-text-secondary hover:border-border hover:bg-surface-subtle hover:text-text-primary",
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
    description: "Continue work and spot repository health issues",
    icon: HomeIcon,
  },
  {
    label: "Organization",
    to: "/organizations",
    keywords: ["teams", "members", "repos"],
    description: "Open organization overview, members, and settings",
    icon: OrganizationIcon,
  },
  {
    label: "Repositories",
    to: "/repositories",
    keywords: ["repos", "catalog", "code"],
    description: "Browse every repository in the active organization",
    icon: RepositoryIcon,
  },
  {
    label: "Reviews",
    to: "/reviews",
    keywords: ["change requests"],
    description: "Review work and compare revisions",
    icon: ReviewIcon,
  },
  {
    label: "Activity",
    to: "/activity",
    keywords: ["audit", "events"],
    description: "Inspect clone, push, and permission activity",
    icon: ActivityIcon,
  },
  {
    label: "Settings",
    to: "/settings",
    keywords: ["profile", "keys", "tokens"],
    description: "Manage user access, SSH keys, and tokens",
    icon: SettingsIcon,
  },
];

export function AppShell() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationSlug, repositorySlug } = useParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isRepositoryRoute = Boolean(organizationSlug && repositorySlug);
  const repositoryRevision = new URLSearchParams(location.search).get(
    "revision",
  );

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
        setCommandPaletteQuery("");
        setCommandPaletteOpen(true);
      }

      if (
        !interactive &&
        isRepositoryRoute &&
        event.key.toLowerCase() === "t"
      ) {
        event.preventDefault();
        setCommandPaletteQuery("~ ");
        setCommandPaletteOpen(true);
      }

      if (!interactive && event.key === "/") {
        event.preventDefault();
        setCommandPaletteQuery(isRepositoryRoute ? "/ " : "");
        setCommandPaletteOpen(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isRepositoryRoute]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const baseItems = primaryNav.map((item) => ({
      id: item.label,
      label: item.label,
      detail: item.description,
      keywords: item.keywords,
      to: item.to,
      group:
        item.label === "Repositories" || item.label === "Organization"
          ? "projects"
          : "actions",
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
        detail: `${organizationSlug}/${repositorySlug} worktree`,
        keywords: ["repository", "code", "worktree"],
        to: `${basePath}/code${location.search}`,
        group: "projects",
      },
      {
        id: "repo-history",
        label: "Open repository history",
        detail: `${organizationSlug}/${repositorySlug} changesets`,
        keywords: ["changesets", "history", "revision"],
        to: `${basePath}/history`,
        group: "revisions",
      },
      {
        id: "repo-settings",
        label: "Open repository settings",
        detail: `${organizationSlug}/${repositorySlug} configuration`,
        keywords: ["access", "transport", "danger zone"],
        to: `${basePath}/settings`,
        group: "actions",
      },
      {
        id: "repo-create",
        label: "Create repository",
        detail: `${organizationSlug} new repository`,
        keywords: ["new", "repository", "create"],
        to: `/organizations/${organizationSlug}/repositories/new`,
        group: "actions",
      },
      {
        id: "org-member",
        label: "Add member",
        detail: `${organizationSlug} membership`,
        keywords: ["member", "invite", "organization"],
        to: `/organizations/${organizationSlug}/members/new`,
        group: "actions",
      },
      {
        id: "tokens",
        label: "Open tokens",
        detail: "Personal access tokens",
        keywords: ["tokens", "https", "credentials"],
        to: "/settings?tab=tokens",
        group: "actions",
      },
      {
        id: "ssh",
        label: "Add SSH key",
        detail: "Transport key setup",
        keywords: ["ssh", "keys", "transport"],
        to: "/settings?tab=ssh-keys",
        group: "actions",
      },
    ];
  }, [location.search, organizationSlug, repositorySlug]);

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/96 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-3 px-4">
          <IconButton
            aria-label={
              mobileNavOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="lg:hidden"
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            {mobileNavOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>

          <NavLink to="/" className="flex shrink-0 items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-sm border border-border bg-surface-muted font-mono text-[11px] font-bold tracking-[0.2em] text-text-primary">
              RF
            </div>
            <div className="hidden sm:block">
              <div className="font-mono text-[13px] font-semibold uppercase tracking-[0.14em] text-text-primary">
                RevForge
              </div>
              <div className="text-[11px] text-text-muted">
                Self-hosted Mercurial forge
              </div>
            </div>
          </NavLink>

          <button
            type="button"
            className="ml-2 hidden h-9 min-w-[320px] max-w-[520px] flex-1 items-center justify-between rounded-sm border border-border bg-surface px-3 text-sm text-text-muted shadow-panel hover:border-border-strong hover:bg-surface-hover hover:text-text-primary lg:flex"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <span className="flex items-center gap-2">
              <SearchIcon />
              Search repositories, paths, revisions, and actions
            </span>
            <kbd className="rounded-sm border border-border bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
              {navigator.platform.includes("Mac") ? "Cmd K" : "Ctrl K"}
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {isAuthenticated ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/repositories")}
              >
                Repositories
              </Button>
            ) : null}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1680px]">
        <aside
          className={clsx(
            "fixed inset-y-14 left-0 z-30 flex flex-col border-r border-border bg-surface transition-[width,transform] duration-200 lg:sticky lg:top-14 lg:h-[calc(100vh-56px)]",
            sidebarCollapsed ? "lg:w-10" : "lg:w-72",
            mobileNavOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div
            className={clsx(
              "border-b border-border",
              sidebarCollapsed ? "px-2 py-3" : "px-4 py-4",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className={clsx(
                  "font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted",
                  sidebarCollapsed && "sr-only",
                )}
              >
                Workspace
              </div>
              <IconButton
                aria-label={
                  sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                className="hidden lg:inline-flex"
                onClick={() => setSidebarCollapsed((current) => !current)}
              >
                {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </IconButton>
            </div>
            {!sidebarCollapsed ? (
              <p className="mt-2 text-sm text-text-secondary">
                Repository-first navigation with revision and path state kept
                visible.
              </p>
            ) : null}
          </div>

          <nav
            className={clsx(
              "flex-1 overflow-y-auto py-4",
              sidebarCollapsed ? "px-0.5" : "px-3",
            )}
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
                      "rounded-sm border transition-colors",
                      sidebarCollapsed ? "px-0 py-3 text-center" : "px-3 py-3",
                      isActive
                        ? "border-border-strong bg-surface-muted"
                        : "border-transparent hover:border-border hover:bg-surface-subtle",
                    )
                  }
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span
                    className={clsx(
                      "text-text-primary",
                      sidebarCollapsed
                        ? "flex items-center justify-center text-base"
                        : "flex items-center gap-3 text-sm font-semibold",
                    )}
                  >
                    <item.icon />
                    {!sidebarCollapsed ? <span>{item.label}</span> : null}
                  </span>
                  {!sidebarCollapsed ? (
                    <span className="mt-1 block text-xs text-text-muted">
                      {item.description}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          </nav>

          {!sidebarCollapsed ? (
            <div className="border-t border-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
              URL state stays revision-aware by default.
            </div>
          ) : null}
        </aside>

        {mobileNavOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
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
        initialQuery={commandPaletteQuery}
        items={paletteItems}
        organizationSlug={organizationSlug}
        repositorySlug={repositorySlug}
        repositoryRevision={repositoryRevision}
      />
    </div>
  );
}
