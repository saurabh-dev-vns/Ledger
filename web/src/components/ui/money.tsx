import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

type Props = {
  value: number | string | null | undefined;
  /** expense = rust, income = green. */
  tone?: "neutral" | "expense" | "income";
  className?: string;
};

export function Money({ value, tone = "neutral", className }: Props) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        tone === "expense" && "text-rust",
        tone === "income" && "text-green",
        className,
      )}
    >
      ₹{money(value)}
    </span>
  );
}
