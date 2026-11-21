import type { Metadata } from "next";
import { ExpensesView } from "./expenses-view";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return <ExpensesView />;
}
