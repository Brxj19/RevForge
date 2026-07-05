import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState, type ButtonHTMLAttributes, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../app/use-auth";
import {
  addOrganizationMember,
  createOrganization,
  createRepository,
  deleteOrganizationMember,
  deleteRepositoryPermission,
  getOrganization,
  getRepository,
  listOrganizationMembers,
  listOrganizations,
  listRepositories,
  listRepositoryPermissions,
  setRepositoryPermission,
  updateOrganization,
  updateOrganizationMember,
  updateRepository,
} from "../lib/api";
import { DevHealthCard } from "../components/dev-health-card";
import { EmptyState, ErrorState, LoadingState } from "../components/states";

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-950">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={clsx("rounded-xl border border-border bg-surface p-5 shadow-panel", className)}>{children}</section>;
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-950">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-950",
        props.className,
      )}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-24 w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-950",
        props.className,
      )}
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink-950",
        props.className,
      )}
    />
  );
}

function Button({
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const variantClasses = {
    primary: "border-forge-500 bg-forge-500 text-white",
    secondary: "border-border bg-surface text-slate-700",
    danger: "border-red-300 bg-red-50 text-red-800",
  } as const;
  return (
    <button
      {...props}
      className={clsx(
        "rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        props.className,
      )}
    >
      {children}
    </button>
  );
}

function MessageBanner({ message, tone = "error" }: { message: string; tone?: "error" | "info" }) {
  const classes =
    tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-red-200 bg-red-50 text-red-800";
  return <p className={clsx("rounded-md border px-3 py-2 text-sm", classes)}>{message}</p>;
}

function VisibilityBadge({
  visibility,
}: {
  visibility: "public" | "internal" | "private";
}) {
  const classes = {
    public: "border-blue-200 bg-blue-50 text-blue-800",
    internal: "border-amber-200 bg-amber-50 text-amber-800",
    private: "border-slate-200 bg-slate-100 text-slate-700",
  } as const;
  return (
    <span className={clsx("rounded-full border px-2 py-1 text-xs font-medium", classes[visibility])}>
      {visibility}
    </span>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Restoring your RevForge session." />;
  }
  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }
  return <>{children}</>;
}

function AuthForm({
  mode,
}: {
  mode: "login" | "register";
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearError, errorMessage, isAuthenticated, login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/organizations" replace />;
  }

  const redirectTarget = new URLSearchParams(location.search).get("redirect") ?? "/organizations";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setLocalError(null);

    if (!email.trim() || !password.trim() || (mode === "register" && !displayName.trim())) {
      setLocalError("Complete every required field before continuing.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "register") {
        await register({
          email,
          display_name: displayName,
          password,
        });
      } else {
        await login({ email, password });
      }
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to continue right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Surface>
        <SectionHeader
          eyebrow={mode === "login" ? "Identity" : "Registration"}
          title={mode === "login" ? "Sign in to the control plane" : "Create your RevForge account"}
          description={
            mode === "login"
              ? "Browser sessions use secure, opaque server-side cookies. Your password never leaves the backend as anything but a verified hash."
              : "Phase 1 uses local email and password authentication so self-hosted teams can stand up organizations and repository metadata without waiting on external identity."
          }
        />
        <form className="grid gap-4" onSubmit={onSubmit}>
          <FormField label="Email">
            <TextInput
              aria-label="Email"
              autoComplete="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          {mode === "register" ? (
            <FormField label="Display name">
              <TextInput
                aria-label="Display name"
                autoComplete="name"
                name="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </FormField>
          ) : null}
          <FormField label="Password">
            <TextInput
              aria-label="Password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          {localError ? <MessageBanner message={localError} /> : null}
          {errorMessage ? <MessageBanner message={errorMessage} /> : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {mode === "login" ? "Need an account?" : "Already registered?"}{" "}
              <Link className="text-forge-600 underline-offset-2 hover:underline" to={mode === "login" ? "/register" : "/login"}>
                {mode === "login" ? "Register here" : "Sign in"}
              </Link>
            </p>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Working..." : mode === "login" ? "Login" : "Create account"}
            </Button>
          </div>
        </form>
      </Surface>

      <Surface>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Phase 1 scope</p>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li>Organization owners and admins manage membership and repository metadata.</li>
          <li>Public, internal, and private repository visibility is enforced by the backend.</li>
          <li>Mercurial repository provisioning, clone URLs, and history browsing land in Phase 2.</li>
        </ul>
      </Surface>
    </div>
  );
}

export function DashboardPage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Control Plane"
        title="Identity, RBAC, and repository catalog are live"
        description="Phase 1 gives RevForge secure browser sessions, organization membership management, repository metadata, and explicit authorization before Mercurial transport arrives."
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Surface>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Authentication", "Opaque server-side sessions with CSRF protection"],
              ["Organizations", "Owner, admin, and member role boundaries"],
              ["Repositories", "Public, internal, and private metadata catalog"],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-border bg-canvas p-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                  Ready
                </p>
                <h3 className="mt-2 text-base font-semibold text-ink-950">{title}</h3>
                <p className="mt-2 text-sm text-slate-500">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Current access model
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Organization owners and admins inherit repository administration.</li>
                <li>Members see internal repositories and need explicit access for private ones.</li>
                <li>Every important control-plane change writes an audit event.</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Next phase
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Mercurial repository provisioning and safe storage mapping</li>
                <li>Native clone, pull, and push transport endpoints</li>
                <li>Changesets, file browsing, and clone guidance</li>
              </ul>
            </div>
          </div>

          {isAuthenticated ? (
            <p className="mt-6 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-slate-600">
              Signed in as <span className="font-medium text-ink-950">{user?.display_name}</span>. Head to{" "}
              <Link className="text-forge-600 underline-offset-2 hover:underline" to="/organizations">
                organizations
              </Link>{" "}
              to create or manage your control-plane workspace.
            </p>
          ) : null}
        </Surface>

        {import.meta.env.DEV ? <DevHealthCard /> : null}
      </div>
    </div>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}

export function OrganizationsPage() {
  return (
    <ProtectedRoute>
      <OrganizationsContent />
    </ProtectedRoute>
  );
}

function OrganizationsContent() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const [createError, setCreateError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    slug: "",
    display_name: "",
    description: "",
  });

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createOrganization(
        {
          slug: formState.slug,
          display_name: formState.display_name,
          description: formState.description || null,
        },
        csrfToken,
      ),
    onSuccess: async () => {
      setFormState({ slug: "", display_name: "", description: "" });
      setCreateError(null);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : "Unable to create organization.");
    },
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Organizations"
        title="Organization workspaces"
        description="Owners and admins use organizations to scope members, repository visibility, and future operational policy."
      />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Surface>
          {organizationsQuery.isLoading ? <LoadingState label="Loading your organizations." /> : null}
          {organizationsQuery.isError ? (
            <ErrorState
              title="Organizations unavailable"
              description={organizationsQuery.error instanceof Error ? organizationsQuery.error.message : "Unable to load organizations."}
            />
          ) : null}
          {organizationsQuery.data?.length ? (
            <div className="grid gap-3">
              {organizationsQuery.data.map((organization) => (
                <Link
                  key={organization.id}
                  to={`/organizations/${organization.slug}`}
                  className="rounded-lg border border-border bg-canvas p-4 hover:border-forge-500/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-ink-950">{organization.display_name}</h3>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                        {organization.slug}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-1 text-xs text-slate-600">
                      {organization.viewer_role}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {organization.description ?? "No description yet."}
                  </p>
                </Link>
              ))}
            </div>
          ) : organizationsQuery.isSuccess ? (
            <EmptyState
              title="No organizations yet"
              description="Create your first organization to start managing members and repository metadata."
            />
          ) : null}
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Create organization</p>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createMutation.mutateAsync();
            }}
          >
            <FormField label="Display name">
              <TextInput
                aria-label="Organization display name"
                value={formState.display_name}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, display_name: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Slug">
              <TextInput
                aria-label="Organization slug"
                value={formState.slug}
                onChange={(event) => setFormState((current) => ({ ...current, slug: event.target.value }))}
              />
            </FormField>
            <FormField label="Description">
              <TextArea
                aria-label="Organization description"
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, description: event.target.value }))
                }
              />
            </FormField>
            {createError ? <MessageBanner message={createError} /> : null}
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create organization"}
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  );
}

function useOrganizationRouteData() {
  const { organizationSlug = "" } = useParams();
  const organizationQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug),
  });
  const membersQuery = useQuery({
    queryKey: ["organization-members", organizationSlug],
    queryFn: () => listOrganizationMembers(organizationSlug),
    enabled: organizationQuery.isSuccess,
  });
  const repositoriesQuery = useQuery({
    queryKey: ["organization-repositories", organizationSlug],
    queryFn: () => listRepositories(organizationSlug),
  });

  return { membersQuery, organizationQuery, organizationSlug, repositoriesQuery };
}

export function OrganizationDetailPage() {
  return (
    <ProtectedRoute>
      <OrganizationDetailContent />
    </ProtectedRoute>
  );
}

function OrganizationDetailContent() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { membersQuery, organizationQuery, organizationSlug, repositoriesQuery } = useOrganizationRouteData();
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"owner" | "admin" | "member">("member");
  const [repoState, setRepoState] = useState({
    slug: "",
    display_name: "",
    description: "",
    visibility: "private" as "public" | "internal" | "private",
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addOrganizationMember(organizationSlug, { email: memberEmail, role: memberRole }, csrfToken),
    onSuccess: async () => {
      setMemberEmail("");
      setMemberRole("member");
      await queryClient.invalidateQueries({ queryKey: ["organization-members", organizationSlug] });
      await queryClient.invalidateQueries({ queryKey: ["organization", organizationSlug] });
    },
  });

  const createRepoMutation = useMutation({
    mutationFn: () => createRepository(organizationSlug, repoState, csrfToken),
    onSuccess: async () => {
      setRepoState({ slug: "", display_name: "", description: "", visibility: "private" });
      await queryClient.invalidateQueries({ queryKey: ["organization-repositories", organizationSlug] });
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization overview." />;
  }
  if (organizationQuery.isError) {
    return (
      <ErrorState
        title="Organization unavailable"
        description={organizationQuery.error instanceof Error ? organizationQuery.error.message : "Unable to load organization."}
      />
    );
  }

  const organization = organizationQuery.data;
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Organization"
        title={organization.display_name}
        description={organization.description ?? "Organization metadata is live now. Mercurial repository provisioning arrives in Phase 2."}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">{organization.slug}</p>
              <p className="mt-3 text-sm text-slate-600">
                Your role is <span className="font-medium text-ink-950">{organization.viewer_role}</span>.
              </p>
            </div>
            <Link
              to={`/organizations/${organization.slug}/settings`}
              className="rounded-md border border-border px-3 py-2 text-sm text-slate-700"
            >
              Settings
            </Link>
          </div>

          <div className="mt-6">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Repositories</p>
            {repositoriesQuery.isLoading ? <LoadingState label="Loading repositories." /> : null}
            {repositoriesQuery.data?.length ? (
              <div className="mt-4 grid gap-3">
                {repositoriesQuery.data.map((repository) => (
                  <Link
                    key={repository.id}
                    to={`/organizations/${organization.slug}/repositories/${repository.slug}`}
                    className="rounded-lg border border-border bg-canvas p-4 hover:border-forge-500/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-ink-950">{repository.display_name}</h3>
                        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                          {repository.slug}
                        </p>
                      </div>
                      <VisibilityBadge visibility={repository.visibility} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">
                      {repository.description ?? "No description yet."}
                    </p>
                  </Link>
                ))}
              </div>
            ) : repositoriesQuery.isSuccess ? (
              <div className="mt-4">
                <EmptyState
                  title="No repositories yet"
                  description="Create repository metadata now. RevForge will attach physical Mercurial provisioning in Phase 2."
                />
              </div>
            ) : null}
          </div>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Members</p>
          {membersQuery.isLoading ? <LoadingState label="Loading members." /> : null}
          {membersQuery.data?.length ? (
            <div className="mt-4 space-y-3">
              {membersQuery.data.map((member) => (
                <div key={member.id} className="rounded-lg border border-border bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink-950">{member.user_display_name}</p>
                      <p className="mt-1 text-sm text-slate-500">{member.user_email}</p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-1 text-xs text-slate-600">
                      {member.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {organization.can_manage ? (
            <>
              <form
                className="mt-6 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addMemberMutation.mutateAsync();
                }}
              >
                <FormField label="Add existing user by email">
                  <TextInput
                    aria-label="Member email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                  />
                </FormField>
                <FormField label="Role">
                  <Select value={memberRole} onChange={(event) => setMemberRole(event.target.value as "owner" | "admin" | "member")}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </Select>
                </FormField>
                {addMemberMutation.isError ? (
                  <MessageBanner
                    message={
                      addMemberMutation.error instanceof Error
                        ? addMemberMutation.error.message
                        : "Unable to add member."
                    }
                  />
                ) : null}
                <Button disabled={addMemberMutation.isPending} type="submit">
                  {addMemberMutation.isPending ? "Adding..." : "Add member"}
                </Button>
              </form>

              <form
                className="mt-8 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createRepoMutation.mutateAsync();
                }}
              >
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Create repository metadata</p>
                <FormField label="Display name">
                  <TextInput
                    aria-label="Repository display name"
                    value={repoState.display_name}
                    onChange={(event) =>
                      setRepoState((current) => ({ ...current, display_name: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Slug">
                  <TextInput
                    aria-label="Repository slug"
                    value={repoState.slug}
                    onChange={(event) => setRepoState((current) => ({ ...current, slug: event.target.value }))}
                  />
                </FormField>
                <FormField label="Visibility">
                  <Select
                    value={repoState.visibility}
                    onChange={(event) =>
                      setRepoState((current) => ({
                        ...current,
                        visibility: event.target.value as "public" | "internal" | "private",
                      }))
                    }
                  >
                    <option value="private">private</option>
                    <option value="internal">internal</option>
                    <option value="public">public</option>
                  </Select>
                </FormField>
                <FormField label="Description">
                  <TextArea
                    aria-label="Repository description"
                    value={repoState.description}
                    onChange={(event) =>
                      setRepoState((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </FormField>
                {createRepoMutation.isError ? (
                  <MessageBanner
                    message={
                      createRepoMutation.error instanceof Error
                        ? createRepoMutation.error.message
                        : "Unable to create repository."
                    }
                  />
                ) : null}
                <Button disabled={createRepoMutation.isPending} type="submit">
                  {createRepoMutation.isPending ? "Creating..." : "Create repository"}
                </Button>
              </form>
            </>
          ) : (
            <p className="mt-6 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-slate-600">
              Member management and repository creation stay restricted to organization owners and admins.
            </p>
          )}
        </Surface>
      </div>
    </div>
  );
}

export function OrganizationSettingsPage() {
  return (
    <ProtectedRoute>
      <OrganizationSettingsContent />
    </ProtectedRoute>
  );
}

function OrganizationSettingsContent() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { membersQuery, organizationQuery, organizationSlug } = useOrganizationRouteData();
  const [message, setMessage] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: { display_name?: string; description?: string | null }) =>
      updateOrganization(organizationSlug, payload, csrfToken),
    onSuccess: async () => {
      setMessage("Organization settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["organization", organizationSlug] });
    },
  });

  const memberRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: "owner" | "admin" | "member";
    }) => updateOrganizationMember(organizationSlug, memberId, { role }, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organization-members", organizationSlug] });
      await queryClient.invalidateQueries({ queryKey: ["organization", organizationSlug] });
    },
  });

  const memberDeleteMutation = useMutation({
    mutationFn: (memberId: string) => deleteOrganizationMember(organizationSlug, memberId, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organization-members", organizationSlug] });
      await queryClient.invalidateQueries({ queryKey: ["organization", organizationSlug] });
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization settings." />;
  }
  if (organizationQuery.isError) {
    return (
      <ErrorState
        title="Organization settings unavailable"
        description={organizationQuery.error instanceof Error ? organizationQuery.error.message : "Unable to load organization settings."}
      />
    );
  }

  const organization = organizationQuery.data;
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Settings"
        title={`${organization.display_name} settings`}
        description="Organization metadata and member roles live here. Last-owner protections are enforced by the backend."
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void updateMutation.mutateAsync({
                display_name: String(form.get("display_name") ?? ""),
                description: String(form.get("description") ?? ""),
              });
            }}
          >
            <FormField label="Display name">
              <TextInput aria-label="Display name" defaultValue={organization.display_name} name="display_name" />
            </FormField>
            <FormField label="Description">
              <TextArea aria-label="Description" defaultValue={organization.description ?? ""} name="description" />
            </FormField>
            {message ? <MessageBanner message={message} tone="info" /> : null}
            {updateMutation.isError ? (
              <MessageBanner
                message={updateMutation.error instanceof Error ? updateMutation.error.message : "Unable to save organization settings."}
              />
            ) : null}
            <Button disabled={updateMutation.isPending || !organization.can_manage} type="submit">
              Save organization settings
            </Button>
          </form>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Member roles</p>
          {membersQuery.isLoading ? <LoadingState label="Loading member settings." /> : null}
          <div className="mt-4 space-y-3">
            {membersQuery.data?.map((member) => (
              <form
                key={member.id}
                className="rounded-lg border border-border bg-canvas p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void memberRoleMutation.mutateAsync({
                    memberId: member.id,
                    role: String(form.get("role")) as "owner" | "admin" | "member",
                  });
                }}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-950">{member.user_display_name}</p>
                    <p className="mt-1 text-sm text-slate-500">{member.user_email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Select aria-label={`Role for ${member.user_email}`} defaultValue={member.role} name="role">
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                      <option value="owner">owner</option>
                    </Select>
                    <Button disabled={!organization.can_manage || memberRoleMutation.isPending} type="submit" variant="secondary">
                      Save
                    </Button>
                    <Button
                      disabled={!organization.can_manage || memberDeleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${member.user_display_name} from ${organization.display_name}?`)) {
                          void memberDeleteMutation.mutateAsync(member.id);
                        }
                      }}
                      type="button"
                      variant="danger"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </form>
            ))}
          </div>
          {memberRoleMutation.isError ? (
            <MessageBanner
              message={memberRoleMutation.error instanceof Error ? memberRoleMutation.error.message : "Unable to update the member role."}
            />
          ) : null}
          {memberDeleteMutation.isError ? (
            <MessageBanner
              message={memberDeleteMutation.error instanceof Error ? memberDeleteMutation.error.message : "Unable to remove the member."}
            />
          ) : null}
        </Surface>
      </div>
    </div>
  );
}

export function RepositoryDetailPage() {
  const { organizationSlug = "", repositorySlug = "" } = useParams();
  const repositoryQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug, repositorySlug),
  });

  if (repositoryQuery.isLoading) {
    return <LoadingState label="Loading repository metadata." />;
  }
  if (repositoryQuery.isError) {
    return (
      <ErrorState
        title="Repository unavailable"
        description={repositoryQuery.error instanceof Error ? repositoryQuery.error.message : "Unable to load repository."}
      />
    );
  }

  const repository = repositoryQuery.data;
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Repository"
        title={`${repository.organization_slug} / ${repository.slug}`}
        description={repository.description ?? "Repository metadata is available. Physical Mercurial provisioning is still intentionally deferred."}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Surface>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-ink-950">{repository.display_name}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
                {repository.slug}
              </p>
            </div>
            <VisibilityBadge visibility={repository.visibility} />
          </div>

          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <dt className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">Viewer role</dt>
              <dd className="mt-2 text-sm text-slate-700">{repository.viewer_role ?? "public metadata only"}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">Archive state</dt>
              <dd className="mt-2 text-sm text-slate-700">{repository.archived_at ? "Archived" : "Active"}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">Permission summary</dt>
              <dd className="mt-2 text-sm text-slate-700">
                {repository.can_manage ? "You can manage repository metadata and permissions." : "Read-only metadata access."}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">Provisioning status</dt>
              <dd className="mt-2 text-sm text-slate-700">{repository.phase_status}</dd>
            </div>
          </dl>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Phase 2 note</p>
          <p className="mt-4 text-sm text-slate-600">
            RevForge intentionally stops at repository metadata here. Clone URLs, changesets, and Mercurial wire-protocol flows begin after the authorization model is stable.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              className="rounded-md border border-border px-3 py-2 text-sm text-slate-700"
              to={`/organizations/${organizationSlug}`}
            >
              Back to organization
            </Link>
            {repository.can_manage ? (
              <Link
                className="rounded-md border border-forge-500 bg-forge-500 px-3 py-2 text-sm font-medium text-white"
                to={`/organizations/${organizationSlug}/repositories/${repositorySlug}/settings`}
              >
                Repository settings
              </Link>
            ) : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}

export function RepositorySettingsPage() {
  return (
    <ProtectedRoute>
      <RepositorySettingsContent />
    </ProtectedRoute>
  );
}

function RepositorySettingsContent() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { organizationSlug = "", repositorySlug = "" } = useParams();
  const repositoryQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug, repositorySlug),
  });
  const permissionsQuery = useQuery({
    queryKey: ["repository-permissions", organizationSlug, repositorySlug],
    queryFn: () => listRepositoryPermissions(organizationSlug, repositorySlug),
    enabled: repositoryQuery.isSuccess,
  });

  const [permissionUserId, setPermissionUserId] = useState("");
  const [permissionRole, setPermissionRole] = useState<"read" | "write" | "admin">("read");

  const updateMutation = useMutation({
    mutationFn: (payload: {
      display_name?: string;
      description?: string | null;
      visibility?: "public" | "internal" | "private";
      archived?: boolean;
    }) => updateRepository(organizationSlug, repositorySlug, payload, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["repository", organizationSlug, repositorySlug] });
      await queryClient.invalidateQueries({ queryKey: ["organization-repositories", organizationSlug] });
    },
  });

  const permissionMutation = useMutation({
    mutationFn: () =>
      setRepositoryPermission(
        organizationSlug,
        repositorySlug,
        permissionUserId,
        { role: permissionRole },
        csrfToken,
      ),
    onSuccess: async () => {
      setPermissionUserId("");
      setPermissionRole("read");
      await queryClient.invalidateQueries({ queryKey: ["repository-permissions", organizationSlug, repositorySlug] });
    },
  });

  const deletePermissionMutation = useMutation({
    mutationFn: (userId: string) =>
      deleteRepositoryPermission(organizationSlug, repositorySlug, userId, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["repository-permissions", organizationSlug, repositorySlug] });
    },
  });

  if (repositoryQuery.isLoading) {
    return <LoadingState label="Loading repository settings." />;
  }
  if (repositoryQuery.isError) {
    return (
      <ErrorState
        title="Repository settings unavailable"
        description={repositoryQuery.error instanceof Error ? repositoryQuery.error.message : "Unable to load repository settings."}
      />
    );
  }

  const repository = repositoryQuery.data;
  if (!repository.can_manage) {
    return (
      <ErrorState
        title="Permission denied"
        description="Repository settings are limited to organization owners/admins and explicit repository admins."
      />
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Repository Settings"
        title={`${repository.organization_slug} / ${repository.display_name}`}
        description="Update repository metadata, visibility, archive state, and explicit repository permissions."
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Surface>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void updateMutation.mutateAsync({
                display_name: String(form.get("display_name") ?? ""),
                description: String(form.get("description") ?? ""),
                visibility: String(form.get("visibility")) as "public" | "internal" | "private",
                archived: form.get("archived") === "on",
              });
            }}
          >
            <FormField label="Display name">
              <TextInput aria-label="Repository display name" defaultValue={repository.display_name} name="display_name" />
            </FormField>
            <FormField label="Description">
              <TextArea aria-label="Repository description" defaultValue={repository.description ?? ""} name="description" />
            </FormField>
            <FormField label="Visibility">
              <Select aria-label="Repository visibility" defaultValue={repository.visibility} name="visibility">
                <option value="private">private</option>
                <option value="internal">internal</option>
                <option value="public">public</option>
              </Select>
            </FormField>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input aria-label="Archive repository" defaultChecked={repository.archived_at !== null} name="archived" type="checkbox" />
              Archive repository metadata
            </label>
            {updateMutation.isError ? (
              <MessageBanner
                message={updateMutation.error instanceof Error ? updateMutation.error.message : "Unable to save repository settings."}
              />
            ) : null}
            <Button disabled={updateMutation.isPending} type="submit">
              Save repository settings
            </Button>
          </form>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">Repository permissions</p>
          <p className="mt-2 text-sm text-slate-500">
            Add explicit access for private repositories or grant repository-specific administration without changing organization-wide roles.
          </p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void permissionMutation.mutateAsync();
            }}
          >
            <FormField label="Target user ID">
              <TextInput
                aria-label="Permission user ID"
                value={permissionUserId}
                onChange={(event) => setPermissionUserId(event.target.value)}
                placeholder="Paste a user UUID"
              />
            </FormField>
            <FormField label="Role">
              <Select value={permissionRole} onChange={(event) => setPermissionRole(event.target.value as "read" | "write" | "admin")}>
                <option value="read">read</option>
                <option value="write">write</option>
                <option value="admin">admin</option>
              </Select>
            </FormField>
            {permissionMutation.isError ? (
              <MessageBanner
                message={permissionMutation.error instanceof Error ? permissionMutation.error.message : "Unable to save repository permission."}
              />
            ) : null}
            <Button disabled={permissionMutation.isPending || !permissionUserId.trim()} type="submit">
              Save permission
            </Button>
          </form>

          {permissionsQuery.isLoading ? <LoadingState label="Loading repository permissions." /> : null}
          <div className="mt-6 space-y-3">
            {permissionsQuery.data?.map((permission) => (
              <div key={permission.id} className="rounded-lg border border-border bg-canvas p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-950">{permission.user_display_name}</p>
                    <p className="mt-1 text-sm text-slate-500">{permission.user_email}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      role: {permission.role}
                    </p>
                  </div>
                  <Button
                    disabled={deletePermissionMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Revoke explicit access for ${permission.user_display_name}?`)) {
                        void deletePermissionMutation.mutateAsync(permission.user_id);
                      }
                    }}
                    type="button"
                    variant="danger"
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {permissionsQuery.isSuccess && permissionsQuery.data.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No explicit permissions yet"
                description="Organization owners and admins still inherit full access even without repository-specific rows."
              />
            </div>
          ) : null}
        </Surface>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="max-w-2xl">
      <SectionHeader
        eyebrow="404"
        title="That route does not exist"
        description="RevForge keeps repository and organization state URL-addressable, so missing routes fail clearly instead of silently redirecting somewhere ambiguous."
      />
      <EmptyState
        title="Page not found"
        description="Use the sidebar to return to the control plane routes."
      />
    </div>
  );
}
