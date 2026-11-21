import { Suspense } from "react";
import type { Metadata } from "next";
import { AddExpenseForm } from "./add-expense-form";

export const metadata: Metadata = { title: "Add Expense" };

export default function AddExpensePage() {
  return (
    <Suspense fallback={null}>
      <AddExpenseForm />
    </Suspense>
  );
}
