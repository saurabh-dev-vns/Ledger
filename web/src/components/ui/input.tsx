import { useId } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full max-w-full rounded-lg border border-line bg-paper px-3 py-[11px] text-[15px] text-ink placeholder:text-ink-soft/60 focus:border-green focus:shadow-[0_0_0_3px_var(--color-green-soft)] focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-rust";

type FieldProps = {
  label: string;
  /** Shows "(optional)" next to the label. */
  optional?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

type Wiring = { id: string; describedBy: string | undefined; invalid: boolean };

function Field({
  label,
  optional,
  hint,
  error,
  className,
  wiring,
  children,
}: FieldProps & { wiring: Wiring; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={wiring.id} className="text-[13px] font-medium text-ink-soft">
        {label}
        {optional && <span className="ml-1 font-normal opacity-70">(optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${wiring.id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${wiring.id}-error`} className="text-xs text-rust">
          {error}
        </p>
      )}
    </div>
  );
}

function useWiring(props: Pick<FieldProps, "hint" | "error">, given?: string): Wiring {
  const auto = useId();
  const id = given ?? auto;
  const ids = [props.error ? `${id}-error` : null, props.hint && !props.error ? `${id}-hint` : null];

  return {
    id,
    describedBy: ids.filter(Boolean).join(" ") || undefined,
    invalid: Boolean(props.error),
  };
}

type InputProps = FieldProps & Omit<React.ComponentProps<"input">, "className">;

export function Input({ label, optional, hint, error, className, id, ...rest }: InputProps) {
  const w = useWiring({ hint, error }, id);

  return (
    <Field label={label} optional={optional} hint={hint} error={error} className={className} wiring={w}>
      <input
        id={w.id}
        className={CONTROL}
        aria-invalid={w.invalid || undefined}
        aria-describedby={w.describedBy}
        {...rest}
      />
    </Field>
  );
}

type SelectProps = FieldProps & Omit<React.ComponentProps<"select">, "className">;

export function Select({ label, optional, hint, error, className, id, children, ...rest }: SelectProps) {
  const w = useWiring({ hint, error }, id);

  return (
    <Field label={label} optional={optional} hint={hint} error={error} className={className} wiring={w}>
      <select
        id={w.id}
        className={CONTROL}
        aria-invalid={w.invalid || undefined}
        aria-describedby={w.describedBy}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}

type TextareaProps = FieldProps & Omit<React.ComponentProps<"textarea">, "className">;

export function Textarea({ label, optional, hint, error, className, id, ...rest }: TextareaProps) {
  const w = useWiring({ hint, error }, id);

  return (
    <Field label={label} optional={optional} hint={hint} error={error} className={className} wiring={w}>
      <textarea
        id={w.id}
        className={cn(CONTROL, "resize-y font-mono")}
        aria-invalid={w.invalid || undefined}
        aria-describedby={w.describedBy}
        {...rest}
      />
    </Field>
  );
}
