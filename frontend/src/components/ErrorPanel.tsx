"use client";

import { Button } from "./Button";

export function ErrorPanel({ retry }: { retry: () => void }) {
  return (
    <div className="panel" role="alert">
      <h1>This page didn&apos;t load</h1>
      <p>
        The account service didn&apos;t respond. You&apos;re still signed in if
        your session is active. Try again, and contact an administrator if this
        keeps happening.
      </p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
