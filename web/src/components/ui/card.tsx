import { cn } from "@/lib/cn";

type Props = {
  title?: string;
  /** Right side of the header (a link or a button). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function Card({ title, action, className, children }: Props) {
  return (
    <section
      className={cn("rounded-card border border-line bg-paper-raised p-6 shadow-card", className)}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[17px]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
