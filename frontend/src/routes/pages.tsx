import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth } from "../app/use-auth";
import {
  browseRepository,
  addOrganizationMember,
  type ChangesetDetail,
  type ChangesetDiff,
  type ChangesetSummary,
  type RepositoryBrowseResult,
  type RepositoryDetail,
  type RepositoryRef,
  type RepositoryRefs,
  getChangeset,
  getChangesetDiff,
  createOrganization,
  createPullRequest,
  createRepository,
  deleteOrganizationMember,
  deleteRepositoryPermission,
  listPullRequests,
  getPullRequest,
  getPullRequestDiff,
  addPullRequestComment,
  addPullRequestReview,
  closePullRequest,
  getOrganization,
  getRepository,
  getRepositoryRefs,
  listOrganizationMembers,
  listOrganizations,
  listChangesets,
  listRepositories,
  listRepositoryPermissions,
  provisionRepository,
  setRepositoryPermission,
  updateOrganization,
  updateOrganizationMember,
  updateRepository,
} from "../lib/api";
import { DevHealthCard } from "../components/dev-health-card";
import { Badge } from "../components/ui/badge";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { CopyButton } from "../components/ui/copy-button";
import { DataTable } from "../components/ui/data-table";
import { Input as UiInput } from "../components/ui/input";
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
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
        {eyebrow}
      </p>
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
  return (
    <section
      className={clsx(
        "rounded-xl border border-border bg-surface p-5 shadow-panel",
        className,
      )}
    >
      {children}
    </section>
  );
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

function MessageBanner({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "info";
}) {
  const classes =
    tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-red-200 bg-red-50 text-red-800";
  return (
    <p className={clsx("rounded-md border px-3 py-2 text-sm", classes)}>
      {message}
    </p>
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
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearError, errorMessage, isAuthenticated, login, register } =
    useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/organizations" replace />;
  }

  const redirectTarget =
    new URLSearchParams(location.search).get("redirect") ?? "/organizations";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setLocalError(null);

    if (
      !email.trim() ||
      !password.trim() ||
      (mode === "register" && !displayName.trim())
    ) {
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
      setLocalError(
        error instanceof Error
          ? error.message
          : "Unable to continue right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Surface>
        <SectionHeader
          eyebrow={mode === "login" ? "Identity" : "Registration"}
          title={
            mode === "login"
              ? "Sign in to the control plane"
              : "Create your RevForge account"
          }
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
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
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
              <Link
                className="text-forge-600 underline-offset-2 hover:underline"
                to={mode === "login" ? "/register" : "/login"}
              >
                {mode === "login" ? "Register here" : "Sign in"}
              </Link>
            </p>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Working..."
                : mode === "login"
                  ? "Login"
                  : "Create account"}
            </Button>
          </div>
        </form>
      </Surface>

      <Surface>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
          Phase 1 scope
        </p>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li>
            Organization owners and admins manage membership and repository
            metadata.
          </li>
          <li>
            Public, internal, and private repository visibility is enforced by
            the backend.
          </li>
          <li>
            Mercurial repository provisioning, clone URLs, and history browsing
            land in Phase 2.
          </li>
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
              [
                "Authentication",
                "Opaque server-side sessions with CSRF protection",
              ],
              ["Organizations", "Owner, admin, and member role boundaries"],
              [
                "Repositories",
                "Public, internal, and private metadata catalog",
              ],
            ].map(([title, detail]) => (
              <div
                key={title}
                className="rounded-lg border border-border bg-canvas p-4"
              >
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                  Ready
                </p>
                <h3 className="mt-2 text-base font-semibold text-ink-950">
                  {title}
                </h3>
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
                <li>
                  Organization owners and admins inherit repository
                  administration.
                </li>
                <li>
                  Members see internal repositories and need explicit access for
                  private ones.
                </li>
                <li>
                  Every important control-plane change writes an audit event.
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Next phase
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  Mercurial repository provisioning and safe storage mapping
                </li>
                <li>Native clone, pull, and push transport endpoints</li>
                <li>Changesets, file browsing, and clone guidance</li>
              </ul>
            </div>
          </div>

          {isAuthenticated ? (
            <p className="mt-6 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-medium text-ink-950">
                {user?.display_name}
              </span>
              . Head to{" "}
              <Link
                className="text-forge-600 underline-offset-2 hover:underline"
                to="/organizations"
              >
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
      setCreateError(
        error instanceof Error
          ? error.message
          : "Unable to create organization.",
      );
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
          {organizationsQuery.isLoading ? (
            <LoadingState label="Loading your organizations." />
          ) : null}
          {organizationsQuery.isError ? (
            <ErrorState
              title="Organizations unavailable"
              description={
                organizationsQuery.error instanceof Error
                  ? organizationsQuery.error.message
                  : "Unable to load organizations."
              }
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
                      <h3 className="text-base font-semibold text-ink-950">
                        {organization.display_name}
                      </h3>
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
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Create organization
          </p>
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
                  setFormState((current) => ({
                    ...current,
                    display_name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Slug">
              <TextInput
                aria-label="Organization slug"
                value={formState.slug}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Description">
              <TextArea
                aria-label="Organization description"
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
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

  return {
    membersQuery,
    organizationQuery,
    organizationSlug,
    repositoriesQuery,
  };
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
  const {
    membersQuery,
    organizationQuery,
    organizationSlug,
    repositoriesQuery,
  } = useOrganizationRouteData();
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"owner" | "admin" | "member">(
    "member",
  );
  const [repoState, setRepoState] = useState({
    slug: "",
    display_name: "",
    description: "",
    visibility: "private" as "public" | "internal" | "private",
  });
  const [repoSearch, setRepoSearch] = useState("");

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addOrganizationMember(
        organizationSlug,
        { email: memberEmail, role: memberRole },
        csrfToken,
      ),
    onSuccess: async () => {
      setMemberEmail("");
      setMemberRole("member");
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationSlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization", organizationSlug],
      });
    },
  });

  const createRepoMutation = useMutation({
    mutationFn: () => createRepository(organizationSlug, repoState, csrfToken),
    onSuccess: async () => {
      setRepoState({
        slug: "",
        display_name: "",
        description: "",
        visibility: "private",
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization-repositories", organizationSlug],
      });
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization overview." />;
  }
  if (organizationQuery.isError) {
    return (
      <ErrorState
        title="Organization unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load organization."
        }
      />
    );
  }

  const organization = organizationQuery.data;
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Organization"
        title={organization.display_name}
        description={
          organization.description ??
          "Organization metadata is live now. Mercurial repository provisioning arrives in Phase 2."
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                {organization.slug}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Your role is{" "}
                <span className="font-medium text-ink-950">
                  {organization.viewer_role}
                </span>
                .
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
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
              Repositories
            </p>
            <div className="mt-3">
              <UiInput
                placeholder="Filter repositories..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
              />
            </div>
            {repositoriesQuery.isLoading ? (
              <div className="mt-3">
                <LoadingState label="Loading repositories." />
              </div>
            ) : null}
            {repositoriesQuery.data?.length ? (
              <div className="mt-3">
                <DataTable
                  columns={[
                    {
                      key: "name",
                      header: "Name",
                      render: (r) => (
                        <Link
                          to={`/organizations/${organization.slug}/repositories/${r.slug}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {r.display_name}
                        </Link>
                      ),
                    },
                    {
                      key: "slug",
                      header: "Slug",
                      render: (r) => (
                        <span className="font-mono text-xs text-text-muted">
                          {r.slug}
                        </span>
                      ),
                    },
                    {
                      key: "visibility",
                      header: "Visibility",
                      render: (r) => (
                        <Badge variant={r.visibility === "public" ? "success" : r.visibility === "internal" ? "warning" : "default"}>
                          {r.visibility}
                        </Badge>
                      ),
                    },
                    {
                      key: "created_at",
                      header: "Created",
                      render: (r) => (
                        <span className="text-sm text-text-muted">
                          {formatTimestamp(r.created_at)}
                        </span>
                      ),
                    },
                  ]}
                  data={repositoriesQuery.data.filter(
                    (r) =>
                      !repoSearch ||
                      r.display_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
                      r.slug.toLowerCase().includes(repoSearch.toLowerCase()),
                  )}
                  keyFn={(r) => r.id}
                />
              </div>
            ) : repositoriesQuery.isSuccess ? (
              <div className="mt-3">
                <EmptyState
                  title="No repositories yet"
                  description="Create repository metadata now. RevForge will attach physical Mercurial provisioning in Phase 2."
                />
              </div>
            ) : null}
          </div>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Members
          </p>
          {membersQuery.isLoading ? (
            <LoadingState label="Loading members." />
          ) : null}
          {membersQuery.data?.length ? (
            <div className="mt-4 space-y-3">
              {membersQuery.data.map((member) => (
                <div
                  key={member.id}
                  className="rounded-lg border border-border bg-canvas p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink-950">
                        {member.user_display_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {member.user_email}
                      </p>
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
                  <Select
                    value={memberRole}
                    onChange={(event) =>
                      setMemberRole(
                        event.target.value as "owner" | "admin" | "member",
                      )
                    }
                  >
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
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                  Create repository metadata
                </p>
                <FormField label="Display name">
                  <TextInput
                    aria-label="Repository display name"
                    value={repoState.display_name}
                    onChange={(event) =>
                      setRepoState((current) => ({
                        ...current,
                        display_name: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Slug">
                  <TextInput
                    aria-label="Repository slug"
                    value={repoState.slug}
                    onChange={(event) =>
                      setRepoState((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Visibility">
                  <Select
                    value={repoState.visibility}
                    onChange={(event) =>
                      setRepoState((current) => ({
                        ...current,
                        visibility: event.target.value as
                          "public" | "internal" | "private",
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
                      setRepoState((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
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
                  {createRepoMutation.isPending
                    ? "Creating..."
                    : "Create repository"}
                </Button>
              </form>
            </>
          ) : (
            <p className="mt-6 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-slate-600">
              Member management and repository creation stay restricted to
              organization owners and admins.
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
  const { membersQuery, organizationQuery, organizationSlug } =
    useOrganizationRouteData();
  const [message, setMessage] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (payload: {
      display_name?: string;
      description?: string | null;
    }) => updateOrganization(organizationSlug, payload, csrfToken),
    onSuccess: async () => {
      setMessage("Organization settings saved.");
      await queryClient.invalidateQueries({
        queryKey: ["organization", organizationSlug],
      });
    },
  });

  const memberRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: "owner" | "admin" | "member";
    }) =>
      updateOrganizationMember(organizationSlug, memberId, { role }, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationSlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization", organizationSlug],
      });
    },
  });

  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ id: string; name: string } | null>(null);
  const memberDeleteMutation = useMutation({
    mutationFn: (memberId: string) =>
      deleteOrganizationMember(organizationSlug, memberId, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationSlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization", organizationSlug],
      });
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization settings." />;
  }
  if (organizationQuery.isError) {
    return (
      <ErrorState
        title="Organization settings unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load organization settings."
        }
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
              <TextInput
                aria-label="Display name"
                defaultValue={organization.display_name}
                name="display_name"
              />
            </FormField>
            <FormField label="Description">
              <TextArea
                aria-label="Description"
                defaultValue={organization.description ?? ""}
                name="description"
              />
            </FormField>
            {message ? <MessageBanner message={message} tone="info" /> : null}
            {updateMutation.isError ? (
              <MessageBanner
                message={
                  updateMutation.error instanceof Error
                    ? updateMutation.error.message
                    : "Unable to save organization settings."
                }
              />
            ) : null}
            <Button
              disabled={updateMutation.isPending || !organization.can_manage}
              type="submit"
            >
              Save organization settings
            </Button>
          </form>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Member roles
          </p>
          {membersQuery.isLoading ? (
            <LoadingState label="Loading member settings." />
          ) : null}
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
                    role: String(form.get("role")) as
                      "owner" | "admin" | "member",
                  });
                }}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-950">
                      {member.user_display_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {member.user_email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      aria-label={`Role for ${member.user_email}`}
                      defaultValue={member.role}
                      name="role"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                      <option value="owner">owner</option>
                    </Select>
                    <Button
                      disabled={
                        !organization.can_manage || memberRoleMutation.isPending
                      }
                      type="submit"
                      variant="secondary"
                    >
                      Save
                    </Button>
                    <Button
                      disabled={
                        !organization.can_manage ||
                        memberDeleteMutation.isPending
                      }
                      onClick={() =>
                        setRemoveMemberTarget({
                          id: member.id,
                          name: member.user_display_name,
                        })
                      }
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
              message={
                memberRoleMutation.error instanceof Error
                  ? memberRoleMutation.error.message
                  : "Unable to update the member role."
              }
            />
          ) : null}
          {memberDeleteMutation.isError ? (
            <MessageBanner
              message={
                memberDeleteMutation.error instanceof Error
                  ? memberDeleteMutation.error.message
                  : "Unable to remove the member."
              }
            />
          ) : null}
          <ConfirmDialog
            open={removeMemberTarget !== null}
            onClose={() => setRemoveMemberTarget(null)}
            onConfirm={() => {
              if (removeMemberTarget) {
                void memberDeleteMutation.mutateAsync(removeMemberTarget.id);
              }
              setRemoveMemberTarget(null);
            }}
            title="Remove member"
            message={`Remove ${removeMemberTarget?.name ?? "this member"} from ${organization.display_name}?`}
            confirmLabel="Remove"
            confirmVariant="danger"
          />
        </Surface>
      </div>
    </div>
  );
}

type RepositorySection =
  | "overview"
  | "code"
  | "commits"
  | "changeset"
  | "branches"
  | "tags"
  | "bookmarks"
  | "pull-requests"
  | "pull-request";

function RepositoryMetadataItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-canvas p-4">
      <dt className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function RepositoryProvisioningBadge({
  provisioningState,
}: {
  provisioningState: RepositoryDetail["provisioning_state"];
}) {
  const tone = {
    unprovisioned: "border-slate-300 bg-slate-100 text-slate-700",
    provisioning: "border-blue-200 bg-blue-50 text-blue-700",
    ready: "border-green-200 bg-green-50 text-green-700",
    failed: "border-red-200 bg-red-50 text-red-700",
  }[provisioningState];

  return (
    <span
      className={clsx(
        "rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]",
        tone,
      )}
    >
      {provisioningState}
    </span>
  );
}

function QuickLinkCard({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      className="rounded-lg border border-border bg-canvas p-4 transition hover:border-forge-500 hover:bg-forge-100/40"
      to={to}
    >
      <p className="text-sm font-semibold text-ink-950">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </Link>
  );
}

function resolveRepositorySection(
  pathname: string,
  basePath: string,
): RepositorySection {
  if (pathname === `${basePath}/code`) {
    return "code";
  }
  if (pathname === `${basePath}/commits`) {
    return "commits";
  }
  if (pathname.startsWith(`${basePath}/changesets/`)) {
    return "changeset";
  }
  if (pathname === `${basePath}/branches`) {
    return "branches";
  }
  if (pathname === `${basePath}/tags`) {
    return "tags";
  }
  if (pathname === `${basePath}/bookmarks`) {
    return "bookmarks";
  }
  if (pathname === `${basePath}/pull-requests`) {
    return "pull-requests";
  }
  if (pathname.startsWith(`${basePath}/pull-requests/`)) {
    return "pull-request";
  }
  return "overview";
}

function repositorySectionNode(pathname: string): string | null {
  const node = pathname.split("/changesets/")[1];
  return node && node.length > 0 ? decodeURIComponent(node) : null;
}

function repositorySearch(
  search: string,
  updates: { path?: string | null; revision?: string | null },
) {
  const params = new URLSearchParams(search);
  if (updates.path === undefined) {
    // Keep the current path untouched.
  } else if (updates.path) {
    params.set("path", updates.path);
  } else {
    params.delete("path");
  }
  if (updates.revision === undefined) {
    // Keep the current revision untouched.
  } else if (updates.revision) {
    params.set("revision", updates.revision);
  } else {
    params.delete("revision");
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function repositoryRevisionGroups(
  refs: RepositoryRefs | undefined,
  selectedRevision: string | null,
) {
  const currentRevision = selectedRevision?.trim() ?? "";
  const groups = [
    { label: "Branches", refs: refs?.branches ?? [] },
    { label: "Tags", refs: refs?.tags ?? [] },
    { label: "Bookmarks", refs: refs?.bookmarks ?? [] },
  ].filter((group) => group.refs.length > 0);

  const hasCurrentRevision =
    currentRevision.length > 0 &&
    groups.some((group) =>
      group.refs.some(
        (ref) => ref.node === currentRevision || ref.name === currentRevision,
      ),
    );

  return { currentRevision, groups, hasCurrentRevision };
}

function renderRepositorySection({
  basePath,
  browseQuery,
  changesetNode,
  changesetQuery,
  changesets,
  currentSection,
  diffQuery,
  historyQuery,
  locationSearch,
  onSelectCodeRevision,
  refsError,
  refsIsError,
  refs,
  repository,
  revisionLabel,
  selectedRevision,
}: {
  basePath: string;
  browseQuery: {
    data?: RepositoryBrowseResult;
    error: unknown;
    isError: boolean;
    isLoading: boolean;
  };
  changesetNode: string | null;
  changesetQuery: {
    data?: ChangesetDetail;
    error: unknown;
    isError: boolean;
    isLoading: boolean;
  };
  changesets: ChangesetSummary[];
  currentSection: RepositorySection;
  diffQuery: {
    data?: ChangesetDiff;
    error: unknown;
    isError: boolean;
    isLoading: boolean;
  };
  historyQuery: {
    error: unknown;
    fetchNextPage: () => Promise<unknown>;
    hasNextPage?: boolean;
    isError: boolean;
    isFetchingNextPage: boolean;
    isLoading: boolean;
  };
  locationSearch: string;
  onSelectCodeRevision: (revision: string | null) => void;
  refsError: unknown;
  refsIsError: boolean;
  refs: RepositoryRefs | undefined;
  repository: RepositoryDetail;
  revisionLabel: string;
  selectedRevision: string | null;
}) {
  if (!repository.is_browsable) {
    return (
      <EmptyState
        title="Mercurial repository not provisioned yet"
        description="Provision the repository to unlock history, diffs, branches, tags, bookmarks, and code browsing."
      />
    );
  }

  if (currentSection === "overview") {
    return (
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
          Overview
        </p>
        <p className="text-sm text-slate-600">
          Repository storage is provisioned and safe read-only browsing is
          active.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <RepositoryMetadataItem
            label="Current target"
            value={revisionLabel}
          />
          <RepositoryMetadataItem
            label="Provisioned at"
            value={
              repository.provisioned_at
                ? formatTimestamp(repository.provisioned_at)
                : "not recorded"
            }
          />
          <RepositoryMetadataItem
            label="Authorized actions"
            value={
              repository.can_manage
                ? "Browse plus repository administration"
                : "Browse only"
            }
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <QuickLinkCard
            title="Browse code"
            description="Open the repository tree at the current revision target."
            to={`${basePath}/code${repositorySearch(locationSearch, { path: "", revision: selectedRevision })}`}
          />
          <QuickLinkCard
            title="View history"
            description="Inspect paginated changesets and open full diff views."
            to={`${basePath}/commits`}
          />
        </div>
      </div>
    );
  }

  if (currentSection === "code") {
    if (browseQuery.isLoading) {
      return <LoadingState label="Loading repository content." />;
    }
    if (browseQuery.isError) {
      return (
        <ErrorState
          title="Repository content unavailable"
          description={
            browseQuery.error instanceof Error
              ? browseQuery.error.message
              : "Unable to load repository content."
          }
        />
      );
    }

    const browseResult = browseQuery.data;
    if (!browseResult) {
      return (
        <ErrorState
          title="Repository content unavailable"
          description="The browser did not receive repository content."
        />
      );
    }

    const pathSegments =
      browseResult.path === "" ? [] : browseResult.path.split("/");
    const revisionOptions = repositoryRevisionGroups(refs, selectedRevision);

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
              Code
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Browsing revision{" "}
              <span className="font-mono text-ink-950">
                {browseResult.revision || "empty repository"}
              </span>
            </p>
          </div>
          <label className="block text-sm text-slate-600">
            <span className="mb-2 block font-medium text-ink-950">
              Revision
            </span>
            {refsIsError ? (
              <p className="mb-2 text-xs text-red-700">
                {refsError instanceof Error
                  ? refsError.message
                  : "Unable to load repository references."}
              </p>
            ) : null}
            <Select
              aria-label="Browse revision"
              value={selectedRevision ?? ""}
              onChange={(event) => {
                onSelectCodeRevision(event.target.value || null);
              }}
            >
              <option value="">latest tip</option>
              {revisionOptions.groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.refs.map((ref) => (
                    <option key={`${group.label}-${ref.name}`} value={ref.name}>
                      {ref.name} ({ref.short_node})
                    </option>
                  ))}
                </optgroup>
              ))}
              {revisionOptions.currentRevision &&
              !revisionOptions.hasCurrentRevision ? (
                <option value={revisionOptions.currentRevision}>
                  {revisionOptions.currentRevision.slice(0, 12)}
                </option>
              ) : null}
            </Select>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-canvas p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              className="text-forge-600 underline-offset-2 hover:underline"
              to={`${basePath}/code${repositorySearch(locationSearch, { path: "", revision: selectedRevision })}`}
            >
              root
            </Link>
            {pathSegments.map((segment, index) => {
              const nextPath = pathSegments.slice(0, index + 1).join("/");
              const isLast = index === pathSegments.length - 1;
              return (
                <span key={nextPath} className="flex items-center gap-2">
                  <span className="text-slate-400">/</span>
                  {isLast && browseResult.kind === "file" ? (
                    <span className="font-mono text-ink-950">{segment}</span>
                  ) : (
                    <Link
                      className="font-mono text-forge-600 underline-offset-2 hover:underline"
                      to={`${basePath}/code${repositorySearch(locationSearch, { path: nextPath, revision: selectedRevision })}`}
                    >
                      {segment}
                    </Link>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {browseResult.kind === "directory" ? (
          browseResult.revision === "" && browseResult.entries.length === 0 ? (
            <EmptyState
              title="Empty repository"
              description="This Mercurial repository is provisioned but does not contain any committed files yet."
            />
          ) : (
            <div className="space-y-2">
              {browseResult.entries.map((entry) => (
                <Link
                  key={entry.path}
                  className="flex items-center justify-between rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-slate-700 transition hover:border-forge-500"
                  to={`${basePath}/code${repositorySearch(locationSearch, {
                    path: entry.path,
                    revision: selectedRevision,
                  })}`}
                >
                  <span className="font-mono text-ink-950">{entry.name}</span>
                  <span className="uppercase tracking-[0.18em] text-slate-500">
                    {entry.kind}
                  </span>
                </Link>
              ))}
            </div>
          )
        ) : browseResult.is_binary ? (
          <EmptyState
            title="Binary file"
            description="RevForge detected binary content and is intentionally withholding inline rendering."
          />
        ) : browseResult.is_too_large ? (
          <EmptyState
            title="File too large to render"
            description="This file exceeded the configured safe inline size limit, so the browser returned metadata without file contents."
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-slate-600">
              <span>
                Language hint:{" "}
                <span className="font-mono text-ink-950">
                  {browseResult.language_hint_when_available ?? "plain text"}
                </span>
              </span>
              <Link
                className="text-forge-600 underline-offset-2 hover:underline"
                to={`${basePath}/changesets/${browseResult.revision}`}
              >
                View changeset
              </Link>
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-canvas p-4 text-xs text-ink-950">
              <code>{browseResult.content ?? ""}</code>
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (currentSection === "commits") {
    if (historyQuery.isLoading) {
      return <LoadingState label="Loading repository history." />;
    }
    if (historyQuery.isError) {
      return (
        <ErrorState
          title="History unavailable"
          description={
            historyQuery.error instanceof Error
              ? historyQuery.error.message
              : "Unable to load repository history."
          }
        />
      );
    }
    if (changesets.length === 0) {
      return (
        <EmptyState
          title="No changesets yet"
          description="The repository is provisioned, but there are not any committed revisions to display."
        />
      );
    }
    return (
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
          History
        </p>
        {changesets.map((changeset) => (
          <div
            key={changeset.node}
            className="rounded-lg border border-border bg-canvas p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <Link
                  className="text-sm font-semibold text-forge-600 underline-offset-2 hover:underline"
                  to={`${basePath}/changesets/${changeset.node}`}
                >
                  {changeset.message.split("\n")[0] || "(no commit message)"}
                </Link>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span className="font-mono text-ink-950">
                    {changeset.short_node}
                  </span>
                  <span>{changeset.author_name}</span>
                  <span>{formatTimestamp(changeset.timestamp)}</span>
                  <span>branch: {changeset.branch}</span>
                </div>
              </div>
              <span className="text-sm text-slate-500">
                {changeset.files_changed_count_when_available ?? 0} file changes
              </span>
            </div>
          </div>
        ))}
        {historyQuery.hasNextPage ? (
          <Button
            disabled={historyQuery.isFetchingNextPage}
            onClick={() => {
              void historyQuery.fetchNextPage();
            }}
            type="button"
            variant="secondary"
          >
            {historyQuery.isFetchingNextPage
              ? "Loading more changesets..."
              : "Load more"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (currentSection === "changeset") {
    if (!changesetNode) {
      return (
        <ErrorState
          title="Changeset unavailable"
          description="No changeset identifier was provided."
        />
      );
    }
    if (changesetQuery.isLoading || diffQuery.isLoading) {
      return <LoadingState label="Loading changeset detail." />;
    }
    if (changesetQuery.isError) {
      return (
        <ErrorState
          title="Changeset unavailable"
          description={
            changesetQuery.error instanceof Error
              ? changesetQuery.error.message
              : "Unable to load changeset detail."
          }
        />
      );
    }
    if (diffQuery.isError) {
      return (
        <ErrorState
          title="Diff unavailable"
          description={
            diffQuery.error instanceof Error
              ? diffQuery.error.message
              : "Unable to load the unified diff."
          }
        />
      );
    }
    if (!changesetQuery.data || !diffQuery.data) {
      return (
        <ErrorState
          title="Changeset unavailable"
          description="The browser did not receive complete changeset data."
        />
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
              Changeset
            </p>
            <h3 className="mt-2 text-lg font-semibold text-ink-950">
              {changesetQuery.data.message.split("\n")[0] ||
                "(no commit message)"}
            </h3>
          </div>
          <Link
            className="text-sm text-forge-600 underline-offset-2 hover:underline"
            to={`${basePath}/commits`}
          >
            Back to history
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <RepositoryMetadataItem
            label="Node"
            value={changesetQuery.data.node}
          />
          <RepositoryMetadataItem
            label="Branch"
            value={changesetQuery.data.branch}
          />
          <RepositoryMetadataItem
            label="Author"
            value={changesetQuery.data.author_name}
          />
          <RepositoryMetadataItem
            label="Timestamp"
            value={formatTimestamp(changesetQuery.data.timestamp)}
          />
        </div>
        <div className="rounded-lg border border-border bg-canvas p-4">
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {changesetQuery.data.message}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-canvas p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
              Parents
            </p>
            {changesetQuery.data.parents.length > 0 ? (
              <div className="mt-3 space-y-2">
                {changesetQuery.data.parents.map((parent) => (
                  <Link
                    key={parent}
                    className="block font-mono text-sm text-forge-600 underline-offset-2 hover:underline"
                    to={`${basePath}/changesets/${parent}`}
                  >
                    {parent}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                This is a root changeset.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border bg-canvas p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
              References
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                Tags:{" "}
                {changesetQuery.data.tags.length > 0
                  ? changesetQuery.data.tags.join(", ")
                  : "none"}
              </p>
              <p>
                Bookmarks:{" "}
                {changesetQuery.data.bookmarks.length > 0
                  ? changesetQuery.data.bookmarks.join(", ")
                  : "none"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-canvas p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
            Changed files
          </p>
          {changesetQuery.data.files_changed.length > 0 ? (
            <div className="mt-3 space-y-2">
              {changesetQuery.data.files_changed.map((filePath) => (
                <Link
                  key={filePath}
                  className="block font-mono text-sm text-forge-600 underline-offset-2 hover:underline"
                  to={`${basePath}/code${repositorySearch("", {
                    path: filePath,
                    revision: changesetQuery.data?.node ?? null,
                  })}`}
                >
                  {filePath}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No file list was returned for this changeset.
            </p>
          )}
        </div>
        {diffQuery.data.is_truncated ? (
          <MessageBanner
            message={`Diff output was truncated${diffQuery.data.truncation_reason_when_applicable ? ` (${diffQuery.data.truncation_reason_when_applicable})` : ""}.`}
            tone="info"
          />
        ) : null}
        <pre className="overflow-x-auto rounded-lg border border-border bg-canvas p-4 text-xs text-ink-950">
          <code>{diffQuery.data.content}</code>
        </pre>
      </div>
    );
  }

  if (currentSection === "pull-requests") {
    return (
      <PullRequestListContent
        basePath={basePath}
        repositorySlug={repository.slug}
        organizationSlug={repository.organization_slug}
      />
    );
  }

  if (currentSection === "pull-request") {
    return (
      <PullRequestDetailContent
        basePath={basePath}
        repositorySlug={repository.slug}
        organizationSlug={repository.organization_slug}
      />
    );
  }

  const refCollection: RepositoryRef[] =
    currentSection === "branches"
      ? (refs?.branches ?? [])
      : currentSection === "tags"
        ? (refs?.tags ?? [])
        : (refs?.bookmarks ?? []);
  const refLabel =
    currentSection === "branches"
      ? "Branches"
      : currentSection === "tags"
        ? "Tags"
        : "Bookmarks";

  if (refsIsError) {
    return (
      <ErrorState
        title={`${refLabel} unavailable`}
        description={
          refsError instanceof Error
            ? refsError.message
            : `Unable to load ${refLabel.toLowerCase()}.`
        }
      />
    );
  }

  if (refs === undefined && currentSection !== "overview") {
    return <LoadingState label={`Loading ${refLabel.toLowerCase()}.`} />;
  }

  if (refCollection.length === 0) {
    return (
      <EmptyState
        title={`No ${refLabel.toLowerCase()} available`}
        description={`This repository does not currently expose any ${refLabel.toLowerCase()} to browse.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
        {refLabel}
      </p>
      {refCollection.map((ref) => (
        <div
          key={`${refLabel}-${ref.name}`}
          className="rounded-lg border border-border bg-canvas p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-950">{ref.name}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                {ref.node}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                className="text-forge-600 underline-offset-2 hover:underline"
                to={`${basePath}/code${repositorySearch("", { path: "", revision: ref.name })}`}
              >
                Browse code
              </Link>
              <Link
                className="text-forge-600 underline-offset-2 hover:underline"
                to={`${basePath}/changesets/${ref.node}`}
              >
                View changeset
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RepositoryDetailPage() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { organizationSlug = "", repositorySlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const basePath = `/organizations/${organizationSlug}/repositories/${repositorySlug}`;
  const currentSection = resolveRepositorySection(location.pathname, basePath);
  const searchParams = new URLSearchParams(location.search);
  const selectedRevision = searchParams.get("revision");
  const selectedPath = searchParams.get("path") ?? "";
  const repositoryQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug, repositorySlug),
  });
  const refsQuery = useQuery({
    queryKey: ["repository-refs", organizationSlug, repositorySlug],
    queryFn: () => getRepositoryRefs(organizationSlug, repositorySlug),
    enabled: repositoryQuery.data?.is_browsable === true,
  });
  const browseQuery = useQuery({
    queryKey: [
      "repository-browse",
      organizationSlug,
      repositorySlug,
      selectedRevision ?? "",
      selectedPath,
    ],
    queryFn: () =>
      browseRepository(organizationSlug, repositorySlug, {
        revision: selectedRevision,
        path: selectedPath,
      }),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      (currentSection === "code" || currentSection === "overview"),
  });
  const historyQuery = useInfiniteQuery({
    queryKey: ["repository-changesets", organizationSlug, repositorySlug],
    queryFn: ({ pageParam }) =>
      listChangesets(organizationSlug, repositorySlug, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "commits",
  });
  const changesetNode =
    currentSection === "changeset"
      ? repositorySectionNode(location.pathname)
      : null;
  const changesetQuery = useQuery({
    queryKey: [
      "repository-changeset",
      organizationSlug,
      repositorySlug,
      changesetNode,
    ],
    queryFn: () =>
      getChangeset(organizationSlug, repositorySlug, changesetNode ?? ""),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "changeset" &&
      changesetNode !== null,
  });
  const diffQuery = useQuery({
    queryKey: [
      "repository-diff",
      organizationSlug,
      repositorySlug,
      changesetNode,
    ],
    queryFn: () =>
      getChangesetDiff(organizationSlug, repositorySlug, changesetNode ?? ""),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "changeset" &&
      changesetNode !== null,
  });
  const [provisionConfirmOpen, setProvisionConfirmOpen] = useState(false);
  const provisionMutation = useMutation({
    mutationFn: () =>
      provisionRepository(organizationSlug, repositorySlug, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["repository-refs", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["repository-browse", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["repository-changesets", organizationSlug, repositorySlug],
      });
      navigate(`${basePath}/code`);
    },
  });

  if (repositoryQuery.isLoading) {
    return <LoadingState label="Loading repository metadata." />;
  }
  if (repositoryQuery.isError) {
    return (
      <ErrorState
        title="Repository unavailable"
        description={
          repositoryQuery.error instanceof Error
            ? repositoryQuery.error.message
            : "Unable to load repository."
        }
      />
    );
  }

  const repository = repositoryQuery.data;
  const refs = refsQuery.data;
  const historyPages = historyQuery.data?.pages ?? [];
  const changesets = historyPages.flatMap((page) => page.changesets);
  const revisionLabel =
    selectedRevision ?? browseQuery.data?.revision ?? "latest tip";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant={repository.visibility === "public" ? "success" : repository.visibility === "internal" ? "warning" : "default"}>
          {repository.visibility}
        </Badge>
        <RepositoryProvisioningBadge
          provisioningState={repository.provisioning_state}
        />
        {repository.archived_at ? (
          <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-slate-700">
            Archived
          </span>
        ) : null}
        {repository.can_manage ? (
          <Link
            to={`${basePath}/settings`}
            className="ml-auto rounded-md border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Settings
          </Link>
        ) : null}
      </div>

      {repository.description ? (
        <p className="text-sm text-text-secondary">{repository.description}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <RepositoryMetadataItem
          label="Viewer role"
          value={repository.viewer_role ?? "public metadata only"}
        />
        <RepositoryMetadataItem
          label="Archive state"
          value={repository.archived_at ? "Archived" : "Active"}
        />
        <RepositoryMetadataItem
          label="Provisioning"
          value={repository.phase_status}
        />
        <RepositoryMetadataItem
          label="Revision target"
          value={
            repository.is_browsable ? revisionLabel : "not available yet"
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
        <Surface>
          {renderRepositorySection({
            basePath,
            browseQuery,
            changesetNode,
            changesetQuery,
            changesets,
            currentSection,
            diffQuery,
            historyQuery,
            locationSearch: location.search,
            onSelectCodeRevision: (revision) => {
              navigate(
                `${basePath}/code${repositorySearch(location.search, {
                  path: selectedPath,
                  revision,
                })}`,
              );
            },
            refsError: refsQuery.error,
            refsIsError: refsQuery.isError,
            refs,
            repository,
            revisionLabel,
            selectedRevision,
          })}
        </Surface>

        <Surface>
          {!repository.is_browsable ? (
            <>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Provisioning
              </p>
              <p className="mt-4 text-sm text-slate-600">
                {repository.phase_status}
              </p>
              {repository.provisioned_at ? (
                <p className="mt-3 text-sm text-slate-500">
                  Last provisioned at{" "}
                  {formatTimestamp(repository.provisioned_at)}.
                </p>
              ) : null}
              {repository.can_manage && !repository.archived_at ? (
                <div className="mt-6 space-y-3">
                  <Button
                    disabled={
                      provisionMutation.isPending ||
                      repository.provisioning_state === "provisioning"
                    }
                    onClick={() => setProvisionConfirmOpen(true)}
                    type="button"
                  >
                    Provision Mercurial repository
                  </Button>
                  {provisionMutation.isError ? (
                    <MessageBanner
                      message={
                        provisionMutation.error instanceof Error
                          ? provisionMutation.error.message
                          : "Unable to provision the Mercurial repository."
                      }
                    />
                  ) : null}
                </div>
              ) : null}
              {!repository.can_manage ? (
                <div className="mt-6">
                  <EmptyState
                    title="Provisioning is limited"
                    description="Only organization owners, organization admins, and repository admins can provision Mercurial storage."
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Clone
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs text-text-muted">HTTPS</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded border border-border bg-canvas px-2 py-1.5 text-xs font-mono text-text-primary">
                      https://{window.location.host}/hg/{organizationSlug}/{repositorySlug}
                    </code>
                    <CopyButton
                      text={`https://${window.location.host}/hg/${organizationSlug}/${repositorySlug}`}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted">SSH</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded border border-border bg-canvas px-2 py-1.5 text-xs font-mono text-text-primary">
                      ssh://hg@{window.location.host}/{organizationSlug}/{repositorySlug}
                    </code>
                    <CopyButton
                      text={`ssh://hg@${window.location.host}/${organizationSlug}/${repositorySlug}`}
                    />
                  </div>
                </div>
              </div>

              {changesets.length > 0 ? (
                <div className="mt-6">
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                    Latest changeset
                  </p>
                  <div className="mt-3 rounded border border-border bg-canvas p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-muted">
                        {changesets[0].short_node}
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatTimestamp(changesets[0].timestamp)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-text-primary line-clamp-2">
                      {changesets[0].message.split("\n")[0]}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {changesets[0].author_name}
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="mt-6 text-xs text-text-muted">
                Role: <span className="font-medium text-text-primary">{repository.viewer_role ?? "none"}</span>
                {repository.can_manage ? (
                  <span className="ml-2 rounded border border-accent-subtle bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent">admin</span>
                ) : null}
              </p>
            </>
          )}
          <ConfirmDialog
            open={provisionConfirmOpen}
            onClose={() => setProvisionConfirmOpen(false)}
            onConfirm={() => {
              setProvisionConfirmOpen(false);
              void provisionMutation.mutateAsync();
            }}
            title="Provision Mercurial repository"
            message={`Provision the Mercurial repository for ${repository.display_name}? This will create the underlying storage.`}
            confirmLabel="Provision"
          />
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
  const [permissionRole, setPermissionRole] = useState<
    "read" | "write" | "admin"
  >("read");

  const updateMutation = useMutation({
    mutationFn: (payload: {
      display_name?: string;
      description?: string | null;
      visibility?: "public" | "internal" | "private";
      archived?: boolean;
    }) =>
      updateRepository(organizationSlug, repositorySlug, payload, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization-repositories", organizationSlug],
      });
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
      await queryClient.invalidateQueries({
        queryKey: ["repository-permissions", organizationSlug, repositorySlug],
      });
    },
  });

  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const deletePermissionMutation = useMutation({
    mutationFn: (userId: string) =>
      deleteRepositoryPermission(
        organizationSlug,
        repositorySlug,
        userId,
        csrfToken,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository-permissions", organizationSlug, repositorySlug],
      });
    },
  });

  if (repositoryQuery.isLoading) {
    return <LoadingState label="Loading repository settings." />;
  }
  if (repositoryQuery.isError) {
    return (
      <ErrorState
        title="Repository settings unavailable"
        description={
          repositoryQuery.error instanceof Error
            ? repositoryQuery.error.message
            : "Unable to load repository settings."
        }
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
                visibility: String(form.get("visibility")) as
                  "public" | "internal" | "private",
                archived: form.get("archived") === "on",
              });
            }}
          >
            <FormField label="Display name">
              <TextInput
                aria-label="Repository display name"
                defaultValue={repository.display_name}
                name="display_name"
              />
            </FormField>
            <FormField label="Description">
              <TextArea
                aria-label="Repository description"
                defaultValue={repository.description ?? ""}
                name="description"
              />
            </FormField>
            <FormField label="Visibility">
              <Select
                aria-label="Repository visibility"
                defaultValue={repository.visibility}
                name="visibility"
              >
                <option value="private">private</option>
                <option value="internal">internal</option>
                <option value="public">public</option>
              </Select>
            </FormField>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                aria-label="Archive repository"
                defaultChecked={repository.archived_at !== null}
                name="archived"
                type="checkbox"
              />
              Archive repository metadata
            </label>
            {updateMutation.isError ? (
              <MessageBanner
                message={
                  updateMutation.error instanceof Error
                    ? updateMutation.error.message
                    : "Unable to save repository settings."
                }
              />
            ) : null}
            <Button disabled={updateMutation.isPending} type="submit">
              Save repository settings
            </Button>
          </form>
        </Surface>

        <Surface>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Repository permissions
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Add explicit access for private repositories or grant
            repository-specific administration without changing
            organization-wide roles.
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
              <Select
                value={permissionRole}
                onChange={(event) =>
                  setPermissionRole(
                    event.target.value as "read" | "write" | "admin",
                  )
                }
              >
                <option value="read">read</option>
                <option value="write">write</option>
                <option value="admin">admin</option>
              </Select>
            </FormField>
            {permissionMutation.isError ? (
              <MessageBanner
                message={
                  permissionMutation.error instanceof Error
                    ? permissionMutation.error.message
                    : "Unable to save repository permission."
                }
              />
            ) : null}
            <Button
              disabled={
                permissionMutation.isPending || !permissionUserId.trim()
              }
              type="submit"
            >
              Save permission
            </Button>
          </form>

          {permissionsQuery.isLoading ? (
            <LoadingState label="Loading repository permissions." />
          ) : null}
          <div className="mt-6 space-y-3">
            {permissionsQuery.data?.map((permission) => (
              <div
                key={permission.id}
                className="rounded-lg border border-border bg-canvas p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-950">
                      {permission.user_display_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {permission.user_email}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      role: {permission.role}
                    </p>
                  </div>
                  <Button
                    disabled={deletePermissionMutation.isPending}
                    onClick={() =>
                      setRevokeTarget({
                        id: permission.user_id,
                        name: permission.user_display_name,
                      })
                    }
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
          <ConfirmDialog
            open={revokeTarget !== null}
            onClose={() => setRevokeTarget(null)}
            onConfirm={() => {
              if (revokeTarget) {
                void deletePermissionMutation.mutateAsync(revokeTarget.id);
              }
              setRevokeTarget(null);
            }}
            title="Revoke access"
            message={`Revoke explicit access for ${revokeTarget?.name ?? "this user"}?`}
            confirmLabel="Revoke"
            confirmVariant="danger"
          />
      </div>
    </div>
  );
}

function usePrQuery(organizationSlug: string, repositorySlug: string) {
  return useQuery({
    queryKey: ["pull-requests", organizationSlug, repositorySlug],
    queryFn: () => listPullRequests(organizationSlug, repositorySlug),
  });
}

function PullRequestListContent({
  basePath,
  organizationSlug,
  repositorySlug,
}: {
  basePath: string;
  organizationSlug: string;
  repositorySlug: string;
}) {
  const { user, csrfToken } = useAuth();
  const prQuery = usePrQuery(organizationSlug, repositorySlug);
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceRevision, setSourceRevision] = useState("");
  const [targetRevision, setTargetRevision] = useState("tip");
  const [sourceBranch, setSourceBranch] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [draft, setDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createPullRequest(
        organizationSlug,
        repositorySlug,
        {
          title,
          description: description || null,
          source_revision: sourceRevision,
          target_revision: targetRevision,
          source_branch: sourceBranch || null,
          target_branch: targetBranch || null,
          draft,
        },
        csrfToken,
      ),
    onSuccess: async () => {
      setShowForm(false);
      setTitle("");
      setDescription("");
      setSourceRevision("");
      setTargetRevision("tip");
      setSourceBranch("");
      setTargetBranch("");
      setDraft(false);
      setFormError(null);
      await queryClient.invalidateQueries({
        queryKey: ["pull-requests", organizationSlug, repositorySlug],
      });
    },
    onError: (error) => {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to create pull request.",
      );
    },
  });

  if (prQuery.isLoading) return <LoadingState label="Loading pull requests." />;
  if (prQuery.isError) {
    return (
      <ErrorState
        title="Pull requests unavailable"
        description={
          prQuery.error instanceof Error
            ? prQuery.error.message
            : "Unable to load pull requests."
        }
      />
    );
  }

  const prs = prQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
          Pull Requests
        </p>
        {user ? (
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "New Pull Request"}
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <Surface className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Create Pull Request
          </p>
          {formError ? (
            <MessageBanner message={formError} tone="error" />
          ) : null}
          <FormField label="Title">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Pull request title"
            />
          </FormField>
          <FormField label="Description">
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Source revision">
              <TextInput
                value={sourceRevision}
                onChange={(e) => setSourceRevision(e.target.value)}
                placeholder="e.g. 1a2b3c4d5e or branch name"
              />
            </FormField>
            <FormField label="Target revision">
              <TextInput
                value={targetRevision}
                onChange={(e) => setTargetRevision(e.target.value)}
                placeholder="default: tip"
              />
            </FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Source branch (optional)">
              <TextInput
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                placeholder="feature-branch"
              />
            </FormField>
            <FormField label="Target branch (optional)">
              <TextInput
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                placeholder="default"
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
              className="rounded border-border"
            />
            Create as draft
          </label>
          <div className="flex gap-3">
            <Button
              variant="primary"
              disabled={
                createMutation.isPending ||
                !title.trim() ||
                !sourceRevision.trim()
              }
              onClick={() => void createMutation.mutateAsync()}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Surface>
      ) : null}

      {prs.length === 0 && !showForm ? (
        <EmptyState
          title="No pull requests yet"
          description="Pull requests let you propose changes and collaborate with your team."
        />
      ) : (
        <div className="space-y-3">
          {prs.map((pr) => (
            <Link
              key={pr.id}
              to={`${basePath}/pull-requests/${pr.id}`}
              className="block rounded-lg border border-border bg-canvas p-4 transition hover:border-forge-500"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-ink-950">
                    #{pr.number} — {pr.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pr.author_id.slice(0, 8)} &middot;{" "}
                    {formatTimestamp(pr.created_at)}
                  </p>
                </div>
                <PullRequestStateBadge state={pr.state} />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>{pr.approval_count} approvals</span>
                <span>{pr.changes_requested_count} changes requested</span>
                <span>{pr.comment_count} comments</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PullRequestStateBadge({ state }: { state: string }) {
  const tone =
    state === "open"
      ? "border-green-200 bg-green-50 text-green-700"
      : state === "draft"
        ? "border-slate-300 bg-slate-100 text-slate-700"
        : state === "merged"
          ? "border-purple-200 bg-purple-50 text-purple-700"
          : "border-red-200 bg-red-50 text-red-700";
  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${tone}`}
    >
      {state}
    </span>
  );
}

function PullRequestDetailContent({
  basePath,
  organizationSlug,
  repositorySlug,
}: {
  basePath: string;
  organizationSlug: string;
  repositorySlug: string;
}) {
  const { pullRequestId } = useParams<{ pullRequestId: string }>();
  const { user, csrfToken } = useAuth();
  const queryClient = useQueryClient();

  const prQuery = useQuery({
    queryKey: ["pull-request", organizationSlug, repositorySlug, pullRequestId],
    queryFn: () =>
      getPullRequest(organizationSlug, repositorySlug, pullRequestId!),
    enabled: !!pullRequestId,
  });

  const diffQuery = useQuery({
    queryKey: [
      "pull-request-diff",
      organizationSlug,
      repositorySlug,
      pullRequestId,
    ],
    queryFn: () =>
      getPullRequestDiff(organizationSlug, repositorySlug, pullRequestId!),
    enabled: !!pullRequestId && prQuery.data?.state === "open",
  });

  const [commentBody, setCommentBody] = useState("");
  const [reviewDecision, setReviewDecision] = useState<
    "approved" | "changes_requested" | "comment"
  >("comment");
  const [reviewBody, setReviewBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const commentMutation = useMutation({
    mutationFn: () =>
      addPullRequestComment(
        organizationSlug,
        repositorySlug,
        pullRequestId!,
        { body: commentBody },
        csrfToken,
      ),
    onSuccess: async () => {
      setCommentBody("");
      setActionError(null);
      await queryClient.invalidateQueries({
        queryKey: [
          "pull-request",
          organizationSlug,
          repositorySlug,
          pullRequestId,
        ],
      });
    },
    onError: (error) =>
      setActionError(
        error instanceof Error ? error.message : "Failed to add comment.",
      ),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      addPullRequestReview(
        organizationSlug,
        repositorySlug,
        pullRequestId!,
        { decision: reviewDecision, body: reviewBody || null },
        csrfToken,
      ),
    onSuccess: async () => {
      setReviewBody("");
      setReviewDecision("comment");
      setActionError(null);
      await queryClient.invalidateQueries({
        queryKey: [
          "pull-request",
          organizationSlug,
          repositorySlug,
          pullRequestId,
        ],
      });
    },
    onError: (error) =>
      setActionError(
        error instanceof Error ? error.message : "Failed to submit review.",
      ),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closePullRequest(
        organizationSlug,
        repositorySlug,
        pullRequestId!,
        csrfToken,
      ),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({
        queryKey: [
          "pull-request",
          organizationSlug,
          repositorySlug,
          pullRequestId,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["pull-requests", organizationSlug, repositorySlug],
      });
    },
    onError: (error) =>
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to close pull request.",
      ),
  });

  if (prQuery.isLoading) return <LoadingState label="Loading pull request." />;
  if (prQuery.isError) {
    return (
      <ErrorState
        title="Pull request not found"
        description={
          prQuery.error instanceof Error
            ? prQuery.error.message
            : "Unable to load pull request."
        }
      />
    );
  }
  const pr = prQuery.data!;

  return (
    <div className="space-y-4">
      {actionError ? (
        <MessageBanner message={actionError} tone="error" />
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            #{pr.number}
          </p>
          <p className="mt-1 text-lg font-semibold text-ink-950">{pr.title}</p>
          {pr.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {pr.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <PullRequestStateBadge state={pr.state} />
            <span>by {pr.author_id.slice(0, 8)}</span>
            <span>{formatTimestamp(pr.created_at)}</span>
            <span>
              {pr.source_revision.slice(0, 8)} &rarr;{" "}
              {pr.target_revision.slice(0, 8)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {pr.state === "open" && user ? (
            <>
              <Button
                variant="danger"
                disabled={closeMutation.isPending}
                onClick={() => void closeMutation.mutateAsync()}
              >
                {closeMutation.isPending ? "Closing..." : "Close"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Diff */}
      {diffQuery.data ? (
        <Surface className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Changes ({diffQuery.data.total_files} files, +
            {diffQuery.data.total_additions}/-{diffQuery.data.total_deletions})
          </p>
          <div className="space-y-2">
            {diffQuery.data.changed_files.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border border-border bg-canvas px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-ink-950">{f.path}</span>
                <span className="text-xs text-slate-500">
                  +{f.additions}/-{f.deletions}
                </span>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      {/* Comments */}
      {pr.comments.length > 0 ? (
        <Surface className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Comments ({pr.comments.length})
          </p>
          {pr.comments.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-canvas p-3"
            >
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{c.author_id.slice(0, 8)}</span>
                <span>{formatTimestamp(c.created_at)}</span>
                {c.outdated ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    outdated
                  </span>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-950">
                {c.body}
              </p>
              {c.file_path ? (
                <p className="mt-1 text-xs text-slate-500">
                  on {c.file_path}
                  {c.line_number ? `:${c.line_number}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </Surface>
      ) : null}

      {/* Reviews */}
      {pr.reviews.length > 0 ? (
        <Surface className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Reviews ({pr.reviews.length})
          </p>
          {pr.reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-border bg-canvas p-3"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-ink-950">{r.decision}</span>
                <span className="text-slate-500">
                  by {r.reviewer_id.slice(0, 8)}
                </span>
                <span className="text-slate-500">
                  {formatTimestamp(r.created_at)}
                </span>
              </div>
              {r.body ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {r.body}
                </p>
              ) : null}
            </div>
          ))}
        </Surface>
      ) : null}

      {/* Add comment */}
      {user && (pr.state === "open" || pr.state === "draft") ? (
        <Surface className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Add Comment
          </p>
          <TextArea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Leave a comment..."
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={commentMutation.isPending || !commentBody.trim()}
              onClick={() => void commentMutation.mutateAsync()}
            >
              {commentMutation.isPending ? "Posting..." : "Comment"}
            </Button>
          </div>
        </Surface>
      ) : null}

      {/* Add review */}
      {user && pr.state === "open" ? (
        <Surface className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
            Submit Review
          </p>
          <Select
            value={reviewDecision}
            onChange={(e) =>
              setReviewDecision(e.target.value as typeof reviewDecision)
            }
          >
            <option value="comment">Comment</option>
            <option value="approved">Approve</option>
            <option value="changes_requested">Request Changes</option>
          </Select>
          <TextArea
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder="Review summary (optional)..."
          />
          <Button
            variant="primary"
            disabled={reviewMutation.isPending}
            onClick={() => void reviewMutation.mutateAsync()}
          >
            {reviewMutation.isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </Surface>
      ) : null}

      <Link
        className="text-sm text-forge-600 underline-offset-2 hover:underline"
        to={`${basePath}/pull-requests`}
      >
        &larr; Back to pull requests
      </Link>
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
