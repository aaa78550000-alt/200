import { OCCUPYING } from "./status";
import { addMinutes, hmFromMinutes, minutesOf, overlaps, taipeiIso, taipeiParts } from "./time";
import type { Appointment, OperatingHours, Service, Staff, StaffBreak, TimeOff } from "./types";

export interface ScheduleContext {
  hours: OperatingHours[];
  breaks: StaffBreak[];
  timeOff: TimeOff[];
  appointments: Appointment[];
  staff: Staff[];
}

export type Conflict =
  | { kind: "closed"; message: string }
  | { kind: "outside_hours"; message: string }
  | { kind: "break"; message: string }
  | { kind: "time_off"; message: string }
  | { kind: "overlap"; message: string; appointmentId: string }
  | { kind: "not_qualified"; message: string };

/** End of the time the groomer is blocked: service end + buffer. */
export function occupiedUntil(a: Pick<Appointment, "endsAt" | "bufferMinutes">): string {
  return addMinutes(a.endsAt, a.bufferMinutes);
}

export function hoursFor(ctx: ScheduleContext, date: string): OperatingHours | null {
  const wd = taipeiParts(taipeiIso(date, "12:00")).weekday;
  const h = ctx.hours.find((x) => x.weekday === wd);
  return h && h.opens && h.closes ? h : null;
}

/**
 * Checks a candidate booking for one groomer. Front-end hint only —
 * the DB exclusion constraint + app.confirm_appointment() are the final judge.
 */
export function findConflicts(
  ctx: ScheduleContext,
  candidate: { staffId: string; startsAt: string; durationMinutes: number; bufferMinutes: number; serviceIds: string[]; ignoreAppointmentId?: string },
): Conflict[] {
  const out: Conflict[] = [];
  const { date, minutes: startMin } = taipeiParts(candidate.startsAt);
  const endsAt = addMinutes(candidate.startsAt, candidate.durationMinutes);
  const blockEnd = addMinutes(endsAt, candidate.bufferMinutes);
  const endMin = startMin + candidate.durationMinutes;
  const h = hoursFor(ctx, date);
  if (!h) out.push({ kind: "closed", message: "當天店休" });
  else if (startMin < minutesOf(h.opens!) || endMin > minutesOf(h.closes!))
    out.push({ kind: "outside_hours", message: `超出營業時間 ${h.opens}–${h.closes}` });

  const staff = ctx.staff.find((s) => s.id === candidate.staffId);
  const missing = candidate.serviceIds.filter((id) => !staff?.serviceIds.includes(id));
  if (staff && missing.length) out.push({ kind: "not_qualified", message: `${staff.displayName} 未設定可提供此服務` });

  for (const b of ctx.breaks.filter((x) => x.staffId === candidate.staffId)) {
    if (startMin < minutesOf(b.ends) && minutesOf(b.starts) < endMin)
      out.push({ kind: "break", message: `與${b.label} ${b.starts}–${b.ends} 重疊` });
  }
  for (const t of ctx.timeOff.filter((x) => x.staffId === candidate.staffId)) {
    if (overlaps(candidate.startsAt, blockEnd, t.startsAt, t.endsAt)) out.push({ kind: "time_off", message: `美容師休假：${t.reason}` });
  }
  for (const a of ctx.appointments) {
    if (a.id === candidate.ignoreAppointmentId || a.staffId !== candidate.staffId || !OCCUPYING.includes(a.status)) continue;
    if (overlaps(candidate.startsAt, blockEnd, a.startsAt, occupiedUntil(a)))
      out.push({ kind: "overlap", message: `與 ${taipeiParts(a.startsAt).time} 的預約時間重疊（含緩衝）`, appointmentId: a.id });
  }
  return out;
}

export interface Slot {
  time: string; // HH:mm
  startsAt: string;
  staffIds: string[];
}

/** Slots a customer may *request* online. Requests are pending and do not hold the slot. */
export function bookableSlots(
  ctx: ScheduleContext,
  date: string,
  service: Service,
  opts: { now: string; leadMinutes?: number; stepMinutes?: number; staffId?: string | null },
): Slot[] {
  const h = hoursFor(ctx, date);
  if (!h) return [];
  const step = opts.stepMinutes ?? 30;
  const earliest = addMinutes(opts.now, opts.leadMinutes ?? 120);
  const groomers = ctx.staff.filter((s) => s.isGroomer && s.serviceIds.includes(service.id) && (!opts.staffId || s.id === opts.staffId));
  const slots: Slot[] = [];
  for (let m = minutesOf(h.opens!); m + service.durationMinutes <= minutesOf(h.closes!); m += step) {
    const startsAt = taipeiIso(date, hmFromMinutes(m));
    if (new Date(startsAt) < new Date(earliest)) continue;
    const free = groomers.filter(
      (g) =>
        findConflicts(ctx, {
          staffId: g.id,
          startsAt,
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
          serviceIds: [service.id],
        }).length === 0,
    );
    if (free.length) slots.push({ time: hmFromMinutes(m), startsAt, staffIds: free.map((g) => g.id) });
  }
  return slots;
}

/** Confirmed appointments that a newly added time-off now collides with (E06: warn, never silently delete). */
export function appointmentsAffectedByTimeOff(ctx: ScheduleContext, t: TimeOff): Appointment[] {
  return ctx.appointments.filter(
    (a) => a.staffId === t.staffId && (OCCUPYING.includes(a.status) || a.status === "pending") && overlaps(a.startsAt, occupiedUntil(a), t.startsAt, t.endsAt),
  );
}
