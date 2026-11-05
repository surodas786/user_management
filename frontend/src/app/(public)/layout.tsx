export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <aside className="public-aside">
        <p className="brand">Pass Office</p>
        <p className="public-tagline">Your account, and who can get in.</p>
      </aside>
      <main className="public-main">{children}</main>
    </div>
  );
}
