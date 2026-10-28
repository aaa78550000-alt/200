import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoAdapter, DemoStore } from "@/lib/db/demo/demoAdapter";
import { DomainError } from "@/lib/db/adapter";
import { taipeiIso } from "@/lib/domain/time";

function fresh() {
  localStorage.clear();
  const store = new DemoStore();
  store.settings.latencyMs = 0;
  return createDemoAdapter(store);
}

describe("demo adapter enforces backend rules", () => {
  beforeEach(() => vi.useRealTimers());

  it("E12: same idempotency key records the payment once", async () => {
    const a = fresh();
    await Promise.all([1, 2, 3].map(() => a.recordPayment("apt-lucky", { type: "payment", method: "cash", amount: 650, idempotencyKey: "same-key" })));
    const d = await a.getAppointment("apt-lucky");
    expect(d.payments).toHaveLength(1);
    expect(d.paymentStatus).toBe("paid");
  });

  it("double finish with a stale version is rejected (no duplicate events)", async () => {
    const a = fresh();
    const before = await a.getAppointment("apt-coco-today");
    const rec = { finishedAt: a.now(), outcome: "normal" as const, note: null, incidentNote: null, ownerContact: null };
    await a.finishService(before.id, before.version, rec);
    await expect(a.finishService(before.id, before.version, rec)).rejects.toMatchObject({ code: "VERSION_MISMATCH" });
    const after = await a.getAppointment("apt-coco-today");
    expect(after.events.filter((e) => e.kind === "finish_recorded")).toHaveLength(1);
  });

  it("E05: two confirms into the same slot → at most one succeeds", async () => {
    const a = fresh();
    const s1 = await a.submitBookingRequest({ shopSlug: "calm-studio", serviceId: "svc-bath", startsAt: taipeiIso("2026-10-29", "16:00"), staffId: "stf-may", clientRequestId: "r1", newCustomer: { name: "甲", phone: "0900-000-001", petName: "A", species: "dog" } });
    const s2 = await a.submitBookingRequest({ shopSlug: "calm-studio", serviceId: "svc-bath", startsAt: taipeiIso("2026-10-29", "16:00"), staffId: "stf-may", clientRequestId: "r2", newCustomer: { name: "乙", phone: "0900-000-002", petName: "B", species: "dog" } });
    const results = await Promise.allSettled([a.confirmAppointment(s1.appointmentId, 1), a.confirmAppointment(s2.appointmentId, 1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as DomainError).code).toBe("CONFLICT");
  });

  it("duplicate booking submit (same client request id) creates one request", async () => {
    const a = fresh();
    const input = { shopSlug: "calm-studio", serviceId: "svc-bath", startsAt: taipeiIso("2026-10-29", "16:00"), staffId: null, clientRequestId: "dup", newCustomer: { name: "甲", phone: "0900-000-001", petName: "A", species: "dog" as const } };
    const r1 = await a.submitBookingRequest(input);
    const r2 = await a.submitBookingRequest(input);
    expect(r2.duplicate).toBe(true);
    expect(r2.appointmentId).toBe(r1.appointmentId);
    expect((await a.listPendingRequests()).filter((x) => x.id === r1.appointmentId)).toHaveLength(1);
  });

  it("E18: OTP request answers identically for known and unknown phones", async () => {
    const a = fresh();
    expect(await a.requestOtp("calm-studio", "0912-000-101")).toEqual(await a.requestOtp("calm-studio", "0900-999-999"));
    await expect(a.verifyOtp("calm-studio", "0912-000-101", "000000")).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("booking with a forged token / someone else's pet is refused", async () => {
    const a = fresh();
    await expect(
      a.submitBookingRequest({ shopSlug: "calm-studio", serviceId: "svc-bath", startsAt: taipeiIso("2026-10-29", "16:00"), staffId: null, clientRequestId: "x", verifiedToken: "demo-otp:0912000101", petId: "pet-pudding" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refund cannot exceed what was paid; failed write rolls back", async () => {
    const a = fresh();
    await expect(a.recordPayment("apt-doudou", { type: "refund", method: "cash", amount: 800, idempotencyKey: "r", note: "x" })).rejects.toBeInstanceOf(DomainError);
    const d = await a.getAppointment("apt-doudou");
    expect(d.payments).toHaveLength(1);
  });

  it("offline: mutations fail and nothing changes", async () => {
    const a = fresh();
    a.store.settings.offline = true;
    await expect(a.checkIn("apt-naicha", 1)).rejects.toMatchObject({ code: "OFFLINE" });
    a.store.settings.offline = false;
    expect((await a.getAppointment("apt-naicha")).status).toBe("confirmed");
  });

  it("E07: reschedule keeps the id, bumps the version and records history", async () => {
    const a = fresh();
    const r = await a.rescheduleAppointment("apt-toast", 1, taipeiIso("2026-10-29", "16:00"), "stf-amy");
    expect(r.id).toBe("apt-toast");
    expect(r.version).toBe(2);
    expect((await a.getAppointment("apt-toast")).events.some((e) => e.kind === "rescheduled")).toBe(true);
  });
});
