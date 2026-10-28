import { useState } from "react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation, useSession } from "@/lib/hooks/queries";
import type { AppointmentDetail } from "@/lib/db/adapter";
import type { PaymentMethod, PaymentType } from "@/lib/domain/types";
import { can } from "@/lib/domain/status";
import { formatNtd } from "@/lib/domain/money";
import { hhmm, formatMonthDay, dateOf } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "現金", transfer: "轉帳", external_card: "外部刷卡" };
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`);

/**
 * Records money the shop actually received outside PetOS (no card processing here).
 * The idempotency key is fixed per open form, so a retried/double-clicked submit cannot charge twice.
 */
export function PaymentSection({ a }: { a: AppointmentDetail }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: session } = useSession();
  const owing = Math.max(0, a.totalDue - a.paidAmount);
  const [type, setType] = useState<PaymentType | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const [touched, setTouched] = useState(false);
  const record = usePetosMutation(() => adapter.recordPayment(a.id, { type: type!, method, amount: Number(amount), idempotencyKey: key, note: note.trim() || undefined }));
  const open = (t: PaymentType) => {
    setType(t);
    setAmount(t === "payment" ? String(owing) : "");
    setNote("");
    setKey(newKey());
    setTouched(false);
    record.reset();
  };
  const amountNum = Number(amount);
  const amountError = !amount ? "請輸入金額" : !Number.isInteger(amountNum) || amountNum <= 0 ? "金額需為正整數" : type === "refund" && amountNum > a.paidAmount ? `不可超過已收 ${formatNtd(a.paidAmount)}` : null;
  const reasonError = type === "refund" && !note.trim() ? "請填寫退款原因" : null;
  const role = session?.role ?? "groomer";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 border-y border-rule text-center">
        <div className="py-2">
          <p className="text-xs text-muted">應收</p>
          <p className="num text-lg font-semibold">{formatNtd(a.totalDue)}</p>
        </div>
        <div className="border-x border-rule py-2">
          <p className="text-xs text-muted">已收</p>
          <p className="num text-lg font-semibold">{formatNtd(a.paidAmount)}</p>
        </div>
        <div className="py-2">
          <p className="text-xs text-muted">尚欠</p>
          <p className={`num text-lg font-semibold ${owing > 0 ? "text-warning-ink" : "text-success"}`} data-testid="owing">
            {formatNtd(owing)}
          </p>
        </div>
      </div>

      {a.payments.length ? (
        <ul className="space-y-1 text-sm" aria-label="收款紀錄">
          {a.payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>
                <span className="num text-muted">{dateOf(p.createdAt) === dateOf(a.startsAt) ? hhmm(p.createdAt) : formatMonthDay(p.createdAt)}</span> {p.type === "refund" ? "退款" : "收款"} · {METHOD_LABEL[p.method]}
                {p.note ? <span className="text-muted"> · {p.note}</span> : null}
              </span>
              <span className={`num font-medium ${p.type === "refund" ? "text-danger" : ""}`}>
                {p.type === "refund" ? "−" : ""}
                {formatNtd(p.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {type ? (
        <form
          data-testid="payment-form"
          className="space-y-3 border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (amountError || reasonError || record.isPending) return;
            record.mutate(undefined, {
              onSuccess: () => {
                toast(`${type === "refund" ? "已記錄退款" : "已記錄收款"} ${formatNtd(amountNum)}`);
                setType(null);
              },
            });
          }}
        >
          <p className="font-semibold">{type === "refund" ? "記錄退款" : "記錄收款"}</p>
          <Field label="金額（NT$）" htmlFor="pay-amount" error={touched ? amountError : null} hint={type === "payment" && owing > 0 ? "可部分付款" : undefined}>
            <Input id="pay-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={touched && !!amountError} className="num" />
          </Field>
          <Field label="方式">
            <Segmented<PaymentMethod> label="付款方式" value={method} onChange={setMethod} options={(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          </Field>
          <Field label={type === "refund" ? "退款原因" : "備註"} htmlFor="pay-note" optional={type !== "refund"} error={touched ? reasonError : null}>
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "refund" ? "例：加購項目未執行" : "例：轉帳末五碼"} />
          </Field>
          {record.error ? <ActionError error={record.error} /> : null}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setType(null)}>
              取消
            </Button>
            <Button type="submit" variant={type === "refund" ? "danger" : "primary"} className="flex-1" loading={record.isPending} data-testid="submit-payment">
              {type === "refund" ? "確認退款" : "確認收款"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {owing > 0 && can(role, "payment.record") ? (
            <Button variant={a.status === "ready_pickup" ? "primary" : "secondary"} size={a.status === "ready_pickup" ? "lg" : "md"} className={a.status === "ready_pickup" ? "w-full" : undefined} onClick={() => open("payment")} data-testid="open-payment">
              記錄收款 <span className="num">{formatNtd(owing)}</span>
            </Button>
          ) : null}
          {a.paidAmount > 0 && can(role, "payment.refund") ? (
            <Button variant="ghost" onClick={() => open("refund")} data-testid="open-refund">
              退款
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
