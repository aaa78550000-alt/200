import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EMBEDDED } from "@/lib/env";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, MapPin, Phone } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { DomainError } from "@/lib/db/adapter";
import { formatNtd } from "@/lib/domain/money";
import { addDays, dateOf, formatDateLong, taipeiIso, taipeiParts, weekdayLabel } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Textarea } from "@/components/ui/field";
import { ActionError, ErrorState, Skeleton } from "@/components/ui/states";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { DemoBar } from "@/features/demo/DemoBar";
import { Wordmark } from "@/app/AppShell";
import { cn } from "@/lib/cn";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["服務", "時段", "毛孩與聯絡", "確認"] as const;

interface Draft {
  step: Step;
  serviceId: string | null;
  date: string | null;
  startsAt: string | null;
  staffId: string | null; // null = 不指定
  identity: "returning" | "new";
  phone: string;
  name: string;
  petName: string;
  species: "dog" | "cat";
  breed: string;
  weight: string;
  note: string;
  petId: string | null;
  agreed: boolean;
  requestId: string;
}

const DRAFT_KEY = (slug: string) => `petos-booking-draft:${slug}`;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `r-${Date.now()}`);
const blank = (): Draft => ({ step: 1, serviceId: null, date: null, startsAt: null, staffId: null, identity: "new", phone: "", name: "", petName: "", species: "dog", breed: "", weight: "", note: "", petId: null, agreed: false, requestId: newId() });

function loadDraft(slug: string): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY(slug));
    return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch {
    return blank();
  }
}

export function BookingPage() {
  const { shopSlug = "" } = useParams();
  const adapter = useAdapter();
  const info = useQuery({ queryKey: ["public", shopSlug], queryFn: () => adapter.getPublicBooking(shopSlug) });
  const [d, setD] = useState<Draft>(() => loadDraft(shopSlug));
  const [verified, setVerified] = useState<null | { token: string; customerName: string; pets: { id: string; name: string; breed: string | null; photoUrl: string | null }[] }>(null);
  const [result, setResult] = useState<null | { duplicate: boolean; appointmentId: string; requestId: string }>(null);
  const [slotTaken, setSlotTaken] = useState<string | null>(null);
  const today = dateOf(adapter.now());
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY(shopSlug), JSON.stringify(d));
    } catch {
      /* draft persistence is best-effort */
    }
  }, [d, shopSlug]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [d.step, result]);

  const service = info.data?.services.find((s) => s.id === d.serviceId) ?? null;
  const staffName = d.staffId ? info.data?.groomers.find((g) => g.id === d.staffId)?.displayName : "不指定";

  const submit = useMutation({
    mutationFn: () =>
      adapter.submitBookingRequest({
        shopSlug,
        serviceId: d.serviceId!,
        startsAt: d.startsAt!,
        staffId: d.staffId,
        clientRequestId: d.requestId,
        note: d.note,
        ...(d.identity === "returning" && verified?.pets.length
          ? { verifiedToken: verified.token, petId: d.petId! }
          : { newCustomer: { name: d.name, phone: d.phone, petName: d.petName, species: d.species, breed: d.breed, weightKg: d.weight ? Number(d.weight) : null } }),
      }),
    onSuccess: (r) => {
      setResult({ duplicate: r.duplicate, appointmentId: r.appointmentId, requestId: d.requestId });
      try {
        sessionStorage.removeItem(DRAFT_KEY(shopSlug));
      } catch {
        /* ignore */
      }
    },
    onError: (e) => {
      if (e instanceof DomainError && e.code === "SLOT_TAKEN") {
        setSlotTaken(e.message);
        set({ step: 2, startsAt: null, agreed: false });
      }
    },
  });

  const phoneOk = /^09\d{2}-?\d{3}-?\d{3}$/.test(d.phone);
  const step3Valid =
    d.identity === "returning" && verified?.pets.length
      ? !!d.petId
      : d.name.trim() && phoneOk && d.petName.trim() && (!d.weight || Number(d.weight) > 0);
  const canNext = d.step === 1 ? !!d.serviceId : d.step === 2 ? !!d.startsAt : d.step === 3 ? !!step3Valid : d.agreed;
  const blockedHint = d.step === 1 ? "請先選擇一項服務" : d.step === 2 ? "請選擇日期與時段" : d.step === 3 ? "請完成必填資料" : "請閱讀並勾選同意預約須知";

  if (info.isLoading)
    return (
      <div className="mx-auto max-w-[560px] space-y-3 px-4 pt-8">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (info.error || !info.data)
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-8">
        <ErrorState error={info.error} onRetry={() => info.refetch()} />
      </div>
    );
  const shop = info.data.shop;

  const summary = (
    <dl className="space-y-2 text-[15px]">
      <div className="flex justify-between gap-3">
        <dt className="text-muted">服務</dt>
        <dd className="text-right">{service ? service.name : <span className="text-muted">未選擇</span>}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted">時段</dt>
        <dd className="num text-right">{d.startsAt ? `${formatDateLong(dateOf(d.startsAt))} ${taipeiParts(d.startsAt).time}` : <span className="text-muted">未選擇</span>}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted">美容師</dt>
        <dd>{staffName}</dd>
      </div>
      {service ? (
        <div className="flex justify-between gap-3 border-t border-rule pt-2">
          <dt className="text-muted">預估費用</dt>
          <dd className="text-right">
            <span className="num text-lg font-bold">{formatNtd(service.basePrice)}</span>
            {service.priceIsFrom ? " 起" : ""}
            <span className="block text-xs text-muted">依毛量與現場評估，店家確認時說明</span>
          </dd>
        </div>
      ) : null}
    </dl>
  );

  if (result)
    return (
      <div className="min-h-dvh bg-canvas">
        <DemoBar />
        <main className="mx-auto max-w-[560px] px-4 pb-16 pt-10" data-testid="booking-result">
          <div className="grid size-12 place-items-center rounded-full bg-warning-tint text-warning-ink">
            <Clock className="size-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-bold leading-8">已收到申請，等待店家確認</h1>
          <p className="mt-2 text-[15px] text-ink/85">
            這是<strong>預約申請</strong>，時段尚未保留。{shop.name}確認後會通知你；若時段無法安排，店家會與你另約時間。
          </p>
          <LineLinkCard slug={shopSlug} appointmentId={result.appointmentId} requestId={result.requestId} />
          {result.duplicate ? <p className="mt-2 text-sm text-muted">（這份申請先前已送出過，沒有重複建立。）</p> : null}
          <div className="mt-6 border-y border-rule py-4">{summary}</div>
          <p className="mt-4 text-sm text-muted">
            有問題請來電 <a className="num text-primary" href={`tel:${shop.phone}`}>{shop.phone}</a>
          </p>
          <Button className="mt-6" variant="secondary" onClick={() => { setResult(null); setVerified(null); setD(blank()); }}>
            再申請一筆
          </Button>
        </main>
      </div>
    );

  return (
    <div className="min-h-dvh bg-canvas">
      <DemoBar />
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-[1040px] px-4 py-4 lg:px-8 lg:py-6">
          {EMBEDDED ? (
            <Link to="/app/today" className="mb-2 inline-flex min-h-9 items-center text-sm text-primary hover:underline">
              ← 回到店家後台（這是飼主看到的畫面）
            </Link>
          ) : null}
          <p className="text-xl font-bold leading-7 lg:text-2xl">{shop.name}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{shop.address}</span>
            <a href={`tel:${shop.phone}`} className="inline-flex items-center gap-1"><Phone className="size-3.5" aria-hidden /><span className="num">{shop.phone}</span></a>
          </p>
          <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="預約步驟">
            {STEPS.map((label, i) => {
              const n = (i + 1) as Step;
              const state = n < d.step ? "done" : n === d.step ? "current" : "todo";
              return (
                <li key={label} aria-current={state === "current" ? "step" : undefined}>
                  <div className={cn("h-1 rounded-full", state === "todo" ? "bg-ink/10" : "bg-primary")} />
                  <p className={cn("mt-1.5 flex items-center gap-1 text-[13px] leading-4", state === "current" ? "font-bold text-ink" : state === "done" ? "text-primary" : "text-muted")}>
                    {state === "done" ? <Check className="size-3.5" aria-hidden /> : <span className="num">{n}</span>}
                    <span className="truncate">{label}</span>
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <div className="mx-auto max-w-[1040px] px-4 pb-40 pt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12 lg:px-8 lg:pb-16 lg:pt-8">
        <main className="min-w-0 max-w-[640px]">
          {d.step > 1 ? (
            <button type="button" onClick={() => set({ step: (d.step - 1) as Step })} className="-ml-2 mb-2 inline-flex h-11 items-center gap-1 px-2 text-[15px] text-muted hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden />
              上一步
            </button>
          ) : null}

          {d.step === 1 ? (
            <section aria-labelledby="s1">
              <h1 id="s1" className="text-2xl font-bold leading-8">想預約什麼服務？</h1>
              <div role="radiogroup" aria-label="服務" className="mt-4 divide-y divide-rule border-y border-rule">
                {info.data.services.map((s) => {
                  const on = d.serviceId === s.id;
                  return (
                    <label key={s.id} className={cn("flex cursor-pointer items-start gap-3 px-1 py-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary", on && "bg-primary-tint/60")}>
                      <input type="radio" name="service" className="sr-only" checked={on} onChange={() => set({ serviceId: s.id, startsAt: null })} />
                      <span aria-hidden className={cn("mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-primary" : "border-ink/30")}>
                        {on ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[17px] font-bold">{s.name}</span>
                          <span className="whitespace-nowrap"><span className="num text-[17px] font-bold">{formatNtd(s.basePrice)}</span>{s.priceIsFrom ? <span className="text-sm text-muted"> 起</span> : null}</span>
                        </span>
                        <span className="mt-0.5 block text-[15px] text-muted">{s.description}</span>
                        <span className="mt-1 block text-sm text-muted">約 <span className="num">{s.durationMinutes}</span> 分鐘{s.species.includes("cat") && !s.species.includes("dog") ? " · 貓咪專用" : ""}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ) : null}

          {d.step === 2 && service ? (
            <SlotStep shopSlug={shopSlug} today={today} draft={d} set={set} groomers={info.data.groomers} closedWeekdays={info.data.closedWeekdays} serviceId={service.id} slotTaken={slotTaken} clearTaken={() => setSlotTaken(null)} />
          ) : null}

          {d.step === 3 ? <IdentityStep shopSlug={shopSlug} draft={d} set={set} verified={verified} setVerified={setVerified} speciesAllowed={service?.species ?? ["dog"]} verification={info.data.returningVerification} /> : null}

          {d.step === 4 ? (
            <section aria-labelledby="s4">
              <h1 id="s4" className="text-2xl font-bold leading-8">確認申請內容</h1>
              <div className="mt-4 border-y border-rule py-4 lg:hidden">{summary}</div>
              <dl className="mt-4 space-y-2 text-[15px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">毛孩</dt>
                  <dd>{d.identity === "returning" && verified?.pets.length ? verified.pets.find((p) => p.id === d.petId)?.name : d.petName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">聯絡人</dt>
                  <dd>{d.identity === "returning" && verified?.customerName ? verified.customerName : d.name} · <span className="num">{d.phone}</span></dd>
                </div>
                {d.note ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">備註</dt>
                    <dd className="text-right">{d.note}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-5 bg-warning-tint/70 px-4 py-3 text-[15px]">
                <p className="font-bold text-warning-ink">預約須知</p>
                <p className="mt-1 text-ink/85">{shop.bookingNotice}</p>
              </div>
              <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={d.agreed} onChange={(e) => set({ agreed: e.target.checked })} data-testid="agree" />
                我已閱讀預約須知，了解送出後需等待店家確認
              </label>
              {submit.error && !(submit.error instanceof DomainError && submit.error.code === "SLOT_TAKEN") ? (
                <div className="mt-3"><ActionError error={submit.error} /></div>
              ) : null}
            </section>
          ) : null}
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-8 border border-rule bg-surface p-5">
            <p className="mb-3 font-bold">你的申請</p>
            {summary}
            <Button variant="primary" size="lg" block className="mt-5" disabled={!canNext} loading={submit.isPending} onClick={() => (d.step === 4 ? submit.mutate() : set({ step: (d.step + 1) as Step }))}>
              {d.step === 4 ? "送出預約申請" : "下一步"}
            </Button>
            {!canNext ? <p className="mt-2 text-center text-sm text-muted">{blockedHint}</p> : null}
          </div>
        </aside>
      </div>
      <footer className="mx-auto hidden max-w-[1040px] px-8 pb-10 text-sm text-muted lg:block">
        <Wordmark className="text-sm text-muted" /> 提供預約服務
      </footer>

      {/* Mobile: one fixed primary action above the safe area */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface px-4 pt-3 pb-safe lg:hidden">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="truncate text-muted">{service ? service.name : "尚未選擇服務"}{d.startsAt ? ` · ${taipeiParts(d.startsAt).time}` : ""}</span>
          {service ? <span className="num shrink-0 font-semibold">{formatNtd(service.basePrice)}{service.priceIsFrom ? " 起" : ""}</span> : null}
        </div>
        <Button variant="primary" size="lg" block disabled={!canNext} loading={submit.isPending} onClick={() => (d.step === 4 ? submit.mutate() : set({ step: (d.step + 1) as Step }))} data-testid="booking-next">
          {d.step === 4 ? "送出預約申請" : canNext ? "下一步" : blockedHint}
        </Button>
      </div>
    </div>
  );
}

function SlotStep({ shopSlug, today, draft: d, set, groomers, closedWeekdays, serviceId, slotTaken, clearTaken }: { shopSlug: string; today: string; draft: Draft; set: (p: Partial<Draft>) => void; groomers: { id: string; displayName: string }[]; closedWeekdays: number[]; serviceId: string; slotTaken: string | null; clearTaken: () => void }) {
  const adapter = useAdapter();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const date = d.date ?? today;
  const slots = useQuery({ queryKey: ["public", shopSlug, "slots", date, serviceId, d.staffId], queryFn: () => adapter.getPublicSlots(shopSlug, date, serviceId, d.staffId) });
  const groups = [
    { label: "上午", from: 0, to: 12 * 60 },
    { label: "下午", from: 12 * 60, to: 17 * 60 },
    { label: "傍晚", from: 17 * 60, to: 24 * 60 },
  ];
  return (
    <section aria-labelledby="s2">
      <h1 id="s2" className="text-2xl font-bold leading-8">選擇想申請的時段</h1>
      <p className="mt-1 text-[15px] text-muted">只顯示目前可以安排的時段；送出後由店家確認。</p>
      {slotTaken ? (
        <div role="alert" className="mt-3 border-l-[3px] border-danger bg-danger-tint px-3 py-2.5 text-[15px]" data-testid="slot-taken">
          {slotTaken}
          <button type="button" className="ml-2 text-sm text-muted underline" onClick={clearTaken}>知道了</button>
        </div>
      ) : null}
      <div className="mt-4">
        <Segmented label="美容師" value={d.staffId ?? "any"} onChange={(v) => set({ staffId: v === "any" ? null : v, startsAt: null })} options={[{ value: "any", label: "不指定" }, ...groomers.map((g) => ({ value: g.id, label: g.displayName }))]} />
      </div>
      <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="日期">
        {days.map((day) => {
          const closed = closedWeekdays.includes(taipeiParts(taipeiIso(day, "12:00")).weekday);
          return (
            <button key={day} role="tab" aria-selected={day === date} disabled={closed} aria-label={closed ? `${formatDateLong(day)} 店休` : undefined} onClick={() => set({ date: day, startsAt: null })} className={cn("flex h-16 min-w-[52px] flex-col items-center justify-center rounded-[var(--radius-control)] border", day === date ? "border-ink bg-ink text-white" : closed ? "hatch border-border text-muted" : "border-border bg-surface")}>
              <span className="text-xs">{day === today ? "今天" : weekdayLabel(day).slice(1)}</span>
              <span className="num text-[17px] font-bold leading-6">{Number(day.slice(8))}</span>
              <span className={cn("text-[11px] leading-3", day === date ? "text-white/70" : "text-muted")}>{closed ? "店休" : `${Number(day.slice(5, 7))}月`}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5" data-testid="slot-list">
        {slots.isLoading ? (
          <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : slots.error ? (
          <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
        ) : !slots.data?.length ? (
          <p className="border-y border-dashed border-border py-8 text-center text-[15px] text-muted">{formatDateLong(date)} 沒有可申請的時段，請選其他日期{d.staffId ? "或改為不指定美容師" : ""}。</p>
        ) : (
          groups.map((g) => {
            const list = slots.data!.filter((s) => {
              const m = taipeiParts(s.startsAt).minutes;
              return m >= g.from && m < g.to;
            });
            if (!list.length) return null;
            return (
              <div key={g.label} className="mb-4">
                <p className="mb-2 text-sm font-medium text-muted">{g.label}</p>
                <div role="radiogroup" aria-label={`${g.label}時段`} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {list.map((s) => {
                    const on = d.startsAt === s.startsAt;
                    return (
                      <button key={s.time} role="radio" aria-checked={on} onClick={() => set({ startsAt: taipeiIso(date, s.time), date })} className={cn("num h-11 rounded-[var(--radius-control)] border text-[15px] font-medium", on ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary/60")}>
                        {s.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function IdentityStep({ shopSlug, draft: d, set, verified, setVerified, speciesAllowed, verification }: { verification: "line" | "demo" | "none"; shopSlug: string; draft: Draft; set: (p: Partial<Draft>) => void; verified: { token: string; customerName: string; pets: { id: string; name: string; breed: string | null; photoUrl: string | null }[] } | null; setVerified: (v: { token: string; customerName: string; pets: { id: string; name: string; breed: string | null; photoUrl: string | null }[] } | null) => void; speciesAllowed: ("dog" | "cat" | "other")[] }) {
  const adapter = useAdapter();
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const otp = useMutation({ mutationFn: () => adapter.requestOtp(shopSlug, d.phone) });
  const verify = useMutation({ mutationFn: () => adapter.verifyOtp(shopSlug, d.phone, code), onSuccess: (v) => { setVerified(v); set({ petId: v.pets[0]?.id ?? null, ...(v.pets.length ? {} : { identity: "new" as const }) }); } });
  const phoneOk = /^09\d{2}-?\d{3}-?\d{3}$/.test(d.phone);
  const species = speciesAllowed.filter((s) => s !== "other") as ("dog" | "cat")[];
  useEffect(() => {
    if (!species.includes(d.species)) set({ species: species[0] ?? "dog" });
  }, [species.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby="s3">
      <h1 id="s3" className="text-2xl font-bold leading-8">毛孩與聯絡資料</h1>
      <div className="mt-4">
        <Segmented<"new" | "returning"> label="是否來過" value={d.identity} onChange={(v) => { set({ identity: v }); setVerified(null); otp.reset(); verify.reset(); }} options={verification === "none" ? [{ value: "new", label: "填寫資料" }] : [{ value: "new", label: "第一次來" }, { value: "returning", label: verification === "line" ? "我來過（LINE 驗證）" : "我來過（手機驗證）" }]} />
      </div>

      {d.identity === "returning" ? (
        <div className="mt-5 space-y-4">
          {!verified ? (
            <>
              <p className="text-[15px] text-muted">為保護個資，需先用手機驗證，才會帶出你的毛孩資料。</p>
              <Field label="手機號碼" htmlFor="ret-phone">
                <div className="flex gap-2">
                  <Input id="ret-phone" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0912-345-678" className="num" />
                  <Button type="button" disabled={!phoneOk} loading={otp.isPending} onClick={() => otp.mutate()}>
                    {otp.isSuccess ? "重新傳送" : "傳送驗證碼"}
                  </Button>
                </div>
              </Field>
              {otp.isSuccess ? (
                <Field label="驗證碼" htmlFor="otp" hint={otp.data.demoCode ? `DEMO：驗證碼固定為 ${otp.data.demoCode}` : "若這支手機已綁定店家 LINE，驗證碼已傳到你的 LINE（10 分鐘內有效）"}>
                  <div className="flex gap-2">
                    <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="num tracking-[0.3em]" />
                    <Button type="button" variant="primary" disabled={code.length !== 6} loading={verify.isPending} onClick={() => verify.mutate()}>
                      驗證
                    </Button>
                  </div>
                </Field>
              ) : null}
              {otp.error || verify.error ? <ActionError error={otp.error ?? verify.error} /> : null}
            </>
          ) : verified.pets.length ? (
            <div>
              <p className="text-[15px]">{verified.customerName} 你好，這次要帶哪一位？</p>
              <div role="radiogroup" aria-label="選擇毛孩" className="mt-3 divide-y divide-rule border-y border-rule">
                {verified.pets.map((p) => (
                  <label key={p.id} className={cn("flex cursor-pointer items-center gap-3 px-1 py-3", d.petId === p.id && "bg-primary-tint/60")}>
                    <input type="radio" name="pet" className="size-5 accent-[var(--primary)]" checked={d.petId === p.id} onChange={() => set({ petId: p.id })} />
                    <PetAvatar src={p.photoUrl} name={p.name} size={52} />
                    <span>
                      <span className="block text-[17px] font-bold">{p.name}</span>
                      <span className="block text-sm text-muted">{p.breed ?? "品種未填"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="border-l-[3px] border-warning pl-3 text-[15px]">驗證成功，但這支手機還沒有毛孩資料，請改用「第一次來」填寫。</p>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="怎麼稱呼你" htmlFor="nm" error={touched && !d.name.trim() ? "請填寫稱呼" : null}>
              <Input id="nm" autoComplete="name" value={d.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => setTouched(true)} placeholder="例：王小姐" />
            </Field>
            <Field label="手機號碼" htmlFor="ph" error={touched && d.phone && !phoneOk ? "請輸入 09 開頭的 10 碼手機" : null}>
              <Input id="ph" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} className="num" placeholder="0912-345-678" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="毛孩名字" htmlFor="pn">
              <Input id="pn" value={d.petName} onChange={(e) => set({ petName: e.target.value })} placeholder="例：Coco" />
            </Field>
            <Field label="種類">
              <Segmented<"dog" | "cat"> label="種類" value={d.species} onChange={(v) => set({ species: v })} options={species.map((s) => ({ value: s, label: s === "dog" ? "狗狗" : "貓咪" }))} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="品種" htmlFor="br" optional>
              <Input id="br" value={d.breed} onChange={(e) => set({ breed: e.target.value })} placeholder="不確定可空白" />
            </Field>
            <Field label="體重（kg）" htmlFor="wt" optional hint="不確定可空白，到店會量">
              <Input id="wt" inputMode="decimal" value={d.weight} onChange={(e) => set({ weight: e.target.value.replace(/[^\d.]/g, "") })} className="num" />
            </Field>
          </div>
        </div>
      )}
      <div className="mt-5">
        <Field label="想告訴店家的事" htmlFor="nt" optional>
          <Textarea id="nt" value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="例：怕吹風機、皮膚比較敏感" className="min-h-20" />
        </Field>
      </div>
    </section>
  );
}

/** After a request: offer the customer the shop's LINE account + one-time code so confirmations reach them. */
function LineLinkCard({ slug, appointmentId, requestId }: { slug: string; appointmentId: string; requestId: string }) {
  const adapter = useAdapter();
  const q = useQuery({ queryKey: ["public", slug, "link", appointmentId], queryFn: () => adapter.getPublicLinkCode(slug, appointmentId, requestId), retry: false });
  if (!q.data?.available) return null;
  if (q.data.linked) return <p className="mt-4 text-[15px] text-success-ink">你的 LINE 已綁定，確認通知會傳到 LINE。</p>;
  return (
    <div className="mt-5 border-l-[3px] border-primary bg-primary-tint/60 px-4 py-3" data-testid="booking-line-code">
      <p className="text-[15px]">想用 LINE 收到確認與接回通知？請加入 <span className="font-semibold">{q.data.basicId}</span> 好友，並傳送綁定碼：</p>
      <p className="num mt-1 text-3xl font-bold tracking-[0.2em]">{q.data.code}</p>
      <p className="mt-1 text-sm text-muted">7 天內有效。之後預約可用「我來過（LINE 驗證）」快速帶入毛孩資料。</p>
    </div>
  );
}
