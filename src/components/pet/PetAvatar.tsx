import { useState } from "react";
import { PawPrint } from "lucide-react";
import { cn } from "@/lib/cn";

const SIZES = { 40: "size-10 rounded-[10px]", 52: "size-[52px] rounded-[12px]", 72: "size-[72px] rounded-[14px]", 96: "size-24 rounded-[16px]", 160: "size-40 rounded-[18px]" } as const;

/**
 * "ID photo" avatar: rounded square, fixed crop, accessible alt, grey fallback on missing/failed image.
 */
export function PetAvatar({ src, name, size = 52, className }: { src: string | null; name: string; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden bg-[#e9ece8] text-muted ring-1 ring-ink/[0.06]", SIZES[size], className)}>
      {showImg ? (
        <img src={src} alt={`${name} 的照片`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={`${name}（沒有照片）`} className="flex flex-col items-center leading-none">
          <PawPrint className={size >= 72 ? "size-7" : "size-4"} aria-hidden />
          {size >= 72 ? <span className="mt-1 text-xs">尚無照片</span> : null}
        </span>
      )}
    </span>
  );
}
