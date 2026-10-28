import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { usePets } from "@/lib/hooks/queries";
import { PetAvatar } from "@/components/pet/PetAvatar";
import { WeightLine } from "@/components/pet/WeightLine";
import { Input } from "@/components/ui/field";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";

/** Search by pet, breed, owner or phone. Same-name pets are told apart by photo + breed + owner (E03). */
export function PetListPage() {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const pets = usePets(query);
  const nameCount = new Map<string, number>();
  pets.data?.forEach((p) => nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1));

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-10 lg:px-8">
      <header className="pt-4 lg:pt-7">
        <h1 className="text-2xl font-bold leading-8">毛孩</h1>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="搜尋毛孩" placeholder="名字、品種、飼主或電話" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="pet-search" />
        </div>
      </header>
      <div className="mt-3">
        {pets.isLoading ? (
          <ListSkeleton />
        ) : pets.error ? (
          <ErrorState error={pets.error} onRetry={() => pets.refetch()} />
        ) : !pets.data?.length ? (
          <EmptyState title={q ? `找不到「${q}」` : "還沒有毛孩資料"} body={q ? "試試飼主姓名或手機末三碼" : undefined} />
        ) : (
          <ul className="divide-y divide-rule" data-testid="pet-results">
            {pets.data.map((p) => {
              const dup = (nameCount.get(p.name) ?? 0) > 1;
              const high = p.notes.filter((n) => n.severity === "high");
              return (
                <li key={p.id}>
                  <Link to={`/app/pets/${p.id}`} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 py-3 hover:bg-ink/[0.03] lg:grid-cols-[52px_minmax(0,1fr)_200px] lg:px-2">
                    <PetAvatar src={p.photoUrl} name={p.name} />
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-bold leading-6">
                        {p.name}
                        {dup ? <span className="ml-2 rounded-full bg-warning-tint px-2 py-0.5 align-middle text-xs font-medium text-warning-ink">同名</span> : null}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {p.breed ?? "品種未填"} · 飼主 {p.customer.name} · <span className="num">尾號 {p.customer.phone.slice(-3)}</span>
                      </p>
                      {high[0] ? (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-warning-ink">
                          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{high[0].body}</span>
                        </p>
                      ) : null}
                    </div>
                    <p className="hidden text-right text-sm text-muted lg:block">
                      <WeightLine weight={p.latestWeight} />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
