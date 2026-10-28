import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EMBEDDED } from "@/lib/env";
import { sitePath } from "@/lib/paths";
import { AlertTriangle, Check, Copy, ExternalLink, Phone, Plus } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import type { AffectedAppointment, ServiceInput } from "@/lib/db/adapter";
import { usePetosMutation, useSchedule, useServices, useSession, useShop, useStaff } from "@/lib/hooks/queries";
import { can, ROLE_LABEL } from "@/lib/domain/status";
import { formatNtd } from "@/lib/domain/money";
import { addDays, dateOf, formatDateLong, formatDateShort, hhmm, taipeiIso } from "@/lib/domain/time";
import type { Service } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Textarea, TimeSelect } from "@/components/ui/field";
import { ActionError, ListSkeleton } from "@/components/ui/states";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

function SectionTitle({ children, aside, id }: { children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex items-end justify-between gap-3 border-b border-ink/80 pb-1.5">
      <h2 className="text-[15px] font-bold tracking-wide">{children}</h2>
      {aside}
    </div>
  );
}

/** 服務與設定 (M2-01): booking link, services, opening hours, staff qualifications, leave. Managers edit; others read. */
export function MorePage() {
  const adapter = useAdapter();
  const { data: shop } = useShop();
  const { data: session } = useSession();
  const [params] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const manage = session ? can(session.role, "settings.manage") : false;
  // Embedded demo has no public URL of its own; show the path the shop will get once deployed.
  const url = shop ? (EMBEDDED ? `https://<你的網域>/book/${shop.slug}` : `${window.location.origin}${sitePath(`/book/${shop.slug}`)}`) : "";
  const onboarding = params.get("onboarding") === "1";

  return (
    <div className="mx-auto max-w-[840px] px-4 pb-16 lg:px-8">
      <h1 className="pt-4 text-2xl font-bold leading-8 lg:pt-7">服務與設定</h1>
      <section className="mt-3">
        <p className="text-[15px] font-semibold">{shop?.name}</p>
        <p className="text-sm text-muted">
          {session ? `目前登入：${session.displayName}（${ROLE_LABEL[session.role]}）` : null}
          {!manage && session ? " · 只有店主或店長可以修改設定" : null}
        </p>
        {adapter.signOut ? (
          <Button size="sm" variant="ghost" className="mt-1 -ml-3" onClick={() => adapter.signOut!().then(() => window.location.assign(sitePath("/login")))}>
            登出
          </Button>
        ) : null}
      </section>

      {onboarding ? <OnboardingChecklist /> : null}

      <section className="mt-8">
        <SectionTitle>飼主線上預約網址</SectionTitle>
        <p className="num mt-3 break-all text-[15px]">{url}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "已複製" : "複製網址"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            {EMBEDDED ? (
              <Link to={`/book/${shop?.slug ?? ""}`}>
                <ExternalLink className="size-3.5" aria-hidden />
                開啟
              </Link>
            ) : (
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" aria-hidden />
                開啟
              </a>
            )}
          </Button>
        </div>
      </section>

      <ServicesSection manage={manage} />
      <HoursSection manage={manage} />
      <StaffSection manage={manage} />
      <TimeOffSection manage={manage} />
    </div>
  );
}

function OnboardingChecklist() {
  const steps = [
    ["營業時間", "#hours"],
    ["服務項目與價格", "#services"],
    ["美容師可服務項目", "#staff"],
    ["建立第一筆毛孩", "/app/pets"],
    ["分享線上預約網址", "#"],
  ] as const;
  return (
    <section className="mt-6 border-l-[3px] border-primary bg-primary-tint/50 px-4 py-3" data-testid="onboarding">
      <p className="font-bold">開店設定（可以先跳過，之後隨時回來）</p>
      <ol className="mt-2 grid gap-1 text-[15px] sm:grid-cols-2">
        {steps.map(([label, href], i) => (
          <li key={label}>
            <a href={href} className="inline-flex min-h-9 items-center gap-2 text-primary hover:underline">
              <span className="num grid size-6 place-items-center rounded-full bg-surface text-sm text-ink">{i + 1}</span>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ServicesSection({ manage }: { manage: boolean }) {
  const { data: services, isLoading } = useServices();
  const { data: staff } = useStaff();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  return (
    <section className="mt-10" aria-labelledby="services">
      <SectionTitle id="services" aside={manage ? <Button size="sm" variant="quiet" onClick={() => setEditing("new")} data-testid="new-service"><Plus className="size-3.5" aria-hidden />新增服務</Button> : undefined}>
        服務項目
      </SectionTitle>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="divide-y divide-rule">
          {services?.map((s) => (
            <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {s.name}
                  {s.isAddon ? <span className="ml-2 text-sm font-normal text-muted">加購</span> : null}
                  {!s.onlineBookable && !s.isAddon ? <span className="ml-2 text-sm font-normal text-muted">不開放線上</span> : null}
                </p>
                <p className="text-sm text-muted">
                  <span className="num">{s.durationMinutes}</span> 分鐘{s.bufferMinutes ? <> ＋ 緩衝 <span className="num">{s.bufferMinutes}</span> 分</> : ""} · 可服務：
                  {staff?.filter((x) => x.serviceIds.includes(s.id)).map((x) => x.displayName).join("、") || <span className="text-warning-ink">尚無美容師</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="num text-right font-semibold">
                  {formatNtd(s.basePrice)}
                  {s.priceIsFrom ? <span className="text-sm font-normal text-muted"> 起</span> : null}
                </p>
                {manage ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`編輯 ${s.name}`}>
                    編輯
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-muted">改價只影響之後的新預約；既有預約保留當時的價格與時長。</p>
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "新增服務" : "編輯服務"}>
        {editing ? <ServiceForm service={editing === "new" ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </section>
  );
}

function ServiceForm({ service, onDone }: { service: Service | null; onDone: () => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [f, setF] = useState<ServiceInput>(() =>
    service
      ? { id: service.id, name: service.name, description: service.description, basePrice: service.basePrice, priceIsFrom: service.priceIsFrom, durationMinutes: service.durationMinutes, bufferMinutes: service.bufferMinutes, isAddon: service.isAddon, species: service.species.filter((x) => x !== "other") as ("dog" | "cat")[], onlineBookable: service.onlineBookable }
      : { name: "", description: "", basePrice: 0, priceIsFrom: true, durationMinutes: 60, bufferMinutes: 15, isAddon: false, species: ["dog"], onlineBookable: true },
  );
  const set = (p: Partial<ServiceInput>) => setF((x) => ({ ...x, ...p }));
  const save = usePetosMutation(() => adapter.saveService(f));
  const archive = usePetosMutation(() => adapter.archiveService(service!.id));
  const num = (v: string) => Number(v.replace(/\D/g, "") || 0);
  return (
    <form
      className="space-y-4"
      data-testid="service-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined, { onSuccess: () => { toast("服務已儲存"); onDone(); } });
      }}
    >
      <Field label="名稱" htmlFor="sv-name">
        <Input id="sv-name" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
      </Field>
      <Field label="說明" htmlFor="sv-desc" optional>
        <Textarea id="sv-desc" value={f.description} onChange={(e) => set({ description: e.target.value })} className="min-h-16" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="價格（NT$）" htmlFor="sv-price">
          <Input id="sv-price" inputMode="numeric" className="num" value={String(f.basePrice)} onChange={(e) => set({ basePrice: num(e.target.value) })} />
        </Field>
        <Field label="時長（分）" htmlFor="sv-dur">
          <Input id="sv-dur" inputMode="numeric" className="num" value={String(f.durationMinutes)} onChange={(e) => set({ durationMinutes: num(e.target.value) })} />
        </Field>
        <Field label="緩衝（分）" htmlFor="sv-buf">
          <Input id="sv-buf" inputMode="numeric" className="num" value={String(f.bufferMinutes)} onChange={(e) => set({ bufferMinutes: num(e.target.value) })} />
        </Field>
      </div>
      <Field label="價格顯示">
        <Segmented<"from" | "fixed"> label="價格顯示" value={f.priceIsFrom ? "from" : "fixed"} onChange={(v) => set({ priceIsFrom: v === "from" })} options={[{ value: "from", label: "起價（依現場評估）" }, { value: "fixed", label: "固定價" }]} />
      </Field>
      <Field label="類型">
        <Segmented<"main" | "addon"> label="類型" value={f.isAddon ? "addon" : "main"} onChange={(v) => set({ isAddon: v === "addon", onlineBookable: v === "addon" ? false : f.onlineBookable })} options={[{ value: "main", label: "主服務" }, { value: "addon", label: "加購（需飼主同意）" }]} />
      </Field>
      <Field label="適用">
        <div className="flex gap-2">
          {(["dog", "cat"] as const).map((sp) => {
            const on = f.species.includes(sp);
            return (
              <label key={sp} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[15px]", on ? "border-primary bg-primary-tint text-primary" : "border-border")}>
                <input type="checkbox" className="accent-[var(--primary)]" checked={on} onChange={() => set({ species: on ? f.species.filter((x) => x !== sp) : [...f.species, sp] })} />
                {sp === "dog" ? "狗狗" : "貓咪"}
              </label>
            );
          })}
        </div>
      </Field>
      {!f.isAddon ? (
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.onlineBookable} onChange={(e) => set({ onlineBookable: e.target.checked })} />
          開放飼主線上申請
        </label>
      ) : null}
      {save.error || archive.error ? <ActionError error={save.error ?? archive.error} /> : null}
      <div className="flex gap-2">
        {service ? (
          <Button type="button" variant="danger" loading={archive.isPending} onClick={() => archive.mutate(undefined, { onSuccess: () => { toast("服務已停用"); onDone(); } })}>
            停用
          </Button>
        ) : null}
        <Button type="submit" variant="primary" className="flex-1" loading={save.isPending} disabled={!f.name.trim() || !f.species.length} data-testid="save-service">
          儲存
        </Button>
      </div>
    </form>
  );
}

function HoursSection({ manage }: { manage: boolean }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: ctx } = useSchedule();
  const initial = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((d) => ctx?.hours.find((h) => h.weekday === d) ?? { weekday: d, opens: null, closes: null }), [ctx]);
  const [draft, setDraft] = useState<typeof initial | null>(null);
  const rows = draft ?? initial;
  const save = usePetosMutation(() => adapter.setOperatingHours(rows));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const update = (d: number, p: Partial<(typeof rows)[number]>) => setDraft(rows.map((r) => (r.weekday === d ? { ...r, ...p } : r)));
  return (
    <section className="mt-10" aria-labelledby="hours">
      <SectionTitle id="hours">營業時間</SectionTitle>
      <ul className="divide-y divide-rule">
        {order.map((d) => {
          const r = rows.find((x) => x.weekday === d)!;
          const open = !!r.opens;
          return (
            <li key={d} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-12 font-semibold">{WEEKDAYS[d]}</span>
              {manage ? (
                <>
                  <Segmented<"open" | "closed"> label={`${WEEKDAYS[d]} 是否營業`} value={open ? "open" : "closed"} onChange={(v) => update(d, v === "open" ? { opens: "10:00", closes: "19:00" } : { opens: null, closes: null })} options={[{ value: "open", label: "營業" }, { value: "closed", label: "店休" }]} />
                  {open ? (
                    <span className="flex items-center gap-2">
                      <TimeSelect aria-label={`${WEEKDAYS[d]} 開店`} value={r.opens ?? ""} onChange={(v) => update(d, { opens: v })} />
                      –
                      <TimeSelect aria-label={`${WEEKDAYS[d]} 打烊`} value={r.closes ?? ""} onChange={(v) => update(d, { closes: v })} />
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="num text-[15px]">{open ? `${r.opens}–${r.closes}` : <span className="text-muted">店休</span>}</span>
              )}
            </li>
          );
        })}
      </ul>
      {manage ? (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="primary" disabled={!draft} loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { toast("營業時間已更新"); setDraft(null); } })} data-testid="save-hours">
            儲存營業時間
          </Button>
          {draft ? <Button variant="ghost" onClick={() => setDraft(null)}>放棄修改</Button> : null}
        </div>
      ) : null}
      {save.error ? <div className="mt-2"><ActionError error={save.error} /></div> : null}
    </section>
  );
}

function StaffSection({ manage }: { manage: boolean }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: staff } = useStaff();
  const { data: services } = useServices();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const save = usePetosMutation((staffId: string) => adapter.setStaffServices(staffId, draft[staffId]));
  return (
    <section className="mt-10" aria-labelledby="staff">
      <SectionTitle id="staff">美容師可服務項目</SectionTitle>
      <ul className="divide-y divide-rule">
        {staff?.filter((s) => s.isGroomer).map((g) => {
          const chosen = draft[g.id] ?? g.serviceIds;
          return (
            <li key={g.id} className="py-3">
              <p className="font-semibold">{g.displayName}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {services?.map((s) => {
                  const on = chosen.includes(s.id);
                  return manage ? (
                    <label key={s.id} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm", on ? "border-primary bg-primary-tint text-primary" : "border-border text-muted")}>
                      <input type="checkbox" className="accent-[var(--primary)]" checked={on} onChange={() => setDraft({ ...draft, [g.id]: on ? chosen.filter((x) => x !== s.id) : [...chosen, s.id] })} />
                      {s.name}
                    </label>
                  ) : on ? (
                    <span key={s.id} className="rounded-full bg-ink/[0.05] px-3 py-1 text-sm">{s.name}</span>
                  ) : null;
                })}
              </div>
              {manage && draft[g.id] ? (
                <Button size="sm" variant="primary" className="mt-2" loading={save.isPending && save.variables === g.id} onClick={() => save.mutate(g.id, { onSuccess: () => { toast(`${g.displayName} 的服務項目已更新`); setDraft(({ [g.id]: _drop, ...rest }) => rest); } })}>
                  儲存 {g.displayName}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {save.error ? <ActionError error={save.error} /> : null}
    </section>
  );
}

function TimeOffSection({ manage }: { manage: boolean }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: staff } = useStaff();
  const { data: ctx } = useSchedule();
  const today = dateOf(adapter.now());
  const groomers = staff?.filter((s) => s.isGroomer) ?? [];
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(addDays(today, 1));
  const [allDay, setAllDay] = useState<"all" | "part">("all");
  const [from, setFrom] = useState("13:00");
  const [to, setTo] = useState("19:00");
  const [reason, setReason] = useState("");
  const [affected, setAffected] = useState<AffectedAppointment[] | null>(null);
  const add = usePetosMutation(() =>
    adapter.addTimeOff({ staffId: staffId!, startsAt: taipeiIso(date, allDay === "all" ? "00:00" : from), endsAt: allDay === "all" ? taipeiIso(addDays(date, 1), "00:00") : taipeiIso(date, to), reason }),
  );
  const del = usePetosMutation((id: string) => adapter.deleteTimeOff(id));
  const upcoming = (ctx?.timeOff ?? []).filter((t) => t.endsAt >= adapter.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <section className="mt-10" aria-labelledby="timeoff">
      <SectionTitle id="timeoff">休假</SectionTitle>
      {upcoming.length ? (
        <ul className="divide-y divide-rule">
          {upcoming.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-[15px]">
              <span>
                <span className="font-semibold">{groomers.find((g) => g.id === t.staffId)?.displayName}</span> · {formatDateLong(dateOf(t.startsAt))}
                {hhmm(t.startsAt) !== "00:00" || hhmm(t.endsAt) !== "00:00" ? <span className="num"> {hhmm(t.startsAt)}–{hhmm(t.endsAt)}</span> : " 全天"} · {t.reason}
              </span>
              {manage ? <Button size="sm" variant="ghost" loading={del.isPending && del.variables === t.id} onClick={() => del.mutate(t.id)}>刪除</Button> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-muted">目前沒有登記的休假。</p>
      )}
      {manage ? (
        <form
          className="mt-3 space-y-3 border border-border p-4"
          data-testid="time-off-form"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(undefined, { onSuccess: (list) => { setAffected(list); toast("休假已登記"); } });
          }}
        >
          <p className="font-semibold">登記休假</p>
          <Field label="美容師">
            <Segmented label="休假美容師" value={staffId} onChange={setStaffId} options={groomers.map((g) => ({ value: g.id, label: g.displayName }))} />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="日期" htmlFor="to-date">
              <Input id="to-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[170px]" />
            </Field>
            <Segmented<"all" | "part"> label="時段" value={allDay} onChange={setAllDay} options={[{ value: "all", label: "全天" }, { value: "part", label: "部分時段" }]} />
            {allDay === "part" ? (
              <span className="flex items-center gap-2">
                <TimeSelect aria-label="開始" value={from} onChange={setFrom} />–
                <TimeSelect aria-label="結束" value={to} onChange={setTo} />
              </span>
            ) : null}
          </div>
          <Field label="原因" htmlFor="to-reason" optional>
            <Input id="to-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：特休、看診" />
          </Field>
          {add.error ? <ActionError error={add.error} /> : null}
          <Button type="submit" variant="primary" disabled={!staffId} loading={add.isPending} data-testid="add-time-off">
            登記休假
          </Button>
        </form>
      ) : null}
      {affected ? (
        affected.length ? (
          <div role="alert" className="mt-3 border-l-[3px] border-warning bg-warning-tint px-4 py-3" data-testid="affected-appointments">
            <p className="flex items-center gap-2 font-bold text-warning-ink">
              <AlertTriangle className="size-4" aria-hidden />
              {affected.length} 筆預約受影響，預約沒有被取消，請聯絡飼主改期或改派：
            </p>
            <ul className="mt-2 space-y-1 text-[15px]">
              {affected.map((a) => (
                <li key={a.id}>
                  <span className="num">{formatDateShort(a.startsAt)} {hhmm(a.startsAt)}</span> · {a.petName}（{a.customerName}）
                  <a className="ml-2 inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${a.customerPhone}`}><Phone className="size-3.5" aria-hidden /><span className="num">{a.customerPhone}</span></a>
                  <Link className="ml-3 text-primary hover:underline" to={`/app/appointments/${a.id}`}>開啟預約</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-success">沒有預約受到這次休假影響。</p>
        )
      ) : null}
    </section>
  );
}
