import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation, useSchedule, useStaff } from "@/lib/hooks/queries";
import type { AppointmentDetail } from "@/lib/db/adapter";
import { findConflicts } from "@/lib/domain/availability";
import { dateOf, formatDateLong, hhmm, taipeiIso } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, TimeSelect } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

function useCandidateConflicts(a: AppointmentDetail, staffId: string | null, startsAt: string) {
  const { data: ctx } = useSchedule();
  return useMemo(() => {
    if (!ctx || !staffId) return [];
    return findConflicts(ctx, {
      staffId,
      startsAt,
      durationMinutes: (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000,
      bufferMinutes: a.bufferMinutes,
      serviceIds: a.items.filter((i) => i.approval === "approved").map((i) => i.serviceId),
      ignoreAppointmentId: a.id,
    });
  }, [ctx, staffId, startsAt, a]);
}

function ConflictHint({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <ul className="space-y-1 border-l-[3px] border-warning bg-warning-tint/60 px-3 py-2 text-sm text-warning-ink" data-testid="conflict-hint">
      {messages.map((m) => (
        <li key={m} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {m}
        </li>
      ))}
    </ul>
  );
}

/** Staff confirms an online request: this is where capacity is atomically checked (pending never held the slot). */
export function ConfirmRequestForm({ a }: { a: AppointmentDetail }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: staff } = useStaff();
  const groomers = staff?.filter((s) => s.isGroomer) ?? [];
  const [staffId, setStaffId] = useState<string | null>(a.staffId);
  const conflicts = useCandidateConflicts(a, staffId, a.startsAt);
  const confirm = usePetosMutation(() => adapter.confirmAppointment(a.id, a.version, staffId ?? undefined));
  return (
    <div className="space-y-3">
      <p className="text-[15px]">
        飼主申請 <span className="font-semibold">{formatDateLong(dateOf(a.startsAt))} <span className="num">{hhmm(a.startsAt)}</span></span>。確認後才會占用時段並通知飼主。
      </p>
      <Field label="指派美容師">
        <Segmented label="指派美容師" value={staffId} onChange={setStaffId} options={groomers.map((g) => ({ value: g.id, label: g.displayName }))} />
      </Field>
      <ConflictHint messages={conflicts.map((c) => c.message)} />
      {confirm.error ? <ActionError error={confirm.error} /> : null}
      <Button
        variant="primary"
        size="lg"
        block
        disabled={!staffId}
        loading={confirm.isPending}
        data-testid="confirm-request"
        onClick={() => confirm.mutate(undefined, { onSuccess: () => toast(`已確認 ${a.pet.name} 的預約`) })}
      >
        {staffId ? "確認預約" : "請先指派美容師"}
      </Button>
    </div>
  );
}

/** Reschedule keeps the same appointment id and writes history (E07). Final check is server-side. */
export function RescheduleForm({ a, onCancel, onDone }: { a: AppointmentDetail; onCancel: () => void; onDone: () => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: staff } = useStaff();
  const [date, setDate] = useState(dateOf(a.startsAt));
  const [time, setTime] = useState(hhmm(a.startsAt));
  const [staffId, setStaffId] = useState<string | null>(a.staffId);
  const startsAt = /^\d{2}:\d{2}$/.test(time) && /^\d{4}-\d{2}-\d{2}$/.test(date) ? taipeiIso(date, time) : a.startsAt;
  const conflicts = useCandidateConflicts(a, staffId, startsAt);
  const save = usePetosMutation(() => adapter.rescheduleAppointment(a.id, a.version, startsAt, staffId!));
  return (
    <form
      data-testid="reschedule-form"
      className="space-y-3 border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined, { onSuccess: () => { toast("已改期，原預約編號與歷程保留"); onDone(); } });
      }}
    >
      <h3 className="font-bold">改期</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="日期" htmlFor="rs-date">
          <Input id="rs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="開始時間" htmlFor="rs-time">
          <TimeSelect id="rs-time" step={15} value={time} onChange={setTime} className="w-full" />
        </Field>
      </div>
      <Field label="美容師">
        <Segmented label="美容師" value={staffId} onChange={setStaffId} options={(staff ?? []).filter((s) => s.isGroomer).map((g) => ({ value: g.id, label: g.displayName }))} />
      </Field>
      <ConflictHint messages={conflicts.map((c) => c.message)} />
      {save.error ? <ActionError error={save.error} /> : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          返回
        </Button>
        <Button type="submit" variant="primary" className="flex-1" loading={save.isPending} disabled={!staffId}>
          確認改期
        </Button>
      </div>
    </form>
  );
}

export function CancelForm({ a, onCancel, onDone }: { a: AppointmentDetail; onCancel: () => void; onDone: () => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const cancel = usePetosMutation(() => adapter.cancelAppointment(a.id, a.version, reason.trim()));
  return (
    <form
      className="space-y-3 border border-danger/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!reason.trim()) return;
        cancel.mutate(undefined, { onSuccess: () => { toast("預約已取消，時段已釋出"); onDone(); } });
      }}
    >
      <h3 className="font-bold">取消預約</h3>
      <Field label="取消原因" htmlFor="cancel-reason" error={touched && !reason.trim() ? "請填寫原因" : null}>
        <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：飼主來電取消" />
      </Field>
      {cancel.error ? <ActionError error={cancel.error} /> : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          返回
        </Button>
        <Button type="submit" variant="danger" className="flex-1" loading={cancel.isPending}>
          確認取消
        </Button>
      </div>
    </form>
  );
}
