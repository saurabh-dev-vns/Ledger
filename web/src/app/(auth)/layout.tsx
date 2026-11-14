export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-10">
      <p className="mb-6 text-center font-display text-3xl font-bold">
        Ledger<span className="text-rust">.</span>
      </p>
      {children}
    </main>
  );
}
