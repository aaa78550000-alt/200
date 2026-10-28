import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { usePendingRequests, useRangeAppointments, useSchedule, useStaff } from "@/lib/hooks/queries";
import { hoursFor, occupiedUntil } from "@/lib/domain/availability";
import { OCCUPYING } from "@/lib/domain/status";
import { addDays, dateOf, formatDateLong, formatMonthDay, hhmm, hmFromMinutes, minutesOf, taipeiIso, taipeiParts, weekdayLabel } from "@/lib/domain/time";
import type { AppointmentView, Staff } from "@/lib/domain/types";
import { AppointmentRow } from "@/components/appointment/AppointmentRow";
import { StatusLabel } from "@/components/appointment/StatusLabel";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { AppointmentDetail } from "@/features/appointments/AppointmentDetail";
import { NewAppointmentSheet, type NewAppointmentPreset } from "@/features/appointments/NewAppointmentSheet";
import { useIsDesktop } from "@/lib/hooks/useMedia";
import { cn } from "@/lib/cn";

const PX_PER_MIN = 1.2; // 72px per hour
const DAY_START = 9 * 60;
const DAY_END = 19 * 60;
const SLOT = 30;

const STAFF_TONE: Record<Staff["color"], { block: string; dot: string }> = {
  teal: { block: "border-l-primary bg-primary-tint", dot: "bg-primary" },
  ochre: { block: "border-l-warning bg-warning-tint", dot: "bg-warning" },
  slate: { block: "border-l-muted bg-ink/[0.05]", dot: "bg-muted" },
};

interface Off {
  start: number;
  end: number;
  label: string;
}
interface Column {
  key: string;
  label: string;
  sub?: string;
  date: string;
  staffId: string | null;
  closed: boolean;
  offs: Off[];
  items: AppointmentView[];
}

function startOfWeek(date: string) {
  const wd = taipeiParts(taipeiIso(date, "12:00")).weekday; // 0 Sun
  return addDays(date, -((wd + 6) % 7)); // Monday
}

export function CalendarPage() {
  const adapter = useAdapter();
  const today = dateOf(adapter.now());
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? today;
  const view = (params.get("view") as "day" | "week") ?? "day";
  const [mobileMode, setMobileMode] = useState<"list" | "timeline">("list");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [preset, setPreset] = useState<NewAppointmentPreset | null>(null);
  const selected = params.get("apt");

  const weekStart = startOfWeek(date);
  const rangeFrom = view === "week" && isDesktop ? weekStart : isDesktop ? date : weekStart;
  const rangeTo = view === "week" || !isDesktop ? addDays(weekStart, 7) : addDays(date, 1);
  const appts = useRangeAppointments(rangeFrom, rangeTo);
  const pending = usePendingRequests();
  const { data: ctx } = useSchedule();
  const { data: staff } = useStaff();
  const groomers = useMemo(() => staff?.filter((s) => s.isGroomer) ?? [], [staff]);

  const setQ = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };
  const openApt = (id: string) => (isDesktop ? setQ({ apt: id }) : navigate(`/app/appointments/${id}`));

  const columnsFor = (d: string, staffList: (Staff | null)[]): Column[] => {
    const h = ctx ? hoursFor(ctx, d) : null;
    const dayItems = (appts.data ?? []).filter((a) => dateOf(a.startsAt) === d && a.status !== "cancelled" && a.status !== "no_show");
    const dayPending = (pending.data ?? []).filter((a) => dateOf(a.startsAt) === d);
    return staffList.map((s) => {
      const offs: Off[] = [];
      if (h) {
        if (minutesOf(h.opens!) > DAY_START) offs.push({ start: DAY_START, end: minutesOf(h.opens!), label: "未營業" });
        if (minutesOf(h.closes!) < DAY_END) offs.push({ start: minutesOf(h.closes!), end: DAY_END, label: "已打烊" });
      }
      if (s && ctx) {
        ctx.breaks.filter((b) => b.staffId === s.id).forEach((b) => offs.push({ start: minutesOf(b.starts), end: minutesOf(b.ends), label: b.label }));
        ctx.timeOff
          .filter((t) => t.staffId === s.id && dateOf(t.startsAt) <= d && dateOf(t.endsAt) >= d)
          .forEach((t) => offs.push({ start: dateOf(t.startsAt) === d ? Math.max(DAY_START, taipeiParts(t.startsAt).minutes) : DAY_START, end: dateOf(t.endsAt) === d ? Math.min(DAY_END, taipeiParts(t.endsAt).minutes) : DAY_END, label: t.reason }));
      }
      const items = [...dayItems, ...dayPending].filter((a) => (s ? a.staffId === s.id : true));
      return { key: `${d}:${s?.id ?? "all"}`, label: s ? s.displayName : `${formatMonthDay(d)} ${weekdayLabel(d)}`, sub: s ? undefined : undefined, date: d, staffId: s?.id ?? null, closed: !h, offs, items };
    });
  };

  const unassignedPending = (pending.data ?? []).filter((a) => !a.staffId);
  const dayList = (appts.data ?? []).filter((a) => dateOf(a.startsAt) === date && (staffFilter === "all" || a.staffId === staffFilter));
  const dayPendingList = (pending.data ?? []).filter((a) => dateOf(a.startsAt) === date && (staffFilter === "all" || a.staffId === staffFilter || !a.staffId));

  let columns: Column[] = [];
  if (isDesktop) {
    columns = view === "week" ? Array.from({ length: 7 }, (_, i) => columnsFor(addDays(weekStart, i), [null])[0]) : columnsFor(date, groomers);
  } else if (mobileMode === "timeline") {
    const g = groomers.find((x) => x.id === staffFilter) ?? groomers[0];
    columns = g ? columnsFor(date, [g]) : [];
  }

  return (
    <div className="px-4 pb-10 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 pt-4 lg:pt-7">
        <div>
          <p className="num text-sm text-muted">{view === "week" && isDesktop ? `${formatMonthDay(weekStart)} – ${formatMonthDay(addDays(weekStart, 6))}` : formatDateLong(date)}</p>
          <h1 className="text-2xl font-bold leading-8">預約行事曆</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-[var(--radius-control)] border border-border bg-surface">
            <button type="button" className="grid size-10 place-items-center hover:bg-ink/5" aria-label={view === "week" ? "上一週" : "前一天"} onClick={() => setQ({ date: addDays(date, view === "week" && isDesktop ? -7 : -1), apt: null })}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className="h-10 border-x border-border px-3 text-sm font-medium hover:bg-ink/5" onClick={() => setQ({ date: null, apt: null })}>
              今天
            </button>
            <button type="button" className="grid size-10 place-items-center hover:bg-ink/5" aria-label={view === "week" ? "下一週" : "後一天"} onClick={() => setQ({ date: addDays(date, view === "week" && isDesktop ? 7 : 1), apt: null })}>
              <ChevronRight className="size-4" />
            </button>
          </div>
          {isDesktop ? (
            <Segmented<"day" | "week"> label="檢視" value={view} onChange={(v) => setQ({ view: v === "day" ? null : v, apt: null })} options={[{ value: "day", label: "日" }, { value: "week", label: "週" }]} />
          ) : null}
          <Button variant="primary" onClick={() => setPreset({ date })} className="hidden lg:inline-flex">
            <Plus className="size-4" aria-hidden />
            新增預約
          </Button>
        </div>
      </header>

      {/* Mobile: week strip + staff filter + list/timeline */}
      {!isDesktop ? (
        <div className="mt-4 space-y-3">
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]" role="tablist" aria-label="選擇日期">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
              const n = (appts.data ?? []).filter((a) => dateOf(a.startsAt) === d && OCCUPYING.concat(["completed"]).includes(a.status)).length;
              const closed = ctx ? !hoursFor(ctx, d) : false;
              return (
                <button key={d} role="tab" aria-selected={d === date} onClick={() => setQ({ date: d })} className={cn("flex h-16 min-w-[48px] flex-1 flex-col items-center justify-center rounded-[var(--radius-control)] border", d === date ? "border-ink bg-ink text-white" : "border-border bg-surface")}>
                  <span className="text-xs">{weekdayLabel(d).slice(1)}</span>
                  <span className="num text-[17px] font-bold leading-6">{Number(d.slice(8))}</span>
                  <span className={cn("h-3 text-[11px] leading-3", d === date ? "text-white/80" : "text-muted")}>{closed ? "店休" : n ? `${n} 筆` : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented label="美容師" value={staffFilter} onChange={setStaffFilter} options={[...(mobileMode === "list" ? [{ value: "all", label: "全部" }] : []), ...groomers.map((g) => ({ value: g.id, label: g.displayName }))]} />
            <Segmented<"list" | "timeline">
              label="顯示方式"
              value={mobileMode}
              onChange={(m) => {
                setMobileMode(m);
                if (m === "timeline" && staffFilter === "all" && groomers[0]) setStaffFilter(groomers[0].id);
              }}
              options={[{ value: "list", label: "列表" }, { value: "timeline", label: "時間軸" }]}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          {groomers.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", STAFF_TONE[g.color].dot)} />
              {g.displayName}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="hatch inline-block h-3 w-5 border border-border" />休息・休假・非營業</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 border border-dashed border-warning-ink" />待確認申請（未占用）</span>
          <span>點空白時段可新增預約</span>
          {unassignedPending.length ? (
            <button type="button" onClick={() => navigate("/app/today#requests")} className="ml-auto inline-flex h-9 items-center rounded-full bg-warning-tint px-3 font-medium text-warning-ink">
              {unassignedPending.length} 筆申請未指派美容師
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-4">
        {appts.isLoading ? (
          <ListSkeleton />
        ) : appts.error ? (
          <ErrorState error={appts.error} onRetry={() => appts.refetch()} />
        ) : !isDesktop && mobileMode === "list" ? (
          ctx && !hoursFor(ctx, date) ? (
            <EmptyState title="店休日" body="這天沒有營業。" />
          ) : dayList.length + dayPendingList.length === 0 ? (
            <EmptyState title="這天沒有預約" action={<Button variant="primary" onClick={() => setPreset({ date, staffId: staffFilter === "all" ? undefined : staffFilter })}>新增預約</Button>} />
          ) : (
            <ul className="divide-y divide-rule border-t border-ink/80 pb-20">
              {[...dayList, ...dayPendingList].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((a) => (
                <AppointmentRow key={a.id} a={a} onOpen={openApt} />
              ))}
            </ul>
          )
        ) : (
          <Timeline columns={columns} today={today} now={adapter.now()} week={view === "week" && isDesktop} groomers={groomers} onOpen={openApt} onEmpty={(c, min) => setPreset({ date: c.date, staffId: c.staffId ?? undefined, time: hmFromMinutes(min) })} />
        )}
      </div>

      {!isDesktop ? (
        <Button variant="primary" size="lg" className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-20 shadow-lg" onClick={() => setPreset({ date, staffId: staffFilter === "all" ? undefined : staffFilter })}>
          <Plus className="size-4" aria-hidden />
          新增預約
        </Button>
      ) : null}

      <Sheet open={isDesktop && !!selected} onOpenChange={(o) => !o && setQ({ apt: null })} title="預約詳情">
        {selected ? <AppointmentDetail key={selected} id={selected} onDone={() => setQ({ apt: null })} /> : null}
      </Sheet>
      <NewAppointmentSheet open={!!preset} onOpenChange={(o) => !o && setPreset(null)} preset={preset ?? { date }} onCreated={(id) => openApt(id)} />
    </div>
  );
}

function Timeline({ columns, today, now, week, groomers, onOpen, onEmpty }: { columns: Column[]; today: string; now: string; week: boolean; groomers: Staff[]; onOpen: (id: string) => void; onEmpty: (c: Column, minutes: number) => void }) {
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60);
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const nowMin = taipeiParts(now).minutes;
  const toneOf = (a: AppointmentView) => STAFF_TONE[groomers.find((g) => g.id === a.staffId)?.color ?? "slate"];
  return (
    <div className="overflow-hidden border border-rule bg-surface" data-testid="timeline">
      <div className="grid border-b border-rule" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
        <div />
        {columns.map((c) => (
          <div key={c.key} className={cn("border-l border-rule px-3 py-2.5 text-[15px] font-semibold", c.date === today && week && "text-primary")}>
            {c.label}
            {!week ? <span className="ml-2 text-sm font-normal text-muted">{c.items.filter((a) => a.status !== "pending").length} 筆</span> : null}
          </div>
        ))}
      </div>
      <div className="max-h-[calc(100dvh-260px)] overflow-y-auto lg:max-h-[calc(100dvh-250px)]">
        <div className="relative mt-2.5 mb-2 grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))`, height }}>
          {/* hour labels + rules */}
          <div className="relative">
            {hours.map((m) => (
              <span key={m} className="num absolute right-2 -translate-y-1/2 text-[12px] text-muted" style={{ top: (m - DAY_START) * PX_PER_MIN }}>
                {m < DAY_END ? hmFromMinutes(m) : ""}
              </span>
            ))}
          </div>
          {hours.slice(1, -1).map((m) => (
            <div key={m} aria-hidden className="pointer-events-none absolute left-14 right-0 border-t border-rule" style={{ top: (m - DAY_START) * PX_PER_MIN }} />
          ))}

          {columns.map((c) => (
            <div key={c.key} className="relative border-l border-rule" data-testid={`col-${c.staffId ?? c.date}`}>
              {c.closed ? (
                <div className="hatch absolute inset-0 grid place-items-center">
                  <span className="bg-surface px-2 py-1 text-sm font-medium text-muted">店休</span>
                </div>
              ) : (
                <>
                  {/* empty-slot buttons (real, keyboard reachable) */}
                  {Array.from({ length: (DAY_END - DAY_START) / SLOT }, (_, i) => DAY_START + i * SLOT).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-label={`新增${c.staffId ? ` ${c.label}` : ""} ${formatMonthDay(c.date)} ${hmFromMinutes(m)} 的預約`}
                      onClick={() => onEmpty(c, m)}
                      className="absolute inset-x-0 hover:bg-primary-tint/60 focus-visible:bg-primary-tint focus-visible:outline-none"
                      style={{ top: (m - DAY_START) * PX_PER_MIN, height: SLOT * PX_PER_MIN }}
                    />
                  ))}
                  {c.offs.map((o) => (
                    <div key={`${o.label}${o.start}`} className="hatch pointer-events-none absolute inset-x-0 flex items-start justify-end border-y border-border/70 px-2 pt-1" style={{ top: (o.start - DAY_START) * PX_PER_MIN, height: (o.end - o.start) * PX_PER_MIN }}>
                      <span className="bg-surface/90 px-1.5 text-xs font-medium text-muted">{o.label}</span>
                    </div>
                  ))}
                </>
              )}
              {c.items.map((a) => {
                const s = taipeiParts(a.startsAt).minutes;
                const e = taipeiParts(a.endsAt).minutes;
                const buf = taipeiParts(occupiedUntil(a)).minutes - e;
                const pendingReq = a.status === "pending";
                const compact = (e - s) * PX_PER_MIN < 64;
                return (
                  <div key={a.id} className="absolute inset-x-1 z-10" style={{ top: (s - DAY_START) * PX_PER_MIN + 1, height: (e - s + (pendingReq ? 0 : buf)) * PX_PER_MIN - 2 }}>
                    <button
                      type="button"
                      onClick={() => onOpen(a.id)}
                      data-testid={`block-${a.id}`}
                      className={cn(
                        "flex w-full flex-col overflow-hidden rounded-[8px] border-l-[3px] px-2 py-1.5 text-left transition-shadow hover:shadow-md",
                        pendingReq ? "border border-dashed border-warning-ink bg-surface/90" : toneOf(a).block,
                        a.status === "completed" && "opacity-60",
                      )}
                      style={{ height: (e - s) * PX_PER_MIN - 2 }}
                      aria-label={`${hhmm(a.startsAt)}–${hhmm(a.endsAt)} ${a.pet.name} ${a.items[0]?.name ?? ""}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {!compact && !week ? <PetAvatar src={a.pet.photoUrl} name={a.pet.name} size={40} className="!size-7 !rounded-[7px]" /> : null}
                        <span className="min-w-0">
                          <span className="num block text-[12px] leading-4 text-ink/70">{hhmm(a.startsAt)}–{hhmm(a.endsAt)}</span>
                          <span className="block truncate text-[15px] font-bold leading-5">{a.pet.name}</span>
                        </span>
                      </span>
                      {!compact ? <span className="mt-0.5 truncate text-[13px] leading-4 text-ink/75">{a.items.filter((i) => i.approval === "approved").map((i) => i.name).join("＋")}{week && a.staff ? ` · ${a.staff.displayName}` : ""}</span> : null}
                      {!compact && (e - s) * PX_PER_MIN > 100 ? <StatusLabel status={a.status} className="mt-auto h-6 self-start bg-surface/70 px-2 text-xs" /> : null}
                    </button>
                    {!pendingReq && buf > 0 ? <div aria-hidden className="hatch mx-0.5 rounded-b-[6px]" style={{ height: buf * PX_PER_MIN }} title="緩衝" /> : null}
                  </div>
                );
              })}
              {c.date === today && nowMin > DAY_START && nowMin < DAY_END ? (
                <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }}>
                  {c === columns[0] ? <span className="num absolute -left-[52px] -top-2.5 rounded bg-danger px-1 text-[11px] font-bold text-white">{hhmm(now)}</span> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
