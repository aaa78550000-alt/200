import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppointmentDetail } from "./AppointmentDetail";

/** Deep link / mobile full-screen detail. Desktop lists open the same component in a side panel. */
export function AppointmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (
    <div className="mx-auto max-w-[640px] px-4 pb-8 lg:px-8 lg:pt-6">
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex h-14 items-center gap-2 border-b border-rule bg-canvas/95 px-2 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/app/today"))} className="grid size-11 place-items-center rounded-[var(--radius-control)] hover:bg-ink/5" aria-label="返回">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-bold">預約詳情</h1>
      </div>
      <AppointmentDetail key={id} id={id!} initialAction={params.get("action") ?? undefined} />
    </div>
  );
}
