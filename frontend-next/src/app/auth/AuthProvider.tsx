import { useQueryClient } from "@tanstack/solid-query";
import {
  batch,
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type JSX,
} from "solid-js";
import { ApiError, authApi, type Viewer } from "~/lib/api";
import { onUnauthorized } from "../query-client";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface AuthContextValue {
  status: () => AuthStatus;
  user: () => Viewer | null;
  csrf: () => string | null;
  isAnonymous: () => boolean;
  isPlatformAdmin: () => boolean;
  /** Set when a request returned 401 mid-session; the session dialog re-authenticates in place. */
  sessionExpired: () => boolean;
  /** Error restoring the session for reasons other than 401 (forge down). */
  restoreError: () => ApiError | null;
  login: (body: { email: string; password: string }) => Promise<Viewer>;
  register: (body: {
    email: string;
    display_name: string;
    password: string;
  }) => Promise<Viewer>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Give up re-authenticating: drop the session locally (dialog "Sign out"). */
  abandonSession: () => void;
}

const AuthContext = createContext<AuthContextValue>();

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export interface AuthProviderProps {
  children: JSX.Element;
  /** Tests start from a known user (or null for anonymous) without calling /auth/me. */
  initialUser?: Viewer | null;
  initialCsrf?: string | null;
}

export function AuthProvider(props: AuthProviderProps) {
  const queryClient = useQueryClient();
  const preset = props.initialUser !== undefined;
  const [user, setUser] = createSignal<Viewer | null>(
    props.initialUser ?? null,
  );
  const [csrf, setCsrf] = createSignal<string | null>(
    props.initialCsrf ?? (props.initialUser ? "test-csrf" : null),
  );
  const [status, setStatus] = createSignal<AuthStatus>(
    preset ? (props.initialUser ? "authenticated" : "anonymous") : "loading",
  );
  const [expired, setExpired] = createSignal(false);
  const [restoreError, setRestoreError] = createSignal<ApiError | null>(null);

  /**
   * F1: anything cached belongs to whoever was signed in. Clear it whenever the identity changes
   * (login, logout, register, or a different account re-authenticating in the session dialog).
   */
  const adopt = (next: Viewer | null, token: string | null) => {
    const previous = user();
    if (!next || !previous || previous.id !== next.id) queryClient.clear();
    batch(() => {
      setUser(next);
      setCsrf(token);
      setStatus(next ? "authenticated" : "anonymous");
      setExpired(false);
      setRestoreError(null);
    });
  };

  const refresh = async () => {
    try {
      const me = await authApi.me();
      const { csrf_token } = await authApi.csrf();
      adopt(me, csrf_token);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) adopt(null, null);
      else {
        batch(() => {
          setStatus(user() ? "authenticated" : "anonymous");
          setRestoreError(
            e instanceof ApiError
              ? e
              : new ApiError("Couldn't restore your session.", 0),
          );
        });
      }
    }
  };

  const login: AuthContextValue["login"] = async (body) => {
    const res = await authApi.login(body);
    adopt(res.user, res.csrf_token);
    // Session-dialog re-auth as the same user keeps the cache; refetch what failed with 401.
    void queryClient.invalidateQueries();
    return res.user;
  };

  const register: AuthContextValue["register"] = async (body) => {
    const res = await authApi.register(body);
    adopt(res.user, res.csrf_token);
    return res.user;
  };

  const logout = async () => {
    // F1: sign out locally even if the request fails (network down, session already gone).
    try {
      await authApi.logout(csrf());
    } catch {
      // The server session expires on its own; local state must not keep the UI signed in.
    } finally {
      adopt(null, null);
    }
  };

  const abandonSession = () => adopt(null, null);

  onMount(() => {
    if (!preset) void refresh();
  });
  // F2: a 401 while signed in means the session ended server-side. This is an event callback,
  // so reading status() untracked is intended.
  // eslint-disable-next-line solid/reactivity
  const stopListening = onUnauthorized(queryClient, () => {
    if (status() === "authenticated") setExpired(true);
  });
  onCleanup(stopListening);

  const value: AuthContextValue = {
    status,
    user,
    csrf,
    isAnonymous: () => status() !== "authenticated",
    isPlatformAdmin: () => user()?.is_platform_admin === true,
    sessionExpired: expired,
    restoreError,
    login,
    register,
    logout,
    refresh,
    abandonSession,
  };
  return (
    <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
  );
}
