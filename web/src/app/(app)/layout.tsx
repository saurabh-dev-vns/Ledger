import { Suspense } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { Footer } from "@/components/layout/Footer";
import { Navbar, NavbarFallback } from "@/components/layout/Navbar";

/** Shell for every signed-in page: top bar, page area, footer. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<NavbarFallback />}>
        <Navbar />
      </Suspense>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-6 pb-20 pt-10">
        <AuthGate>{children}</AuthGate>
      </main>

      <Footer />
    </div>
  );
}
