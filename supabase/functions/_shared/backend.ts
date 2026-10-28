// Minimal server-side helpers (no external dependencies): call app.* RPCs with the service role.
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export class RpcError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown>, bearer = SERVICE_KEY): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: bearer === SERVICE_KEY ? SERVICE_KEY : ANON_KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", "Content-Profile": "app", "Accept-Profile": "app" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new RpcError(body?.message ?? text, body?.hint ?? body?.code ?? "ERROR", res.status);
  return body as T;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
