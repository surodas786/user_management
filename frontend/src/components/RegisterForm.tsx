"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { loginUrl } from "@/lib/auth/redirect";
import { validateRegister } from "@/lib/validation";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { TextField } from "./TextField";
import { useFormSubmit } from "./useFormSubmit";

export function RegisterForm({ next }: { next: string }) {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { pending, formError, fieldErrors, onSubmit } = useFormSubmit<"name" | "email" | "password">({
    validate: () => validateRegister({ name, email, password }),
    submit: async () => {
      await register({ name: name.trim(), email: email.trim(), password });
      router.replace(next);
      router.refresh();
    },
    fieldForCode: { EMAIL_ALREADY_EXISTS: "email" },
  });

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <h1>Create an account</h1>
      {formError && <Notice tone="error">{formError}</Notice>}
      <TextField
        label="Name"
        name="name"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
      />
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
        autoComplete="new-password"
        hint="At least 8 characters."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
      />
      <Button type="submit" pending={pending} pendingLabel="Creating account…">
        Create account
      </Button>
      <p className="form-switch">
        Already have an account? <Link href={loginUrl({ next })}>Sign in</Link>
      </p>
    </form>
  );
}
