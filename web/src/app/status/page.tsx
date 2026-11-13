// Phase 0 smoke test: confirms the Next.js app is running.
// Delete once real pages exist.
export default function StatusPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Ledger web is running</h1>
      <p className="mt-2 text-sm opacity-70">
        Unmigrated pages are still served by the Express app.
      </p>
    </main>
  );
}
