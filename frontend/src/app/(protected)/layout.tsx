import { AppHeader } from "@/components/AppHeader";
import { RequireAuth } from "@/components/RequireAuth";

/** Layouts don't re-render on navigation, so each page authorizes with requireUser. */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader />
      <main className="app-main">
        <RequireAuth>{children}</RequireAuth>
      </main>
    </>
  );
}
