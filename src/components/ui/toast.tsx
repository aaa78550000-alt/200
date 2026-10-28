import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

type Toast = { id: number; text: string };
const ToastCtx = createContext<(text: string) => void>(() => {});

/** Only call after the adapter resolved — a toast is evidence of a real backend result. */
export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:items-end">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-control)] bg-ink px-4 py-3 text-[15px] text-white shadow-lg">
            <CheckCircle2 className="size-5 text-[#8fd3c8]" aria-hidden />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
