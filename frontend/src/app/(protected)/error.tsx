"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

export default function ProtectedError({ retry }: { retry: () => void }) {
  return <ErrorPanel retry={retry} />;
}
