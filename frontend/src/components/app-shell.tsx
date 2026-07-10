import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { clsx } from "clsx";
import { useAuth } from "../app/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getOrganization, getRepository } from "../lib/api";
import { IconButton } from "./ui/icon-button";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("revforge-theme");
    if (stored === "dark" || stored === "light") return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("revforge-theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.5 2.5l1.5 1.5M12 12l1.5 1.5M2.5 13.5l1.5-1.5M12 4l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function useOutsideClick(handler: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [handler]);
  return ref;
}

function UserMenu() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick(() => setOpen(false));

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <button
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary hover:bg-accent-subtle transition-colors"
          onClick={() => navigate("/login")}
        >
          Sign in
        </button>
        <button
          className="rounded-md border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110"
          onClick={() => navigate("/register")}
        >
          Register
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary hover:bg-accent-subtle transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="User menu"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
          {user?.display_name.charAt(0).toUpperCase() ?? "?"}
        </span>
        <span className="hidden md:inline">{user?.display_name}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-surface py-1 shadow-dropdown"
          role="menu"
        >
          <div className="border-b border-border px-3 py-2 text-xs text-text-muted">
            Signed in as <span className="font-medium text-text-primary">{user?.email}</span>
          </div>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-accent-subtle transition-colors"
            role="menuitem"
            onClick={() => { setOpen(false); }}
          >
            Profile
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-accent-subtle transition-colors"
            role="menuitem"
            onClick={() => { setOpen(false); }}
          >
            SSH keys
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-accent-subtle transition-colors"
            role="menuitem"
            onClick={() => { setOpen(false); }}
          >
            Access tokens
          </button>
          <div className="border-t border-border mt-1 pt-1">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-subtle transition-colors"
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
      )}
    </div>
  );
}

const REPO_SECTIONS = [
  { key: "overview", label: "Overview", path: "" },
  { key: "code", label: "Code", path: "/code" },
  { key: "commits", label: "History", path: "/commits" },
  { key: "branches", label: "Branches", path: "/branches" },
  { key: "tags", label: "Tags", path: "/tags" },
  { key: "bookmarks", label: "Bookmarks", path: "/bookmarks" },
];

function RepositoryContextHeader() {
  const { organizationSlug, repositorySlug } = useParams();
  const location = useLocation();

  const orgQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug ?? ""),
    enabled: !!organizationSlug,
  });

  const repoQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug ?? "", repositorySlug ?? ""),
    enabled: !!organizationSlug && !!repositorySlug,
  });

  if (!organizationSlug || !repositorySlug) return null;
  if (orgQuery.isLoading || repoQuery.isLoading) return null;
  if (orgQuery.isError || repoQuery.isError) return null;

  const org = orgQuery.data;
  const repo = repoQuery.data;
  if (!org || !repo) return null;

  const basePath = `/organizations/${org.slug}/repositories/${repo.slug}`;

  return (
    <div className="border-b border-border">
      <div className="px-5 py-3">
        <nav className="flex items-center gap-1.5 text-sm" aria-label="Repository breadcrumb">
          <NavLink to={`/organizations/${org.slug}`} className="text-text-muted hover:text-text-primary transition-colors">
            {org.display_name}
          </NavLink>
          <span className="text-text-muted" aria-hidden="true">/</span>
          <span className="font-medium text-text-primary">{repo.display_name}</span>
        </nav>
      </div>
      <div className="flex items-center gap-1 px-3 overflow-x-auto" role="tablist" aria-label="Repository sections">
        {REPO_SECTIONS.map((s) => {
          const to = s.path ? `${basePath}${s.path}` : basePath;
          const isActive = s.key === "overview"
            ? location.pathname === basePath
            : location.pathname.startsWith(`${basePath}${s.path}`);
          return (
            <NavLink
              key={s.key}
              to={to}
              end={s.key === "overview"}
              className={clsx(
                "flex-shrink-0 rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-surface text-accent border-b-2 border-accent"
                  : "text-text-muted hover:text-text-primary hover:bg-accent/50",
              )}
              role="tab"
              aria-selected={isActive}
            >
              {s.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell() {
  const { isAuthenticated } = useAuth();
  const { organizationSlug, repositorySlug } = useParams();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isRepoPage = !!organizationSlug && !!repositorySlug;

  const navItems = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/organizations", label: "Organizations" },
    { to: "/repositories", label: "Repositories" },
    ...(isAuthenticated
      ? [{ to: "/settings", label: "Settings" } as const]
      : []),
  ];

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-4">
          <button
            className="flex items-center justify-center rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-accent transition-colors lg:hidden"
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <CloseIcon /> : <MenuIcon />}
          </button>

          <NavLink to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
              RF
            </div>
            <span className="hidden text-sm font-semibold text-text-primary sm:inline">
              RevForge
            </span>
          </NavLink>

          {isRepoPage ? (
            <nav className="ml-2 flex items-center gap-1.5 text-sm truncate" aria-label="Breadcrumb">
              <NavLink
                to={`/organizations/${organizationSlug}`}
                className="text-text-muted hover:text-text-primary transition-colors truncate"
              >
                {organizationSlug}
              </NavLink>
              <span className="text-text-muted flex-shrink-0" aria-hidden="true">/</span>
              <span className="font-medium text-text-primary truncate">{repositorySlug}</span>
            </nav>
          ) : null}

          <div className="flex-1" />

          <button
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text-primary hover:bg-accent-subtle transition-colors"
            onClick={() => {}}
            aria-label="Search"
          >
            <SearchIcon />
            <span className="hidden text-xs text-text-muted sm:inline">Search...</span>
            <kbd className="hidden rounded border border-border bg-canvas px-1.5 py-0.5 text-xs text-text-muted lg:inline">
              /
            </kbd>
          </button>

          <IconButton
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleDark}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </IconButton>

          <UserMenu />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside
          className={clsx(
            "fixed inset-0 z-30 flex flex-col bg-surface pt-12 transition-transform duration-200 lg:sticky lg:top-12 lg:z-auto lg:h-[calc(100vh-3rem)] lg:w-56 lg:shrink-0 lg:border-r lg:border-border lg:pt-0 lg:transition-none",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
          aria-label="Primary navigation"
        >
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent font-medium text-white"
                      : "text-text-secondary hover:bg-accent-subtle hover:text-text-primary",
                  )
                }
                onClick={() => setMobileNavOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-border px-3 py-3">
            <p className="text-xs text-text-muted">
              RevForge v0.1
            </p>
          </div>
        </aside>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {isRepoPage ? <RepositoryContextHeader /> : null}
          <div className={clsx("flex-1", isRepoPage ? "" : "px-5 py-6")}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
