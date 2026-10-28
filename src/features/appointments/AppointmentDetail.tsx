import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Phone, RotateCw } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { useAppointment, usePetosMutation, useSession } from "@/lib/hooks/queries";
import type { AppointmentDetail as Detail } from "@/lib/db/adapter";
import { CONTRACT_LABEL, PROGRESS, APPOINTMENT_LABEL, can } from "@/lib/domain/status";
import { formatNtd } from "@/lib/domain/money";
import { formatDateLong, dateOf, hhmm } from "@/lib/domain/time";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { AttentionList } from "@/components/pet/AttentionList";
import { NotificationText, PaymentText, StatusLabel } from "@/components/appointment/StatusLabel";
import { Button } from "@/components/ui/button";
import { ActionError, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { FinishReview } from "./FinishReview";
import { PaymentSection } from "./PaymentSection";
import { HandoverAction } from "./HandoverAction";
import { RescheduleForm, CancelForm, ConfirmRequestForm } from "./ManageForms";
import { AddonSection } from "./AddonSection";
import { cn } from "@/lib/cn";

function Section({ title, children, aside, testId }: { title: string; children: ReactNode; aside?: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="border-t border-rule py-4 first:border-t-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-bold tracking-wide text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ProgressRail({ a }: { a: Detail }) {
  if (a.status === "cancelled" || a.status === "no_show")
    return (
      <div className="flex items-center gap-2 bg-ink/[0.04] px-3 py-2.5">
        <StatusLabel status={a.status} />
        {a.cancelledReason ? <span className="text-sm text-muted">{a.cancelledReason}</span> : null}
      </div>
    );
  const idx = PROGRESS.indexOf(a.status);
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="預約進度">
      {PROGRESS.map((s, i) => (
        <li key={s} className="min-w-0" aria-current={i === idx ? "step" : undefined}>
          <div className={cn("h-1 rounded-full", i < idx ? "bg-primary/60" : i === idx ? "bg-primary" : "bg-ink/10")} />
          <p className={cn("mt-1.5 truncate text-center text-[12px] leading-4", i === idx ? "font-bold text-primary" : i < idx ? "text-ink/70" : "text-muted")}>{APPOINTMENT_LABEL[s]}</p>
        </li>
      ))}
    </ol>
  );
}

type Mode = "idle" | "finish" | "reschedule" | "cancel";

export function AppointmentDetail({ id, onDone, initialAction }: { id: string; onDone?: () => void; initialAction?: string }) {
  const q = useAppointment(id);
  const { data: session } = useSession();
  const [mode, setMode] = useState<Mode>(initialAction === "finish" ? "finish" : "idle");

  if (q.isLoading)
    return (
      <div className="space-y-4 p-1" role="status" aria-label="載入預約">
        <div className="flex gap-3">
          <Skeleton className="size-[52px] rounded-[12px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  const role = session?.role ?? "groomer";
  const showFinance = can(role, "finance.view");

  return (
    <article data-testid="appointment-detail" data-status={a.status} aria-label={`${a.pet.name} 的預約`}>
      {/* Identity — who is this, whose is it */}
      <header className="flex items-start gap-3">
        <PetAvatar src={a.pet.photoUrl} name={a.pet.name} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/app/pets/${a.pet.id}`} className="group inline-flex min-h-8 items-center gap-0.5 text-xl font-bold leading-7 hover:text-primary">
              {a.pet.name}
              <ChevronRight className="size-4 text-muted group-hover:text-primary" aria-hidden />
            </Link>
            <StatusLabel status={a.status} />
          </div>
          <p className="truncate text-sm text-muted">
            {a.pet.breed ?? "品種未填"} · 飼主 {a.customer.name}
            <a href={`tel:${a.customer.phone}`} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="size-3.5" aria-hidden />
              <span className="num">{a.customer.phone}</span>
            </a>
          </p>
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[15px]">
        <dt className="text-muted">時間</dt>
        <dd>
          {formatDateLong(dateOf(a.startsAt))} <span className="num font-semibold">{hhmm(a.startsAt)}–{hhmm(a.endsAt)}</span>
        </dd>
        {a.pickupExpectedAt && !["completed", "cancelled", "no_show"].includes(a.status) ? (
          <>
            <dt className="text-muted">接回</dt>
            <dd>
              預計 <span className="num">{hhmm(a.pickupExpectedAt)}</span>
            </dd>
          </>
        ) : null}
        <dt className="text-muted">服務</dt>
        <dd>
          {a.items.filter((i) => i.approval === "approved").map((i) => i.name).join("＋")}
          {showFinance ? <span className="num ml-2 font-semibold">{formatNtd(a.totalDue)}</span> : null}
        </dd>
        <dt className="text-muted">美容師</dt>
        <dd>{a.staff?.displayName ?? <span className="text-warning-ink">尚未指派</span>}</dd>
        {a.customerNote ? (
          <>
            <dt className="text-muted">飼主備註</dt>
            <dd>{a.customerNote}</dd>
          </>
        ) : null}
      </dl>

      {/* Care notes at the moment care happens — first screen, no second-level page. */}
      <div className="mt-4 bg-warning-tint/60 px-3 py-3">
        <p className="mb-2 text-sm font-bold text-warning-ink">照護注意事項</p>
        <AttentionList notes={a.highNotes.length ? a.highNotes : []} compact emptyText="沒有標記為重要的注意事項" />
        <Link to={`/app/pets/${a.pet.id}#care`} className="mt-2 inline-flex min-h-8 items-center text-sm text-primary hover:underline">
          看完整照護資訊與偏好
        </Link>
      </div>

      <div className="mt-5">
        <ProgressRail a={a} />
      </div>

      {/* The one primary thing to do now */}
      <div className="mt-5" data-testid="primary-action-zone">
        {mode === "finish" && a.status === "in_service" ? (
          <FinishReview a={a} onCancel={() => setMode("idle")} onDone={() => setMode("idle")} />
        ) : mode === "reschedule" ? (
          <RescheduleForm a={a} onCancel={() => setMode("idle")} onDone={() => setMode("idle")} />
        ) : mode === "cancel" ? (
          <CancelForm a={a} onCancel={() => setMode("idle")} onDone={() => { setMode("idle"); onDone?.(); }} />
        ) : (
          <PrimaryAction a={a} onFinish={() => setMode("finish")} onReschedule={() => setMode("reschedule")} onCancel={() => setMode("cancel")} />
        )}
      </div>

      <div className="mt-4">
        {(a.status === "in_service" || a.status === "checked_in" || a.items.some((i) => i.approval !== "approved")) && mode !== "finish" ? (
          <Section title="加購" testId="addon-section">
            <AddonSection a={a} />
          </Section>
        ) : null}

        <Section title="狀態">
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-[15px]">
            <dt className="text-muted">預約</dt>
            <dd>{APPOINTMENT_LABEL[a.status]}{a.source === "online" ? <span className="text-muted">（線上申請）</span> : null}</dd>
            <dt className="text-muted">契約</dt>
            <dd className={a.contractStatus === "pending" ? "text-warning-ink" : undefined}>{CONTRACT_LABEL[a.contractStatus]}{a.contractStatus === "pending" ? <span className="text-muted">（電子簽約 M4 提供，目前請用紙本）</span> : null}</dd>
            {showFinance ? (
              <>
                <dt className="text-muted">付款</dt>
                <dd data-testid="payment-status">
                  <PaymentText status={a.paymentStatus} /> <span className="num text-muted">已收 {formatNtd(a.paidAmount)} / 應收 {formatNtd(a.totalDue)}</span>
                </dd>
              </>
            ) : null}
            <dt className="text-muted">通知</dt>
            <dd data-testid="notification-status">
              <NotificationList a={a} />
            </dd>
          </dl>
        </Section>

        {a.finish ? (
          <Section title="完工紀錄">
            <p className="text-[15px]">
              <span className="num">{hhmm(a.finish.finishedAt)}</span> 完成 ·{" "}
              {a.finish.outcome === "normal" ? "正常" : <span className="font-semibold text-danger">異常</span>}
            </p>
            {a.finish.incidentNote ? <p className="mt-1 border-l-[3px] border-danger pl-3 text-[15px]">{a.finish.incidentNote}</p> : null}
            {a.finish.note ? <p className="mt-1 text-[15px] text-ink/85">{a.finish.note}</p> : null}
          </Section>
        ) : null}

        {showFinance && ["checked_in", "in_service", "completed"].includes(a.status) ? (
          <Section title="收款" testId="payment-section">
            <PaymentSection a={a} />
          </Section>
        ) : null}

        <Section title="歷程">
          <ol className="space-y-2">
            {a.events.map((e) => (
              <li key={e.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 text-sm">
                <span className="num pt-px text-muted">{dateOf(e.at) === dateOf(a.startsAt) ? hhmm(e.at) : `${Number(dateOf(e.at).slice(5, 7))}/${Number(dateOf(e.at).slice(8))}`}</span>
                <span>
                  {e.summary}
                  <span className="text-muted"> · {e.actorName}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </article>
  );
}

function NotificationList({ a }: { a: Detail }) {
  const adapter = useAdapter();
  const retry = usePetosMutation((jobId: string) => adapter.retryNotification(jobId));
  if (!a.notifications.length) return <span className="text-muted">尚無</span>;
  const KIND = { ready_pickup: "待接回通知", booking_received: "收到申請通知", booking_confirmed: "預約確認通知" } as const;
  return (
    <ul className="space-y-1">
      {a.notifications.map((n) => (
        <li key={n.id} className="flex flex-wrap items-center gap-x-2">
          <span>{KIND[n.kind]}</span>
          <NotificationText status={n.status} />
          <span className="text-xs text-muted">LINE 模擬</span>
          {n.status === "failed" ? (
            <Button size="sm" variant="quiet" className="-my-1 h-8" loading={retry.isPending} onClick={() => retry.mutate(n.id)}>
              <RotateCw className="size-3.5" aria-hidden />
              重試
            </Button>
          ) : null}
        </li>
      ))}
      {retry.error ? <ActionError error={retry.error} /> : null}
    </ul>
  );
}

function PrimaryAction({ a, onFinish, onReschedule, onCancel }: { a: Detail; onFinish: () => void; onReschedule: () => void; onCancel: () => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: session } = useSession();
  const role = session?.role ?? "groomer";
  const checkIn = usePetosMutation(() => adapter.checkIn(a.id, a.version));
  const start = usePetosMutation(() => adapter.startService(a.id, a.version));
  const noShow = usePetosMutation(() => adapter.markNoShow(a.id, a.version));
  const err = checkIn.error ?? start.error ?? noShow.error;

  const secondary = (
    <div className="mt-2 flex flex-wrap gap-x-1">
      {can(role, "appointment.reschedule") ? (
        <Button variant="ghost" size="sm" onClick={onReschedule}>
          改期
        </Button>
      ) : null}
      {can(role, "appointment.cancel") ? (
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消預約
        </Button>
      ) : null}
      {a.status === "confirmed" && can(role, "appointment.cancel") ? (
        <Button variant="ghost" size="sm" loading={noShow.isPending} onClick={() => noShow.mutate(undefined, { onSuccess: () => toast("已標記未到店") })}>
          未到店
        </Button>
      ) : null}
    </div>
  );

  switch (a.status) {
    case "pending":
      return can(role, "appointment.confirm") ? (
        <div>
          <ConfirmRequestForm a={a} />
          {secondary}
        </div>
      ) : (
        <p className="text-[15px] text-muted">待櫃檯或店長確認。</p>
      );
    case "confirmed":
      return (
        <div>
          <p className="mb-2 text-sm text-muted">報到前請當面核對毛孩外觀與上方注意事項。</p>
          <Button variant="primary" size="lg" block loading={checkIn.isPending} onClick={() => checkIn.mutate(undefined, { onSuccess: () => toast(`${a.pet.name} 已報到`) })}>
            報到
          </Button>
          {err ? <div className="mt-2"><ActionError error={err} /></div> : null}
          {secondary}
        </div>
      );
    case "checked_in":
      return (
        <div>
          <Button variant="primary" size="lg" block loading={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: () => toast("已開始美容") })}>
            開始美容
          </Button>
          {err ? <div className="mt-2"><ActionError error={err} /></div> : null}
        </div>
      );
    case "in_service":
      return (
        <Button variant="primary" size="lg" block onClick={onFinish} data-testid="open-finish-review">
          完成美容
        </Button>
      );
    case "ready_pickup":
      return (
        <div className="space-y-4">
          {can(role, "finance.view") ? <PaymentSection a={a} /> : null}
          <HandoverAction a={a} />
        </div>
      );
    case "completed":
      return <p className="text-[15px] text-muted">已完成{a.completedAt ? `（${hhmm(a.completedAt)} 接回）` : ""}。</p>;
    default:
      return null;
  }
}
