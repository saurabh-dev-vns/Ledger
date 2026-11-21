"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ExpensesSkeleton } from "./expenses-skeleton";

type ExpenseItem = {
  id: number;
  amount: number;
  category: string;
  spent_on: string;
  notes?: string | null;
  payment_method: string;
  account_name?: string | null;
  savings_part?: string | null;
};

type AccountTypeMeta = {
  value: string;
  label: string;
  credit: boolean;
};

type MetaData = {
  categories: string[];
  accountTypes: AccountTypeMeta[];
};

type ExpensesResponse = {
  expenses: ExpenseItem[];
  total: number;
  filters: {
    category: string;
    method: string;
    from: string;
    to: string;
  };
};

export function ExpensesView() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<MetaData>({ categories: [], accountTypes: [] });
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [total, setTotal] = useState(0);

  // Filters state
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchExpenses = useCallback(
    async (cat: string, mth: string, fDate: string, tDate: string) => {
      try {
        const params = new URLSearchParams();
        if (cat) params.set("category", cat);
        if (mth) params.set("method", mth);
        if (fDate) params.set("from", fDate);
        if (tDate) params.set("to", tDate);

        const query = params.toString() ? `?${params.toString()}` : "";
        const res = await api.get<ExpensesResponse>(`/api/expenses${query}`);

        setExpenses(res.data.expenses);
        setTotal(res.data.total);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load expenses.",
        );
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        const metaRes = await api.get<MetaData>("/api/meta");
        if (alive) {
          setMeta({
            categories: metaRes.data.categories || [],
            accountTypes: metaRes.data.accountTypes || [],
          });
        }
      } catch {
        // Silently handle meta fetch fallback
      }

      if (alive) {
        await fetchExpenses(category, method, from, to);
      }
    }

    init();
    return () => {
      alive = false;
    };
  }, [category, method, from, to, fetchExpenses]);

  function handleFilterSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setLoading(true);
    fetchExpenses(category, method, from, to);
  }

  function handleClearFilters() {
    setCategory("");
    setMethod("");
    setFrom("");
    setTo("");
    setLoading(true);
    fetchExpenses("", "", "", "");
  }

  async function handleDelete(exp: ExpenseItem) {
    const isImported = !exp.account_name && exp.payment_method === "imported";
    const confirmMsg = isImported
      ? "Delete this imported record? No account balance will change."
      : `Delete this expense of ₹${exp.amount}? The amount will be credited back to ${exp.account_name || "your account"}.`;

    if (!window.confirm(confirmMsg)) return;

    setDeletingId(exp.id);
    try {
      await api.delete(`/api/expenses/${exp.id}`);
      setExpenses((prev) => prev.filter((item) => item.id !== exp.id));
      setTotal((prev) => Math.max(0, prev - Number(exp.amount)));
      toast.success("Expense deleted and amount credited back.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to delete expense.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && expenses.length === 0) {
    return <ExpensesSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-[12px] font-mono uppercase tracking-[.12em] text-rust">
            History
          </p>
          <h1 className="text-3xl font-display font-bold">All expenses</h1>
          <p className="text-sm text-ink-soft">
            {expenses.length} entries &middot; Total logged:{" "}
            <strong className="text-ink font-semibold">
              <Money value={total} />
            </strong>
          </p>
        </div>

        <ButtonLink href="/add-expense" variant="primary">
          Add expense
        </ButtonLink>
      </div>

      {/* Filter Card */}
      <Card>
        <form onSubmit={handleFilterSubmit} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {meta.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>

            <Select
              label="Account type"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">All</option>
              {meta.accountTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>

            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />

            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" size="sm">
              Apply filters
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {/* Expenses Table */}
      <Card>
        {expenses.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-soft">
            No expenses found matching the selected filters.
          </div>
        ) : (
          <Table caption="All Expenses History">
            <THead>
              <Tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Notes</Th>
                <Th>Account</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Action</Th>
              </Tr>
            </THead>
            <TBody>
              {expenses.map((row) => (
                <Tr key={row.id}>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {formatDate(row.spent_on)}
                  </Td>
                  <Td>
                    <span className="rounded bg-paper px-2 py-0.5 text-xs font-medium text-ink">
                      {row.category}
                    </span>
                  </Td>
                  <Td className="max-w-[200px] truncate text-xs text-ink-soft">
                    {row.notes || "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {row.account_name ? (
                      <span>
                        {row.account_name}
                        {row.savings_part ? ` (${row.savings_part})` : ""}
                      </span>
                    ) : (
                      <span className="capitalize">{row.payment_method}</span>
                    )}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <Money value={row.amount} tone="expense" />
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      disabled={deletingId === row.id}
                      onClick={() => handleDelete(row)}
                      className="rounded p-1 text-xs text-ink-soft transition-colors hover:text-rust disabled:opacity-50"
                      title="Delete expense"
                    >
                      {deletingId === row.id ? "…" : "✕"}
                    </button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
