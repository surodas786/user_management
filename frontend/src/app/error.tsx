"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function RootError({ retry }: { retry: () => void }) {
  return (
    <main className="centered">
      <ErrorPanel retry={retry} />
    </main>
  );
}
