// Staff accounts for a shop (owner/manager). The caller is verified from their own access token;
// every permission rule is enforced again in SQL (app.assert_can_manage).
import { ANON_KEY, cors, json, rpc, RpcError, SERVICE_KEY, SUPABASE_URL } from "../_shared/backend.ts";

const ROLES = ["manager", "groomer", "receptionist"] as const;

async function caller(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } });
  return res.ok ? ((await res.json()) as { id: string }).id : null;
}

async function admin(path: string, method: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    method,
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const fail = (code: string, message: string, status = 400) => json({ code, message }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const actor = await caller(req);
  if (!actor) return fail("UNAUTHENTICATED", "請重新登入", 401);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "create") {
      const email = String(b.email ?? "").trim().toLowerCase();
      const password = String(b.password ?? "");
      const name = String(b.displayName ?? "").trim();
      if (!ROLES.includes(b.role)) return fail("VALIDATION", "角色不正確");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("VALIDATION", "Email 格式不正確");
      if (password.length < 8) return fail("VALIDATION", "初始密碼至少 8 個字元");
      if (!name) return fail("VALIDATION", "請填寫員工稱呼");
      await rpc("assert_can_manage", { p_shop: b.shopId, p_actor: actor, p_target_role: b.role });
      const created = await admin("/users", "POST", { email, password, email_confirm: true, user_metadata: { name } });
      if (!created.ok) {
        const exists = /already|registered|exists/i.test(JSON.stringify(created.data));
        return fail(exists ? "CONFLICT" : "VALIDATION", exists ? "這個 Email 已經有 PetOS 帳號；請改用其他 Email" : `建立帳號失敗（${created.status}）`);
      }
      await rpc("add_staff_member", { p_shop: b.shopId, p_actor: actor, p_user: created.data.id, p_name: name, p_email: email, p_role: b.role, p_is_groomer: !!b.isGroomer });
      return json({ ok: true, userId: created.data.id });
    }
    if (b.action === "setActive") {
      await rpc("set_member_active", { p_shop: b.shopId, p_actor: actor, p_user: b.userId, p_active: !!b.active });
      return json({ ok: true });
    }
    if (b.action === "resetPassword") {
      if (String(b.password ?? "").length < 8) return fail("VALIDATION", "新密碼至少 8 個字元");
      await rpc("assert_can_reset", { p_shop: b.shopId, p_actor: actor, p_user: b.userId });
      const r = await admin(`/users/${b.userId}`, "PUT", { password: b.password });
      if (!r.ok) return fail("VALIDATION", `重設密碼失敗（${r.status}）`);
      return json({ ok: true });
    }
    return fail("VALIDATION", "未知的操作");
  } catch (e) {
    if (e instanceof RpcError) return fail(e.code, e.message, e.status === 403 || e.code === "FORBIDDEN" ? 403 : 400);
    return fail("ERROR", String(e), 500);
  }
});
