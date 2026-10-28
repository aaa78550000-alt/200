import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, ChevronDown, Plus } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { useDayAppointments, usePendingRequests, usePetosMutation } from "@/lib/hooks/queries";
import type { AppointmentView } from "@/lib/domain/types";
import { IN_SHOP, TERMINAL } from "@/lib/domain/status";
import { dateOf, formatDateLong } from "@/lib/domain/time";
import { AppointmentRow } from "@/components/appointment/AppointmentRow";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton, StaleNotice } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AppointmentDetail } from "@/features/appointments/AppointmentDetail";
import { NewAppointmentSheet } from "@/features/appointments/NewAppointmentSheet";
import { useIsDesktop, useIsWide } from "@/lib/hooks/useMedia";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

type Filter = "all" | "in_service" | "ready_pickup";

function SectionHead({ title, count, hint, id }: { title: string; count: number; hint?: string; id?: string }) {
  return (
    <h2 id={id} className="flex items-baseline gap-2 border-b border-ink/80 pt-6 pb-1.5 text-[15px] font-bold tracking-wide">
      {title}
      <span className="num text-sm font-medium text-muted">{count}</span>
      {hint ? <span className="ml-auto text-sm font-normal text-muted">{hint}</span> : null}
    </h2>
  );
}

function QuickAction({ a, onOpen }: { a: AppointmentView; onOpen: (id: string, action?: string) => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const checkIn = usePetosMutation(() => adapter.checkIn(a.id, a.version));
  const start = usePetosMutation(() => adapter.startService(a.id, a.version));
  const btn = "h-9 px-3 text-sm";
  switch (a.status) {
    case "in_service":
      return (
        <Button variant="primary" className={btn} onClick={() => onOpen(a.id, "finish")} data-testid={`quick-finish-${a.id}`}>
          完成美容
        </Button>
      );
    case "ready_pickup":
      return a.totalDue - a.paidAmount > 0 ? (
        <Button variant="secondary" className={btn} onClick={() => onOpen(a.id)}>
          收款・交接
        </Button>
      ) : (
        <Button variant="secondary" className={btn} onClick={() => onOpen(a.id)}>
          交接
        </Button>
      );
    case "checked_in":
      return (
        <Button variant="secondary" className={btn} loading={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: () => toast(`${a.pet.name} 開始美容`), onError: () => onOpen(a.id) })}>
          開始美容
        </Button>
      );
    case "confirmed": {
      const minutesAway = (new Date(a.startsAt).getTime() - new Date(adapter.now()).getTime()) / 60000;
      return minutesAway <= 60 ? (
        <Button variant="secondary" className={btn} loading={checkIn.isPending} onClick={() => checkIn.mutate(undefined, { onSuccess: () => toast(`${a.pet.name} 已報到`), onError: () => onOpen(a.id) })} data-testid={`quick-checkin-${a.id}`}>
          報到
        </Button>
      ) : null;
    }
    default:
      return null;
  }
}

export function TodayPage() {
  const adapter = useAdapter();
  const today = dateOf(adapter.now());
  const isDesktop = useIsDesktop();
  const isWide = useIsWide(); // docked panel only when the list keeps enough width
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const day = useDayAppointments(today);
  const pending = usePendingRequests();
  const list = day.data ?? [];

  const groups = useMemo(() => {
    const visible = list.filter((a) => filter === "all" || a.status === filter);
    const order = { ready_pickup: 0, in_service: 1, checked_in: 2 } as Record<string, number>;
    return {
      inShop: visible.filter((a) => IN_SHOP.includes(a.status)).sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9) || x.startsAt.localeCompare(y.startsAt)),
      upcoming: visible.filter((a) => a.status === "confirmed"),
      done: visible.filter((a) => TERMINAL.includes(a.status)),
    };
  }, [list, filter]);

  const counts = {
    total: list.filter((a) => a.status !== "cancelled").length,
    in_service: list.filter((a) => a.status === "in_service").length,
    ready_pickup: list.filter((a) => a.status === "ready_pickup").length,
  };

  // Desktop master–detail: default focus is the first thing that needs a hand.
  const selected = params.get("apt") ?? (isWide ? (groups.inShop[0] ?? groups.upcoming[0])?.id ?? null : null);
  const action = params.get("action") ?? undefined;
  const open = (id: string, act?: string) => {
    if (isDesktop) setParams(act ? { apt: id, action: act } : { apt: id }, { replace: true });
    else navigate(`/app/appointments/${id}${act ? `?action=${act}` : ""}`);
  };

  const rows = (items: AppointmentView[], withAction = true) => (
    <ul className="divide-y divide-rule">
      {items.map((a) => (
        <AppointmentRow key={a.id} a={a} onOpen={open} selected={isDesktop && selected === a.id} action={withAction ? <QuickAction a={a} onOpen={open} /> : undefined} />
      ))}
    </ul>
  );

  const pendingCount = pending.data?.length ?? 0;
  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "今日預約", n: counts.total },
    { key: "in_service", label: "服務中", n: counts.in_service },
    { key: "ready_pickup", label: "待接回", n: counts.ready_pickup },
  ];

  return (
    <div className="xl:grid xl:h-[calc(100dvh-var(--topbar,0px))] xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 px-4 pb-10 lg:px-8 xl:overflow-y-auto">
        <header className="flex items-end justify-between gap-3 pt-4 lg:pt-7">
          <div>
            <p className="num text-sm text-muted">
              {formatDateLong(today)}
            </p>
            <h1 className="text-2xl font-bold leading-8">今日工作</h1>
          </div>
          <div className="flex items-center gap-1">
            <a href="#requests" className="relative grid size-11 place-items-center rounded-[var(--radius-control)] text-ink hover:bg-ink/5 lg:hidden" aria-label={`待確認申請 ${pendingCount} 筆`}>
              <Bell className="size-5" />
              {pendingCount ? <span className="num absolute right-1.5 top-1.5 grid min-w-[18px] place-items-center rounded-full bg-warning px-1 text-[11px] font-bold leading-[18px] text-ink">{pendingCount}</span> : null}
            </a>
            <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-appointment">
              <Plus className="size-4" aria-hidden />
              <span>新增預約</span>
            </Button>
          </div>
        </header>

        {/* Light summary that doubles as a filter — not KPI cards. */}
        <div role="tablist" aria-label="篩選" className="mt-4 flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                filter === f.key ? "border-ink bg-ink text-white" : "border-border bg-surface text-ink hover:border-ink/40",
              )}
            >
              {f.label}
              <span className={cn("num font-semibold", filter === f.key ? "text-white" : "text-ink")}>{f.n}</span>
            </button>
          ))}
        </div>

        {day.data ? <div className="mt-3"><StaleNotice error={day.error} onRetry={() => day.refetch()} /></div> : null}
        {day.isLoading && !day.data ? (
          <div className="mt-4">
            <ListSkeleton />
          </div>
        ) : !day.data ? (
          <div className="mt-4">
            <ErrorState error={day.error} onRetry={() => day.refetch()} />
          </div>
        ) : !list.length ? (
          <div className="mt-6">
            <EmptyState title="今天沒有預約" body="可以從這裡建立第一筆預約。" action={<Button variant="primary" onClick={() => setCreating(true)}>新增預約</Button>} />
          </div>
        ) : (
          <>
            {groups.inShop.length ? (
              <section aria-labelledby="sec-inshop">
                <SectionHead id="sec-inshop" title="店內" count={groups.inShop.length} hint="已報到・服務中・待接回" />
                {rows(groups.inShop)}
              </section>
            ) : null}
            {groups.upcoming.length ? (
              <section aria-labelledby="sec-next">
                <SectionHead id="sec-next" title="接下來" count={groups.upcoming.length} />
                {rows(groups.upcoming)}
              </section>
            ) : null}
            {filter !== "all" && !groups.inShop.length && !groups.upcoming.length ? (
              <div className="mt-6">
                <EmptyState title="沒有符合篩選的預約" action={<Button onClick={() => setFilter("all")}>顯示全部</Button>} />
              </div>
            ) : null}
            {groups.done.length ? (
              <section aria-labelledby="sec-done">
                <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} className="mt-6 flex min-h-11 w-full items-center gap-2 border-b border-rule text-left text-[15px] font-bold text-muted" id="sec-done">
                  已結束 <span className="num text-sm font-medium">{groups.done.length}</span>
                  <span className="text-sm font-normal">（已完成・已取消）</span>
                  <ChevronDown className={cn("ml-auto size-4 transition-transform", showDone && "rotate-180")} aria-hidden />
                </button>
                {showDone ? rows(groups.done, false) : null}
              </section>
            ) : null}
          </>
        )}

        <section aria-labelledby="requests" className="scroll-mt-4">
          <SectionHead id="requests" title="待確認申請" count={pendingCount} hint="線上送出，尚未占用時段" />
          {pending.isLoading ? (
            <ListSkeleton rows={1} />
          ) : !pending.data ? (
            <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
          ) : pendingCount ? (
            <ul className="divide-y divide-rule">
              {pending.data!.map((a) => (
                <AppointmentRow key={a.id} a={a} onOpen={open} selected={isDesktop && selected === a.id} showNotes={false} showDate />
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted">目前沒有待確認的線上申請。</p>
          )}
        </section>
      </div>

      {isDesktop && !isWide ? (
        <Sheet open={!!selected} onOpenChange={(o) => !o && setParams({}, { replace: true })} title="預約詳情">
          {selected ? <AppointmentDetail key={`${selected}:${action ?? ""}`} id={selected} initialAction={action} /> : null}
        </Sheet>
      ) : null}
      {isWide ? (
        <aside aria-label="預約詳情" className="border-l border-rule bg-surface xl:overflow-y-auto">
          {selected ? (
            <div className="px-6 py-6">
              <AppointmentDetail key={`${selected}:${action ?? ""}`} id={selected} initialAction={action} />
            </div>
          ) : (
            <div className="grid h-full place-items-center px-8 text-center text-muted">
              <p>點選左側預約以查看詳情</p>
            </div>
          )}
        </aside>
      ) : null}

      <NewAppointmentSheet open={creating} onOpenChange={setCreating} preset={{ date: today }} onCreated={(id) => open(id)} />
    </div>
  );
}
