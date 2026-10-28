import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Mobile: full-height bottom sheet. Desktop (lg): right-side drawer 440px.
 * Primary actions live in the `footer` slot so they stay visible above the safe area / keyboard.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  labelledBy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "center";
  labelledBy?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <Dialog.Content
          aria-labelledby={labelledBy}
          className={cn(
            "fixed z-50 flex flex-col bg-surface outline-none",
            "inset-x-0 bottom-0 top-[8dvh] rounded-t-[var(--radius-sheet)] data-[state=open]:animate-[sheet-up_260ms_var(--ease-out-soft)]",
            side === "right"
              ? "lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[440px] lg:rounded-none lg:border-l lg:border-border lg:data-[state=open]:animate-[drawer-in_240ms_var(--ease-out-soft)]"
              : "lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[520px] lg:max-h-[86dvh] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[var(--radius-sheet)]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-4 py-3 lg:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-bold leading-7">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{typeof title === "string" ? title : "面板"}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mr-2 grid size-11 place-items-center rounded-[var(--radius-control)] text-muted hover:bg-ink/5" aria-label="關閉">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">{children}</div>
          {footer ? <div className="border-t border-rule bg-surface px-4 pt-3 pb-safe lg:px-6">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
