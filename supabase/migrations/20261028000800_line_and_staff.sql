-- Real LINE delivery (M4-02), LINE-based returning-customer verification, staff accounts.
-- Each shop connects its OWN LINE Official Account. Secrets live in shop_line_channels, which no
-- client role can read: only SECURITY DEFINER functions and the service role (Edge Functions) use them.

-- ---------- LINE channel per shop ----------
create table public.shop_line_channels (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  channel_secret text not null,
  access_token text not null,
  bot_basic_id text not null check (bot_basic_id ~ '^@[A-Za-z0-9._-]{2,30}$'),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
alter table public.shop_line_channels enable row level security; -- no policies on purpose
revoke all on public.shop_line_channels from anon, authenticated;

alter table public.customers add column line_user_id text;
create unique index customers_line_user on public.customers (shop_id, line_user_id) where line_user_id is not null;

create table public.customer_link_codes (
  code text primary key,
  shop_id uuid not null references public.shops (id) on delete cascade,
  customer_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  foreign key (shop_id, customer_id) references public.customers (shop_id, id) on delete cascade
);
alter table public.customer_link_codes enable row level security;
revoke all on public.customer_link_codes from anon, authenticated;

-- Notification jobs: OTP messages have no appointment; payload carries the code until it is sent.
alter table public.notification_jobs alter column appointment_id drop not null;
alter table public.notification_jobs add column customer_id uuid;
alter table public.notification_jobs add column payload jsonb;
alter table public.notification_jobs drop constraint notification_jobs_kind_check;
alter table public.notification_jobs add constraint notification_jobs_kind_check
  check (kind in ('ready_pickup', 'booking_received', 'booking_confirmed', 'otp'));
alter table public.notification_jobs add constraint notification_jobs_target check (appointment_id is not null or customer_id is not null);
alter table public.notification_jobs alter column channel set default 'line';

alter table public.user_profiles add column email text;

create or replace function app.shop_has_line(p_shop uuid) returns boolean
language sql stable security definer set search_path = public, app, extensions as $$
  select exists (select 1 from public.shop_line_channels where shop_id = p_shop)
$$;

/**
 * Queue a message. dev_mode shops (local seed only) keep the mock worker; real shops without LINE get an
 * explicit "not sent" status instead of a job that waits forever.
 */
create or replace function app.queue_notification(p_shop uuid, p_apt uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare v_dev boolean; v_line boolean; v_linked boolean;
begin
  select dev_mode into v_dev from public.shops where id = p_shop;
  v_line := app.shop_has_line(p_shop);
  select c.line_user_id is not null into v_linked from public.appointments a join public.customers c on c.id = a.customer_id where a.id = p_apt;
  insert into public.notification_jobs (shop_id, appointment_id, kind, dedupe_key, channel, status, last_error)
  values (p_shop, p_apt, p_kind, p_kind || ':' || p_apt::text,
    case when v_dev and not v_line then 'line_mock' else 'line' end,
    case when v_dev or (v_line and coalesce(v_linked, false)) then 'queued'::app.notification_status else 'not_applicable'::app.notification_status end,
    case when v_dev or (v_line and coalesce(v_linked, false)) then null
         when not v_line then '店家尚未連接 LINE 官方帳號' else '飼主尚未綁定 LINE' end)
  on conflict (shop_id, dedupe_key) do nothing;
end $$;

-- ---------- owner settings ----------
create or replace function app.set_line_channel(p_shop uuid, p_secret text, p_token text, p_basic_id text) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
begin
  perform app.require_role(p_shop, '{owner}');
  if coalesce(length(trim(p_secret)), 0) < 16 or coalesce(length(trim(p_token)), 0) < 40 then
    perform app.fail('VALIDATION', 'Channel secret 或 Channel access token 看起來不完整，請從 LINE Developers 複製完整內容');
  end if;
  if trim(p_basic_id) !~ '^@[A-Za-z0-9._-]{2,30}$' then perform app.fail('VALIDATION', 'LINE ID 需以 @ 開頭，例如 @123abcde'); end if;
  insert into public.shop_line_channels (shop_id, channel_secret, access_token, bot_basic_id, updated_by)
  values (p_shop, trim(p_secret), trim(p_token), trim(p_basic_id), auth.uid())
  on conflict (shop_id) do update set channel_secret = excluded.channel_secret, access_token = excluded.access_token,
    bot_basic_id = excluded.bot_basic_id, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (shop_id, actor_id, action) values (p_shop, auth.uid(), 'line_channel_set');
end $$;

create or replace function app.clear_line_channel(p_shop uuid) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
begin
  perform app.require_role(p_shop, '{owner}');
  delete from public.shop_line_channels where shop_id = p_shop;
  insert into public.audit_logs (shop_id, actor_id, action) values (p_shop, auth.uid(), 'line_channel_cleared');
end $$;

/** What staff may know about the LINE connection — never the secrets. */
create or replace function app.line_status(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare c public.shop_line_channels;
begin
  if not app.is_member(p_shop) then perform app.fail('NOT_FOUND', '找不到店家'); end if;
  select * into c from public.shop_line_channels where shop_id = p_shop;
  return jsonb_build_object(
    'configured', c.shop_id is not null,
    'basicId', c.bot_basic_id,
    'updatedAt', c.updated_at,
    'linkedCustomers', (select count(*) from public.customers where shop_id = p_shop and line_user_id is not null));
end $$;

/** Staff generates a one-time code the owner sends to the shop's LINE account to link their chat. */
create or replace function app.create_link_code(p_customer uuid) returns jsonb
language plpgsql security definer set search_path = public, app, extensions as $$
declare c public.customers; v_code text; b text;
begin
  select * into c from public.customers where id = p_customer;
  if not found or not app.is_member(c.shop_id) then perform app.fail('NOT_FOUND', '找不到飼主'); end if;
  perform app.require_role(c.shop_id, '{owner,manager,receptionist}');
  select bot_basic_id into b from public.shop_line_channels where shop_id = c.shop_id;
  if b is null then perform app.fail('VALIDATION', '請先在「服務與設定」連接店家的 LINE 官方帳號'); end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.customer_link_codes where code = v_code and used_at is null and expires_at > now());
  end loop;
  delete from public.customer_link_codes where customer_id = p_customer and used_at is null;
  insert into public.customer_link_codes (code, shop_id, customer_id, expires_at) values (v_code, c.shop_id, c.id, now() + interval '7 days');
  return jsonb_build_object('code', v_code, 'basicId', b, 'expiresAt', now() + interval '7 days');
end $$;

/** After an online request: the browser that submitted it (proved by its client request id) may get a link code. */
create or replace function app.public_link_code(p_slug text, p_appointment uuid, p_client_request_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, extensions as $$
declare s public.shops; a public.appointments; c public.customers; b text; v_code text;
begin
  s := app.shop_by_slug(p_slug);
  select bot_basic_id into b from public.shop_line_channels where shop_id = s.id;
  if b is null then return jsonb_build_object('available', false); end if;
  select * into a from public.appointments where id = p_appointment and shop_id = s.id and client_request_id = p_client_request_id;
  if not found then perform app.fail('NOT_FOUND', '找不到這筆申請'); end if;
  select * into c from public.customers where id = a.customer_id;
  if c.line_user_id is not null then return jsonb_build_object('available', true, 'linked', true, 'basicId', b); end if;
  select code into v_code from public.customer_link_codes where customer_id = c.id and used_at is null and expires_at > now() limit 1;
  if v_code is null then
    loop
      v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
      exit when not exists (select 1 from public.customer_link_codes where code = v_code and used_at is null and expires_at > now());
    end loop;
    insert into public.customer_link_codes (code, shop_id, customer_id, expires_at) values (v_code, s.id, c.id, now() + interval '7 days');
  end if;
  return jsonb_build_object('available', true, 'linked', false, 'basicId', b, 'code', v_code);
end $$;

-- ---------- booking: returning-customer verification goes through LINE ----------
create or replace function app.public_booking_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare s public.shops; b text;
begin
  s := app.shop_by_slug(p_slug);
  select bot_basic_id into b from public.shop_line_channels where shop_id = s.id;
  return jsonb_build_object(
    'shop', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'phone', s.phone, 'address', s.address, 'bookingNotice', s.booking_notice, 'timezone', s.timezone),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'description', v.description, 'basePrice', v.base_price,
        'priceIsFrom', v.price_is_from, 'durationMinutes', v.duration_minutes, 'bufferMinutes', v.buffer_minutes, 'species', v.species) order by v.sort, v.base_price)
      from public.services v where v.shop_id = s.id and v.active and v.online_bookable and not v.is_addon), '[]'::jsonb),
    'groomers', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'displayName', g.display_name) order by g.display_name)
      from public.staff_profiles g where g.shop_id = s.id and g.active and g.is_groomer), '[]'::jsonb),
    'closedWeekdays', coalesce((select jsonb_agg(weekday) from public.operating_hours where shop_id = s.id and opens is null), '[]'::jsonb),
    'returningVerification', case when b is not null then 'line' when s.dev_mode then 'demo' else 'none' end,
    'lineBasicId', b
  );
end $$;

/**
 * Sends the code to the customer's linked LINE chat. The answer is identical whether or not the phone
 * belongs to a linked customer (E18); unlinked phones simply receive nothing.
 */
create or replace function app.request_otp(p_slug text, p_phone text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, extensions as $$
declare s public.shops; v_phone text := app.normalize_phone(p_phone); v_code text; v_recent int; c public.customers; v_line boolean;
begin
  s := app.shop_by_slug(p_slug);
  v_line := app.shop_has_line(s.id);
  if not s.dev_mode and not v_line then perform app.fail('VALIDATION', '這間店尚未開通熟客驗證，請選「第一次來」填寫，店家會幫你對應資料'); end if;
  if v_phone !~ '^09[0-9]{8}$' then perform app.fail('VALIDATION', '請輸入正確的手機號碼（09 開頭 10 碼）'); end if;
  select count(*) into v_recent from public.booking_otps where shop_id = s.id and phone = v_phone and created_at > now() - interval '1 hour';
  if v_recent >= 5 then perform app.fail('RATE_LIMITED', '驗證碼請求太頻繁，請稍後再試'); end if;
  v_code := case when s.dev_mode and not v_line then '123456' else lpad((floor(random() * 1000000))::int::text, 6, '0') end;
  insert into public.booking_otps (shop_id, phone, code_hash, expires_at) values (s.id, v_phone, crypt(v_code, gen_salt('bf')), now() + interval '10 minutes');
  if v_line then
    select * into c from public.customers where shop_id = s.id and phone = v_phone and line_user_id is not null;
    if found then
      insert into public.notification_jobs (shop_id, customer_id, kind, dedupe_key, channel, payload)
      values (s.id, c.id, 'otp', 'otp:' || gen_random_uuid()::text, 'line', jsonb_build_object('code', v_code));
    end if;
    return jsonb_build_object('sent', true, 'channel', 'line');
  end if;
  return jsonb_build_object('sent', true, 'channel', 'demo', 'demoCode', v_code);
end $$;

-- ---------- for the Edge Functions (service role only) ----------
create or replace function app.line_channel(p_shop uuid) returns jsonb
language sql stable security definer set search_path = public, app, extensions as $$
  select jsonb_build_object('secret', channel_secret, 'token', access_token) from public.shop_line_channels where shop_id = p_shop
$$;

/** The real worker only takes real LINE jobs; local demo jobs (line_mock) stay with app.dev_run_mock_notifications. */
create or replace function app.claim_notification_jobs(p_limit int default 20) returns setof public.notification_jobs
language sql security definer set search_path = public, app, extensions as $$
  update public.notification_jobs j set attempts = attempts + 1, updated_at = now(), next_attempt_at = now() + interval '5 minutes'
  where j.id in (select id from public.notification_jobs where status = 'queued' and channel = 'line' and next_attempt_at <= now()
                 order by next_attempt_at limit p_limit for update skip locked)
  returning j.*
$$;

create or replace function app.dev_run_mock_notifications(p_shop uuid, p_fail boolean default false) returns int
language plpgsql security definer set search_path = public, app, extensions as $$
declare j public.notification_jobs; n int := 0;
begin
  if not exists (select 1 from public.shops where id = p_shop and dev_mode) then perform app.fail('FORBIDDEN', '只有開發模式店家可使用模擬通知'); end if;
  perform app.require_role(p_shop, '{owner,manager,receptionist,groomer}');
  for j in update public.notification_jobs set attempts = attempts + 1, updated_at = now()
           where id in (select id from public.notification_jobs where shop_id = p_shop and channel = 'line_mock' and status = 'queued' for update skip locked)
           returning * loop
    perform app.complete_notification_job(j.id, not p_fail, case when p_fail then 'LINE API 模擬錯誤 503（開發模式）' end, jsonb_build_object('mock', true), true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- staff accounts (called by the staff-admin Edge Function with the verified caller id) ----------
create or replace function app.rank(p app.member_role) returns int language sql immutable as $$
  select case p when 'owner' then 3 when 'manager' then 2 else 1 end
$$;

/** Owner manages everyone below owner; manager manages groomer/receptionist. Returns the caller's role. */
create or replace function app.assert_can_manage(p_shop uuid, p_actor uuid, p_target_role app.member_role) returns app.member_role
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare r app.member_role;
begin
  select role into r from public.shop_memberships where shop_id = p_shop and user_id = p_actor and status = 'active';
  if r is null or r not in ('owner', 'manager') or app.rank(p_target_role) >= app.rank(r) then
    perform app.fail('FORBIDDEN', '你的角色不能管理這個員工帳號');
  end if;
  return r;
end $$;

create or replace function app.add_staff_member(p_shop uuid, p_actor uuid, p_user uuid, p_name text, p_email text, p_role app.member_role, p_is_groomer boolean)
returns void language plpgsql security definer set search_path = public, app, extensions as $$
begin
  perform app.assert_can_manage(p_shop, p_actor, p_role);
  insert into public.user_profiles (user_id, display_name, email) values (p_user, trim(p_name), lower(trim(p_email)))
    on conflict (user_id) do update set display_name = excluded.display_name, email = excluded.email;
  insert into public.shop_memberships (shop_id, user_id, role) values (p_shop, p_user, p_role)
    on conflict (shop_id, user_id) do update set role = excluded.role, status = 'active';
  insert into public.staff_profiles (shop_id, user_id, display_name, is_groomer) values (p_shop, p_user, trim(p_name), p_is_groomer)
    on conflict (shop_id, user_id) do update set display_name = excluded.display_name, is_groomer = excluded.is_groomer, active = true;
  insert into public.audit_logs (shop_id, actor_id, action, target, data) values (p_shop, p_actor, 'staff_added', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function app.set_member_active(p_shop uuid, p_actor uuid, p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare r app.member_role;
begin
  if p_actor = p_user then perform app.fail('VALIDATION', '不能停用自己的帳號'); end if;
  select role into r from public.shop_memberships where shop_id = p_shop and user_id = p_user;
  if r is null then perform app.fail('NOT_FOUND', '找不到這位員工'); end if;
  perform app.assert_can_manage(p_shop, p_actor, r);
  update public.shop_memberships set status = case when p_active then 'active'::app.member_status else 'disabled'::app.member_status end where shop_id = p_shop and user_id = p_user;
  update public.staff_profiles set active = p_active where shop_id = p_shop and user_id = p_user;
  insert into public.audit_logs (shop_id, actor_id, action, target) values (p_shop, p_actor, case when p_active then 'staff_enabled' else 'staff_disabled' end, p_user::text);
end $$;

/** Password resets are only allowed for members of this shop the caller outranks. */
create or replace function app.assert_can_reset(p_shop uuid, p_actor uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare r app.member_role;
begin
  select role into r from public.shop_memberships where shop_id = p_shop and user_id = p_user;
  if r is null then perform app.fail('NOT_FOUND', '找不到這位員工'); end if;
  perform app.assert_can_manage(p_shop, p_actor, r);
end $$;

/** LINE webhook: a customer sent a 6-digit code to the shop's account. */
create or replace function app.line_link_customer(p_shop uuid, p_code text, p_line_user_id text) returns text
language plpgsql security definer set search_path = public, app, extensions as $$
declare l public.customer_link_codes; c public.customers;
begin
  select * into l from public.customer_link_codes where code = p_code and shop_id = p_shop and used_at is null and expires_at > now() for update;
  if not found then return null; end if;
  -- the same LINE account can only belong to one customer of this shop
  update public.customers set line_user_id = null where shop_id = p_shop and line_user_id = p_line_user_id and id <> l.customer_id;
  update public.customers set line_user_id = p_line_user_id, line_linked = true where id = l.customer_id returning * into c;
  update public.customer_link_codes set used_at = now() where code = p_code;
  insert into public.audit_logs (shop_id, action, target) values (p_shop, 'line_linked', c.id::text);
  return c.name;
end $$;

/** Everything the worker needs to send one job: recipient, token and the message text (zh-TW). */
create or replace function app.notification_message(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare j public.notification_jobs; ch public.shop_line_channels; s public.shops; a public.appointments; p public.pets; c public.customers; v_text text; v_when text;
begin
  select * into j from public.notification_jobs where id = p_job;
  select * into ch from public.shop_line_channels where shop_id = j.shop_id;
  select * into s from public.shops where id = j.shop_id;
  if j.appointment_id is not null then
    select * into a from public.appointments where id = j.appointment_id;
    select * into p from public.pets where id = a.pet_id;
    select * into c from public.customers where id = a.customer_id;
    v_when := to_char(a.starts_at at time zone s.timezone, 'MM/DD HH24:MI');
  else
    select * into c from public.customers where id = j.customer_id;
  end if;
  v_text := case j.kind
    when 'ready_pickup' then format('【%s】%s 已完成美容，可以來接回囉！%s', s.name, p.name,
      case when a.pickup_expected_at is not null then E'\n預計接回時間：' || to_char(a.pickup_expected_at at time zone s.timezone, 'HH24:MI') else '' end)
    when 'booking_confirmed' then format(E'【%s】%s 的預約已確認：%s。\n如需改期請直接回覆這個帳號或來電 %s。', s.name, p.name, v_when, coalesce(s.phone, ''))
    when 'booking_received' then format(E'【%s】已收到 %s %s 的預約申請，店家確認後會再通知你（目前尚未保留時段）。', s.name, p.name, v_when)
    when 'otp' then format(E'【%s】你的預約驗證碼是 %s，10 分鐘內有效。若不是你本人操作，請忽略這則訊息。', s.name, j.payload ->> 'code')
  end;
  return jsonb_build_object('to', c.line_user_id, 'token', ch.access_token, 'text', v_text);
end $$;

/** Same as before, but OTP jobs have no appointment to write history on. */
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
  if j.appointment_id is not null then
    perform app.log_event(j.shop_id, j.appointment_id, 'notification',
      case when p_ok then '通知已送出（LINE；送出不代表已讀）'
           when v_retry then '通知送出失敗，稍後自動重試：' || coalesce(p_error, '未知錯誤')
           else '通知送出失敗：' || coalesce(p_error, '未知錯誤') end, '{}'::jsonb, '系統');
  end if;
end $$;

-- OTP codes are removed from the queue once handled.
create or replace function app.clear_job_payload() returns trigger language plpgsql as $$
begin
  if new.kind = 'otp' and new.status in ('sent', 'failed') then new.payload := null; end if;
  return new;
end $$;
create trigger notification_jobs_clear_payload before update on public.notification_jobs for each row execute function app.clear_job_payload();

-- ---------- scheduling the worker (hosted Supabase: pg_cron + pg_net + Vault) ----------
-- The deploy workflow stores two Vault secrets: petos_worker_url and petos_worker_key.
create or replace function app.invoke_notify_worker() returns void
language plpgsql security definer set search_path = public, app, extensions as $$
declare v_url text; v_key text;
begin
  if to_regnamespace('vault') is null or to_regnamespace('net') is null then return; end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'petos_worker_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'petos_worker_key'$q$ into v_key;
  if v_url is null or v_key is null then return; end if;
  if not exists (select 1 from public.notification_jobs where status = 'queued' and next_attempt_at <= now()) then return; end if;
  execute 'select net.http_post(url := $1, headers := jsonb_build_object(''Authorization'', ''Bearer '' || $2, ''Content-Type'', ''application/json''), body := ''{}''::jsonb)'
    using v_url, v_key;
end $$;

-- Deliver right after the transaction that queued the job commits (pg_net requests are sent post-commit).
create or replace function app.kick_notify_worker() returns trigger language plpgsql security definer set search_path = public, app, extensions as $$
begin
  if new.status = 'queued' then perform app.invoke_notify_worker(); end if;
  return null;
end $$;
create trigger notification_jobs_kick after insert or update of status on public.notification_jobs
  for each row when (new.status = 'queued') execute function app.kick_notify_worker();

do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then raise notice 'pg_net not available: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
    -- retries with backoff and anything the immediate kick missed
    perform cron.schedule('petos-notify-worker', '* * * * *', 'select app.invoke_notify_worker()');
  exception when others then raise notice 'pg_cron not available: %', sqlerrm;
  end;
end $$;

call app.apply_function_grants();
