"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Money } from "@/components/ui/money";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

const SWATCHES = [
  ["paper", "bg-paper"],
  ["paper-raised", "bg-paper-raised"],
  ["ink", "bg-ink"],
  ["ink-soft", "bg-ink-soft"],
  ["line", "bg-line"],
  ["green", "bg-green"],
  ["green-soft", "bg-green-soft"],
  ["rust", "bg-rust"],
  ["rust-soft", "bg-rust-soft"],
  ["gold", "bg-gold"],
];

export function StatusDemo() {
  const toast = useToast();
  const { status, user } = useSession();
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(name: string, fn: () => Promise<string | undefined>) {
    setBusy(name);
    try {
      const message = await fn();
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e instanceof ApiError ? `${e.status}: ${e.message}` : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Ledger web is running</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Phase 2 check page. Unmigrated pages are still served by the Express app.
        </p>
      </div>

      <Card title="Session">
        <p className="text-sm">
          {status === "loading" && "Checking…"}
          {status === "ready" && user && (
            <>
              Signed in as <strong>{user.name}</strong> (id {user.id})
            </>
          )}
          {status === "ready" && !user && "Not signed in."}
        </p>
      </Card>

      <Card title="Fonts and colors">
        <p className="font-display text-2xl">Fraunces — display, for headings</p>
        <p className="mt-1 font-sans">Inter — body text for everything else.</p>
        <p className="mt-1 font-mono text-sm">IBM Plex Mono — 0123456789 ₹1,250.00</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="text-center text-[11px] text-ink-soft">
              <div className={`h-10 w-16 rounded-md border border-line ${cls}`} />
              {name}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="/status" variant="secondary">
            Link button
          </ButtonLink>
        </div>
      </Card>

      <Card title="Form fields">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            toast.info("Form submitted (nothing was sent).");
          }}
        >
          <Input label="Amount" name="amount" type="number" step="0.01" hint="In rupees" />
          <Select label="Category" name="category" defaultValue="food">
            <option value="food">Food &amp; Dining</option>
            <option value="travel">Travel</option>
          </Select>
          <Input label="Email" name="email" type="email" error="Enter a valid email address." />
          <Input label="Note" name="note" optional />
          <Textarea label="Paste lines" name="data" rows={3} className="sm:col-span-2" optional />
          <div className="sm:col-span-2">
            <Button type="submit">Submit</Button>
          </div>
        </form>
      </Card>

      <Card title="Table and money">
        <Table caption="Sample expenses">
          <THead>
            <Tr>
              <Th>Date</Th>
              <Th>Category</Th>
              <Th align="right">Amount</Th>
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Td>2026-11-14</Td>
              <Td>Food &amp; Dining</Td>
              <Td align="right">
                <Money value={120} tone="expense" />
              </Td>
            </Tr>
            <Tr>
              <Td>2026-11-13</Td>
              <Td>Funds added</Td>
              <Td align="right">
                <Money value={5000} tone="income" />
              </Td>
            </Tr>
          </TBody>
        </Table>
      </Card>

      <Card title="Toasts, modal and API">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast.success("Saved. This one is a success toast.")}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Something failed. This one is an error toast.")}>
            Error toast
          </Button>
          <Button variant="secondary" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button
            variant="secondary"
            loading={busy === "get"}
            onClick={() =>
              run("get", async () => {
                const { data } = await api.get<{ categories: string[] }>("/api/meta");
                return `GET works: ${data.categories.length} categories loaded.`;
              })
            }
          >
            API GET /api/meta
          </Button>
          <Button
            variant="secondary"
            loading={busy === "post"}
            onClick={() =>
              run("post", async () => {
                const r = await api.post("/api/auth/forgot-password", { email: "nobody@example.invalid" });
                return `POST works (CSRF ok): ${r.message}`;
              })
            }
          >
            API POST (CSRF)
          </Button>
          <Button
            variant="secondary"
            loading={busy === "bad"}
            onClick={() =>
              run("bad", async () => {
                await api.get("/api/does-not-exist");
                return undefined;
              })
            }
          >
            API error (404)
          </Button>
        </div>
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Delete this expense?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setModal(false);
                toast.success("Deleted (demo only).");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        The amount is credited back to the account. Esc, Cancel, or a click outside closes this box.
      </Modal>
    </div>
  );
}
