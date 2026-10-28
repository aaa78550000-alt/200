import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { EMBEDDED } from "@/lib/env";
import { sitePath } from "@/lib/paths";
import { DomainError } from "@/lib/db/adapter";
import { useAdapter } from "@/lib/db/context";
import { CalendarDays, ExternalLink, LayoutList, MoreHorizontal, PawPrint } from "lucide-react";
import { useSession, useShop } from "@/lib/hooks/queries";
import { ROLE_LABEL } from "@/lib/domain/status";
import { DemoBar } from "@/features/demo/DemoBar";
import { cn } from "@/lib/cn";

const NAV = [
  { to: "/app/today", label: "今日工作", short: "今日", icon: LayoutList },
  { to: "/app/calendar", label: "預約行事曆", short: "預約", icon: CalendarDays },
  { to: "/app/pets", label: "毛孩", short: "毛孩", icon: PawPrint },
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight text-ink", className)}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--primary)" />
        <path d="M10 9h7.5a5.5 5.5 0 0 1 0 11H14v4h-4z" fill="var(--canvas)" />
        <rect x="14" y="13" width="3.5" height="3.5" rx="1" fill="var(--primary)" />
      </svg>
      PetOS
    </span>
  );
}

export function AppShell() {
  const adapter = useAdapter();
  const { data: shop } = useShop();
  const { data: session, error: sessionError } = useSession();
  if (sessionError instanceof DomainError && sessionError.code === "UNAUTHENTICATED") return <Navigate to="/login" replace />;
  if (sessionError instanceof DomainError && sessionError.code === "NO_SHOP") return <Navigate to="/onboarding" replace />;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule bg-canvas px-3 py-5 lg:flex">
        <div className="px-3">
          <Wordmark className="text-lg" />
          <p className="mt-3 truncate text-[15px] font-semibold">{shop?.name ?? " "}</p>
          <p className="text-sm text-muted">{session ? `${session.displayName} · ${ROLE_LABEL[session.role]}` : " "}</p>
        </div>
        <nav aria-label="主要導覽" className="mt-6 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn("flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] text-ink/80 hover:bg-ink/5", isActive && "bg-surface font-semibold text-ink ring-1 ring-rule")
              }
            >
              <n.icon className="size-[18px] text-muted" aria-hidden />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/app/more" className={({ isActive }) => cn("flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] text-ink/80 hover:bg-ink/5", isActive && "bg-surface font-semibold text-ink ring-1 ring-rule")}>
            <MoreHorizontal className="size-[18px] text-muted" aria-hidden />
            服務與設定
          </NavLink>
        </nav>
        <div className="mt-auto border-t border-rule px-3 pt-4">
          {EMBEDDED ? (
            <Link to={`/book/${shop?.slug ?? "calm-studio"}`} className="flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden />
              飼主線上預約頁
            </Link>
          ) : (
            <a href={sitePath(`/book/${shop?.slug ?? "calm-studio"}`)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden />
              飼主線上預約頁
            </a>
          )}
          {adapter.signOut ? (
            <button type="button" className="flex min-h-11 items-center text-sm text-muted hover:text-ink" onClick={() => adapter.signOut!().then(() => window.location.assign(sitePath("/login")))}>
              登出
            </button>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        <DemoBar />
        <Outlet />
      </div>

      <nav aria-label="主要導覽" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-rule bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {[...NAV, { to: "/app/more", label: "更多", short: "更多", icon: MoreHorizontal }].map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("flex h-16 flex-col items-center justify-center gap-1 text-[13px] text-muted", isActive && "font-semibold text-primary")}>
            <n.icon className="size-[22px]" aria-hidden />
            {n.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
