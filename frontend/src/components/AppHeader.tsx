"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api/core";
import { Button } from "./Button";
import { Notice } from "./Notice";

export function AppHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSignOut() {
    setPending(true);
    setError(undefined);
    try {
      await logout();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(user?.role === "admin" ? [{ href: "/users", label: "People" }] : []),
  ];

  return (
    <header className="app-header">
      <div className="app-header-row">
        <Link href="/dashboard" className="brand">
          Pass Office
        </Link>
        <nav aria-label="Main">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {user && (
          <Button
            variant="quiet"
            onClick={onSignOut}
            pending={pending}
            pendingLabel="Signing out…"
          >
            Sign out
          </Button>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </header>
  );
}
