import { AppLink } from "@/components/layout/AppLink";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm";

type Style = { variant?: Variant; size?: Size; block?: boolean; className?: string };

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<Variant, string> = {
  primary: "border-transparent bg-ink text-paper-raised hover:bg-[#0f1712]",
  secondary: "border-line bg-paper-raised text-ink hover:border-ink",
  danger: "border-rust bg-rust text-paper-raised hover:bg-[#963f2c]",
  ghost: "border-transparent bg-transparent text-ink-soft hover:text-ink",
};

const SIZES: Record<Size, string> = {
  md: "px-5 py-3 text-sm",
  sm: "px-3 py-1.5 text-[13px]",
};

export function buttonClasses({ variant = "primary", size = "md", block, className }: Style) {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

type ButtonProps = React.ComponentProps<"button"> & Style & { loading?: boolean };

/** type defaults to "button" so a stray button never submits a form; pass type="submit" where you mean it. */
export function Button({
  variant,
  size,
  block,
  loading,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<React.ComponentProps<"a">, "href"> & Style & { href: string };

/** A link that looks like a button. */
export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <AppLink className={buttonClasses({ variant, size, block, className })} {...rest} />;
}
