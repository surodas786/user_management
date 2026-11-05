"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { authApi, setSessionEndedHandler } from "@/lib/api/client";
import type { LoginInput, RegisterInput, User } from "@/lib/api/types";

/** Catches a session that ends while the page sits open and untouched. */
const SESSION_RECHECK_MS = 60_000;

export type SessionEnd = "expired" | "signed-out";

interface AuthContextValue {
  /** undefined while unknown, including during an API outage. null when signed out. */
  user: User | null | undefined;
  /** Why the session stopped in this tab, if it did. */
  sessionEnd: SessionEnd | undefined;
  login(input: LoginInput): Promise<User>;
  register(input: RegisterInput): Promise<User>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null | undefined;
  children: ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [sessionEnd, setSessionEnd] = useState<SessionEnd>();
  const pathname = usePathname();
  const signedOut = user === null;

  useEffect(
    () =>
      setSessionEndedHandler(() => {
        if (signedOut) return;
        setSessionEnd("expired");
        setUser(null);
      }),
    [signedOut],
  );

  const revalidate = useCallback(
    () =>
      authApi.me().then(
        // A sign-out may have finished while this request was in flight.
        (current) => setUser((previous) => (previous === null ? null : current)),
        // An ended session arrives through the handler above. An outage says
        // nothing about the session, so the user stays as they were.
        () => undefined,
      ),
    [],
  );

  useEffect(() => {
    if (!signedOut) void revalidate();
  }, [pathname, signedOut, revalidate]);

  useEffect(() => {
    if (signedOut) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    const timer = setInterval(onVisible, SESSION_RECHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [signedOut, revalidate]);

  const value = useMemo<AuthContextValue>(() => {
    const signIn = (signedIn: User) => {
      setSessionEnd(undefined);
      setUser(signedIn);
      return signedIn;
    };
    return {
      user,
      sessionEnd,
      login: async (input) => signIn(await authApi.login(input)),
      register: async (input) => signIn(await authApi.register(input)),
      logout: async () => {
        await authApi.logout();
        setSessionEnd("signed-out");
        setUser(null);
      },
    };
  }, [user, sessionEnd]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
