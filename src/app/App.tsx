import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdapterContext } from "@/lib/db/context";
import { createAdapter } from "@/lib/db";
import type { DataAdapter } from "@/lib/db/adapter";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "./AppShell";
import { TodayPage } from "@/features/today/TodayPage";
import { PetListPage } from "@/features/pets/PetListPage";
import { PetProfilePage } from "@/features/pets/PetProfilePage";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { AppointmentPage } from "@/features/appointments/AppointmentPage";
import { BookingPage } from "@/features/booking/BookingPage";
import { MorePage } from "@/features/more/MorePage";
import { LoginPage } from "@/features/auth/LoginPage";

// networkMode "always": TanStack Query would otherwise PAUSE mutations while offline and replay them silently
// when the connection returns (e.g. a payment recorded minutes later). Offline attempts must fail visibly (E17).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000, networkMode: "always" },
    mutations: { retry: false, networkMode: "always" },
  },
});

export function App() {
  const [adapter, setAdapter] = useState<DataAdapter | null>(null);
  useEffect(() => {
    let unsub: (() => void)[] = [];
    createAdapter().then((a) => {
      // Changes made outside a mutation (e.g. the mock LINE worker) must refresh the UI.
      const store = (a as DataAdapter & { store?: { subscribe(l: () => void): () => boolean } }).store;
      const refresh = () => void queryClient.invalidateQueries();
      unsub = [store?.subscribe(refresh), a.subscribe?.(refresh)].filter(Boolean).map((u) => () => void u!());
      setAdapter(a);
    });
    return () => unsub.forEach((u) => u());
  }, []);
  if (!adapter) return null;
  return (
    <AdapterContext.Provider value={adapter}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/app/today" replace />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<Navigate to="today" replace />} />
                <Route path="today" element={<TodayPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="pets" element={<PetListPage />} />
                <Route path="pets/:id" element={<PetProfilePage />} />
                <Route path="appointments/:id" element={<AppointmentPage />} />
                <Route path="more" element={<MorePage />} />
              </Route>
              <Route path="/book/:shopSlug" element={<BookingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="*" element={<Navigate to="/app/today" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </AdapterContext.Provider>
  );
}
