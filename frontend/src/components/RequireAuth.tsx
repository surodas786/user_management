"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { loginUrl } from "@/lib/auth/redirect";

/**
 * Removes protected content the moment this tab learns the session is over.
 * This is a user experience guard; authorization happens on the server, so an
 * unknown user still renders: the page has passed requireUser or shows its error.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, sessionEnd } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user !== null) return;
    // The proxy stops requests with no cookie, so any other null is a rejected session.
    router.replace(
      sessionEnd === "signed-out"
        ? loginUrl()
        : loginUrl({ next: pathname, reason: "expired" }),
    );
  }, [user, sessionEnd, pathname, router]);

  if (user === null) {
    return <p className="page-status">Taking you to sign in…</p>;
  }
  return children;
}
