"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { validateLogin } from "@/lib/validation";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { TextField } from "./TextField";
import { useFormSubmit } from "./useFormSubmit";

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { pending, formError, fieldErrors, onSubmit } = useFormSubmit<"email" | "password">({
    validate: () => validateLogin({ email, password }),
    submit: async () => {
      await login({ email: email.trim(), password });
      router.replace(next);
      router.refresh();
    },
  });

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <h1>Sign in</h1>
      {expired && !formError && (
        <Notice tone="info">Your session ended. Sign in to continue.</Notice>
      )}
      {formError && <Notice tone="error">{formError}</Notice>}
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
      />
      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
      />
      <Button type="submit" pending={pending} pendingLabel="Signing in…">
        Sign in
      </Button>
      <p className="form-switch">
        New here?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
