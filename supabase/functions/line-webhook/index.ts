// LINE webhook for one shop: https://<project>.supabase.co/functions/v1/line-webhook?shop=<shop id>
// Verifies the signature with that shop's channel secret, links customers who send their 6-digit code.
import { json, rpc } from "../_shared/backend.ts";
import { replyText, validSignature } from "../_shared/line.ts";

interface LineEvent { type: string; replyToken?: string; source?: { userId?: string }; message?: { type: string; text?: string } }

Deno.serve(async (req) => {
  const shop = new URL(req.url).searchParams.get("shop") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(shop)) return json({ error: "missing shop" }, 400);
  const raw = await req.text();
  const channel = await rpc<{ secret: string; token: string } | null>("line_channel", { p_shop: shop });
  if (!channel || !(await validSignature(channel.secret, raw, req.headers.get("x-line-signature")))) return json({ error: "bad signature" }, 401);

  const events: LineEvent[] = JSON.parse(raw).events ?? []; // LINE's "verify" request has no events
  for (const e of events) {
    const userId = e.source?.userId;
    if (e.type === "follow" && e.replyToken) {
      await replyText(channel.token, e.replyToken, "謝謝加入！如果店家給了你 6 位數的綁定碼，直接傳給我們，之後預約與接回通知就會傳到這裡。");
    } else if (e.type === "message" && e.message?.type === "text" && userId && e.replyToken) {
      const code = (e.message.text ?? "").replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) continue; // ordinary chat is left for the shop to answer in LINE
      const name = await rpc<string | null>("line_link_customer", { p_shop: shop, p_code: code, p_line_user_id: userId });
      await replyText(channel.token, e.replyToken, name ? `綁定完成！${name}，之後的預約確認與接回通知會傳到這裡。` : "這組綁定碼無效或已過期，請向店家索取新的綁定碼。");
    }
  }
  return json({ ok: true });
});
