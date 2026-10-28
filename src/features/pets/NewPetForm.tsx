import { useState } from "react";
import { useAdapter } from "@/lib/db/context";
import { usePetosMutation } from "@/lib/hooks/queries";
import type { Customer } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

/**
 * Progressive first record (PRD「逐步建檔」): only owner phone/name and pet name/species are required.
 * The phone is looked up first so an existing owner is reused instead of duplicated.
 */
export function NewPetForm({ onCreated, onCancel }: { onCreated: (petId: string) => void; onCancel?: () => void }) {
  const adapter = useAdapter();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<"idle" | "found" | "new">("idle");
  const [owner, setOwner] = useState<Customer | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [petName, setPetName] = useState("");
  const [species, setSpecies] = useState<"dog" | "cat">("dog");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "unknown">("unknown");
  const [weight, setWeight] = useState("");
  const [touched, setTouched] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const phoneOk = /^09\d{8}$/.test(digits);
  const find = usePetosMutation(() => adapter.findCustomerByPhone(digits));
  const create = usePetosMutation(() =>
    adapter.createCustomerPet({
      customerId: owner?.id,
      customerName: owner ? undefined : ownerName,
      phone: owner ? undefined : digits,
      petName,
      species,
      breed,
      sex,
      weightKg: weight ? Number(weight) : null,
    }),
  );
  const valid = lookup !== "idle" && petName.trim() && (owner || ownerName.trim());
  const submit = () => {
    setTouched(true);
    if (!valid || create.isPending) return;
    create.mutate(undefined, { onSuccess: (r) => { toast(`已建立 ${petName.trim()} 的檔案`); onCreated(r.petId); } });
  };

  // Not a <form>: it is also embedded inside the new-appointment form, and forms cannot nest.
  return (
    <div role="group" aria-label="新增飼主與毛孩" data-testid="new-pet-form" className="space-y-4">
      <Field label="飼主手機" htmlFor="np-phone" hint={lookup === "idle" ? "先用手機查詢，避免重複建立飼主" : undefined} error={touched && !phoneOk ? "請輸入 09 開頭的 10 碼手機" : null}>
        <div className="flex gap-2">
          <Input id="np-phone" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setLookup("idle"); setOwner(null); }} className="num" placeholder="0912-345-678" />
          <Button type="button" disabled={!phoneOk} loading={find.isPending} onClick={() => find.mutate(undefined, { onSuccess: (c) => { setOwner(c); setLookup(c ? "found" : "new"); } })}>
            查詢
          </Button>
        </div>
      </Field>
      {lookup === "found" && owner ? (
        <p className="border-l-[3px] border-primary bg-primary-tint/50 px-3 py-2 text-[15px]">
          既有飼主：<span className="font-semibold">{owner.name}</span>，新毛孩會加到這位飼主名下。
        </p>
      ) : null}
      {lookup === "new" ? (
        <Field label="飼主稱呼" htmlFor="np-owner" error={touched && !ownerName.trim() ? "請填寫飼主稱呼" : null}>
          <Input id="np-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="例：林小姐" />
        </Field>
      ) : null}
      {lookup !== "idle" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="毛孩名字" htmlFor="np-name" error={touched && !petName.trim() ? "請填寫毛孩名字" : null}>
              <Input id="np-name" value={petName} onChange={(e) => setPetName(e.target.value)} />
            </Field>
            <Field label="種類">
              <Segmented<"dog" | "cat"> label="種類" value={species} onChange={setSpecies} options={[{ value: "dog", label: "狗狗" }, { value: "cat", label: "貓咪" }]} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="品種" htmlFor="np-breed" optional>
              <Input id="np-breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
            </Field>
            <Field label="體重（kg）" htmlFor="np-weight" optional>
              <Input id="np-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} className="num" />
            </Field>
          </div>
          <Field label="性別" optional>
            <Segmented<"male" | "female" | "unknown"> label="性別" value={sex} onChange={setSex} options={[{ value: "female", label: "母" }, { value: "male", label: "公" }, { value: "unknown", label: "不確定" }]} />
          </Field>
          <p className="text-sm text-muted">生日、照片、注意事項可之後在毛孩檔案補上。</p>
        </>
      ) : null}
      {find.error || create.error ? <ActionError error={create.error ?? find.error} /> : null}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            返回
          </Button>
        ) : null}
        <Button type="button" variant="primary" size="lg" className="flex-1" disabled={lookup === "idle"} loading={create.isPending} onClick={submit} data-testid="create-pet">
          {lookup === "idle" ? "請先查詢飼主手機" : "建立毛孩檔案"}
        </Button>
      </div>
    </div>
  );
}
