"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Buttons shown at the bottom. */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Uses the browser's own <dialog>: focus stays inside, Esc closes it, and the
 * page behind is inert. Clicking the dark area outside also closes it.
 */
export function Modal({ open, onClose, title, footer, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-line bg-paper-raised p-0 text-ink shadow-card backdrop:bg-ink/40",
        className,
      )}
    >
      <div className="p-6">
        <h2 id={titleId} className="mb-3 text-[17px]">
          {title}
        </h2>
        <div className="text-sm text-ink-soft">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
