import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAdapter } from "@/lib/db/context";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ActionError } from "@/components/ui/states";
import { Wordmark } from "@/app/AppShell";

const LOCAL_ACCOUNTS = [
  ["owner@calm.petos.test", "店主 王怡君"],
  ["iris@calm.petos.test", "櫃檯 Iris"],
  ["amy@calm.petos.test", "美容師 Amy"],
  ["owner@north.petos.test", "第二間店店主（隔離測試）"],
] as const;

export function LoginPage() {
  const adapter = useAdapter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const isLocal = /127\.0\.0\.1|localhost/.test(String(import.meta.env.VITE_SUPABASE_URL ?? ""));
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <form
        className="w-full max-w-[380px] space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await adapter.signIn!(email.trim(), password);
            qc.clear();
            navigate("/app/today", { replace: true });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Wordmark className="text-xl" />
        <h1 className="text-2xl font-bold">登入店家後台</h1>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="密碼" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error ? <ActionError error={error} /> : null}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          登入
        </Button>
        <p className="text-center text-sm text-muted">
          第一次使用？<Link className="text-primary hover:underline" to="/signup">建立店家帳號</Link>
        </p>
        {isLocal ? (
          <div className="border-t border-rule pt-3 text-sm text-muted">
            <p className="mb-1 font-medium text-ink">本機開發帳號（密碼 petos-dev-only，僅限本機 seed）</p>
            <ul className="space-y-0.5">
              {LOCAL_ACCOUNTS.map(([em, label]) => (
                <li key={em}>
                  <button type="button" className="min-h-8 text-left text-primary hover:underline" onClick={() => { setEmail(em); setPassword("petos-dev-only"); }}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </div>
  );
}
