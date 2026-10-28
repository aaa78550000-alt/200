import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdapter } from "@/lib/db/context";
import { addDays, taipeiIso } from "@/lib/domain/time";

export const qk = {
  all: ["petos"] as const,
  day: (date: string) => ["petos", "appointments", date] as const,
  range: (from: string, to: string) => ["petos", "appointments", from, to] as const,
  pending: ["petos", "pending"] as const,
  appointment: (id: string) => ["petos", "appointment", id] as const,
  pets: (q: string) => ["petos", "pets", q] as const,
  pet: (id: string) => ["petos", "pet", id] as const,
  session: ["petos", "session"] as const,
  shop: ["petos", "shop"] as const,
  staff: ["petos", "staff"] as const,
  services: ["petos", "services"] as const,
  schedule: ["petos", "schedule"] as const,
};

export function useSession() {
  const a = useAdapter();
  return useQuery({ queryKey: qk.session, queryFn: () => a.getSession() });
}
export function useShop() {
  const a = useAdapter();
  return useQuery({ queryKey: qk.shop, queryFn: () => a.getShop(), staleTime: Infinity });
}
export function useStaff() {
  const a = useAdapter();
  return useQuery({ queryKey: qk.staff, queryFn: () => a.listStaff(), staleTime: 60_000 });
}
export function useServices() {
  const a = useAdapter();
  return useQuery({ queryKey: qk.services, queryFn: () => a.listServices(), staleTime: 60_000 });
}
export function useSchedule() {
  const a = useAdapter();
  return useQuery({ queryKey: qk.schedule, queryFn: () => a.getScheduleContext() });
}
export function useDayAppointments(date: string) {
  const a = useAdapter();
  return useQuery({
    queryKey: qk.day(date),
    queryFn: () => a.listAppointments({ from: taipeiIso(date, "00:00"), to: taipeiIso(addDays(date, 1), "00:00") }),
  });
}
export function useRangeAppointments(from: string, toExclusive: string) {
  const a = useAdapter();
  return useQuery({
    queryKey: qk.range(from, toExclusive),
    queryFn: () => a.listAppointments({ from: taipeiIso(from, "00:00"), to: taipeiIso(toExclusive, "00:00") }),
  });
}
export function usePendingRequests() {
  const a = useAdapter();
  return useQuery({ queryKey: qk.pending, queryFn: () => a.listPendingRequests() });
}
export function useAppointment(id: string | null) {
  const a = useAdapter();
  return useQuery({
    queryKey: qk.appointment(id ?? ""),
    queryFn: () => a.getAppointment(id!),
    enabled: !!id,
    // the LINE worker delivers in the background: keep checking until no message is still queued
    refetchInterval: (query) => (query.state.data?.notifications.some((n) => n.status === "queued") ? 3000 : false),
  });
}
export function usePets(q: string) {
  const a = useAdapter();
  return useQuery({ queryKey: qk.pets(q), queryFn: () => a.searchPets(q), placeholderData: (prev) => prev });
}
export function usePet(id: string) {
  const a = useAdapter();
  return useQuery({ queryKey: qk.pet(id), queryFn: () => a.getPet(id) });
}

/** Every mutation invalidates all PetOS queries so lists, counters and details stay in sync. */
export function usePetosMutation<TVars, TOut>(fn: (vars: TVars) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: qk.all }),
  });
}
