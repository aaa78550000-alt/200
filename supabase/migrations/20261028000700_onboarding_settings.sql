-- F01 shop onboarding + M2-01 settings operations that need more than plain RLS writes.

/** E01: a signed-in user creates their shop and becomes its owner (one transaction). */
create or replace function app.create_shop(p_name text, p_slug text, p_display_name text, p_is_groomer boolean default true)
returns uuid language plpgsql security definer set search_path = public, app, extensions as $$
declare v_shop uuid; v_staff uuid;
begin
  if auth.uid() is null then perform app.fail('UNAUTHENTICATED', '請先登入'); end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_display_name), '') = '' then perform app.fail('VALIDATION', '請填寫店名與你的稱呼'); end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,40}$' then perform app.fail('VALIDATION', '預約網址只能用小寫英文、數字與 -，至少 3 個字'); end if;
  if exists (select 1 from public.shops where slug = p_slug) then perform app.fail('CONFLICT', '這個預約網址已被使用，請換一個'); end if;
  insert into public.shops (name, slug) values (trim(p_name), p_slug) returning id into v_shop;
  insert into public.user_profiles (user_id, display_name) values (auth.uid(), trim(p_display_name))
    on conflict (user_id) do update set display_name = excluded.display_name;
  insert into public.shop_memberships (shop_id, user_id, role) values (v_shop, auth.uid(), 'owner');
  insert into public.staff_profiles (shop_id, user_id, display_name, is_groomer) values (v_shop, auth.uid(), trim(p_display_name), p_is_groomer) returning id into v_staff;
  -- sensible defaults the owner edits during onboarding: Tue–Sun 10:00–19:00, Monday closed
  insert into public.operating_hours (shop_id, weekday, opens, closes)
  select v_shop, d, case when d = 1 then null else time '10:00' end, case when d = 1 then null else time '19:00' end from generate_series(0, 6) d;
  insert into public.audit_logs (shop_id, actor_id, action, target) values (v_shop, auth.uid(), 'shop_created', v_shop::text);
  return v_shop;
end $$;

/**
 * E06: record leave. Existing bookings are NEVER deleted or moved; affected ones get a warning event
 * and are returned so the UI can tell staff whom to call.
 */
create or replace function app.add_time_off(p_staff uuid, p_starts timestamptz, p_ends timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, app, extensions as $$
declare s public.staff_profiles; v_tz text; v_affected jsonb;
begin
  select * into s from public.staff_profiles where id = p_staff;
  if not found or not app.is_member(s.shop_id) then perform app.fail('NOT_FOUND', '找不到這位員工'); end if;
  perform app.require_role(s.shop_id, '{owner,manager}');
  if p_ends <= p_starts then perform app.fail('VALIDATION', '結束時間需晚於開始時間'); end if;
  select timezone into v_tz from public.shops where id = s.shop_id;
  insert into public.time_off (shop_id, staff_id, starts_at, ends_at, reason) values (s.shop_id, p_staff, p_starts, p_ends, coalesce(nullif(trim(p_reason), ''), '休假'));
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'startsAt', a.starts_at, 'status', a.status, 'petName', p.name, 'customerName', c.name, 'customerPhone', c.phone) order by a.starts_at), '[]'::jsonb)
  into v_affected
  from public.appointments a join public.pets p on p.id = a.pet_id join public.customers c on c.id = a.customer_id
  where a.staff_id = p_staff and a.status in ('pending', 'confirmed') and tstzrange(a.starts_at, a.occupied_until) && tstzrange(p_starts, p_ends);
  insert into public.appointment_events (shop_id, appointment_id, kind, actor_id, actor_name, summary)
  select s.shop_id, (x ->> 'id')::uuid, 'warning', auth.uid(), app.actor_name(), format('%s 新增休假（%s），此預約需聯絡飼主改期或改派', s.display_name, coalesce(nullif(trim(p_reason), ''), '休假'))
  from jsonb_array_elements(v_affected) x;
  return v_affected;
end $$;

/** Staff-side creation of an owner + pet in one step (F02 "新建"). Reuses an existing owner by phone only when asked to. */
create or replace function app.create_customer_pet(p_shop uuid, p_customer_id uuid, p_customer_name text, p_phone text,
  p_pet_name text, p_species app.species, p_breed text, p_sex app.sex, p_birthdate date, p_weight numeric)
returns jsonb language plpgsql security definer set search_path = public, app, extensions as $$
declare v_customer uuid; v_pet uuid; v_phone text := app.normalize_phone(p_phone);
begin
  perform app.require_role(p_shop, '{owner,manager,receptionist}');
  if coalesce(trim(p_pet_name), '') = '' then perform app.fail('VALIDATION', '請填寫毛孩名字'); end if;
  if p_customer_id is not null then
    select id into v_customer from public.customers where id = p_customer_id and shop_id = p_shop;
    if not found then perform app.fail('NOT_FOUND', '找不到飼主'); end if;
  else
    if coalesce(trim(p_customer_name), '') = '' or v_phone !~ '^09[0-9]{8}$' then perform app.fail('VALIDATION', '請填寫飼主稱呼與 09 開頭的手機號碼'); end if;
    if exists (select 1 from public.customers where shop_id = p_shop and phone = v_phone) then
      perform app.fail('CONFLICT', '這支手機已有飼主資料，請改選既有飼主');
    end if;
    insert into public.customers (shop_id, name, phone) values (p_shop, trim(p_customer_name), v_phone) returning id into v_customer;
  end if;
  insert into public.pets (shop_id, primary_customer_id, name, species, breed, sex, birthdate)
  values (p_shop, v_customer, trim(p_pet_name), coalesce(p_species, 'dog'), nullif(trim(p_breed), ''), coalesce(p_sex, 'unknown'), p_birthdate)
  returning id into v_pet;
  if p_weight is not null and p_weight > 0 then
    insert into public.pet_weight_records (shop_id, pet_id, weight_kg, recorded_by, recorded_by_name) values (p_shop, v_pet, p_weight, auth.uid(), app.actor_name());
  end if;
  return jsonb_build_object('customerId', v_customer, 'petId', v_pet);
end $$;

-- grants for these functions live in app.apply_function_grants() (20261028000500_privileges.sql)
call app.apply_function_grants();
