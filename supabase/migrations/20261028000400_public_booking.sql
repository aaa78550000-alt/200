-- Public (anon) booking API for /book/:shopSlug.
-- * Read only what a customer needs: shop card, bookable services, groomer first names, closed weekdays, open slots.
-- * Requests are `pending` and never hold a slot; staff confirmation is where capacity is enforced.
-- * Returning customers prove phone ownership by OTP before any of their data is returned (E18).
--   request_otp answers identically for known and unknown numbers.

create or replace function app.normalize_phone(p text) returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')
$$;

create or replace function app.shop_by_slug(p_slug text) returns public.shops
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare s public.shops;
begin
  select * into s from public.shops where slug = p_slug and online_booking_enabled;
  if not found then perform app.fail('NOT_FOUND', '找不到這間店的預約頁'); end if;
  return s;
end $$;

create or replace function app.public_booking_info(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare s public.shops;
begin
  s := app.shop_by_slug(p_slug);
  return jsonb_build_object(
    'shop', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'phone', s.phone, 'address', s.address, 'bookingNotice', s.booking_notice, 'timezone', s.timezone),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'description', v.description, 'basePrice', v.base_price,
        'priceIsFrom', v.price_is_from, 'durationMinutes', v.duration_minutes, 'bufferMinutes', v.buffer_minutes, 'species', v.species) order by v.sort, v.base_price)
      from public.services v where v.shop_id = s.id and v.active and v.online_bookable and not v.is_addon), '[]'::jsonb),
    'groomers', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'displayName', g.display_name) order by g.display_name)
      from public.staff_profiles g where g.shop_id = s.id and g.active and g.is_groomer), '[]'::jsonb),
    'closedWeekdays', coalesce((select jsonb_agg(weekday) from public.operating_hours where shop_id = s.id and opens is null), '[]'::jsonb),
    'devMode', s.dev_mode
  );
end $$;

create or replace function app.public_slots(p_slug text, p_date date, p_service uuid, p_staff uuid default null)
returns table (slot_time text, starts_at timestamptz, staff_ids uuid[])
language plpgsql stable security definer set search_path = public, app, extensions as $$
declare
  s public.shops;
  v public.services;
  h public.operating_hours;
  t time;
  st timestamptz;
  free uuid[];
begin
  s := app.shop_by_slug(p_slug);
  select * into v from public.services where id = p_service and shop_id = s.id and active and online_bookable and not is_addon;
  if not found then perform app.fail('VALIDATION', '請選擇服務'); end if;
  select * into h from public.operating_hours where shop_id = s.id and weekday = extract(dow from p_date);
  if not found or h.opens is null then return; end if;
  t := h.opens;
  while t + make_interval(mins => v.duration_minutes) <= h.closes loop
    st := (p_date + t) at time zone s.timezone;
    if st >= now() + make_interval(mins => s.booking_lead_minutes) then
      select coalesce(array_agg(g.id order by g.display_name), '{}') into free
      from public.staff_profiles g
      where g.shop_id = s.id and g.active and g.is_groomer and (p_staff is null or g.id = p_staff)
        and exists (select 1 from public.staff_services ss where ss.staff_id = g.id and ss.service_id = v.id)
        and cardinality(app.schedule_problems(s.id, g.id, st, st + make_interval(mins => v.duration_minutes), v.buffer_minutes, array[v.id])) = 0;
      if cardinality(free) > 0 then
        slot_time := to_char(t, 'HH24:MI'); starts_at := st; staff_ids := free;
        return next;
      end if;
    end if;
    t := t + interval '30 minutes';
  end loop;
end $$;

create or replace function app.request_otp(p_slug text, p_phone text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, extensions as $$
declare s public.shops; v_phone text := app.normalize_phone(p_phone); v_code text; v_recent int;
begin
  s := app.shop_by_slug(p_slug);
  if v_phone !~ '^09[0-9]{8}$' then perform app.fail('VALIDATION', '請輸入正確的手機號碼（09 開頭 10 碼）'); end if;
  select count(*) into v_recent from public.booking_otps where shop_id = s.id and phone = v_phone and created_at > now() - interval '1 hour';
  if v_recent >= 5 then perform app.fail('RATE_LIMITED', '驗證碼請求太頻繁，請稍後再試'); end if;
  v_code := case when s.dev_mode then '123456' else lpad((floor(random() * 1000000))::int::text, 6, '0') end;
  insert into public.booking_otps (shop_id, phone, code_hash, expires_at) values (s.id, v_phone, crypt(v_code, gen_salt('bf')), now() + interval '10 minutes');
  -- Real SMS delivery is BLOCKED pending a provider/credentials (see docs/HANDOFF.md). Never reveals whether the phone is a customer.
  return case when s.dev_mode then jsonb_build_object('sent', true, 'demoCode', v_code) else jsonb_build_object('sent', true) end;
end $$;

create or replace function app.verify_otp(p_slug text, p_phone text, p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, extensions as $$
declare s public.shops; v_phone text := app.normalize_phone(p_phone); o public.booking_otps; c public.customers; v_token text;
begin
  s := app.shop_by_slug(p_slug);
  select * into o from public.booking_otps where shop_id = s.id and phone = v_phone and consumed_at is null and expires_at > now() order by created_at desc limit 1 for update;
  if not found or o.attempts >= 5 then perform app.fail('OTP_INVALID', '驗證碼不正確或已過期，請重新取得'); end if;
  if o.code_hash <> crypt(coalesce(p_code, ''), o.code_hash) then
    update public.booking_otps set attempts = attempts + 1 where id = o.id;
    return jsonb_build_object('error', 'OTP_INVALID'); -- returned (not raised) so the attempt counter is kept
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  update public.booking_otps set consumed_at = now(), session_hash = encode(digest(v_token, 'sha256'), 'hex'), session_expires_at = now() + interval '30 minutes' where id = o.id;
  select * into c from public.customers where shop_id = s.id and phone = v_phone;
  return jsonb_build_object(
    'token', v_token,
    'customerName', coalesce(c.name, ''),
    'pets', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'breed', p.breed, 'photoUrl', null) order by p.name)
      from public.pets p where p.shop_id = s.id and p.primary_customer_id = c.id), '[]'::jsonb));
end $$;

create or replace function app.submit_booking_request(
  p_slug text, p_service uuid, p_starts_at timestamptz, p_staff uuid, p_client_request_id text, p_note text,
  p_token text default null, p_pet uuid default null, p_new jsonb default null)
returns jsonb language plpgsql volatile security definer set search_path = public, app, extensions as $$
declare
  s public.shops; v public.services; a public.appointments; o public.booking_otps; c public.customers;
  v_pet uuid; v_customer uuid; v_phone text; v_open boolean;
begin
  s := app.shop_by_slug(p_slug);
  if coalesce(length(p_client_request_id), 0) < 8 then perform app.fail('VALIDATION', '請重新整理後再送出'); end if;
  select * into a from public.appointments where shop_id = s.id and client_request_id = p_client_request_id;
  if found then return jsonb_build_object('appointmentId', a.id, 'status', 'pending', 'duplicate', true); end if;
  select * into v from public.services where id = p_service and shop_id = s.id and active and online_bookable and not is_addon;
  if not found then perform app.fail('VALIDATION', '請選擇服務'); end if;
  -- Re-check at submit time: the slot may have been confirmed for someone else since step 2.
  select exists (select 1 from app.public_slots(p_slug, (p_starts_at at time zone s.timezone)::date, p_service, p_staff) x where x.starts_at = p_starts_at) into v_open;
  if not v_open then perform app.fail('SLOT_TAKEN', '這個時段剛被預約走了，請改選其他時段。你填的資料都還在。'); end if;

  if p_token is not null then
    select * into o from public.booking_otps where shop_id = s.id and session_hash = encode(digest(p_token, 'sha256'), 'hex') and session_expires_at > now();
    if not found then perform app.fail('FORBIDDEN', '身分驗證已失效，請重新驗證'); end if;
    select * into c from public.customers where shop_id = s.id and phone = o.phone;
    if not found or not exists (select 1 from public.pets where id = p_pet and shop_id = s.id and primary_customer_id = c.id) then
      perform app.fail('FORBIDDEN', '身分驗證已失效，請重新驗證');
    end if;
    v_customer := c.id; v_pet := p_pet;
  elsif p_new is not null then
    v_phone := app.normalize_phone(p_new ->> 'phone');
    if coalesce(trim(p_new ->> 'name'), '') = '' or coalesce(trim(p_new ->> 'petName'), '') = '' or v_phone !~ '^09[0-9]{8}$' then
      perform app.fail('VALIDATION', '請填寫稱呼、手機與毛孩名字');
    end if;
    -- A new-customer request never attaches to (or reveals) an existing customer's record.
    -- If the phone already exists, the request is stored with an unlinked placeholder for staff to merge.
    insert into public.customers (shop_id, name, phone)
    values (s.id, trim(p_new ->> 'name'), v_phone)
    on conflict (shop_id, phone) do nothing
    returning id into v_customer;
    if v_customer is null then
      select id into v_customer from public.customers where shop_id = s.id and phone = v_phone;
      p_note := concat_ws(E'\n', nullif(trim(p_note), ''), format('（未驗證新客申請：自稱「%s」，需店員核對身分）', trim(p_new ->> 'name')));
    end if;
    insert into public.pets (shop_id, primary_customer_id, name, species, breed)
    values (s.id, v_customer, trim(p_new ->> 'petName'), coalesce((p_new ->> 'species')::app.species, 'dog'), nullif(trim(p_new ->> 'breed'), ''))
    returning id into v_pet;
    if (p_new ->> 'weightKg') is not null and (p_new ->> 'weightKg')::numeric > 0 then
      insert into public.pet_weight_records (shop_id, pet_id, weight_kg, recorded_by_name) values (s.id, v_pet, (p_new ->> 'weightKg')::numeric, '飼主自填');
    end if;
  else
    perform app.fail('VALIDATION', '請完成身分資料');
  end if;

  insert into public.appointments (shop_id, pet_id, customer_id, staff_id, starts_at, ends_at, buffer_minutes, status, source, customer_note, client_request_id)
  values (s.id, v_pet, v_customer, p_staff, p_starts_at, p_starts_at + make_interval(mins => v.duration_minutes), v.buffer_minutes, 'pending', 'online', nullif(trim(p_note), ''), p_client_request_id)
  returning * into a;
  insert into public.appointment_items (shop_id, appointment_id, service_id, name, price_snapshot, duration_snapshot)
  values (s.id, a.id, v.id, v.name, v.base_price, v.duration_minutes);
  perform app.log_event(s.id, a.id, 'requested', '飼主線上申請', '{}'::jsonb, '飼主');
  perform app.queue_notification(s.id, a.id, 'booking_received');
  return jsonb_build_object('appointmentId', a.id, 'status', 'pending', 'duplicate', false);
end $$;
