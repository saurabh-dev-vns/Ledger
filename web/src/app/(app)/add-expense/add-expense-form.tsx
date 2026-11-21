"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { hardNavigate } from "@/lib/nav";

type Account = {
  id: number;
  name: string;
  type: string;
  balance: number;
  credit_limit: number | null;
};

type MetaData = {
  categories: string[];
  savingsParts: string[];
  aiEnabled: boolean;
};

type AccountsResponse = {
  accounts: Account[];
};

type AiSuggestion = {
  amount?: number | null;
  notes?: string | null;
  category?: string | null;
  spent_on?: string | null;
  account_id?: number | null;
  savings_part?: string | null;
};

type AiResponse = {
  ok: boolean;
  suggestion?: AiSuggestion;
  missing?: string[];
  error?: string;
};

function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function AddExpenseForm() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [savingsParts, setSavingsParts] = useState<string[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);

  // Form state
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [spentOn, setSpentOn] = useState("");
  const [savingsPart, setSavingsPart] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // AI Natural typing state
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ text: string; kind?: "ok" | "warn" | "error" } | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [accRes, metaRes] = await Promise.all([
          api.get<AccountsResponse>("/api/accounts"),
          api.get<MetaData>("/api/meta"),
        ]);

        if (alive) {
          const accs = accRes.data.accounts || [];
          setAccounts(accs);
          if (accs.length > 0) setAccountId(String(accs[0].id));

          const cats = metaRes.data.categories || [];
          setCategories(cats);
          if (cats.length > 0) setCategory(cats[0]);

          const parts = metaRes.data.savingsParts || [];
          setSavingsParts(parts);
          if (parts.length > 0) setSavingsPart(parts[0]);

          setSpentOn(todayIso());
          setAiEnabled(Boolean(metaRes.data.aiEnabled));
        }
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Failed to load accounts and metadata.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [toast]);

  const selectedAccount = accounts.find((a) => String(a.id) === accountId);
  const isSavingsAccount = selectedAccount?.type === "savings";

  async function handleAiParse() {
    const text = aiText.trim();
    if (!text) {
      setAiStatus({ text: "Type the expense first, e.g. kal 250 ka petrol cash se.", kind: "warn" });
      return;
    }

    setAiBusy(true);
    setAiStatus({ text: "Analyzing prompt with AI…" });

    try {
      const res = await api.post<AiResponse>("/api/ai/parse-expense", {
        text,
        today: todayIso(),
      });

      if (!res.data.ok || !res.data.suggestion) {
        setAiStatus({
          text: res.data.error || "Could not parse that. Please fill by hand.",
          kind: "error",
        });
        return;
      }

      const s = res.data.suggestion;
      if (s.amount !== null && s.amount !== undefined) setAmount(String(s.amount));
      if (s.notes) setNotes(s.notes);
      if (s.category && categories.includes(s.category)) setCategory(s.category);
      if (s.spent_on) setSpentOn(s.spent_on);
      if (s.account_id) setAccountId(String(s.account_id));
      if (s.savings_part) setSavingsPart(s.savings_part);

      setAiStatus({ text: "Form pre-filled! Please review and click Save.", kind: "ok" });
      toast.success("Details auto-filled by AI.");
    } catch (err) {
      setAiStatus({
        text: err instanceof ApiError ? err.message : "AI service unavailable. Fill manually.",
        kind: "error",
      });
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e: React.SubmitEvent) {
    e.preventDefault();
    setError("");

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    if (!accountId) {
      setError("Please select an account.");
      return;
    }

    setSubmitting(true);

    try {
      await api.post("/api/expenses", {
        amount: numAmount,
        notes: notes.trim() || null,
        category,
        account_id: Number(accountId),
        spent_on: spentOn,
        savings_part: isSavingsAccount ? savingsPart : null,
      });

      toast.success("Expense added successfully.");
      hardNavigate("/expenses");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add expense.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Skeleton className="mb-2 h-3.5 w-20" />
          <Skeleton className="mb-1.5 h-8 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Card>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div>
        <p className="text-[12px] font-mono uppercase tracking-[.12em] text-rust">
          Spending
        </p>
        <h1 className="text-3xl font-display font-bold">Add expense</h1>
        <p className="text-sm text-ink-soft">
          Log a transaction and keep your balances up to date.
        </p>
      </div>

      {/* AI Assistant Card */}
      {aiEnabled && (
        <Card className="border-green/40 bg-green-soft/10">
          <h2 className="text-base font-bold text-ink">✨ Type naturally</h2>
          <p className="mt-1 mb-3 text-xs text-ink-soft">
            Write it like you would say it in Hindi, English, or Hinglish. We fill the form; you review and save.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAiParse();
                }
              }}
              placeholder="e.g. kal 250 ka petrol ICICI se"
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-green focus:outline-none"
            />
            <Button
              type="button"
              variant="primary"
              loading={aiBusy}
              onClick={handleAiParse}
            >
              Fill form
            </Button>
          </div>

          {aiStatus && (
            <p
              className={`mt-2 text-xs ${
                aiStatus.kind === "error"
                  ? "text-rust"
                  : aiStatus.kind === "ok"
                    ? "text-[#1b5e20]"
                    : "text-ink-soft"
              }`}
            >
              {aiStatus.text}
            </p>
          )}
        </Card>
      )}

      {/* Main Expense Form */}
      <Card>
        <h2 className="mb-4 text-lg font-bold">New entry</h2>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-[#e6c4b8] bg-rust-soft px-4 py-3 text-sm text-rust"
          >
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Amount (₹)"
            type="number"
            step="0.01"
            min="0.01"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <Input
            label="Notes"
            optional
            type="text"
            maxLength={500}
            placeholder="e.g. Groceries, Dinner with friends"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Account"
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — ₹{money(a.balance)} available
                </option>
              ))}
            </Select>

            <Select
              label="Category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          {isSavingsAccount && (
            <Select
              label="Pay from Savings Part"
              required
              value={savingsPart}
              onChange={(e) => setSavingsPart(e.target.value)}
            >
              {savingsParts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          )}

          <Input
            label="Date"
            type="date"
            required
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
          />

          <div className="pt-2">
            <Button type="submit" variant="primary" loading={submitting}>
              Save expense
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
