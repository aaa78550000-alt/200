import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation, usePets, useSchedule, useServices, useStaff } from "@/lib/hooks/queries";
import { findConflicts } from "@/lib/domain/availability";
import { formatNtd } from "@/lib/domain/money";
import { taipeiIso } from "@/lib/domain/time";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { WeightLine } from "@/components/pet/WeightLine";
import { cn } from "@/lib/cn";

export interface NewAppointmentPreset {
  petId?: string;
  staffId?: string;
  date: string;
  time?: string;
}

/**
 * Staff-created booking (F02): search owner/pet → service → groomer & time → server-side capacity check → confirmed.
 * Returning customers: picking the pet pre-fills owner and the pet's usual duration hint.
 */
export function NewAppointmentSheet({ open, onOpenChange, preset, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; preset: NewAppointmentPreset; onCreated?: (id: string) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="新增預約" description="店員建立的預約會直接確認，並由系統檢查時段">
      {open ? <NewAppointmentForm key={JSON.stringify(preset)} preset={preset} onCreated={(id) => { onOpenChange(false); onCreated?.(id); }} /> : null}
    </Sheet>
  );
}

function NewAppointmentForm({ preset, onCreated }: { preset: NewAppointmentPreset; onCreated: (id: string) => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [petId, setPetId] = useState<string | null>(preset.petId ?? null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(preset.staffId ?? null);
  const [date, setDate] = useState(preset.date);
  const [time, setTime] = useState(preset.time ?? "");
  const [requestId] = useState(() => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())));
  const pets = usePets(query);
  const { data: services } = useServices();
  const { data: staff } = useStaff();
  const { data: ctx } = useSchedule();
  const pet = pets.data?.find((p) => p.id === petId);
  const main = services?.filter((s) => !s.isAddon && (!pet || s.species.includes(pet.species))) ?? [];
  const addonList = services?.filter((s) => s.isAddon) ?? [];
  const chosen = [serviceId, ...addons].filter(Boolean) as string[];
  const chosenSvcs = chosen.map((id) => services?.find((s) => s.id === id)).filter(Boolean) as NonNullable<typeof services>;
  const duration = chosenSvcs.reduce((s, x) => s + x.durationMinutes, 0);
  const total = chosenSvcs.reduce((s, x) => s + x.basePrice, 0);
  const validTime = /^\d{2}:\d{2}$/.test(time);
  const startsAt = validTime ? taipeiIso(date, time) : null;
  const conflicts = useMemo(() => {
    if (!ctx || !staffId || !startsAt || !chosenSvcs.length) return [];
    return findConflicts(ctx, { staffId, startsAt, durationMinutes: duration, bufferMinutes: Math.max(...chosenSvcs.map((s) => s.bufferMinutes)), serviceIds: chosen });
  }, [ctx, staffId, startsAt, duration, chosen.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = usePetosMutation(() => adapter.createAppointment({ petId: petId!, staffId: staffId!, startsAt: startsAt!, serviceIds: chosen, clientRequestId: requestId }));
  const ready = petId && serviceId && staffId && startsAt;

  return (
    <form
      data-testid="new-appointment-form"
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        create.mutate(undefined, { onSuccess: (a) => { toast("預約已建立並確認"); onCreated(a.id); } });
      }}
    >
      <Field label="毛孩">
        {pet ? (
          <div className="flex items-center gap-3 border border-primary/40 bg-primary-tint/40 p-2">
            <PetAvatar src={pet.photoUrl} name={pet.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {pet.name} <span className="text-sm font-normal text-muted">{pet.breed ?? "品種未填"} · {pet.customer.name}</span>
              </p>
              <p className="text-sm text-muted">
                <WeightLine weight={pet.latestWeight} />
                {pet.estimatedMinutes ? ` · 常用約 ${pet.estimatedMinutes} 分` : ""}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPetId(null)}>
              更換
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input autoFocus aria-label="搜尋毛孩、飼主或電話" placeholder="名字、品種、飼主或電話" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
            </div>
            <ul className="max-h-64 divide-y divide-rule overflow-y-auto border-y border-rule">
              {pets.data?.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setPetId(p.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-ink/[0.03]">
                    <PetAvatar src={p.photoUrl} name={p.name} size={40} />
                    <span className="min-w-0">
                      <span className="block font-semibold">{p.name} <span className="text-sm font-normal text-muted">{p.breed ?? "品種未填"}</span></span>
                      <span className="block text-sm text-muted">{p.customer.name} · <span className="num">{p.customer.phone}</span></span>
                    </span>
                  </button>
                </li>
              ))}
              {pets.data && !pets.data.length ? <li className="py-4 text-center text-sm text-muted">找不到符合的毛孩</li> : null}
            </ul>
          </div>
        )}
      </Field>

      <Field label="服務">
        <Segmented label="服務" value={serviceId} onChange={setServiceId} options={main.map((s) => ({ value: s.id, label: <span>{s.name} <span className="num text-sm text-muted">{formatNtd(s.basePrice)}</span></span> }))} />
      </Field>
      <Field label="加購" optional hint="店員建立時已與飼主確認的加購">
        <div className="flex flex-wrap gap-2">
          {addonList.map((s) => {
            const on = addons.includes(s.id);
            return (
              <label key={s.id} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[15px]", on ? "border-primary bg-primary-tint text-primary" : "border-border")}>
                <input type="checkbox" className="accent-[var(--primary)]" checked={on} onChange={() => setAddons((x) => (on ? x.filter((y) => y !== s.id) : [...x, s.id]))} />
                {s.name} <span className="num text-sm">{formatNtd(s.basePrice)}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <Field label="美容師">
        <Segmented label="美容師" value={staffId} onChange={setStaffId} options={(staff ?? []).filter((s) => s.isGroomer).map((g) => ({ value: g.id, label: g.displayName }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="日期" htmlFor="na-date">
          <Input id="na-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="開始時間" htmlFor="na-time">
          <Input id="na-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className="num" />
        </Field>
      </div>

      {chosenSvcs.length ? (
        <p className="text-[15px]">
          預估 <span className="num font-semibold">{duration}</span> 分鐘 · <span className="num font-semibold">{formatNtd(total)}</span>
          <span className="text-muted">（實際金額依現場確認）</span>
        </p>
      ) : null}
      {conflicts.length ? (
        <ul className="space-y-1 border-l-[3px] border-warning bg-warning-tint/60 px-3 py-2 text-sm text-warning-ink" data-testid="conflict-hint">
          {conflicts.map((c) => <li key={c.message}>{c.message}</li>)}
        </ul>
      ) : null}
      {create.error ? <ActionError error={create.error} /> : null}
      <Button type="submit" variant="primary" size="lg" block disabled={!ready} loading={create.isPending} data-testid="create-appointment">
        {ready ? "建立預約" : "請選擇毛孩、服務、美容師與時間"}
      </Button>
    </form>
  );
}
