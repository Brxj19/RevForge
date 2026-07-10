import { NavLink, Outlet } from "react-router-dom";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/use-auth";

export function AppShell() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const navItems = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/organizations", label: "Organizations" },
    isAuthenticated ? null : { to: "/login", label: "Login" },
    isAuthenticated ? null : { to: "/register", label: "Register" },
  ].filter(Boolean) as Array<{ to: string; label: string; end?: boolean }>;

  return (
    <div className="min-h-screen bg-canvas text-ink-950">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col lg:flex-row">
        <aside className="border-b border-border bg-ink-950 px-5 py-5 text-slate-100 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between lg:block">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-forge-100">
                Mercurial Forge
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                RevForge
              </h1>
              <p className="mt-2 max-w-xs text-sm text-slate-300">
                Mercurial hosting, code review, and repository operations.
              </p>
            </div>
          </div>

          <nav
            className="mt-6 flex flex-wrap gap-2 lg:flex-col"
            aria-label="Primary"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-forge-500 bg-forge-100/10 text-white"
                      : "border-white/10 text-slate-300 hover:border-forge-500/50 hover:text-white",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 hidden rounded-lg border border-white/10 bg-white/5 p-4 lg:block">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-300">
              Phase 1
            </p>
            <p className="mt-2 text-sm text-slate-100">
              Identity, organizations, RBAC, and repository metadata are ready.
              Mercurial provisioning and history browsing follow in Phase 2.
            </p>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-forge-600">
                  Control Plane
                </p>
                <h2 className="mt-1 text-xl font-semibold text-ink-950">
                  Self-hosted Mercurial operations, deliberately built.
                </h2>
                {isAuthenticated ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Signed in as{" "}
                    <span className="font-medium text-ink-950">
                      {user?.display_name}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="flex gap-3">
                <button
                  className="rounded-md border border-border px-3 py-2 text-sm text-slate-700"
                  onClick={() => navigate("/organizations")}
                >
                  Browse organizations
                </button>
                {isAuthenticated ? (
                  <button
                    className="rounded-md border border-forge-500 bg-forge-500 px-3 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      void logout().then(() => navigate("/login"));
                    }}
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    className="rounded-md border border-forge-500 bg-forge-500 px-3 py-2 text-sm font-medium text-white"
                    onClick={() => navigate("/login")}
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="px-5 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
