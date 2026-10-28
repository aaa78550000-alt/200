import { useState } from "react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation } from "@/lib/hooks/queries";
import type { AppointmentDetail } from "@/lib/db/adapter";
import type { FinishRecord } from "@/lib/domain/types";
import { hhmm } from "@/lib/domain/time";
import { formatNtd } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { Field, Segmented, Textarea } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

/**
 * finish_review: a front-end draft only. The appointment stays in_service until the backend commits.
 * Normal finish is one tap; abnormal requires a note and the owner-contact state.
 */
export function FinishReview({ a, onCancel, onDone }: { a: AppointmentDetail; onCancel: () => void; onDone: () => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [outcome, setOutcome] = useState<FinishRecord["outcome"]>("normal");
  const [note, setNote] = useState("");
  const [incident, setIncident] = useState("");
  const [contact, setContact] = useState<FinishRecord["ownerContact"]>(null);
  const [touched, setTouched] = useState(false);
  const pendingAddons = a.items.filter((i) => i.approval === "pending_owner");
  const commit = usePetosMutation(() =>
    adapter.finishService(a.id, a.version, {
      finishedAt: adapter.now(),
      outcome,
      note: note.trim() || null,
      incidentNote: outcome === "abnormal" ? incident.trim() : null,
      ownerContact: outcome === "abnormal" ? contact : null,
    }),
  );
  const abnormalInvalid = outcome === "abnormal" && (!incident.trim() || !contact);

  return (
    <form
      data-testid="finish-review"
      className="space-y-4 border border-primary/30 bg-primary-tint/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (abnormalInvalid || commit.isPending) return;
        commit.mutate(undefined, {
          onSuccess: () => {
            toast(`${a.pet.name} 已完成美容，轉為待接回`);
            onDone();
          },
        });
      }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold">確認完工</h3>
        <span className="text-sm text-muted">
          完工時間 <span className="num font-semibold text-ink">{hhmm(adapter.now())}</span>
        </span>
      </div>

      <Field label="服務結果">
        <Segmented<FinishRecord["outcome"]> label="服務結果" value={outcome} onChange={setOutcome} options={[{ value: "normal", label: "正常完成" }, { value: "abnormal", label: "有異常狀況" }]} />
      </Field>

      {outcome === "abnormal" ? (
        <>
          <Field label="異常狀況說明" htmlFor="incident" error={touched && !incident.trim() ? "請描述觀察到的狀況與處理方式" : null} hint="只記錄觀察與處理，不做醫療診斷">
            <Textarea id="incident" value={incident} onChange={(e) => setIncident(e.target.value)} aria-invalid={touched && !incident.trim()} placeholder="例：右耳內側發現紅點，已停止清耳並拍照" />
          </Field>
          <Field label="飼主聯絡狀態" error={touched && !contact ? "請選擇聯絡狀態" : null}>
            <Segmented<NonNullable<FinishRecord["ownerContact"]>>
              label="飼主聯絡狀態"
              value={contact}
              onChange={setContact}
              options={[{ value: "contacted", label: "已聯絡飼主" }, { value: "not_contacted", label: "尚未聯絡" }, { value: "unreachable", label: "聯絡不上" }]}
            />
          </Field>
        </>
      ) : null}

      <Field label="給飼主的備註" htmlFor="finish-note" optional>
        <Textarea id="finish-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" placeholder="例：腳毛修短、耳朵留長" />
      </Field>

      {pendingAddons.length ? (
        <p className="border-l-[3px] border-warning pl-3 text-sm text-warning-ink">
          {pendingAddons.map((i) => `${i.name} ${formatNtd(i.priceSnapshot)}`).join("、")} 尚未取得飼主同意，不會計入應收。
        </p>
      ) : null}

      {commit.error ? <ActionError error={commit.error} /> : null}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          返回
        </Button>
        <Button type="submit" variant="primary" size="lg" className="flex-1" loading={commit.isPending} data-testid="commit-finish">
          確認完工 · 轉待接回
        </Button>
      </div>
    </form>
  );
}
