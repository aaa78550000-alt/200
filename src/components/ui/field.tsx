import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Field({ label, hint, error, children, htmlFor, optional }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted">（選填）</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-base text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(inputCls, "h-11", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(inputCls, "min-h-24 py-2.5 leading-6", className)} {...p} />
));
Textarea.displayName = "Textarea";

/** Segmented single-choice control with real radio semantics. */
export function Segmented<T extends string>({ value, onChange, options, name, label }: { value: T | null; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; name?: string; label: string }) {
  const auto = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] border px-3.5 text-[15px] transition-colors duration-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary",
              active ? "border-primary bg-primary-tint text-primary font-medium" : "border-border bg-surface text-ink hover:border-ink/30",
            )}
          >
            <input type="radio" className="sr-only" name={name ?? auto} value={o.value} checked={active} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
