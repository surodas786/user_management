import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/api/server";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reason } = await searchParams;
  const nextPath = safeNextPath(next);

  // Verified with the API, so a revoked cookie can't cause a redirect loop.
  if ((await getSession()).status === "authenticated") {
    redirect(nextPath);
  }

  return <LoginForm next={nextPath} expired={reason === "expired"} />;
}
