import type { WeightRecord } from "@/lib/domain/types";
import { formatDateShort } from "@/lib/domain/time";

/** Latest weight with its measurement date; missing data says so instead of "0 kg". */
export function WeightLine({ weight, className }: { weight: WeightRecord | null; className?: string }) {
  if (!weight) return <span className={className}>體重未提供</span>;
  return (
    <span className={className}>
      <span className="num font-semibold text-ink">{weight.weightKg.toFixed(1)}</span> kg
      <span className="text-muted"> · {formatDateShort(weight.measuredAt)} 量測</span>
    </span>
  );
}
