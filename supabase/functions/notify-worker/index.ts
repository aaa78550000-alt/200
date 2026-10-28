// Outbox worker: claims queued LINE jobs and pushes them. Invoked by pg_net right after a job is queued
// and every minute by pg_cron (retries with backoff). Only the database (holding PETOS_WORKER_SECRET in Vault)
// may call it; without that secret configured, the service key is accepted (local development).
import { json, rpc, SERVICE_KEY } from "../_shared/backend.ts";
import { pushText } from "../_shared/line.ts";

interface Job { id: string; attempts: number }
interface Message { to: string | null; token: string | null; text: string | null }

const WORKER_SECRET = Deno.env.get("PETOS_WORKER_SECRET") || SERVICE_KEY;

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${WORKER_SECRET}`) return json({ error: "unauthorized" }, 401);
  const jobs = await rpc<Job[]>("claim_notification_jobs", { p_limit: 20 });
  const results: { id: string; ok: boolean; status: number }[] = [];
  for (const job of jobs) {
    const m = await rpc<Message>("notification_message", { p_job: job.id });
    if (!m.token || !m.to || !m.text) {
      await rpc("complete_notification_job", { p_job: job.id, p_ok: false, p_error: !m.token ? "店家尚未連接 LINE 官方帳號" : "飼主尚未綁定 LINE", p_response: null, p_final: true });
      results.push({ id: job.id, ok: false, status: 0 });
      continue;
    }
    // The job id is the retry key: if a previous attempt reached LINE, LINE will not deliver it twice.
    const r = await pushText(m.token, m.to, m.text, job.id);
    await rpc("complete_notification_job", {
      p_job: job.id,
      p_ok: r.ok,
      p_error: r.ok ? null : `LINE API ${r.status || "連線失敗"}：${r.body.slice(0, 200)}`,
      p_response: { status: r.status, body: r.body.slice(0, 500) },
      p_final: r.permanent,
    });
    results.push({ id: job.id, ok: r.ok, status: r.status });
  }
  return json({ processed: results.length, results });
});
