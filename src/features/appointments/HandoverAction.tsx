import { useState } from "react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation, useSession } from "@/lib/hooks/queries";
import type { AppointmentDetail } from "@/lib/db/adapter";
import { can } from "@/lib/domain/status";
import { formatNtd } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

/** Pickup is separate from payment: paid-but-still-here stays ready_pickup (E09); completed only after handover (E10). */
export function HandoverAction({ a }: { a: AppointmentDetail }) {
  const adapter = useAdapter();
  const toast = useToast();
  const { data: session } = useSession();
  const owing = Math.max(0, a.totalDue - a.paidAmount);
  const [authorizing, setAuthorizing] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const handover = usePetosMutation((unpaidReason?: string) => adapter.handover(a.id, a.version, unpaidReason));
  const mayAuthorize = can(session?.role ?? "groomer", "handover.unpaid_authorize");

  if (owing === 0)
    return (
      <div>
        <p className="mb-2 text-sm text-success">款項已付清，飼主到店即可交接。</p>
        <Button variant="primary" size="lg" block loading={handover.isPending} data-testid="handover" onClick={() => handover.mutate(undefined, { onSuccess: () => toast(`${a.pet.name} 已交接，預約完成`) })}>
          飼主已接回 · 完成
        </Button>
        {handover.error ? <div className="mt-2"><ActionError error={handover.error} /></div> : null}
      </div>
    );

  return (
    <div className="space-y-2">
      <p className="text-[15px]">
        尚欠 <span className="num font-bold text-warning-ink">{formatNtd(owing)}</span>，記錄收款後即可交接。
      </p>
      {!authorizing ? (
        <Button variant="ghost" size="sm" onClick={() => setAuthorizing(true)} data-testid="unpaid-handover">
          未付款交接（需店長授權）
        </Button>
      ) : (
        <form
          className="space-y-3 border border-warning/50 bg-warning-tint/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!reason.trim()) return;
            handover.mutate(reason.trim(), { onSuccess: () => toast("已授權未付款交接，已留紀錄") });
          }}
        >
          {!mayAuthorize ? <p className="text-sm text-warning-ink">目前角色沒有授權權限，送出會被拒絕，請由店長或店主操作。</p> : null}
          <Field label="未付款交接原因" htmlFor="unpaid-reason" error={touched && !reason.trim() ? "請填寫原因" : null}>
            <Input id="unpaid-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：熟客月結，下次到店補付" />
          </Field>
          {handover.error ? <ActionError error={handover.error} /> : null}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setAuthorizing(false)}>
              取消
            </Button>
            <Button type="submit" variant="danger" className="flex-1" loading={handover.isPending}>
              授權並交接
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
