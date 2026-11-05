import { redirect } from "next/navigation";
import { DEFAULT_SIGNED_IN_PATH, loginUrl } from "@/lib/auth/redirect";
import { getSession } from "@/lib/api/server";

export default async function HomePage() {
  const session = await getSession();
  redirect(session.status === "anonymous" ? loginUrl() : DEFAULT_SIGNED_IN_PATH);
}
