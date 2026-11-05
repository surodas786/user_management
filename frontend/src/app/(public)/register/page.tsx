import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/RegisterForm";
import { getSession } from "@/lib/api/server";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({
  searchParams,
}: PageProps<"/register">) {
  const nextPath = safeNextPath((await searchParams).next);

  if ((await getSession()).status === "authenticated") {
    redirect(nextPath);
  }

  return <RegisterForm next={nextPath} />;
}
