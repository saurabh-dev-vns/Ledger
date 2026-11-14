import { cn } from "@/lib/cn";

/** Scrolls sideways on small screens instead of breaking the page. */
export function Table({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export const THead = (p: React.ComponentProps<"thead">) => <thead {...p} />;
export const TBody = (p: React.ComponentProps<"tbody">) => <tbody {...p} />;

export function Tr({ className, ...rest }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line-soft last:border-0", className)} {...rest} />;
}

type CellProps = { align?: "left" | "right" };

export function Th({ align = "left", className, ...rest }: React.ComponentProps<"th"> & CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-line px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-soft",
        align === "right" && "text-right",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ align = "left", className, ...rest }: React.ComponentProps<"td"> & CellProps) {
  return <td className={cn("px-3 py-3", align === "right" && "text-right", className)} {...rest} />;
}
