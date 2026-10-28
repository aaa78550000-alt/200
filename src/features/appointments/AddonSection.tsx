import { useState } from "react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation, useServices } from "@/lib/hooks/queries";
import type { AppointmentDetail } from "@/lib/db/adapter";
import { formatNtd } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { ActionError } from "@/components/ui/states";

/** Add-ons during service need the owner's consent before they are billable (EDGE_CASES #6). */
export function AddonSection({ a }: { a: AppointmentDetail }) {
  const adapter = useAdapter();
  const { data: services } = useServices();
  const [picking, setPicking] = useState(false);
  const request = usePetosMutation((serviceId: string) => adapter.requestAddon(a.id, serviceId));
  const decide = usePetosMutation((v: { itemId: string; approve: boolean }) => adapter.decideAddon(a.id, v.itemId, v.approve));
  const addons = a.items.filter((i) => services?.find((s) => s.id === i.serviceId)?.isAddon);
  const canRequest = a.status === "in_service" || a.status === "checked_in";
  const LABEL = { approved: "飼主已同意", pending_owner: "等待飼主同意", declined: "飼主不同意" } as const;

  return (
    <div className="space-y-2">
      {addons.length ? (
        <ul className="divide-y divide-rule border-y border-rule">
          {addons.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-[15px]">
                {i.name} <span className="num text-muted">{formatNtd(i.priceSnapshot)}</span>
                <span className={`ml-2 text-sm ${i.approval === "pending_owner" ? "text-warning-ink" : i.approval === "approved" ? "text-success" : "text-muted"}`}>{LABEL[i.approval]}</span>
              </span>
              {i.approval === "pending_owner" ? (
                <span className="flex gap-1">
                  <Button size="sm" variant="secondary" loading={decide.isPending && decide.variables?.itemId === i.id && decide.variables.approve} onClick={() => decide.mutate({ itemId: i.id, approve: true })}>
                    飼主同意
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ itemId: i.id, approve: false })}>
                    不同意
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">沒有加購項目</p>
      )}
      {canRequest ? (
        picking ? (
          <div className="flex flex-wrap gap-2">
            {services
              ?.filter((s) => s.isAddon && !addons.some((x) => x.serviceId === s.id))
              .map((s) => (
                <Button key={s.id} size="sm" onClick={() => request.mutate(s.id, { onSuccess: () => setPicking(false) })} loading={request.isPending && request.variables === s.id}>
                  {s.name} {formatNtd(s.basePrice)}
                </Button>
              ))}
            <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>
              取消
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="quiet" onClick={() => setPicking(true)}>
            ＋ 提出加購（需飼主同意）
          </Button>
        )
      ) : null}
      {request.error || decide.error ? <ActionError error={request.error ?? decide.error} /> : null}
    </div>
  );
}
