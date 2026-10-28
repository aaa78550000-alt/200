// LINE Messaging API. LINE_API_BASE can point tests at a local stand-in; production uses api.line.me.
const LINE_API = Deno.env.get("LINE_API_BASE") ?? "https://api.line.me";

export interface LineResult {
  ok: boolean;
  status: number;
  body: string;
  /** 4xx other than 429 will not succeed on retry (bad token, user blocked the account, …). */
  permanent: boolean;
}

async function call(path: string, token: string, payload: unknown, retryKey?: string): Promise<LineResult> {
  try {
    const res = await fetch(`${LINE_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}) },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    // 409 with a retry key = this exact message was already accepted earlier → treat as sent.
    const ok = res.ok || (res.status === 409 && !!retryKey);
    return { ok, status: res.status, body, permanent: !ok && res.status >= 400 && res.status < 500 && res.status !== 429 };
  } catch (e) {
    return { ok: false, status: 0, body: String(e), permanent: false };
  }
}

export const pushText = (token: string, to: string, text: string, retryKey: string) =>
  call("/v2/bot/message/push", token, { to, messages: [{ type: "text", text }] }, retryKey);

export const replyText = (token: string, replyToken: string, text: string) =>
  call("/v2/bot/message/reply", token, { replyToken, messages: [{ type: "text", text }] });

/** X-Line-Signature = base64(HMAC-SHA256(channel secret, raw body)). Constant-time compare. */
export async function validSignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
