import type { Metadata } from "next";
import { RestoreAccountCard } from "./restore-account-card";

export const metadata: Metadata = { title: "Restore Account" };

export default function RestoreAccountPage() {
  return <RestoreAccountCard />;
}
