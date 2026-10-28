import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import type { DemoStore } from "@/lib/db/demo/demoAdapter";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { ROLE_LABEL } from "@/lib/domain/status";
import { formatDateShort, hhmm } from "@/lib/domain/time";
import type { Role } from "@/lib/domain/types";
import { cn } from "@/lib/cn";

function useDemoStore(): DemoStore | null {
  const a = useAdapter() as ReturnType<typeof useAdapter> & { store?: DemoStore };
  return a.store ?? null;
}

function Toggle({ label, hint, checked, onChange, testId }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-rule py-2">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <input data-testid={testId} type="checkbox" className="size-5 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Always-visible DEMO marker (M0). Hidden in supabase mode. */
export function DemoBar() {
  const store = useDemoStore();
  const adapter = useAdapter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // Re-render on settings changes and on demo-clock ticks (each mutation advances the clock).
  useSyncExternalStore(
    (l) => (store ? store.subscribe(l) : () => {}),
    () => (store ? `${JSON.stringify(store.settings)}|${store.db.clockOffsetMin}` : ""),
  );
  const settings = store?.settings;
  // Full-height layouts subtract this bar's height.
  useEffect(() => {
    if (!store) return;
    document.documentElement.style.setProperty("--topbar", "36px");
    return () => {
      document.documentElement.style.removeProperty("--topbar");
    };
  }, [store]);
  if (!store || !settings) return null;
  const now = adapter.now();
  const set = (patch: Parameters<DemoStore["update"]>[0]) => {
    store.update(patch);
    qc.invalidateQueries({ queryKey: ["petos"] });
  };
  return (
    <>
      <div className={cn("flex h-9 items-center justify-between gap-3 border-b px-4 text-[13px] lg:px-8", settings.offline ? "border-danger/30 bg-danger-tint text-danger" : "border-warning/40 bg-warning-tint text-warning-ink")}>
        <p className="min-w-0 truncate">
          <span className="font-bold tracking-wide">DEMO</span>
          <span className="mx-1.5">·</span>
          {settings.offline ? "模擬離線中" : <><span className="hidden sm:inline">虛構資料 · 固定時間 </span><span className="num">{formatDateShort(now)} {hhmm(now)}</span></>}
          <span className="hidden sm:inline"> · 角色：{ROLE_LABEL[settings.role]}</span>
        </p>
        <button type="button" onClick={() => setOpen(true)} className="-mr-2 inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap px-2 font-medium underline-offset-2 hover:underline" data-testid="demo-tools">
          <FlaskConical className="size-3.5" aria-hidden />
          Demo 工具
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen} title="Demo 工具" description="只影響這個瀏覽器中的虛構資料">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">目前角色（權限展示）</p>
            <Segmented<Role>
              label="目前角色"
              value={settings.role}
              onChange={(role) => set({ role })}
              options={(["owner", "receptionist", "groomer"] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
          </div>
          <div>
            <Toggle testId="demo-offline" label="模擬網路離線" hint="所有送出都會失敗，不會顯示假成功" checked={settings.offline} onChange={(offline) => set({ offline })} />
            <Toggle testId="demo-line-fails" label="模擬 LINE 送出失敗" hint="通知失敗不影響預約與完工" checked={settings.lineFails} onChange={(lineFails) => set({ lineFails })} />
            <Toggle testId="demo-slot-race" label="模擬時段被搶（一次）" hint="下一次確認／送出申請時，另一台裝置搶先確認同時段" checked={settings.slotRace} onChange={(slotRace) => set({ slotRace })} />
          </div>
          <Button
            variant="danger"
            block
            data-testid="demo-reset"
            onClick={() => {
              store.reset();
              qc.invalidateQueries({ queryKey: ["petos"] });
              setOpen(false);
            }}
          >
            重設所有 Demo 資料
          </Button>
        </div>
      </Sheet>
    </>
  );
}
