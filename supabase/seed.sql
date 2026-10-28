-- PetOS local seed: two fictional shops for RLS isolation tests. NOT real data.
-- Appointment times are relative to "today" in Asia/Taipei so local dev always has a working day.
-- Login (local only): <name>@petos.test / petos-dev-only  (e.g. owner@calm.petos.test)

do $$
declare
  has_email_confirmed boolean := exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at');
  has_identities boolean := to_regclass('auth.identities') is not null;
  u record;
begin
  for u in select * from (values
    ('00000000-0000-4000-a000-000000000001'::uuid, 'owner@calm.petos.test', '王怡君'),
    ('00000000-0000-4000-a000-000000000002'::uuid, 'amy@calm.petos.test', 'Amy'),
    ('00000000-0000-4000-a000-000000000003'::uuid, 'may@calm.petos.test', 'May'),
    ('00000000-0000-4000-a000-000000000004'::uuid, 'iris@calm.petos.test', 'Iris'),
    ('00000000-0000-4000-a000-000000000011'::uuid, 'owner@north.petos.test', '北區店長'),
    ('00000000-0000-4000-a000-000000000012'::uuid, 'groomer@north.petos.test', '小北')
  ) as t(id, email, name) loop
    if has_email_confirmed then
      execute 'insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
               values (''00000000-0000-0000-0000-000000000000'', $1, ''authenticated'', ''authenticated'', $2, extensions.crypt(''petos-dev-only'', extensions.gen_salt(''bf'')), now(), ''{"provider":"email","providers":["email"]}'', jsonb_build_object(''name'', $3::text), now(), now(), '''', '''', '''', '''')
               on conflict (id) do nothing' using u.id, u.email, u.name;
    else
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, extensions.crypt('petos-dev-only', extensions.gen_salt('bf')),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now())
      on conflict (id) do nothing;
    end if;
    if has_identities then
      execute 'insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
               values (gen_random_uuid(), $1, $1::text, jsonb_build_object(''sub'', $1::text, ''email'', $2::text, ''email_verified'', true), ''email'', now(), now(), now())
               on conflict do nothing' using u.id, u.email;
    end if;
    insert into public.user_profiles (user_id, display_name) values (u.id, u.name) on conflict do nothing;
  end loop;
end $$;

-- ---------- Shop A: 靜室寵物美容 (dev_mode on: OTP echo + mock LINE) ----------
insert into public.shops (id, slug, name, phone, address, booking_notice, dev_mode) values
  ('a0000000-0000-4000-a000-00000000000a', 'calm-studio', '靜室寵物美容', '02-2700-0000', '台北市大安區（虛構地址）',
   '線上送出為「預約申請」，店家確認後才算預約成功。若需取消請於前一天告知。', true),
  ('b0000000-0000-4000-a000-00000000000b', 'north-paws', '北區毛孩沙龍（測試第二店）', '02-2800-0000', '台北市北投區（虛構地址）', '測試用第二間店', true);

insert into public.shop_memberships (shop_id, user_id, role) values
  ('a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000002', 'groomer'),
  ('a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000003', 'groomer'),
  ('a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000004', 'receptionist'),
  ('b0000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-000000000011', 'owner'),
  ('b0000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-000000000012', 'groomer');

insert into public.staff_profiles (id, shop_id, user_id, display_name, is_groomer, color) values
  ('a5000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000001', '王怡君', false, 'slate'),
  ('a5000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000002', 'Amy', true, 'teal'),
  ('a5000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000003', 'May', true, 'ochre'),
  ('a5000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000004', 'Iris', false, 'slate'),
  ('b5000000-0000-4000-a000-000000000012', 'b0000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-000000000012', '小北', true, 'teal');

insert into public.services (id, shop_id, name, description, base_price, duration_minutes, buffer_minutes, is_addon, species, online_bookable, price_is_from, sort) values
  ('a6000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-00000000000a', '基礎洗澡', '洗澡、吹整、清耳、擠肛門腺', 700, 60, 15, false, '{dog}', true, true, 1),
  ('a6000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-00000000000a', '洗澡＋修剪', '基礎洗澡加臉、腳、腹部修剪', 900, 120, 15, false, '{dog}', true, true, 2),
  ('a6000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-00000000000a', '洗澡＋梳毛', '基礎洗澡加全身除廢毛', 650, 75, 15, false, '{dog}', true, true, 3),
  ('a6000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-00000000000a', '精緻造型', '全身造型修剪，依毛量與配合度估價', 1500, 150, 15, false, '{dog}', true, true, 4),
  ('a6000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-00000000000a', '貓咪洗澡', '安靜時段、單獨空間', 1100, 90, 30, false, '{cat}', true, true, 5),
  ('a6000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-00000000000a', '指甲修剪', '', 100, 10, 0, true, '{dog,cat}', false, false, 6),
  ('a6000000-0000-4000-a000-000000000007', 'a0000000-0000-4000-a000-00000000000a', '刷牙', '', 150, 10, 0, true, '{dog,cat}', false, false, 7),
  ('a6000000-0000-4000-a000-000000000008', 'a0000000-0000-4000-a000-00000000000a', '燕麥舒緩 SPA', '', 300, 20, 0, true, '{dog}', false, false, 8),
  ('b6000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-00000000000b', '北區洗澡', '', 800, 60, 15, false, '{dog}', true, true, 1);

insert into public.staff_services (shop_id, staff_id, service_id)
select 'a0000000-0000-4000-a000-00000000000a'::uuid, 'a5000000-0000-4000-a000-000000000002'::uuid, id from public.services where shop_id = 'a0000000-0000-4000-a000-00000000000a'
union all
select 'a0000000-0000-4000-a000-00000000000a', 'a5000000-0000-4000-a000-000000000003', id from public.services
  where shop_id = 'a0000000-0000-4000-a000-00000000000a' and name <> '精緻造型'
union all
select 'b0000000-0000-4000-a000-00000000000b', 'b5000000-0000-4000-a000-000000000012', 'b6000000-0000-4000-a000-000000000001';

insert into public.operating_hours (shop_id, weekday, opens, closes)
select s, d, case when d = 1 then null when d in (0, 6) then time '10:00' else time '09:00' end, case when d = 1 then null when d in (0, 6) then time '18:00' else time '19:00' end
from unnest(array['a0000000-0000-4000-a000-00000000000a'::uuid, 'b0000000-0000-4000-a000-00000000000b'::uuid]) s, generate_series(0, 6) d;

insert into public.staff_breaks (shop_id, staff_id, starts, ends, label) values
  ('a0000000-0000-4000-a000-00000000000a', 'a5000000-0000-4000-a000-000000000002', '12:00', '12:30', '午休'),
  ('a0000000-0000-4000-a000-00000000000a', 'a5000000-0000-4000-a000-000000000003', '12:30', '13:00', '午休');

insert into public.customers (id, shop_id, name, phone, line_linked) values
  ('a7000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-00000000000a', '林小姐', '0912000101', true),
  ('a7000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-00000000000a', '陳先生', '0928000202', true),
  ('a7000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-00000000000a', '張太太', '0933000303', false),
  ('a7000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-00000000000a', '黃先生', '0955000404', true),
  ('a7000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-00000000000a', '周小姐', '0988000707', true),
  -- Same phone at the other shop: must never be linked or visible across shops (EDGE_CASES #14)
  ('b7000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-00000000000b', '林小姐（北區）', '0912000101', false);

insert into public.pets (id, shop_id, primary_customer_id, name, species, breed, sex, birthdate, birthdate_estimated, neutered, coat_color, microchip, photo_key, grooming_preferences, product_preferences, estimated_minutes) values
  ('a8000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-00000000000a', 'a7000000-0000-4000-a000-000000000001', 'Coco', 'dog', '貴賓（玩具型）', 'female', '2020-03-12', false, true, '杏色', '900123456783381', 'demo:coco-poodle', '臉修圓、耳朵留長；腳毛修短露出腳型；尾巴留球', '低敏燕麥洗毛精（飼主自備）', 120),
  ('a8000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-00000000000a', 'a7000000-0000-4000-a000-000000000003', '奶茶', 'dog', '柴犬', 'male', '2022-06-01', false, true, '奶油色', null, 'demo:naicha-shiba', '換毛季加強除廢毛', null, 60),
  ('a8000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-00000000000a', 'a7000000-0000-4000-a000-000000000004', 'Lucky', 'dog', '米克斯', 'male', '2019-01-01', true, true, '黑褐', null, 'demo:lucky-mix', null, null, 75),
  ('a8000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-00000000000a', 'a7000000-0000-4000-a000-000000000002', 'Coco', 'dog', '瑪爾濟斯', 'female', '2023-02-14', false, false, '白色', null, 'demo:coco-maltese', null, null, 60),
  ('a8000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-00000000000a', 'a7000000-0000-4000-a000-000000000002', '布丁', 'cat', '英國短毛貓', 'male', '2021-09-09', false, true, '藍灰', null, 'demo:pudding-cat', null, null, 90),
  ('a8000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-00000000000a', 'a7000000-0000-4000-a000-000000000005', '吐司', 'dog', '柯基', 'male', '2022-12-24', false, false, '三色', null, 'demo:toast-corgi', null, null, 120),
  ('b8000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-00000000000b', 'b7000000-0000-4000-a000-000000000001', '北區豆花', 'dog', '比熊', 'female', null, false, null, null, null, null, null, null, null);

insert into public.pet_weight_records (shop_id, pet_id, weight_kg, measured_at, recorded_by_name) values
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000001', 5.0, now() - interval '100 days', 'Amy'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000001', 4.9, now() - interval '42 days', 'Amy'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000001', 4.8, now() - interval '14 days', 'May'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000002', 10.2, now() - interval '28 days', 'May'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000003', 14.6, now() - interval '2 hours', 'May');

insert into public.pet_notes (shop_id, pet_id, category, source, severity, body, updated_by_name, updated_at) values
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000001', 'skin', 'owner_reported', 'high', '皮膚敏感，只用低敏洗毛精；背部易泛紅', '林小姐', now() - interval '56 days'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000001', 'behavior', 'groomer_observed', 'high', '怕吹風機，請用低風量並從後腿開始吹', 'Amy', now() - interval '14 days'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000001', 'behavior', 'groomer_observed', 'normal', '剪指甲會掙扎，需兩人協助保定', 'Amy', now() - interval '69 days'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000002', 'behavior', 'groomer_observed', 'high', '碰後腳會想咬，保定時注意', 'May', now() - interval '28 days'),
  ('a0000000-0000-4000-a000-00000000000a', 'a8000000-0000-4000-a000-000000000003', 'health', 'owner_reported', 'high', '左後腿舊傷，抱上美容台時托住臀部', '黃先生', now() - interval '163 days'),
  ('b0000000-0000-4000-a000-00000000000b', 'b8000000-0000-4000-a000-000000000001', 'skin', 'owner_reported', 'high', '北區店的機密照護紀錄（跨店測試）', '北區店長', now());

-- Today's appointments (Asia/Taipei)
do $$
declare
  shop uuid := 'a0000000-0000-4000-a000-00000000000a';
  d date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into public.appointments (id, shop_id, pet_id, customer_id, staff_id, starts_at, ends_at, buffer_minutes, status, version, source, contract_status, pickup_expected_at, checked_in_at, service_started_at, finished_at, finish_outcome, finish_note) values
    ('a9000000-0000-4000-a000-000000000001', shop, 'a8000000-0000-4000-a000-000000000003', 'a7000000-0000-4000-a000-000000000004', 'a5000000-0000-4000-a000-000000000003',
      (d + time '13:30') at time zone 'Asia/Taipei', (d + time '14:45') at time zone 'Asia/Taipei', 15, 'ready_pickup', 4, 'staff', 'signed', (d + time '16:00') at time zone 'Asia/Taipei',
      (d + time '13:28') at time zone 'Asia/Taipei', (d + time '13:35') at time zone 'Asia/Taipei', (d + time '14:50') at time zone 'Asia/Taipei', 'normal', '全身除廢毛完成，左後腿已注意托住'),
    ('a9000000-0000-4000-a000-000000000002', shop, 'a8000000-0000-4000-a000-000000000001', 'a7000000-0000-4000-a000-000000000001', 'a5000000-0000-4000-a000-000000000002',
      (d + time '14:00') at time zone 'Asia/Taipei', (d + time '16:00') at time zone 'Asia/Taipei', 15, 'in_service', 3, 'staff', 'signed', (d + time '16:30') at time zone 'Asia/Taipei',
      (d + time '13:55') at time zone 'Asia/Taipei', (d + time '14:02') at time zone 'Asia/Taipei', null, null, null),
    ('a9000000-0000-4000-a000-000000000003', shop, 'a8000000-0000-4000-a000-000000000002', 'a7000000-0000-4000-a000-000000000003', 'a5000000-0000-4000-a000-000000000003',
      (d + time '15:30') at time zone 'Asia/Taipei', (d + time '16:30') at time zone 'Asia/Taipei', 15, 'confirmed', 1, 'online', 'pending', null, null, null, null, null, null),
    ('a9000000-0000-4000-a000-000000000004', shop, 'a8000000-0000-4000-a000-000000000006', 'a7000000-0000-4000-a000-000000000005', 'a5000000-0000-4000-a000-000000000002',
      (d + time '16:30') at time zone 'Asia/Taipei', (d + time '18:30') at time zone 'Asia/Taipei', 15, 'confirmed', 1, 'staff', 'signed', null, null, null, null, null, null),
    ('a9000000-0000-4000-a000-000000000005', shop, 'a8000000-0000-4000-a000-000000000004', 'a7000000-0000-4000-a000-000000000002', null,
      (d + 1 + time '10:00') at time zone 'Asia/Taipei', (d + 1 + time '11:00') at time zone 'Asia/Taipei', 15, 'pending', 1, 'online', 'pending', null, null, null, null, null, null);

  insert into public.appointment_items (shop_id, appointment_id, service_id, name, price_snapshot, duration_snapshot, approval) values
    (shop, 'a9000000-0000-4000-a000-000000000001', 'a6000000-0000-4000-a000-000000000003', '洗澡＋梳毛', 650, 75, 'approved'),
    (shop, 'a9000000-0000-4000-a000-000000000002', 'a6000000-0000-4000-a000-000000000002', '洗澡＋修剪', 900, 120, 'approved'),
    (shop, 'a9000000-0000-4000-a000-000000000002', 'a6000000-0000-4000-a000-000000000006', '指甲修剪', 100, 10, 'pending_owner'),
    (shop, 'a9000000-0000-4000-a000-000000000003', 'a6000000-0000-4000-a000-000000000001', '基礎洗澡', 700, 60, 'approved'),
    (shop, 'a9000000-0000-4000-a000-000000000004', 'a6000000-0000-4000-a000-000000000002', '洗澡＋修剪', 900, 120, 'approved'),
    (shop, 'a9000000-0000-4000-a000-000000000005', 'a6000000-0000-4000-a000-000000000001', '基礎洗澡', 700, 60, 'approved');

  insert into public.appointment_events (shop_id, appointment_id, kind, actor_name, summary, at) values
    (shop, 'a9000000-0000-4000-a000-000000000001', 'created', 'Iris', '櫃檯建立預約', now() - interval '7 days'),
    (shop, 'a9000000-0000-4000-a000-000000000001', 'finish_recorded', 'May', '完成美容（正常）', (d + time '14:50') at time zone 'Asia/Taipei'),
    (shop, 'a9000000-0000-4000-a000-000000000002', 'created', 'Iris', '櫃檯建立預約', now() - interval '8 days'),
    (shop, 'a9000000-0000-4000-a000-000000000002', 'status_changed', 'Amy', '開始美容', (d + time '14:02') at time zone 'Asia/Taipei'),
    (shop, 'a9000000-0000-4000-a000-000000000005', 'requested', '飼主', '飼主線上申請', now() - interval '3 hours');

  insert into public.notification_jobs (shop_id, appointment_id, kind, status, attempts, dedupe_key) values
    (shop, 'a9000000-0000-4000-a000-000000000001', 'ready_pickup', 'sent', 1, 'ready_pickup:a9000000-0000-4000-a000-000000000001');
end $$;

-- Other shop: one appointment, used to prove cross-shop isolation
insert into public.appointments (id, shop_id, pet_id, customer_id, staff_id, starts_at, ends_at, buffer_minutes, status, source)
values ('b9000000-0000-4000-a000-000000000001', 'b0000000-0000-4000-a000-00000000000b', 'b8000000-0000-4000-a000-000000000001', 'b7000000-0000-4000-a000-000000000001',
  'b5000000-0000-4000-a000-000000000012', ((now() at time zone 'Asia/Taipei')::date + time '11:00') at time zone 'Asia/Taipei',
  ((now() at time zone 'Asia/Taipei')::date + time '12:00') at time zone 'Asia/Taipei', 15, 'confirmed', 'staff');
insert into public.payment_transactions (shop_id, appointment_id, type, method, amount_ntd, idempotency_key, created_by_name)
values ('b0000000-0000-4000-a000-00000000000b', 'b9000000-0000-4000-a000-000000000001', 'payment', 'cash', 800, 'north-seed-1', '北區店長');
