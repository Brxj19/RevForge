import { useEffect, type PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth";
import { AccentPreferenceProvider } from "./accent";
import { queryClient } from "../lib/query-client";

export function AppProviders({ children }: PropsWithChildren) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AccentPreferenceProvider>
        <AuthProvider>{children}</AuthProvider>
      </AccentPreferenceProvider>
    </QueryClientProvider>
  );
}
