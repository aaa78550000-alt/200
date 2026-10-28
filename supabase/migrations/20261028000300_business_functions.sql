-- Business operations. All SECURITY DEFINER with a fixed search_path; every function:
--   1) resolves the row's shop and checks the caller's active membership/role,
--   2) checks the optimistic version where a status changes,
--   3) validates the transition / schedule / amounts,
--   4) writes an append-only event with actor.
-- Errors: message = human text (zh-TW), hint = machine code read by the client adapter.

create or replace function app.fail(p_code text, p_message text, p_detail text default null) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_message, hint = p_code, detail = coalesce(p_detail, '');
end $$;

create or replace function app.actor_name() returns text
language sql stable security definer set search_path = public, app, extensions as $$
  select coalesce((select display_name from public.user_profiles where user_id = auth.uid()), '系統')
$$;

create or replace function app.require_role(p_shop uuid, p_roles app.member_role[]) returns void
language plpgsql stable security definer set search_path = public, app, extensions as $$
begin
  if auth.uid() is null or not app.has_role(p_shop, p_roles) then
    perform app.fail('FORBIDDEN', '目前的角色沒有這個操作權限');
  end if;
end $$;

create or replace function app.log_event(p_shop uuid, p_apt uuid, p_kind text, p_summary text, p_data jsonb default '{}'::jsonb, p_actor_name text default null)
returns void language sql security definer set search_path = public, app, extensions as $$
  insert into public.appointment_events (shop_id, appointment_id, kind, actor_id, actor_name, summary, data)
  values (p_shop, p_apt, p_kind, auth.uid(), coalesce(p_actor_name, app.actor_name()), p_summary, p_data)
$$;

create or replace function app.allowed_transition(p_from app.appointment_status, p_to app.appointment_status) returns boolean
language sql immutable as $$
  select (p_from, p_to) in (
    ('pending', 'confirmed'), ('pending', 'cancelled'),
    ('confirmed', 'checked_in'), ('confirmed', 'cancelled'), ('confirmed', 'no_show'),
    ('checked_in', 'in_service'), ('checked_in', 'cancelled'),
    ('in_service', 'ready_pickup'),
    ('ready_pickup', 'completed'))
$$;

create or replace function app.status_label(p app.appointment_status) returns text language sql immutable as $$
  select case p when 'pending' then '待確認' when 'confirmed' then '已確認' when 'checked_in' then '已報到' when 'in_service' then '服務中'
    when 'ready_pickup' then '待接回' when 'completed' then '已完成' when 'cancelled' then '已取消' else '未到店' end
$$;

/** Locks the appointment row and checks the optimistic version. */
create or replace function app.lock_appointment(p_id uuid, p_version int default null) returns public.appointments
language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if not found or not app.is_member(a.shop_id) then
    perform app.fail('NOT_FOUND', '找不到這筆預約');
  end if;
  if p_version is not null and a.version <> p_version then
    perform app.fail('VERSION_MISMATCH', '這筆預約剛被其他人更新，畫面已重新整理，請確認後再操作。');
  end if;
  return a;
end $$;

/** Schedule rules other than overlap (overlap is the exclusion constraint). Returns human messages. */
create or replace function app.schedule_problems(p_shop uuid, p_staff uuid, p_starts timestamptz, p_ends timestamptz, p_buffer int, p_service_ids uuid[], p_ignore uuid default null)
returns text[] language plpgsql stable security definer set search_path = public, app, extensions as $$
declare
  tz text;
  local_start timestamp;
  local_end timestamp;
  h public.operating_hours;
  out text[] := '{}';
  r record;
begin
  select timezone into tz from public.shops where id = p_shop;
  local_start := p_starts at time zone tz;
  local_end := p_ends at time zone tz;
  select * into h from public.operating_hours where shop_id = p_shop and weekday = extract(dow from local_start);
  if not found or h.opens is null then
    out := out || '當天店休'::text;
  elsif local_start::time < h.opens or local_end::time > h.closes or local_end::date <> local_start::date then
    out := out || format('超出營業時間 %s–%s', to_char(h.opens, 'HH24:MI'), to_char(h.closes, 'HH24:MI'));
  end if;
  if not exists (select 1 from public.staff_profiles where id = p_staff and shop_id = p_shop and active and is_groomer) then
    out := out || '美容師不存在或未啟用'::text;
  elsif exists (select 1 from unnest(p_service_ids) sid where not exists (select 1 from public.staff_services ss where ss.staff_id = p_staff and ss.service_id = sid)) then
    out := out || '美容師未設定可提供此服務'::text;
  end if;
  for r in select * from public.staff_breaks b where b.staff_id = p_staff
    and local_start::time < b.ends and b.starts < local_end::time loop
    out := out || format('與%s %s–%s 重疊', r.label, to_char(r.starts, 'HH24:MI'), to_char(r.ends, 'HH24:MI'));
  end loop;
  for r in select * from public.time_off t where t.staff_id = p_staff
    and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts, p_ends + make_interval(mins => p_buffer)) loop
    out := out || format('美容師休假：%s', r.reason);
  end loop;
  for r in select a.starts_at from public.appointments a where a.staff_id = p_staff and a.id is distinct from p_ignore
    and a.status in ('confirmed', 'checked_in', 'in_service', 'ready_pickup')
    and tstzrange(a.starts_at, a.occupied_until) && tstzrange(p_starts, p_ends + make_interval(mins => p_buffer)) loop
    out := out || format('與 %s 的預約時間重疊（含緩衝）', to_char(r.starts_at at time zone tz, 'HH24:MI'));
  end loop;
  return out;
end $$;

create or replace function app.assert_schedule(p_shop uuid, p_staff uuid, p_starts timestamptz, p_ends timestamptz, p_buffer int, p_service_ids uuid[], p_ignore uuid default null)
returns void language plpgsql stable security definer set search_path = public, app, extensions as $$
declare problems text[];
begin
  problems := app.schedule_problems(p_shop, p_staff, p_starts, p_ends, p_buffer, p_service_ids, p_ignore);
  if cardinality(problems) > 0 then
    perform app.fail('CONFLICT', '這個時段無法安排', array_to_string(problems, E'\n'));
  end if;
end $$;

create or replace function app.queue_notification(p_shop uuid, p_apt uuid, p_kind text) returns void
language sql security definer set search_path = public, app, extensions as $$
  insert into public.notification_jobs (shop_id, appointment_id, kind, dedupe_key)
  values (p_shop, p_apt, p_kind, p_kind || ':' || p_apt::text)
  on conflict (shop_id, dedupe_key) do nothing
$$;

create or replace function app.approved_service_ids(p_apt uuid) returns uuid[]
language sql stable security definer set search_path = public, app, extensions as $$
  select coalesce(array_agg(service_id), '{}') from public.appointment_items where appointment_id = p_apt and approval = 'approved'
$$;

-- ---------- money derived from the ledger ----------
create or replace function app.payment_summary(p_apt uuid, out total_due int, out paid int, out refunded int, out status text)
language sql stable security definer set search_path = public, app, extensions as $$
  with due as (select coalesce(sum(price_snapshot), 0)::int v from public.appointment_items where appointment_id = p_apt and approval = 'approved'),
       p as (select coalesce(sum(amount_ntd) filter (where type = 'payment'), 0)::int pay, coalesce(sum(amount_ntd) filter (where type = 'refund'), 0)::int ref
             from public.payment_transactions where appointment_id = p_apt)
  select due.v, p.pay, p.ref,
    case when p.ref > 0 then case when p.pay - p.ref <= 0 then 'refunded' else 'partially_refunded' end
         when p.pay <= 0 then 'unpaid'
         when p.pay - p.ref >= due.v then 'paid'
         else 'partially_paid' end
  from due, p
$$;

-- List view with derived money. security_invoker → RLS of the caller applies (groomers see paid = 0 and the UI hides money).
create or replace view public.appointment_overview with (security_invoker = true) as
select a.*,
  (select coalesce(sum(price_snapshot), 0)::int from public.appointment_items i where i.appointment_id = a.id and i.approval = 'approved') as total_due,
  (select coalesce(sum(case when t.type = 'payment' then t.amount_ntd else -t.amount_ntd end), 0)::int from public.payment_transactions t where t.appointment_id = a.id) as paid_net,
  (select coalesce(sum(t.amount_ntd), 0)::int from public.payment_transactions t where t.appointment_id = a.id and t.type = 'refund') as refunded
from public.appointments a;
grant select on public.appointment_overview to authenticated;

-- ---------- staff operations ----------
create or replace function app.create_appointment(p_shop uuid, p_pet uuid, p_staff uuid, p_starts_at timestamptz, p_service_ids uuid[], p_client_request_id text)
returns public.appointments language plpgsql security definer set search_path = public, app, extensions as $$
declare
  a public.appointments;
  v_pet public.pets;
  v_duration int;
  v_buffer int;
begin
  perform app.require_role(p_shop, '{owner,manager,receptionist}');
  select * into a from public.appointments where shop_id = p_shop and client_request_id = p_client_request_id;
  if found then return a; end if; -- idempotent retry
  select * into v_pet from public.pets where id = p_pet and shop_id = p_shop;
  if not found then perform app.fail('NOT_FOUND', '找不到這隻毛孩'); end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 then perform app.fail('VALIDATION', '請選擇服務'); end if;
  if (select count(*) from public.services where shop_id = p_shop and active and id = any (p_service_ids)) <> cardinality(p_service_ids) then
    perform app.fail('VALIDATION', '服務不存在或已停用');
  end if;
  select sum(duration_minutes), max(buffer_minutes) into v_duration, v_buffer from public.services where id = any (p_service_ids);
  perform app.assert_schedule(p_shop, p_staff, p_starts_at, p_starts_at + make_interval(mins => v_duration), v_buffer, p_service_ids);
  begin
    insert into public.appointments (shop_id, pet_id, customer_id, staff_id, starts_at, ends_at, buffer_minutes, status, source, client_request_id, created_by)
    values (p_shop, p_pet, v_pet.primary_customer_id, p_staff, p_starts_at, p_starts_at + make_interval(mins => v_duration), v_buffer, 'confirmed', 'staff', p_client_request_id, auth.uid())
    returning * into a;
  exception when exclusion_violation then
    perform app.fail('CONFLICT', '這個時段無法安排', '同一時間已有其他確認的預約');
  end;
  insert into public.appointment_items (shop_id, appointment_id, service_id, name, price_snapshot, duration_snapshot)
  select p_shop, a.id, s.id, s.name, s.base_price, s.duration_minutes from public.services s where s.id = any (p_service_ids);
  perform app.log_event(p_shop, a.id, 'created', app.actor_name() || ' 建立並確認預約');
  return a;
end $$;

create or replace function app.confirm_appointment(p_id uuid, p_version int, p_staff uuid default null)
returns public.appointments language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments; v_name text;
begin
  a := app.lock_appointment(p_id, p_version);
  perform app.require_role(a.shop_id, '{owner,manager,receptionist}');
  if not app.allowed_transition(a.status, 'confirmed') then
    perform app.fail('INVALID_TRANSITION', format('「%s」不能直接變成「已確認」', app.status_label(a.status)));
  end if;
  if coalesce(p_staff, a.staff_id) is null then perform app.fail('VALIDATION', '請先指派美容師'); end if;
  perform app.assert_schedule(a.shop_id, coalesce(p_staff, a.staff_id), a.starts_at, a.ends_at, a.buffer_minutes, app.approved_service_ids(a.id), a.id);
  begin
    update public.appointments set status = 'confirmed', staff_id = coalesce(p_staff, staff_id), version = version + 1 where id = p_id returning * into a;
  exception when exclusion_violation then
    perform app.fail('CONFLICT', '這個時段無法安排', '同一時間已有其他確認的預約');
  end;
  select display_name into v_name from public.staff_profiles where id = a.staff_id;
  perform app.log_event(a.shop_id, a.id, 'confirmed', '確認預約並指派 ' || v_name);
  perform app.queue_notification(a.shop_id, a.id, 'booking_confirmed');
  return a;
end $$;

create or replace function app.set_status(p_id uuid, p_version int, p_to app.appointment_status, p_reason text default null)
returns public.appointments language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments;
begin
  a := app.lock_appointment(p_id, p_version);
  if p_to in ('checked_in', 'in_service') then
    perform app.require_role(a.shop_id, '{owner,manager,receptionist,groomer}');
  elsif p_to in ('cancelled', 'no_show') then
    perform app.require_role(a.shop_id, '{owner,manager,receptionist}');
  else
    perform app.fail('INVALID_TRANSITION', '請使用對應的操作（完工、交接）');
  end if;
  if not app.allowed_transition(a.status, p_to) then
    perform app.fail('INVALID_TRANSITION', format('「%s」不能直接變成「%s」', app.status_label(a.status), app.status_label(p_to)));
  end if;
  if p_to = 'cancelled' and coalesce(trim(p_reason), '') = '' then perform app.fail('VALIDATION', '請填寫取消原因'); end if;
  update public.appointments set
    status = p_to, version = version + 1,
    checked_in_at = case when p_to = 'checked_in' then now() else checked_in_at end,
    service_started_at = case when p_to = 'in_service' then now() else service_started_at end,
    cancelled_reason = case when p_to = 'cancelled' then p_reason else cancelled_reason end
  where id = p_id returning * into a;
  perform app.log_event(a.shop_id, a.id, case when p_to = 'cancelled' then 'cancelled' else 'status_changed' end,
    case p_to when 'checked_in' then '已報到：核對毛孩與注意事項' when 'in_service' then '開始美容' when 'no_show' then '標記未到店' else '取消：' || p_reason end);
  return a;
end $$;

create or replace function app.reschedule_appointment(p_id uuid, p_version int, p_starts_at timestamptz, p_staff uuid)
returns public.appointments language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments; v_len interval; v_before text; v_tz text; v_name text;
begin
  a := app.lock_appointment(p_id, p_version);
  perform app.require_role(a.shop_id, '{owner,manager,receptionist}');
  if a.status not in ('pending', 'confirmed') then perform app.fail('INVALID_TRANSITION', '已報到或之後的預約不能改期'); end if;
  select timezone into v_tz from public.shops where id = a.shop_id;
  v_len := a.ends_at - a.starts_at;
  v_before := to_char(a.starts_at at time zone v_tz, 'YYYY-MM-DD HH24:MI');
  if a.status = 'confirmed' then
    perform app.assert_schedule(a.shop_id, p_staff, p_starts_at, p_starts_at + v_len, a.buffer_minutes, app.approved_service_ids(a.id), a.id);
  end if;
  begin
    update public.appointments set starts_at = p_starts_at, ends_at = p_starts_at + v_len, staff_id = p_staff, version = version + 1
    where id = p_id returning * into a;
  exception when exclusion_violation then
    perform app.fail('CONFLICT', '這個時段無法安排', '同一時間已有其他確認的預約');
  end;
  select display_name into v_name from public.staff_profiles where id = p_staff;
  perform app.log_event(a.shop_id, a.id, 'rescheduled', format('改期：%s → %s（%s）', v_before, to_char(p_starts_at at time zone v_tz, 'YYYY-MM-DD HH24:MI'), v_name));
  return a;
end $$;

create or replace function app.finish_service(p_id uuid, p_version int, p_outcome app.finish_outcome, p_note text, p_incident text, p_contact app.owner_contact)
returns public.appointments language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments;
begin
  a := app.lock_appointment(p_id, p_version); -- stale version → a double tap cannot finish twice
  perform app.require_role(a.shop_id, '{owner,manager,receptionist,groomer}');
  if not app.allowed_transition(a.status, 'ready_pickup') then
    perform app.fail('INVALID_TRANSITION', format('「%s」不能完工', app.status_label(a.status)));
  end if;
  if p_outcome = 'abnormal' and (coalesce(trim(p_incident), '') = '' or p_contact is null) then
    perform app.fail('VALIDATION', '異常完工需填寫狀況說明與飼主聯絡狀態');
  end if;
  update public.appointments set status = 'ready_pickup', version = version + 1, finished_at = now(), finish_outcome = p_outcome,
    finish_note = nullif(trim(p_note), ''), incident_note = case when p_outcome = 'abnormal' then trim(p_incident) end,
    owner_contact = case when p_outcome = 'abnormal' then p_contact end
  where id = p_id returning * into a;
  perform app.log_event(a.shop_id, a.id, 'finish_recorded', case when p_outcome = 'normal' then '完成美容（正常）' else '完成美容（異常，已記錄）' end);
  if p_outcome = 'abnormal' then perform app.log_event(a.shop_id, a.id, 'incident', '異常紀錄：' || trim(p_incident)); end if;
  perform app.queue_notification(a.shop_id, a.id, 'ready_pickup');
  return a;
end $$;

create or replace function app.request_addon(p_id uuid, p_service uuid) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments; s public.services;
begin
  a := app.lock_appointment(p_id);
  perform app.require_role(a.shop_id, '{owner,manager,receptionist,groomer}');
  if a.status not in ('checked_in', 'in_service') then perform app.fail('INVALID_TRANSITION', '只有服務中可以提出加購'); end if;
  select * into s from public.services where id = p_service and shop_id = a.shop_id and is_addon and active;
  if not found then perform app.fail('NOT_FOUND', '找不到加購項目'); end if;
  insert into public.appointment_items (shop_id, appointment_id, service_id, name, price_snapshot, duration_snapshot, approval)
  values (a.shop_id, a.id, s.id, s.name, s.base_price, s.duration_minutes, 'pending_owner');
  perform app.log_event(a.shop_id, a.id, 'addon_requested', format('加購「%s」NT$%s，等待飼主同意', s.name, s.base_price));
end $$;

create or replace function app.decide_addon(p_item uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare i public.appointment_items;
begin
  select * into i from public.appointment_items where id = p_item for update;
  if not found or not app.is_member(i.shop_id) then perform app.fail('NOT_FOUND', '找不到加購項目'); end if;
  perform app.require_role(i.shop_id, '{owner,manager,receptionist,groomer}');
  if i.approval <> 'pending_owner' then perform app.fail('VALIDATION', '這個加購已經處理過'); end if;
  update public.appointment_items set approval = case when p_approve then 'approved'::app.item_approval else 'declined'::app.item_approval end where id = p_item;
  perform app.log_event(i.shop_id, i.appointment_id, 'addon_decided', format('飼主%s加購「%s」（由 %s 記錄）', case when p_approve then '同意' else '不同意' end, i.name, app.actor_name()));
end $$;

create or replace function app.record_payment(p_id uuid, p_type app.payment_type, p_method app.payment_method, p_amount int, p_key text, p_note text default null)
returns public.payment_transactions language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments; t public.payment_transactions; s record;
begin
  a := app.lock_appointment(p_id); -- serialises concurrent payments/refunds on one appointment
  perform app.require_role(a.shop_id, case when p_type = 'refund' then '{owner,manager}'::app.member_role[] else '{owner,manager,receptionist}'::app.member_role[] end);
  select * into t from public.payment_transactions where shop_id = a.shop_id and idempotency_key = p_key;
  if found then
    if t.appointment_id <> p_id or t.amount_ntd <> p_amount or t.type <> p_type then
      perform app.fail('VALIDATION', '同一個請求編號被用在不同的款項');
    end if;
    return t; -- retry of the same request: no double charge
  end if;
  if p_amount is null or p_amount <= 0 then perform app.fail('VALIDATION', '金額需為正整數'); end if;
  if a.status in ('pending', 'cancelled', 'no_show') then perform app.fail('INVALID_TRANSITION', '這筆預約目前不能收款'); end if;
  s := app.payment_summary(p_id);
  if p_type = 'refund' and p_amount > s.paid - s.refunded then
    perform app.fail('VALIDATION', format('退款金額不可超過已收 NT$%s', s.paid - s.refunded));
  end if;
  if p_type = 'refund' and coalesce(trim(p_note), '') = '' then perform app.fail('VALIDATION', '請填寫退款原因'); end if;
  insert into public.payment_transactions (shop_id, appointment_id, type, method, amount_ntd, idempotency_key, note, created_by, created_by_name)
  values (a.shop_id, p_id, p_type, p_method, p_amount, p_key, nullif(trim(p_note), ''), auth.uid(), app.actor_name())
  returning * into t;
  perform app.log_event(a.shop_id, p_id, p_type::text, format('%s NT$%s（%s）%s', case when p_type = 'refund' then '退款' else '收款' end, p_amount,
    case p_method when 'cash' then '現金' when 'transfer' then '轉帳' else '外部刷卡' end, coalesce('：' || nullif(trim(p_note), ''), '')));
  return t;
end $$;

create or replace function app.handover(p_id uuid, p_version int, p_unpaid_reason text default null)
returns public.appointments language plpgsql security definer set search_path = public, app, extensions as $$
declare a public.appointments; s record; owing int;
begin
  a := app.lock_appointment(p_id, p_version);
  perform app.require_role(a.shop_id, '{owner,manager,receptionist,groomer}');
  if not app.allowed_transition(a.status, 'completed') then
    perform app.fail('INVALID_TRANSITION', format('「%s」不能交接', app.status_label(a.status)));
  end if;
  s := app.payment_summary(p_id);
  owing := s.total_due - (s.paid - s.refunded);
  if owing > 0 then
    if not app.has_role(a.shop_id, '{owner,manager}') then
      perform app.fail('FORBIDDEN', format('尚有 NT$%s 未收，未付款交接需店長授權', owing));
    end if;
    if coalesce(trim(p_unpaid_reason), '') = '' then perform app.fail('VALIDATION', '未付款交接需填寫原因'); end if;
  end if;
  update public.appointments set status = 'completed', version = version + 1, completed_at = now() where id = p_id returning * into a;
  if owing > 0 then
    perform app.log_event(a.shop_id, a.id, 'handover_unpaid_authorized', format('%s 授權未付款交接（未收 NT$%s）：%s', app.actor_name(), owing, trim(p_unpaid_reason)));
    insert into public.audit_logs (shop_id, actor_id, action, target, data) values (a.shop_id, auth.uid(), 'handover_unpaid', a.id::text, jsonb_build_object('owing', owing, 'reason', p_unpaid_reason));
  end if;
  perform app.log_event(a.shop_id, a.id, 'handover', '飼主已接回，預約完成');
  return a;
end $$;

create or replace function app.retry_notification(p_job uuid) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare j public.notification_jobs;
begin
  select * into j from public.notification_jobs where id = p_job for update;
  if not found or not app.is_member(j.shop_id) then perform app.fail('NOT_FOUND', '找不到通知'); end if;
  if j.status <> 'failed' then perform app.fail('VALIDATION', '這個通知不需要重試'); end if;
  if j.attempts >= 5 then perform app.fail('VALIDATION', '已達重試上限，請改用電話聯絡'); end if;
  update public.notification_jobs set status = 'queued', next_attempt_at = now(), updated_at = now() where id = p_job;
end $$;

-- ---------- notification worker (service role / edge function) ----------
create or replace function app.claim_notification_jobs(p_limit int default 20) returns setof public.notification_jobs
language sql security definer set search_path = public, app, extensions as $$
  update public.notification_jobs j set attempts = attempts + 1, updated_at = now(), next_attempt_at = now() + interval '5 minutes'
  where j.id in (select id from public.notification_jobs where status = 'queued' and next_attempt_at <= now() order by next_attempt_at limit p_limit for update skip locked)
  returning j.*
$$;

/** Records a delivery attempt. Failures are retried automatically with exponential backoff up to 3 attempts,
    then left as `failed` for a person to retry or call the owner. A send never means "read". */
create or replace function app.complete_notification_job(p_job uuid, p_ok boolean, p_error text default null, p_response jsonb default null, p_final boolean default false) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare j public.notification_jobs; v_retry boolean;
begin
  select * into j from public.notification_jobs where id = p_job for update;
  v_retry := not p_ok and not p_final and j.attempts < 3;
  update public.notification_jobs set
    status = case when p_ok then 'sent'::app.notification_status when v_retry then 'queued'::app.notification_status else 'failed'::app.notification_status end,
    last_error = case when p_ok then null else p_error end, provider_response = p_response, updated_at = now(),
    next_attempt_at = now() + make_interval(mins => (2 ^ j.attempts)::int)
  where id = p_job returning * into j;
  perform app.log_event(j.shop_id, j.appointment_id, 'notification',
    case when p_ok then '通知已送出（' || j.channel || '；送出不代表已讀）'
         when v_retry then '通知送出失敗，稍後自動重試：' || coalesce(p_error, '未知錯誤')
         else '通知送出失敗：' || coalesce(p_error, '未知錯誤') end, '{}'::jsonb, '系統');
end $$;

/** DEV ONLY: lets the browser drive the mock LINE worker for shops with dev_mode = true. */
create or replace function app.dev_run_mock_notifications(p_shop uuid, p_fail boolean default false) returns int
language plpgsql security definer set search_path = public, app, extensions as $$
declare j public.notification_jobs; n int := 0;
begin
  if not exists (select 1 from public.shops where id = p_shop and dev_mode) then perform app.fail('FORBIDDEN', '只有開發模式店家可使用模擬通知'); end if;
  perform app.require_role(p_shop, '{owner,manager,receptionist,groomer}');
  for j in select * from app.claim_notification_jobs(50) where shop_id = p_shop loop
    perform app.complete_notification_job(j.id, not p_fail, case when p_fail then 'LINE API 模擬錯誤 503（開發模式）' end, jsonb_build_object('mock', true), true);
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function app.claim_notification_jobs(int), app.complete_notification_job(uuid, boolean, text, jsonb, boolean) to service_role;

grant execute on function
  app.create_appointment(uuid, uuid, uuid, timestamptz, uuid[], text),
  app.confirm_appointment(uuid, int, uuid),
  app.set_status(uuid, int, app.appointment_status, text),
  app.reschedule_appointment(uuid, int, timestamptz, uuid),
  app.finish_service(uuid, int, app.finish_outcome, text, text, app.owner_contact),
  app.request_addon(uuid, uuid),
  app.decide_addon(uuid, boolean),
  app.record_payment(uuid, app.payment_type, app.payment_method, int, text, text),
  app.handover(uuid, int, text),
  app.retry_notification(uuid),
  app.dev_run_mock_notifications(uuid, boolean)
to authenticated;
