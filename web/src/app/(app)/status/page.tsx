import type { Metadata } from "next";
import { StatusDemo } from "./demo";

export const metadata: Metadata = { title: "Status" };

// Dev page: shows every shared component and checks the API link.
// Delete this folder when the real pages are done.
export default function StatusPage() {
  return <StatusDemo />;
}
