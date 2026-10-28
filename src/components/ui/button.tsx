import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors duration-100 disabled:opacity-45 select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover",
        secondary: "bg-surface text-ink border border-border hover:border-ink/30",
        ghost: "text-ink hover:bg-ink/5",
        quiet: "text-primary hover:bg-primary-tint",
        danger: "bg-surface text-danger border border-danger/40 hover:bg-danger-tint",
      },
      size: {
        md: "h-11 px-4 text-[15px]",
        lg: "h-12 px-5 text-base",
        sm: "h-9 px-3 text-sm",
        icon: "h-11 w-11",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, block, asChild, loading, children, disabled, ...props }, ref) => {
  if (asChild)
    // Slot requires exactly one child element; links rendered as buttons have no loading state.
    return (
      <Slot ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props}>
        {children}
      </Slot>
    );
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";
