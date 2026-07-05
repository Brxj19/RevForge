import { createContext, useEffect, useState, type PropsWithChildren } from "react";
import {
  ApiClientError,
  type CurrentUser,
  getCsrfToken,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "../lib/api";

interface AuthContextValue {
  csrfToken: string | null;
  errorMessage: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CurrentUser | null;
  clearError: () => void;
  login: (payload: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  register: (payload: { email: string; display_name: string; password: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearError = () => setErrorMessage(null);

  const refreshSession = async () => {
    setIsLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      const csrf = await getCsrfToken();
      setCsrfToken(csrf.csrf_token);
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setUser(null);
        setCsrfToken(null);
        setErrorMessage(null);
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Unable to restore session.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  const register = async (payload: { email: string; display_name: string; password: string }) => {
    const response = await registerUser(payload);
    setUser(response.user);
    setCsrfToken(response.csrf_token);
    setErrorMessage(null);
  };

  const login = async (payload: { email: string; password: string }) => {
    const response = await loginUser(payload);
    setUser(response.user);
    setCsrfToken(response.csrf_token);
    setErrorMessage(null);
  };

  const logout = async () => {
    await logoutUser(csrfToken);
    setUser(null);
    setCsrfToken(null);
    setErrorMessage(null);
  };

  return (
    <AuthContext.Provider
      value={{
        csrfToken,
        errorMessage,
        isAuthenticated: user !== null,
        isLoading,
        user,
        clearError,
        login,
        logout,
        refreshSession,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
