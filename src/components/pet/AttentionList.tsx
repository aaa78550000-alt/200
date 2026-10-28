import { AlertTriangle } from "lucide-react";
import type { PetNote } from "@/lib/domain/types";
import { formatDateShort } from "@/lib/domain/time";
import { cn } from "@/lib/cn";

export const SOURCE_LABEL = { owner_reported: "飼主提供", groomer_observed: "美容師觀察" } as const;
const CATEGORY_LABEL = { skin: "皮膚", behavior: "行為", health: "身體", product: "用品", grooming: "修剪" } as const;

/**
 * Care notes as "marginalia": an ochre rule on the left, the note, then its provenance.
 * Never presented as a diagnosis; provenance (source + who + date) is always shown.
 */
export function AttentionList({ notes, compact, emptyText = "尚未記錄注意事項", className }: { notes: PetNote[]; compact?: boolean; emptyText?: string; className?: string }) {
  if (!notes.length)
    return <p className={cn("border-l-[3px] border-border pl-3 text-[15px] text-muted", className)}>{emptyText}</p>;
  return (
    <ul className={cn("space-y-2.5", className)} aria-label="照護注意事項">
      {notes.map((n) => (
        <li key={n.id} className={cn("border-l-[3px] pl-3", n.severity === "high" ? "border-warning" : "border-border")}>
          <p className={cn("leading-6 text-ink", compact ? "text-[15px]" : "text-base")}>
            {n.severity === "high" ? <AlertTriangle className="mr-1 -mt-0.5 inline size-4 text-warning-ink" aria-label="重要" /> : null}
            {!compact ? <span className="mr-1.5 text-sm text-muted">{CATEGORY_LABEL[n.category]}</span> : null}
            {n.body}
          </p>
          <p className="text-xs text-muted">
            {SOURCE_LABEL[n.source]} · {n.updatedBy} · {formatDateShort(n.updatedAt)} 更新
          </p>
        </li>
      ))}
    </ul>
  );
}
