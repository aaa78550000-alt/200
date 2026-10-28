import type { AppointmentStatus, NotificationStatus, PaymentStatus } from "@/lib/domain/types";
import { APPOINTMENT_LABEL, NOTIFICATION_LABEL, PAYMENT_LABEL } from "@/lib/domain/status";
import { cn } from "@/lib/cn";

/** Shape + text (never color alone). */
function Glyph({ status }: { status: AppointmentStatus }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true } as const;
  switch (status) {
    case "pending":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.8" /></svg>;
    case "confirmed":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
    case "checked_in":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" /></svg>;
    case "in_service":
      return <svg {...common}><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>;
    case "ready_pickup":
      return <svg {...common}><circle cx="6" cy="6" r="5.5" fill="currentColor" /><path d="M3.6 6.1l1.6 1.6 3.2-3.3" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "completed":
      return <svg {...common}><path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "cancelled":
    case "no_show":
      return <svg {...common}><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  }
}

const TONE: Record<AppointmentStatus, string> = {
  pending: "text-warning-ink bg-warning-tint",
  confirmed: "text-ink/80 bg-ink/[0.05]",
  checked_in: "text-primary bg-primary-tint",
  in_service: "text-primary bg-primary-tint",
  ready_pickup: "text-success bg-success-tint",
  completed: "text-muted bg-transparent",
  cancelled: "text-muted bg-transparent",
  no_show: "text-danger bg-danger-tint",
};

export function StatusLabel({ status, className }: { status: AppointmentStatus; className?: string }) {
  return (
    <span data-status={status} className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap", TONE[status], className)}>
      <Glyph status={status} />
      {APPOINTMENT_LABEL[status]}
    </span>
  );
}

const PAY_TONE: Record<PaymentStatus, string> = {
  unpaid: "text-warning-ink",
  partially_paid: "text-warning-ink",
  paid: "text-success",
  partially_refunded: "text-ink",
  refunded: "text-muted",
};

export function PaymentText({ status, className }: { status: PaymentStatus; className?: string }) {
  return <span className={cn("font-medium", PAY_TONE[status], className)}>{PAYMENT_LABEL[status]}</span>;
}

const NTF_TONE: Record<NotificationStatus, string> = { queued: "text-muted", sent: "text-success", failed: "text-danger", not_applicable: "text-muted" };

export function NotificationText({ status }: { status: NotificationStatus }) {
  return <span className={cn("font-medium", NTF_TONE[status])}>{NOTIFICATION_LABEL[status]}</span>;
}
