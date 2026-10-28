import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAdapter } from "@/lib/db/context";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { Wordmark } from "@/app/AppShell";

/** E01 / F01: create an account (if needed), then the shop. Defaults are editable in 服務與設定. */
export function OnboardingPage({ mode }: { mode: "signup" | "shop" }) {
  const adapter = useAdapter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<"account" | "shop">(mode === "signup" ? "account" : "shop");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [me, setMe] = useState("");
  const [groomer, setGroomer] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (adapter.mode === "demo" || !adapter.createShop)
    return (
      <div className="grid min-h-dvh place-items-center px-4 text-center">
        <div>
          <p className="text-lg font-bold">Demo 模式不需要註冊</p>
          <Link to="/app/today" className="text-primary hover:underline">回到 Demo</Link>
        </div>
      </div>
    );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Wordmark className="text-xl" />
        <ol className="mt-4 flex gap-4 text-sm" aria-label="開店步驟">
          <li className={step === "account" ? "font-bold" : "text-muted"}>1 建立帳號</li>
          <li className={step === "shop" ? "font-bold" : "text-muted"}>2 建立店家</li>
          <li className="text-muted">3 設定服務與時間</li>
        </ol>
        {step === "account" ? (
          <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await adapter.signUp!(email.trim(), password); setStep("shop"); }); }}>
            <h1 className="text-2xl font-bold">建立 PetOS 帳號</h1>
            <Field label="Email" htmlFor="su-email">
              <Input id="su-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="密碼" htmlFor="su-pw" hint="至少 8 個字元">
              <Input id="su-pw" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error ? <ActionError error={error} /> : null}
            <Button type="submit" variant="primary" size="lg" block loading={busy}>下一步</Button>
            <p className="text-center text-sm text-muted">已經有帳號？<Link className="text-primary hover:underline" to="/login">登入</Link></p>
          </form>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await adapter.createShop!({ name: name.trim(), slug: slug.trim(), displayName: me.trim(), isGroomer: groomer });
                qc.clear();
                navigate("/app/more?onboarding=1", { replace: true });
              });
            }}
          >
            <h1 className="text-2xl font-bold">建立你的店</h1>
            <Field label="店名" htmlFor="sh-name">
              <Input id="sh-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="例：靜室寵物美容" />
            </Field>
            <Field label="飼主預約網址" htmlFor="sh-slug" hint={`網址會是 /book/${slug || "your-shop"}（小寫英文、數字、-）`}>
              <Input id="sh-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} required minLength={3} className="num" />
            </Field>
            <Field label="你的稱呼" htmlFor="sh-me">
              <Input id="sh-me" value={me} onChange={(e) => setMe(e.target.value)} required placeholder="例：王怡君" />
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={groomer} onChange={(e) => setGroomer(e.target.checked)} />
              我也會幫毛孩美容（排進美容師行事曆）
            </label>
            {error ? <ActionError error={error} /> : null}
            <Button type="submit" variant="primary" size="lg" block loading={busy}>建立店家</Button>
            <p className="text-sm text-muted">預設營業時間為週二至週日 10:00–19:00、週一店休，下一步可以修改。</p>
          </form>
        )}
      </div>
    </div>
  );
}
