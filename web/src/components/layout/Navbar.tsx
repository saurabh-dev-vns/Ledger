"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppLink } from "@/components/layout/AppLink";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

type NavItem = { href: string; label: string };

const MAIN_LINKS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/insights", label: "Insights" },
  { href: "/expenses", label: "Expenses" },
  { href: "/accounts", label: "Accounts" },
  { href: "/budgets", label: "Budgets" },
  { href: "/loans", label: "Money owed" },
  { href: "/transactions", label: "Transactions" },
  { href: "/reports", label: "Reports" },
];

const MONEY_ADD: NavItem[] = [
  { href: "/add-balance", label: "Add balance" },
  { href: "/add-expense", label: "Add expense" },
  { href: "/swap-balance", label: "Transfer money" },
];

const MONEY_HISTORY: NavItem[] = [
  { href: "/funds-added", label: "Funds added" },
  { href: "/import-expenses", label: "Import history" },
];

// Tailwind has no "1025px and up" shortcut; the old CSS collapsed the menu at 1024px.
const DESKTOP = "min-[1025px]";

const LINK =
  "rounded-md px-3 py-2 text-sm text-ink-soft no-underline transition-colors hover:bg-green-soft hover:text-ink";
const LINK_ACTIVE = "bg-green-soft font-medium text-green";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavbarFallback() {
  return (
    <header className="sticky top-0 z-[1000] border-b border-line bg-paper-raised">
      <div className="mx-auto flex max-w-[1120px] items-center px-6 py-3.5">
        <span className="font-display text-xl font-bold text-ink">
          Ledger<span className="text-rust">.</span>
        </span>
      </div>
    </header>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { status, user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Esc closes the menus; a click outside the header closes them too.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      setMoneyOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMoneyOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const moneyActive = [...MONEY_ADD, ...MONEY_HISTORY].some((i) => isActive(pathname, i.href));

  const renderLink = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <AppLink
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(LINK, active && LINK_ACTIVE)}
      >
        {item.label}
      </AppLink>
    );
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-[1000] w-full border-b border-line bg-paper-raised"
    >
      <div className="relative mx-auto flex max-w-[1120px] items-center gap-6 px-6 py-3.5">
        <AppLink
          href="/dashboard"
          className="shrink-0 font-display text-xl font-bold text-ink no-underline"
        >
          Ledger<span className="text-rust">.</span>
        </AppLink>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="main-navigation"
          className={cn(
            "ml-auto flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-line",
            `${DESKTOP}:hidden`,
          )}
        >
          <span className="h-0.5 w-5 rounded bg-ink" />
          <span className="h-0.5 w-5 rounded bg-ink" />
          <span className="h-0.5 w-5 rounded bg-ink" />
        </button>

        <nav
          id="main-navigation"
          aria-label="Main"
          onClick={(e) => {
            // Any link tap closes the mobile panel.
            if ((e.target as HTMLElement).closest("a")) {
              setOpen(false);
              setMoneyOpen(false);
            }
          }}
          className={cn(
            "absolute inset-x-0 top-full flex-col gap-1 border-b border-line bg-paper-raised p-4 shadow-card",
            `${DESKTOP}:static ${DESKTOP}:flex ${DESKTOP}:flex-1 ${DESKTOP}:flex-row ${DESKTOP}:items-center`,
            `${DESKTOP}:gap-0.5 ${DESKTOP}:border-0 ${DESKTOP}:bg-transparent ${DESKTOP}:p-0 ${DESKTOP}:shadow-none`,
            open ? "flex" : "hidden",
          )}
        >
          {MAIN_LINKS.map(renderLink)}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMoneyOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={moneyOpen}
              aria-controls="money-menu"
              className={cn(LINK, "flex w-full cursor-pointer items-center gap-1.5", moneyActive && LINK_ACTIVE)}
            >
              Money
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M2 3.5 5 6.5 8 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div
              id="money-menu"
              className={cn(
                "flex-col gap-1 pl-3 pt-1",
                `${DESKTOP}:absolute ${DESKTOP}:left-0 ${DESKTOP}:top-full ${DESKTOP}:mt-1 ${DESKTOP}:w-56 ${DESKTOP}:rounded-card`,
                `${DESKTOP}:border ${DESKTOP}:border-line ${DESKTOP}:bg-paper-raised ${DESKTOP}:p-2 ${DESKTOP}:shadow-card`,
                moneyOpen ? "flex" : "hidden",
              )}
            >
              <span className="px-3 pt-1 text-[11px] font-medium uppercase tracking-wide text-ink-soft">
                Add &amp; move money
              </span>
              {MONEY_ADD.map(renderLink)}
              <span className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-soft">
                History
              </span>
              {MONEY_HISTORY.map(renderLink)}
            </div>
          </div>

          {status === "ready" && user && (
            <div
              className={cn(
                "mt-2 flex items-center gap-3 border-t border-line-soft pt-3",
                `${DESKTOP}:ml-auto ${DESKTOP}:mt-0 ${DESKTOP}:border-0 ${DESKTOP}:pt-0`,
              )}
            >
              <AppLink
                href="/profile"
                aria-current={isActive(pathname, "/profile") ? "page" : undefined}
                className={cn(
                  "text-sm font-medium text-ink no-underline hover:text-green",
                  isActive(pathname, "/profile") && "text-green",
                )}
              >
                {user.name}
              </AppLink>
              <button
                type="button"
                onClick={signOut}
                className="cursor-pointer text-sm text-ink-soft underline-offset-2 hover:text-rust hover:underline"
              >
                Sign out
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
