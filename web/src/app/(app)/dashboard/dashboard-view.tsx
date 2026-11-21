"use client";

import { useEffect, useState } from "react";
import { AppLink } from "@/components/layout/AppLink";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { api, ApiError } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { DashboardSkeleton } from "./dashboard-skeleton";

type Account = {
  id: number;
  name: string;
  type: string;
  balance: number;
};

type CreditAccount = {
  id: number;
  name: string;
  type: string;
  balance: number;
  credit_limit: number | null;
};

type Expense = {
  id: number;
  amount: number;
  category: string;
  spent_on: string;
  notes?: string | null;
  payment_method?: string | null;
  account_name?: string | null;
  savings_part?: string | null;
};

type FundsAdded = {
  id: number;
  amount: number;
  account_name: string;
  part?: string | null;
  kind?: string | null;
  note?: string | null;
  created_at: string;
};

type CategoryTotal = {
  category: string;
  total: number;
};

type Budget = {
  id: number;
  category: string;
  amount: number;
  spent: number;
};

type Trend = {
  month: string;
  total: number;
};

type Loan = {
  id: number;
  person_name: string;
  direction: "given" | "taken";
  amount: number;
  remaining: number;
  status: string;
};

type DashboardData = {
  accounts: Account[];
  creditAccounts: CreditAccount[];
  total: number;
  monthTotal: number;
  recent: Expense[];
  byCategory: CategoryTotal[];
  maxCategory: number;
  budgets: Budget[];
  trend: Trend[];
  loans: Loan[];
  recentAdded: FundsAdded[];
  addedThisMonth: { total: number };
};

export function DashboardView() {
  const { user } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await api.get<DashboardData>("/api/dashboard");
        if (alive) {
          setData(res.data);
          setError(null);
        }
      } catch (err) {
        if (alive) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load dashboard data.",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <Card className="py-10 text-center">
        <p className="text-rust mb-4">{error || "Something went wrong."}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </Card>
    );
  }

  const maxTrend = data.trend.length
    ? Math.max(...data.trend.map((t) => t.total), 1)
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[12px] font-mono uppercase tracking-[.12em] text-rust">
          Overview
        </p>
        <h1 className="text-3xl font-display font-bold">
          Welcome back, {user?.name || "there"}
        </h1>
        <p className="text-sm text-ink-soft">Your money at a glance.</p>
      </div>

      <Card className="border-t-4 border-t-green bg-paper-raised">
        <span className="text-xs uppercase tracking-wider text-ink-soft">
          Total across accounts
        </span>
        <div className="mt-1 mb-5 font-mono text-3xl font-bold tabular-nums text-ink">
          <Money value={data.total} />
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line py-3.5 text-xs text-ink-soft">
          {data.accounts.map((acc) => (
            <div key={acc.id} className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  acc.type === "cash"
                    ? "bg-[#2e7d32]"
                    : acc.type === "savings"
                      ? "bg-[#1565c0]"
                      : "bg-[#7b1fa2]"
                }`}
              />
              <span>{acc.name}</span>
              <strong className="text-ink">₹{money(acc.balance)}</strong>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green" />
            <span>Added this month</span>
            <strong className="text-green font-semibold">
              +₹{money(data.addedThisMonth.total)}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rust" />
            <span>Spent this month</span>
            <strong className="text-rust font-semibold">
              ₹{money(data.monthTotal)}
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/add-expense" variant="primary">
            Add expense
          </ButtonLink>
          <ButtonLink href="/add-balance" variant="secondary">
            Add balance
          </ButtonLink>
          <ButtonLink href="/swap-balance" variant="secondary">
            Transfer
          </ButtonLink>
          <ButtonLink href="/insights" variant="secondary">
            Insights
          </ButtonLink>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card
          title="Recently added"
          action={
            <AppLink href="/funds-added" className="text-xs font-medium text-green hover:underline">
              View all &rarr;
            </AppLink>
          }
        >
          {data.recentAdded.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No money added yet.{" "}
              <AppLink href="/add-balance" className="text-green underline">
                Add balance &rarr;
              </AppLink>
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft">
              {data.recentAdded.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">
                      Added to {row.account_name}
                      {row.part ? ` (${row.part})` : ""}
                    </p>
                    {row.note && <p className="text-xs text-ink-soft">{row.note}</p>}
                    <span className="text-[11px] text-ink-soft">
                      {formatDate(row.created_at)}
                    </span>
                  </div>
                  <strong className="font-mono text-green tabular-nums">
                    +₹{money(row.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Recent expenses"
          action={
            <AppLink href="/expenses" className="text-xs font-medium text-green hover:underline">
              View all &rarr;
            </AppLink>
          }
        >
          {data.recent.length === 0 ? (
            <p className="text-sm text-ink-soft">No expenses yet.</p>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Category</Th>
                  <Th align="right">Amount</Th>
                </Tr>
              </THead>
              <TBody>
                {data.recent.map((exp) => (
                  <Tr key={exp.id}>
                    <Td className="text-xs text-ink-soft">{formatDate(exp.spent_on)}</Td>
                    <Td>
                      <span className="rounded bg-paper px-2 py-0.5 text-xs font-medium">
                        {exp.category}
                      </span>
                      {exp.notes && (
                        <span className="ml-1 text-xs text-ink-soft">
                          ({exp.notes})
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <Money value={exp.amount} tone="expense" />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card
          title="This month by category"
          action={
            <AppLink
              href="/insights?period=month"
              className="text-xs font-medium text-green hover:underline"
            >
              Insights &rarr;
            </AppLink>
          }
        >
          {data.byCategory.length === 0 ? (
            <p className="text-sm text-ink-soft">No spending this month.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.byCategory.map((cat) => {
                const pct = data.maxCategory
                  ? Math.round((cat.total / data.maxCategory) * 100)
                  : 0;
                return (
                  <div key={cat.category} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{cat.category}</span>
                      <strong className="font-mono">₹{money(cat.total)}</strong>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-rust"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Monthly spending"
          action={
            <AppLink
              href="/insights?period=year"
              className="text-xs font-medium text-green hover:underline"
            >
              Insights &rarr;
            </AppLink>
          }
        >
          {data.trend.length === 0 ? (
            <p className="text-sm text-ink-soft">No monthly history yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.trend.map((tr) => {
                const pct = Math.round((tr.total / maxTrend) * 100);
                return (
                  <div key={tr.month} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{tr.month}</span>
                      <strong className="font-mono">₹{money(tr.total)}</strong>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-green"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {data.budgets.length > 0 && (
          <Card
            title="Budget status"
            action={
              <AppLink href="/budgets" className="text-xs font-medium text-green hover:underline">
                Manage &rarr;
              </AppLink>
            }
          >
            <div className="flex flex-col gap-3">
              {data.budgets.map((b) => {
                const pct = Math.min(100, Math.round((b.spent / b.amount) * 100));
                const isOver = pct >= 100;
                return (
                  <div key={b.id} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{b.category}</span>
                      <span className="font-mono">
                        ₹{money(b.spent)} / ₹{money(b.amount)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className={`h-full rounded-full ${isOver ? "bg-rust" : "bg-green"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {data.creditAccounts?.length > 0 && (
          <Card
            title="Credit & EMI"
            action={
              <AppLink href="/accounts" className="text-xs font-medium text-green hover:underline">
                Manage &rarr;
              </AppLink>
            }
          >
            <div className="flex flex-col gap-3">
              {data.creditAccounts.map((c) => {
                const used = c.credit_limit !== null ? c.credit_limit - c.balance : 0;
                const pct = c.credit_limit
                  ? Math.min(100, Math.round((used / c.credit_limit) * 100))
                  : 0;
                return (
                  <div key={c.id} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{c.name}</span>
                      <span className="font-mono">
                        ₹{money(used)} / ₹{money(c.credit_limit)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-rust"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
