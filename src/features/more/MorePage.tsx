import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useServices, useSession, useShop, useStaff } from "@/lib/hooks/queries";
import { ROLE_LABEL } from "@/lib/domain/status";
import { formatNtd } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ui/states";

/** Shop info, booking link and the service menu (read-only until M2-01 adds editing). */
export function MorePage() {
  const { data: shop } = useShop();
  const { data: session } = useSession();
  const { data: services, isLoading } = useServices();
  const { data: staff } = useStaff();
  const [copied, setCopied] = useState(false);
  const url = shop ? `${window.location.origin}/book/${shop.slug}` : "";
  return (
    <div className="mx-auto max-w-[760px] px-4 pb-10 lg:px-8">
      <h1 className="pt-4 text-2xl font-bold leading-8 lg:pt-7">服務與設定</h1>
      <section className="mt-5 border-t border-ink/80 pt-3">
        <h2 className="text-[15px] font-bold">{shop?.name}</h2>
        <p className="text-sm text-muted">{session ? `目前登入：${session.displayName}（${ROLE_LABEL[session.role]}）` : null}</p>
      </section>
      <section className="mt-6">
        <h2 className="border-b border-ink/80 pb-1.5 text-[15px] font-bold">飼主線上預約網址</h2>
        <p className="num mt-3 break-all text-[15px]">{url}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))}>
            <Copy className="size-3.5" aria-hidden />
            {copied ? "已複製" : "複製網址"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              開啟
            </a>
          </Button>
        </div>
      </section>
      <section className="mt-8">
        <h2 className="border-b border-ink/80 pb-1.5 text-[15px] font-bold">服務項目</h2>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : (
          <ul className="divide-y divide-rule">
            {services?.map((s) => (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {s.name}
                    {s.isAddon ? <span className="ml-2 text-sm font-normal text-muted">加購</span> : null}
                    {!s.onlineBookable && !s.isAddon ? <span className="ml-2 text-sm font-normal text-muted">不開放線上</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {s.durationMinutes} 分鐘{s.bufferMinutes ? ` ＋ 緩衝 ${s.bufferMinutes} 分` : ""} · 可服務：{staff?.filter((x) => x.serviceIds.includes(s.id)).map((x) => x.displayName).join("、") || "—"}
                  </p>
                </div>
                <p className="num text-right font-semibold">
                  {formatNtd(s.basePrice)}
                  {s.priceIsFrom ? <span className="text-sm font-normal text-muted"> 起</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-muted">服務、營業時間與員工設定的編輯介面規劃於 M2-01。</p>
      </section>
    </div>
  );
}
