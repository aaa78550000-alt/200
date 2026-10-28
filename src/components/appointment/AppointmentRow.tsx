import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { AppointmentView } from "@/lib/domain/types";
import { dateOf, formatMonthDay, hhmm, weekdayLabel } from "@/lib/domain/time";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { StatusLabel } from "./StatusLabel";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/hooks/useMedia";

/**
 * Ledger row: time spine · ID photo · pet name · service/groomer · status.
 * One optional quick action (never four buttons per row).
 */
export function AppointmentRow({
  a,
  onOpen,
  selected,
  action,
  showNotes = true,
  showDate = false,
}: {
  a: AppointmentView;
  onOpen: (id: string) => void;
  selected?: boolean;
  action?: ReactNode;
  showNotes?: boolean;
  /** For rows that are not on the page's day (e.g. pending requests). */
  showDate?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const muted = a.status === "cancelled" || a.status === "no_show" || a.status === "completed";
  const services = a.items.filter((i) => i.approval === "approved").map((i) => i.name).join("＋");
  const note = showNotes && !muted ? a.highNotes[0] : undefined;
  return (
    <li
      data-testid={`apt-row-${a.id}`}
      className={cn(
        "group relative grid grid-cols-[48px_52px_minmax(0,1fr)] items-start gap-x-3 py-3.5 lg:grid-cols-[56px_52px_minmax(0,1fr)_auto] lg:gap-x-4 lg:px-3",
        a.status === "in_service" && "bg-primary-tint/50",
        selected && "bg-primary-tint lg:shadow-[inset_3px_0_0_var(--primary)]",
      )}
    >
      <div className={cn("num pt-0.5 text-right leading-5", muted && "text-muted")}>
        {showDate ? (
          <div className="text-[12px] font-semibold text-warning-ink">
            {formatMonthDay(a.startsAt)}
            <span className="font-normal">{weekdayLabel(dateOf(a.startsAt)).slice(1)}</span>
          </div>
        ) : null}
        <div className="text-[15px] font-semibold">{hhmm(a.startsAt)}</div>
        <div className="text-[13px] text-muted">{hhmm(a.endsAt)}</div>
      </div>
      <PetAvatar src={a.pet.photoUrl} name={a.pet.name} className={cn(muted && "opacity-60 grayscale")} />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(a.id)}
            className="min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary"
            aria-label={`${a.pet.name}（${a.pet.breed ?? "品種未填"}，飼主${a.customer.name}）${hhmm(a.startsAt)} 預約詳情`}
          >
            <span className={cn("block truncate text-[17px] font-bold leading-6", muted && "text-muted", (a.status === "cancelled" || a.status === "no_show") && "line-through decoration-1")}>
              {a.pet.name}
              <span className="ml-1.5 text-sm font-normal text-muted">
                {a.pet.breed ?? "品種未填"}
                <span className="hidden lg:inline"> · {a.customer.name}</span>
              </span>
            </span>
          </button>
          <StatusLabel status={a.status} className="lg:hidden" />
        </div>
        <p className="truncate text-sm leading-6 text-muted">
          <span className="lg:hidden">{a.customer.name} · </span>
          {services || "—"} · {a.staff?.displayName ?? "未指派"}
        </p>
        {note ? (
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm leading-5 text-warning-ink">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{note.body}</span>
          </p>
        ) : null}
        {action && !isDesktop ? <div className="relative z-10 mt-2">{action}</div> : null}
      </div>
      <div className="relative z-10 hidden flex-col items-end gap-2 lg:flex">
        <StatusLabel status={a.status} />
        {isDesktop ? action : null}
      </div>
    </li>
  );
}
