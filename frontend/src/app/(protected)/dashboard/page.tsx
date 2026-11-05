import type { Metadata } from "next";
import Link from "next/link";
import { AccessPass } from "@/components/AccessPass";
import { requireUser } from "@/lib/api/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  return (
    <div className="dashboard">
      <AccessPass user={user} />
      <div className="dashboard-notes">
        <h2>About your session</h2>
        <p>
          You stay signed in for one hour, then you&apos;ll need to sign in
          again.
        </p>
        <p>Signing out ends your session on every device.</p>
        {user.role === "admin" && (
          <p>
            <Link href="/users">See everyone with an account</Link>
          </p>
        )}
      </div>
    </div>
  );
}
