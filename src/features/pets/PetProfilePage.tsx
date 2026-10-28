import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Phone } from "lucide-react";
import { useAdapter } from "@/lib/db/context";
import { usePet, usePetosMutation, useSession } from "@/lib/hooks/queries";
import type { PetDetail } from "@/lib/db/adapter";
import type { MediaCategory, PetNote } from "@/lib/domain/types";
import { ageText, dateOf, formatDateShort, hhmm } from "@/lib/domain/time";
import { formatNtd } from "@/lib/domain/money";
import { can } from "@/lib/domain/status";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { AttentionList } from "@/components/pet/AttentionList";
import { WeightLine } from "@/components/pet/WeightLine";
import { StatusLabel } from "@/components/appointment/StatusLabel";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionError, ErrorState, Skeleton } from "@/components/ui/states";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { NewAppointmentSheet } from "@/features/appointments/NewAppointmentSheet";
import { cn } from "@/lib/cn";

const SEX = { male: "公", female: "母", unknown: "性別未填" } as const;
const SPECIES = { dog: "狗", cat: "貓", other: "其他" } as const;
const MEDIA_LABEL: Record<MediaCategory, string> = { avatar: "頭像", before: "美容前", after: "美容後", care: "照護", incident: "事件" };

export function PetProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const adapter = useAdapter();
  const q = usePet(id!);
  const location = useLocation();
  const [booking, setBooking] = useState(false);
  const today = dateOf(adapter.now());

  if (q.isLoading && !q.data)
    return (
      <div className="mx-auto max-w-[1080px] space-y-4 px-4 pt-6 lg:px-8" role="status" aria-label="載入毛孩檔案">
        <div className="flex gap-4">
          <Skeleton className="size-24 rounded-[16px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  if (!q.data)
    return (
      <div className="px-4 pt-6 lg:px-8">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  const p = q.data;
  const facts = `${p.breed ?? "品種未填"} · ${SEX[p.sex]} · ${ageText(p.birthdate, p.birthdateEstimated, today)}`;

  return (
    <div className="pb-28 lg:pb-10">
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-rule bg-canvas/95 px-2 backdrop-blur lg:hidden">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/app/pets"))} className="grid size-11 place-items-center rounded-[var(--radius-control)] hover:bg-ink/5" aria-label="返回">
          <ArrowLeft className="size-5" />
        </button>
        <p className="font-bold">毛孩檔案</p>
        <EditMenu pet={p} />
      </div>

      <div className="mx-auto max-w-[1120px] px-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:pt-7">
        {/* Left: identity dossier */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="flex gap-4 pt-4 lg:block lg:pt-0">
            <PetAvatar src={p.photoUrl} name={p.name} size={96} className="lg:hidden" />
            <PetAvatar src={p.photoUrl} name={p.name} size={160} className="hidden lg:inline-grid lg:size-[200px] lg:rounded-[20px]" />
            <div className="min-w-0 lg:mt-4">
              <h1 className="text-2xl font-bold leading-8 lg:text-[30px] lg:leading-10" data-testid="pet-name">{p.name}</h1>
              <p className="text-[15px] text-ink/80">{facts}</p>
              <p className="mt-1 text-[15px]">
                <WeightLine weight={p.latestWeight} className="text-ink/80" />
              </p>
            </div>
          </div>

          <div className="mt-4 border-y border-rule py-3 text-[15px] lg:mt-5">
            <p className="text-sm text-muted">飼主</p>
            <p className="flex flex-wrap items-center gap-x-3">
              <span className="font-semibold">{p.customer.name}</span>
              <a href={`tel:${p.customer.phone}`} className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline">
                <Phone className="size-3.5" aria-hidden />
                <span className="num">{p.customer.phone}</span>
              </a>
            </p>
            {p.siblings.length ? (
              <p className="mt-1 text-sm text-muted">
                同一飼主：
                {p.siblings.map((s, i) => (
                  <span key={s.id}>
                    {i ? "、" : ""}
                    <Link to={`/app/pets/${s.id}`} className="text-primary hover:underline">
                      {s.name}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>

          <div className="mt-4 hidden gap-2 lg:flex">
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setBooking(true)} data-testid="pet-book">
              <CalendarPlus className="size-4" aria-hidden />
              新增預約
            </Button>
            <EditMenu pet={p} desktop />
          </div>
        </aside>

        {/* Right: care first, then history */}
        <main className="min-w-0">
          <section aria-labelledby="attention-h" className="mt-5 lg:mt-0">
            <h2 id="attention-h" className="mb-2.5 text-[15px] font-bold tracking-wide">注意事項</h2>
            <AttentionList notes={p.notes.filter((n) => n.severity === "high")} emptyText="沒有標記為重要的注意事項" />
          </section>

          <Tabs defaultValue={location.hash === "#care" ? "care" : "overview"} className="mt-6">
            <TabsList aria-label="毛孩檔案分頁">
              <TabsTrigger value="overview">概覽</TabsTrigger>
              <TabsTrigger value="history">美容紀錄</TabsTrigger>
              <TabsTrigger value="care">照護資訊</TabsTrigger>
              <TabsTrigger value="photos">相簿</TabsTrigger>
              <TabsTrigger value="member">會員</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="pt-4">
              <Overview p={p} today={today} />
            </TabsContent>
            <TabsContent value="history" className="pt-2">
              <History p={p} />
            </TabsContent>
            <TabsContent value="care" className="pt-4" id="care">
              <Care p={p} />
            </TabsContent>
            <TabsContent value="photos" className="pt-4">
              <Photos p={p} />
            </TabsContent>
            <TabsContent value="member" className="pt-4">
              <Member p={p} />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-rule bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Button variant="primary" size="lg" block onClick={() => setBooking(true)}>
          <CalendarPlus className="size-4" aria-hidden />
          為 {p.name} 新增預約
        </Button>
      </div>
      <NewAppointmentSheet open={booking} onOpenChange={setBooking} preset={{ petId: p.id, date: today }} onCreated={(aid) => navigate(`/app/appointments/${aid}`)} />
    </div>
  );
}

function Overview({ p, today }: { p: PetDetail; today: string }) {
  const { data: session } = useSession();
  const next = p.appointments.filter((a) => ["pending", "confirmed", "checked_in", "in_service", "ready_pickup"].includes(a.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const last = p.appointments.find((a) => a.status === "completed");
  const showChip = session && can(session.role, "finance.view");
  return (
    <div className="space-y-6">
      {next ? (
        <Link to={`/app/appointments/${next.id}`} className="flex items-center justify-between gap-3 border-l-[3px] border-primary bg-primary-tint/50 px-3 py-2.5 hover:bg-primary-tint">
          <span className="min-w-0">
            <span className="block text-sm text-muted">{dateOf(next.startsAt) === today ? "今天" : formatDateShort(next.startsAt)}</span>
            <span className="block truncate font-semibold">
              <span className="num">{hhmm(next.startsAt)}</span> {next.items.filter((i) => i.approval === "approved").map((i) => i.name).join("＋")} · {next.staff?.displayName ?? "未指派"}
            </span>
          </span>
          <StatusLabel status={next.status} />
        </Link>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-bold text-muted">美容偏好</h3>
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-[15px]">
          <dt className="text-muted">修剪要求</dt>
          <dd>{p.groomingPreferences ?? <span className="text-muted">尚未記錄</span>}</dd>
          <dt className="text-muted">洗護用品</dt>
          <dd>{p.productPreferences ?? <span className="text-muted">尚未記錄</span>}</dd>
          <dt className="text-muted">預估時間</dt>
          <dd>{p.estimatedMinutes ? <><span className="num">{p.estimatedMinutes}</span> 分鐘</> : <span className="text-muted">尚未記錄</span>}</dd>
          <dt className="text-muted">上次服務</dt>
          <dd>{last ? <>{formatDateShort(last.startsAt)} · {last.items.filter((i) => i.approval === "approved").map((i) => i.name).join("＋")} · {last.staff?.displayName}</> : <span className="text-muted">尚無紀錄</span>}</dd>
        </dl>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-muted">基本資料</h3>
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-[15px]">
          <dt className="text-muted">物種</dt>
          <dd>{SPECIES[p.species]}</dd>
          <dt className="text-muted">生日</dt>
          <dd>{p.birthdate ? `${formatDateShort(p.birthdate)}${p.birthdateEstimated ? "（估計）" : ""}` : <span className="text-muted">未提供</span>}</dd>
          <dt className="text-muted">結紮</dt>
          <dd>{p.neutered === null ? <span className="text-muted">未提供</span> : p.neutered ? "已結紮" : "未結紮"}</dd>
          <dt className="text-muted">毛色</dt>
          <dd>{p.coatColor ?? <span className="text-muted">未提供</span>}</dd>
          <dt className="text-muted">晶片</dt>
          <dd className="num">{p.microchipMasked ? (showChip ? p.microchipMasked : "已登錄（權限不足不顯示）") : <span className="text-muted">未提供</span>}</dd>
        </dl>
      </div>
    </div>
  );
}

function History({ p }: { p: PetDetail }) {
  const { data: session } = useSession();
  const finance = session ? can(session.role, "finance.view") : false;
  if (!p.appointments.length) return <p className="py-6 text-muted">還沒有美容紀錄。</p>;
  return (
    <ul className="divide-y divide-rule" data-testid="pet-history">
      {p.appointments.map((a) => (
        <li key={a.id}>
          <Link to={`/app/appointments/${a.id}`} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-start gap-3 py-3 hover:bg-ink/[0.03]">
            <span className="num pt-0.5 text-[15px] font-semibold">{formatDateShort(a.startsAt)}</span>
            <span className="min-w-0">
              <span className="block truncate">
                {a.items.filter((i) => i.approval === "approved").map((i) => i.name).join("＋")} · {a.staff?.displayName ?? "未指派"}
                {finance ? <span className="num ml-2 text-muted">{formatNtd(a.totalDue)}</span> : null}
              </span>
              {a.finish?.incidentNote ? <span className="mt-0.5 block border-l-[3px] border-danger pl-2 text-sm text-ink/85">異常：{a.finish.incidentNote}</span> : a.finish?.note ? <span className="block truncate text-sm text-muted">{a.finish.note}</span> : null}
            </span>
            <StatusLabel status={a.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Care({ p }: { p: PetDetail }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-bold text-muted">全部注意事項</h3>
        <AttentionList notes={p.notes} />
        <p className="mt-3 text-xs text-muted">注意事項為飼主說明或美容師觀察紀錄，不是醫療診斷。</p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold text-muted">體重紀錄</h3>
        {p.weights.length ? (
          <ol className="divide-y divide-rule border-y border-rule" data-testid="weight-history">
            {p.weights.map((w, i) => {
              const prev = p.weights[i + 1];
              const delta = prev ? Math.round((w.weightKg - prev.weightKg) * 10) / 10 : null;
              return (
                <li key={w.id} className="grid grid-cols-[96px_80px_minmax(0,1fr)] items-baseline gap-2 py-2 text-[15px]">
                  <span className="num text-muted">{formatDateShort(w.measuredAt)}</span>
                  <span className="num font-semibold">{w.weightKg.toFixed(1)} kg</span>
                  <span className="text-sm text-muted">
                    {delta !== null && delta !== 0 ? <span className="num">{delta > 0 ? "+" : ""}{delta.toFixed(1)} · </span> : null}
                    {w.recordedBy ?? ""}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-muted">體重未提供</p>
        )}
      </div>
    </div>
  );
}

function Photos({ p }: { p: PetDetail }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [cat, setCat] = useState<"all" | MediaCategory>("all");
  const [zoom, setZoom] = useState<PetDetail["media"][number] | null>(null);
  const [uploadCat, setUploadCat] = useState<"before" | "after" | "care">("after");
  const upload = usePetosMutation((file: File) => adapter.uploadPetMedia(p.id, file, uploadCat));
  const media = p.media.filter((m) => m.category !== "avatar" && (cat === "all" || m.category === cat));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<"all" | MediaCategory>
          label="相片分類"
          value={cat}
          onChange={setCat}
          options={[{ value: "all", label: "全部" }, { value: "before", label: "美容前" }, { value: "after", label: "美容後" }, { value: "care", label: "照護" }]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-rule py-2">
        <span className="text-sm text-muted">新增照片：</span>
        <Segmented<"before" | "after" | "care"> label="上傳分類" value={uploadCat} onChange={setUploadCat} options={[{ value: "before", label: "美容前" }, { value: "after", label: "美容後" }, { value: "care", label: "照護" }]} />
        <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-control)] border border-border bg-surface px-4 text-[15px] font-medium hover:border-ink/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
          {upload.isPending ? "上傳中…" : "選擇照片"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            data-testid="photo-input"
            disabled={upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload.mutate(f, { onSuccess: () => toast("照片已上傳") });
            }}
          />
        </label>
      </div>
      {upload.error ? <div className="mt-2"><ActionError error={upload.error} /></div> : null}
      {media.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setZoom(m)} className="block w-full text-left">
                <img src={m.url} alt={`${p.name} ${MEDIA_LABEL[m.category]}照片`} className="aspect-square w-full rounded-[10px] object-cover" loading="lazy" />
                <span className="mt-1 block text-xs text-muted">
                  {MEDIA_LABEL[m.category]} · {formatDateShort(m.takenAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-muted">這個分類還沒有照片。</p>
      )}
      <p className="mt-4 text-xs text-muted">{adapter.mode === "demo" ? "DEMO 圖片為 AI 生成之虛構毛孩；Demo 上傳只存在這個瀏覽器。" : "照片存於私有空間，只以 10 分鐘有效的授權連結顯示。"}</p>
      <Sheet open={!!zoom} onOpenChange={(o) => !o && setZoom(null)} title={zoom ? `${MEDIA_LABEL[zoom.category]} · ${formatDateShort(zoom.takenAt)}` : ""} side="center">
        {zoom ? (
          <figure>
            <img src={zoom.url} alt={`${p.name} ${MEDIA_LABEL[zoom.category]}照片`} className="mx-auto w-full max-w-[320px] rounded-[12px]" />
            {zoom.caption ? <figcaption className="mt-3 text-[15px]">{zoom.caption}</figcaption> : null}
          </figure>
        ) : null}
      </Sheet>
    </div>
  );
}

function Member({ p }: { p: PetDetail }) {
  return (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-[15px]">
      <dt className="text-muted">飼主</dt>
      <dd>{p.customer.name}</dd>
      <dt className="text-muted">LINE</dt>
      <dd>{p.customer.lineLinked ? "已綁定店家官方帳號" : <span className="text-muted">未綁定</span>}</dd>
      <dt className="text-muted">包套・儲值</dt>
      <dd className="text-muted">尚未啟用（規劃於 P1 里程碑）</dd>
    </dl>
  );
}

/** Secondary edits: record weight / add a care note. Both are real writes with provenance. */
function EditMenu({ pet, desktop }: { pet: PetDetail; desktop?: boolean }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [open, setOpen] = useState<null | "weight" | "note">(null);
  const [menu, setMenu] = useState(false);
  const [kg, setKg] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<PetNote["source"]>("groomer_observed");
  const [category, setCategory] = useState<PetNote["category"]>("behavior");
  const [important, setImportant] = useState<"high" | "normal">("high");
  const addWeight = usePetosMutation(() => adapter.addWeight(pet.id, Number(kg)));
  const addNote = usePetosMutation(() => adapter.addNote(pet.id, { body, source, category, severity: important }));
  return (
    <>
      <div className="relative">
        <Button variant={desktop ? "secondary" : "ghost"} size={desktop ? "lg" : "md"} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
          編輯
        </Button>
        {menu ? (
          <div role="menu" className={cn("absolute z-30 mt-1 w-44 border border-border bg-surface py-1 shadow-lg", desktop ? "left-0" : "right-0")}>
            <button role="menuitem" className="block min-h-11 w-full px-4 text-left hover:bg-ink/5" onClick={() => { setOpen("weight"); setMenu(false); setKg(""); addWeight.reset(); }}>
              記錄體重
            </button>
            <button role="menuitem" className="block min-h-11 w-full px-4 text-left hover:bg-ink/5" onClick={() => { setOpen("note"); setMenu(false); setBody(""); addNote.reset(); }}>
              新增注意事項
            </button>
          </div>
        ) : null}
      </div>
      <Sheet open={open === "weight"} onOpenChange={(o) => !o && setOpen(null)} title={`記錄 ${pet.name} 的體重`} side="center"
        footer={<Button variant="primary" size="lg" block loading={addWeight.isPending} disabled={!(Number(kg) > 0)} onClick={() => addWeight.mutate(undefined, { onSuccess: () => { toast("已記錄體重"); setOpen(null); } })}>儲存</Button>}>
        <Field label="體重（kg）" htmlFor="kg" hint="會記錄量測時間與記錄人">
          <Input id="kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.]/g, ""))} className="num" placeholder="例：4.8" />
        </Field>
        {addWeight.error ? <div className="mt-3"><ActionError error={addWeight.error} /></div> : null}
      </Sheet>
      <Sheet open={open === "note"} onOpenChange={(o) => !o && setOpen(null)} title="新增注意事項" side="center"
        footer={<Button variant="primary" size="lg" block loading={addNote.isPending} disabled={!body.trim()} onClick={() => addNote.mutate(undefined, { onSuccess: () => { toast("已新增注意事項"); setOpen(null); } })}>儲存</Button>}>
        <div className="space-y-4">
          <Field label="內容" htmlFor="note-body" hint="寫觀察與處理方式，不寫診斷">
            <Textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="例：右前腳碰到會縮，修腳毛時放慢" />
          </Field>
          <Field label="來源">
            <Segmented<PetNote["source"]> label="來源" value={source} onChange={setSource} options={[{ value: "groomer_observed", label: "美容師觀察" }, { value: "owner_reported", label: "飼主提供" }]} />
          </Field>
          <Field label="類別">
            <Segmented<PetNote["category"]> label="類別" value={category} onChange={setCategory} options={[{ value: "skin", label: "皮膚" }, { value: "behavior", label: "行為" }, { value: "health", label: "身體" }, { value: "product", label: "用品" }, { value: "grooming", label: "修剪" }]} />
          </Field>
          <Field label="重要程度">
            <Segmented<"high" | "normal"> label="重要程度" value={important} onChange={setImportant} options={[{ value: "high", label: "重要（預約時置頂）" }, { value: "normal", label: "一般" }]} />
          </Field>
          {addNote.error ? <ActionError error={addNote.error} /> : null}
        </div>
      </Sheet>
    </>
  );
}
