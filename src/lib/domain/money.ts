import type { AppointmentItem, PaymentStatus, PaymentTransaction } from "./types";

export function formatNtd(amount: number): string {
  return `NT$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Only approved items are billable — an add-on without owner approval never raises the price. */
export function totalDue(items: AppointmentItem[]): number {
  return items.filter((i) => i.approval === "approved").reduce((s, i) => s + i.priceSnapshot, 0);
}

export function paidAmount(payments: PaymentTransaction[]): { paid: number; refunded: number; net: number } {
  const paid = payments.filter((p) => p.type === "payment").reduce((s, p) => s + p.amount, 0);
  const refunded = payments.filter((p) => p.type === "refund").reduce((s, p) => s + p.amount, 0);
  return { paid, refunded, net: paid - refunded };
}

/** Derived from the immutable ledger — never stored as an editable number. Mirrors app.payment_status(). */
export function paymentStatus(due: number, payments: PaymentTransaction[]): PaymentStatus {
  const { paid, refunded, net } = paidAmount(payments);
  if (refunded > 0) return net <= 0 ? "refunded" : "partially_refunded";
  if (paid <= 0) return "unpaid";
  if (net >= due) return "paid";
  return "partially_paid";
}
