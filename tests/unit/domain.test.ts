import { describe, expect, it } from "vitest";
import { canTransition, can } from "@/lib/domain/status";
import { paymentStatus, totalDue, formatNtd } from "@/lib/domain/money";
import { ageText, taipeiIso, taipeiParts, addDays, dateOf } from "@/lib/domain/time";
import { bookableSlots, findConflicts } from "@/lib/domain/availability";
import { createFixtures, DEMO_NOW } from "@/lib/db/demo/fixtures";
import type { PaymentTransaction } from "@/lib/domain/types";

const pay = (type: "payment" | "refund", amount: number): PaymentTransaction => ({ id: String(Math.random()), appointmentId: "a", type, method: "cash", amount, idempotencyKey: String(Math.random()), note: null, createdAt: DEMO_NOW, createdBy: "t" });

describe("state machine", () => {
  it("allows the happy path only in order", () => {
    expect(canTransition("confirmed", "checked_in")).toBe(true);
    expect(canTransition("in_service", "ready_pickup")).toBe(true);
    expect(canTransition("ready_pickup", "completed")).toBe(true);
    expect(canTransition("confirmed", "in_service")).toBe(false);
    expect(canTransition("in_service", "completed")).toBe(false);
  });
  it("terminal states never go back to service", () => {
    for (const s of ["completed", "cancelled", "no_show"] as const) {
      expect(canTransition(s, "in_service")).toBe(false);
      expect(canTransition(s, "confirmed")).toBe(false);
    }
  });
  it("roles: groomer cannot record money; receptionist cannot authorize unpaid handover", () => {
    expect(can("groomer", "payment.record")).toBe(false);
    expect(can("receptionist", "handover.unpaid_authorize")).toBe(false);
    expect(can("manager", "handover.unpaid_authorize")).toBe(true);
  });
});

describe("money", () => {
  it("only approved items are billable", () => {
    const items = [
      { id: "1", appointmentId: "a", serviceId: "s", name: "x", priceSnapshot: 900, durationSnapshot: 60, approval: "approved" as const },
      { id: "2", appointmentId: "a", serviceId: "n", name: "y", priceSnapshot: 100, durationSnapshot: 10, approval: "pending_owner" as const },
    ];
    expect(totalDue(items)).toBe(900);
  });
  it("derives payment status from the ledger", () => {
    expect(paymentStatus(900, [])).toBe("unpaid");
    expect(paymentStatus(900, [pay("payment", 300)])).toBe("partially_paid");
    expect(paymentStatus(900, [pay("payment", 900)])).toBe("paid");
    expect(paymentStatus(900, [pay("payment", 900), pay("refund", 100)])).toBe("partially_refunded");
    expect(paymentStatus(900, [pay("payment", 900), pay("refund", 900)])).toBe("refunded");
  });
  it("formats NTD with thousands separator", () => expect(formatNtd(1500)).toBe("NT$1,500"));
});

describe("time (Asia/Taipei)", () => {
  it("does not split dates at UTC midnight", () => {
    const iso = taipeiIso("2026-10-29", "07:30"); // 2026-10-28T23:30Z
    expect(iso).toBe("2026-10-28T23:30:00.000Z");
    expect(dateOf(iso)).toBe("2026-10-29");
    expect(taipeiParts(iso).time).toBe("07:30");
  });
  it("addDays crosses month boundary", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
  it("age never shows a fake value", () => {
    expect(ageText(null, false, "2026-10-28")).toBe("年齡未提供");
    expect(ageText("2020-03-12", false, "2026-10-28")).toBe("6 歲");
    expect(ageText("2026-05-01", true, "2026-10-28")).toBe("約 5 個月");
  });
});

describe("availability", () => {
  const db = createFixtures();
  const ctx = { hours: db.hours, breaks: db.breaks, timeOff: db.timeOff, appointments: db.appointments, staff: db.staff };
  const bath = db.services.find((s) => s.id === "svc-bath")!;

  it("detects overlap including buffer", () => {
    // Coco (Amy) 14:00–16:00 + 15 buffer → 16:00 start for Amy conflicts
    const c = findConflicts(ctx, { staffId: "stf-amy", startsAt: taipeiIso("2026-10-28", "16:00"), durationMinutes: 60, bufferMinutes: 15, serviceIds: ["svc-bath"] });
    expect(c.map((x) => x.kind)).toContain("overlap");
  });
  it("cancelled appointments do not occupy time", () => {
    const c = findConflicts(ctx, { staffId: "stf-amy", startsAt: taipeiIso("2026-10-28", "12:30"), durationMinutes: 60, bufferMinutes: 15, serviceIds: ["svc-bath"] });
    expect(c.filter((x) => x.kind === "overlap")).toHaveLength(0);
  });
  it("respects breaks, time off, closed days and qualification", () => {
    expect(findConflicts(ctx, { staffId: "stf-amy", startsAt: taipeiIso("2026-10-29", "12:00"), durationMinutes: 60, bufferMinutes: 0, serviceIds: ["svc-bath"] }).map((x) => x.kind)).toContain("break");
    expect(findConflicts(ctx, { staffId: "stf-amy", startsAt: taipeiIso("2026-10-30", "10:00"), durationMinutes: 60, bufferMinutes: 0, serviceIds: ["svc-bath"] }).map((x) => x.kind)).toContain("time_off");
    expect(findConflicts(ctx, { staffId: "stf-may", startsAt: taipeiIso("2026-11-02", "10:00"), durationMinutes: 60, bufferMinutes: 0, serviceIds: ["svc-bath"] }).map((x) => x.kind)).toContain("closed");
    expect(findConflicts(ctx, { staffId: "stf-may", startsAt: taipeiIso("2026-10-29", "10:00"), durationMinutes: 150, bufferMinutes: 0, serviceIds: ["svc-style"] }).map((x) => x.kind)).toContain("not_qualified");
  });
  it("pending requests never block slots; past/lead-time slots are hidden", () => {
    const slots = bookableSlots(ctx, "2026-10-28", bath, { now: DEMO_NOW });
    expect(slots.every((s) => new Date(s.startsAt) >= new Date(taipeiIso("2026-10-28", "17:10")))).toBe(true);
    const tomorrow = bookableSlots(ctx, "2026-10-29", bath, { now: DEMO_NOW });
    expect(tomorrow.find((s) => s.time === "10:00")).toBeTruthy(); // apt-req-coco2 is pending at 10:00
  });
});
