-- PetOS core schema (M1-01 / M1-02 / M2 / M3 foundations)
-- Rules (docs/DATA_MODEL.md):
--  * every tenant table carries shop_id; cross-table FKs are composite (shop_id, id) so a row can
--    only point at rows of the SAME shop — not merely "a key that exists".
--  * timestamps are timestamptz (UTC); money is integer NTD.
--  * status changes, payments and events go through SECURITY DEFINER functions (next migrations).

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------- enums ----------
create type app.member_role as enum ('owner', 'manager', 'groomer', 'receptionist');
create type app.member_status as enum ('invited', 'active', 'disabled');
create type app.appointment_status as enum ('pending', 'confirmed', 'checked_in', 'in_service', 'ready_pickup', 'completed', 'cancelled', 'no_show');
create type app.contract_status as enum ('not_required', 'pending', 'signed', 'superseded');
create type app.notification_status as enum ('queued', 'sent', 'failed', 'not_applicable');
create type app.payment_type as enum ('payment', 'refund');
create type app.payment_method as enum ('cash', 'transfer', 'external_card');
create type app.species as enum ('dog', 'cat', 'other');
create type app.sex as enum ('male', 'female', 'unknown');
create type app.note_source as enum ('owner_reported', 'groomer_observed');
create type app.note_category as enum ('skin', 'behavior', 'health', 'product', 'grooming');
create type app.media_category as enum ('avatar', 'before', 'after', 'care', 'incident');
create type app.item_approval as enum ('approved', 'pending_owner', 'declined');
create type app.finish_outcome as enum ('normal', 'abnormal');
create type app.owner_contact as enum ('contacted', 'not_contacted', 'unreachable');

-- ---------- tenancy ----------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  name text not null check (length(name) between 1 and 80),
  timezone text not null default 'Asia/Taipei',
  phone text,
  address text,
  booking_notice text not null default '線上送出為「預約申請」，店家確認後才算預約成功。',
  online_booking_enabled boolean not null default true,
  booking_lead_minutes int not null default 120 check (booking_lead_minutes >= 0),
  -- Development only: echo OTP codes instead of sending SMS, and allow the mock notification worker RPC.
  -- Must be false for any real shop.
  dev_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.shop_memberships (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role app.member_role not null,
  status app.member_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index on public.shop_memberships (user_id);

-- Scheduling identity is separate from the management role: an owner can also be a groomer.
create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null,
  is_groomer boolean not null default true,
  color text not null default 'teal' check (color in ('teal', 'ochre', 'slate')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, user_id)
);

-- ---------- customers & pets ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  phone text not null check (phone ~ '^09[0-9]{8}$'), -- normalised digits
  line_linked boolean not null default false,
  consent_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, phone)
);
create index customers_search on public.customers (shop_id, name);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  primary_customer_id uuid not null,
  name text not null check (length(name) between 1 and 40),
  species app.species not null default 'dog',
  breed text,
  sex app.sex not null default 'unknown',
  birthdate date,
  birthdate_estimated boolean not null default false,
  neutered boolean,
  coat_color text,
  microchip text, -- visible only through app.pet_microchip() to owner/manager
  photo_key text,
  grooming_preferences text,
  product_preferences text,
  estimated_minutes int check (estimated_minutes > 0),
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  foreign key (shop_id, primary_customer_id) references public.customers (shop_id, id)
);
create index pets_search on public.pets (shop_id, name);
create index on public.pets (shop_id, primary_customer_id);

create table public.pet_weight_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  pet_id uuid not null,
  weight_kg numeric(5, 2) not null check (weight_kg > 0 and weight_kg < 120),
  measured_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id),
  recorded_by_name text,
  foreign key (shop_id, pet_id) references public.pets (shop_id, id) on delete cascade
);
create index on public.pet_weight_records (shop_id, pet_id, measured_at desc);

create table public.pet_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  pet_id uuid not null,
  category app.note_category not null,
  source app.note_source not null,
  severity text not null default 'normal' check (severity in ('high', 'normal')),
  body text not null check (length(body) between 1 and 500),
  updated_by uuid references auth.users (id),
  updated_by_name text not null, -- provenance is mandatory
  updated_at timestamptz not null default now(),
  foreign key (shop_id, pet_id) references public.pets (shop_id, id) on delete cascade
);
create index on public.pet_notes (shop_id, pet_id);

-- ---------- services & schedule ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  name text not null,
  description text not null default '',
  base_price int not null check (base_price >= 0),
  price_is_from boolean not null default true,
  duration_minutes int not null check (duration_minutes between 5 and 600),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120),
  is_addon boolean not null default false,
  species app.species[] not null default '{dog}',
  online_bookable boolean not null default true,
  active boolean not null default true,
  sort int not null default 0,
  unique (shop_id, id)
);

create table public.staff_services (
  shop_id uuid not null,
  staff_id uuid not null,
  service_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (shop_id, staff_id) references public.staff_profiles (shop_id, id) on delete cascade,
  foreign key (shop_id, service_id) references public.services (shop_id, id) on delete cascade
);

create table public.operating_hours (
  shop_id uuid not null references public.shops (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  opens time,
  closes time,
  primary key (shop_id, weekday),
  check ((opens is null and closes is null) or (opens < closes))
);

create table public.staff_breaks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  staff_id uuid not null,
  starts time not null,
  ends time not null check (ends > starts),
  label text not null default '休息',
  foreign key (shop_id, staff_id) references public.staff_profiles (shop_id, id) on delete cascade
);

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text not null default '休假',
  created_at timestamptz not null default now(),
  foreign key (shop_id, staff_id) references public.staff_profiles (shop_id, id) on delete cascade
);
create index on public.time_off (shop_id, staff_id, starts_at);

-- ---------- appointments ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  pet_id uuid not null,
  customer_id uuid not null,
  staff_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  -- computed in UTC wall time because timestamptz + interval is not IMMUTABLE
  occupied_until timestamptz generated always as (((ends_at at time zone 'UTC') + make_interval(mins => buffer_minutes)) at time zone 'UTC') stored,
  status app.appointment_status not null default 'pending',
  version int not null default 1,
  source text not null check (source in ('staff', 'online')),
  contract_status app.contract_status not null default 'pending',
  pickup_expected_at timestamptz,
  customer_note text check (length(customer_note) <= 500),
  finished_at timestamptz,
  finish_outcome app.finish_outcome,
  finish_note text,
  incident_note text,
  owner_contact app.owner_contact,
  checked_in_at timestamptz,
  service_started_at timestamptz,
  completed_at timestamptz,
  cancelled_reason text,
  client_request_id text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (shop_id, client_request_id),
  foreign key (shop_id, pet_id) references public.pets (shop_id, id),
  foreign key (shop_id, customer_id) references public.customers (shop_id, id),
  foreign key (shop_id, staff_id) references public.staff_profiles (shop_id, id),
  -- The final judge for double booking: one groomer cannot hold overlapping occupying appointments.
  -- pending / cancelled / no_show / completed never hold time.
  constraint no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, occupied_until, '[)') with &&
  ) where (status in ('confirmed', 'checked_in', 'in_service', 'ready_pickup'))
);
create index on public.appointments (shop_id, starts_at);
create index on public.appointments (shop_id, status);
create index on public.appointments (shop_id, pet_id);

create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  appointment_id uuid not null,
  service_id uuid not null,
  name text not null,
  price_snapshot int not null check (price_snapshot >= 0),
  duration_snapshot int not null,
  approval app.item_approval not null default 'approved',
  created_at timestamptz not null default now(),
  foreign key (shop_id, appointment_id) references public.appointments (shop_id, id) on delete cascade,
  foreign key (shop_id, service_id) references public.services (shop_id, id)
);
create index on public.appointment_items (appointment_id);

create table public.appointment_events (
  id bigint generated always as identity primary key,
  shop_id uuid not null,
  appointment_id uuid not null,
  kind text not null,
  actor_id uuid,
  actor_name text not null,
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  foreign key (shop_id, appointment_id) references public.appointments (shop_id, id) on delete cascade
);
create index on public.appointment_events (appointment_id, at);

create table public.pet_media (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  pet_id uuid not null,
  appointment_id uuid,
  category app.media_category not null,
  storage_key text not null, -- "<shop_id>/<pet_id>/<uuid>.jpg" in the private bucket
  caption text,
  taken_at timestamptz not null default now(),
  uploaded_by uuid references auth.users (id),
  foreign key (shop_id, pet_id) references public.pets (shop_id, id) on delete cascade,
  foreign key (shop_id, appointment_id) references public.appointments (shop_id, id),
  check (storage_key like shop_id::text || '/%')
);
create index on public.pet_media (shop_id, pet_id, taken_at desc);

-- ---------- money (immutable ledger) ----------
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  appointment_id uuid not null,
  type app.payment_type not null,
  method app.payment_method not null,
  amount_ntd int not null check (amount_ntd > 0),
  idempotency_key text not null,
  note text,
  created_by uuid references auth.users (id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  unique (shop_id, idempotency_key),
  foreign key (shop_id, appointment_id) references public.appointments (shop_id, id)
);
create index on public.payment_transactions (appointment_id);

-- ---------- notifications (transactional outbox) ----------
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  appointment_id uuid not null,
  kind text not null check (kind in ('ready_pickup', 'booking_received', 'booking_confirmed')),
  channel text not null default 'line_mock',
  status app.notification_status not null default 'queued',
  attempts int not null default 0,
  last_error text,
  dedupe_key text not null,
  provider_response jsonb,
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, dedupe_key),
  foreign key (shop_id, appointment_id) references public.appointments (shop_id, id) on delete cascade
);
create index on public.notification_jobs (status, next_attempt_at);

-- ---------- audit ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  shop_id uuid,
  actor_id uuid,
  action text not null,
  target text,
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

-- ---------- online booking OTP ----------
create table public.booking_otps (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  session_hash text, -- issued after a correct code; lets the browser act for this phone for 30 minutes
  session_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.booking_otps (shop_id, phone, created_at desc);

-- Append-only guards: events and payments are never edited or deleted (corrections are new rows).
create or replace function app.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'IMMUTABLE: % rows cannot be %', tg_table_name, lower(tg_op) using errcode = 'P0001';
end $$;
create trigger appointment_events_immutable before update or delete on public.appointment_events
  for each row execute function app.forbid_mutation();
create trigger payment_transactions_immutable before update or delete on public.payment_transactions
  for each row execute function app.forbid_mutation();
