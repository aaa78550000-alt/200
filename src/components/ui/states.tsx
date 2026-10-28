import type { ReactNode } from "react";
import { AlertTriangle, WifiOff } from "lucide-react";
import { DomainError } from "@/lib/db/adapter";
import { Button } from "./button";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[var(--radius-control)] bg-ink/[0.06]", className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="載入中" className="divide-y divide-rule">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-4">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="size-[52px] rounded-[12px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-44" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-y border-dashed border-border px-4 py-10 text-center">
      <p className="text-base font-semibold">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof DomainError && error.code === "OFFLINE";
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div role="alert" className="flex items-start gap-3 border-l-[3px] border-danger bg-danger-tint px-4 py-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{offline ? "目前離線" : "資料讀取失敗"}</p>
        <p className="text-sm text-ink/80">{error instanceof Error ? error.message : "請稍後再試"}</p>
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          重試
        </Button>
      ) : null}
    </div>
  );
}

/** Inline error for a failed mutation — the action did NOT happen. */
export function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof DomainError ? error : null;
  return (
    <div role="alert" className="border-l-[3px] border-danger bg-danger-tint px-3 py-2.5 text-sm">
      <p className="font-semibold text-danger">{e?.code === "OFFLINE" ? "未送出：目前離線" : "未完成"}</p>
      <p className="text-ink/85">{error instanceof Error ? error.message : String(error)}</p>
      {e?.details?.length ? (
        <ul className="mt-1 list-disc pl-5 text-ink/85">
          {e.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
