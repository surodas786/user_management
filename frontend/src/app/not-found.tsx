import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered">
      <div className="panel">
        <h1>Page not found</h1>
        <p>This address doesn&apos;t match any page.</p>
        <Link href="/">Go to your dashboard</Link>
      </div>
    </main>
  );
}
