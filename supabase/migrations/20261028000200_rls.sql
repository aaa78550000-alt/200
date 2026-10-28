-- Row Level Security. Every tenant table is closed by default; access is granted per shop membership & role.
-- Writes to appointments / items / events / payments / notifications happen ONLY through SECURITY DEFINER
-- functions in app.* (next migration), so the client can never set a status or amount directly.

create or replace function app.current_roles(p_shop uuid) returns app.member_role[]
language sql stable security definer set search_path = public, app, extensions as $$
  select coalesce(array_agg(role), '{}') from public.shop_memberships
  where shop_id = p_shop and user_id = auth.uid() and status = 'active'
$$;

create or replace function app.is_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = public, app, extensions as $$
  select exists (select 1 from public.shop_memberships where shop_id = p_shop and user_id = auth.uid() and status = 'active')
$$;

create or replace function app.has_role(p_shop uuid, p_roles app.member_role[]) returns boolean
language sql stable security definer set search_path = public, app, extensions as $$
  select exists (select 1 from public.shop_memberships where shop_id = p_shop and user_id = auth.uid() and status = 'active' and role = any (p_roles))
$$;

create or replace function app.can_view_finance(p_shop uuid) returns boolean
language sql stable as $$ select app.has_role(p_shop, '{owner,manager,receptionist}') $$;

create or replace function app.is_manager(p_shop uuid) returns boolean
language sql stable as $$ select app.has_role(p_shop, '{owner,manager}') $$;

grant usage on schema app to anon, authenticated;
grant execute on function app.is_member(uuid), app.has_role(uuid, app.member_role[]), app.can_view_finance(uuid), app.is_manager(uuid), app.current_roles(uuid) to authenticated;

alter table public.shops enable row level security;
alter table public.user_profiles enable row level security;
alter table public.shop_memberships enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.pets enable row level security;
alter table public.pet_weight_records enable row level security;
alter table public.pet_notes enable row level security;
alter table public.pet_media enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;
alter table public.operating_hours enable row level security;
alter table public.staff_breaks enable row level security;
alter table public.time_off enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_items enable row level security;
alter table public.appointment_events enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.booking_otps enable row level security; -- no policies: only definer functions touch it

-- Default privileges: anon gets nothing on tables (public booking uses functions only).
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.appointments, public.appointment_items, public.appointment_events,
  public.payment_transactions, public.notification_jobs, public.audit_logs, public.booking_otps from authenticated;
revoke all on public.booking_otps from authenticated;
-- the microchip column is never readable directly (see app.pet_microchip)
revoke select on public.pets from authenticated;
grant select (id, shop_id, primary_customer_id, name, species, breed, sex, birthdate, birthdate_estimated, neutered, coat_color,
  photo_key, grooming_preferences, product_preferences, estimated_minutes, created_at) on public.pets to authenticated;

-- shops
create policy shops_member_read on public.shops for select to authenticated using (app.is_member(id));
create policy shops_owner_update on public.shops for update to authenticated using (app.has_role(id, '{owner}')) with check (app.has_role(id, '{owner}'));

-- profiles
create policy profiles_self on public.user_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_same_shop_read on public.user_profiles for select to authenticated using (
  exists (select 1 from public.shop_memberships m where m.user_id = user_profiles.user_id and app.is_member(m.shop_id))
);

-- memberships: see your own + your shop's (managers); only owners change roles
create policy memberships_read on public.shop_memberships for select to authenticated using (user_id = auth.uid() or app.is_manager(shop_id));
create policy memberships_owner_write on public.shop_memberships for insert to authenticated with check (app.has_role(shop_id, '{owner}'));
create policy memberships_owner_update on public.shop_memberships for update to authenticated using (app.has_role(shop_id, '{owner}')) with check (app.has_role(shop_id, '{owner}'));
create policy memberships_owner_delete on public.shop_memberships for delete to authenticated using (app.has_role(shop_id, '{owner}') and user_id <> auth.uid());

-- staff / services / schedule: members read, owner+manager write
create policy staff_read on public.staff_profiles for select to authenticated using (app.is_member(shop_id));
create policy staff_write on public.staff_profiles for all to authenticated using (app.is_manager(shop_id)) with check (app.is_manager(shop_id));
create policy services_read on public.services for select to authenticated using (app.is_member(shop_id));
create policy services_write on public.services for all to authenticated using (app.is_manager(shop_id)) with check (app.is_manager(shop_id));
create policy staff_services_read on public.staff_services for select to authenticated using (app.is_member(shop_id));
create policy staff_services_write on public.staff_services for all to authenticated using (app.is_manager(shop_id)) with check (app.is_manager(shop_id));
create policy hours_read on public.operating_hours for select to authenticated using (app.is_member(shop_id));
create policy hours_write on public.operating_hours for all to authenticated using (app.is_manager(shop_id)) with check (app.is_manager(shop_id));
create policy breaks_read on public.staff_breaks for select to authenticated using (app.is_member(shop_id));
create policy breaks_write on public.staff_breaks for all to authenticated using (app.is_manager(shop_id)) with check (app.is_manager(shop_id));
create policy time_off_read on public.time_off for select to authenticated using (app.is_member(shop_id));
create policy time_off_write on public.time_off for all to authenticated using (app.is_manager(shop_id)) with check (app.is_manager(shop_id));

-- customers & pets: any active staff member reads/creates/edits; only managers delete
create policy customers_read on public.customers for select to authenticated using (app.is_member(shop_id));
create policy customers_insert on public.customers for insert to authenticated with check (app.is_member(shop_id));
create policy customers_update on public.customers for update to authenticated using (app.is_member(shop_id)) with check (app.is_member(shop_id));
create policy customers_delete on public.customers for delete to authenticated using (app.is_manager(shop_id));
create policy pets_read on public.pets for select to authenticated using (app.is_member(shop_id));
create policy pets_insert on public.pets for insert to authenticated with check (app.is_member(shop_id));
create policy pets_update on public.pets for update to authenticated using (app.is_member(shop_id)) with check (app.is_member(shop_id));
create policy pets_delete on public.pets for delete to authenticated using (app.is_manager(shop_id));

-- weights & notes: append by members; provenance is stamped by trigger; no edits of someone else's history
create policy weights_read on public.pet_weight_records for select to authenticated using (app.is_member(shop_id));
create policy weights_insert on public.pet_weight_records for insert to authenticated with check (app.is_member(shop_id));
create policy weights_delete on public.pet_weight_records for delete to authenticated using (app.is_manager(shop_id));
create policy notes_read on public.pet_notes for select to authenticated using (app.is_member(shop_id));
create policy notes_insert on public.pet_notes for insert to authenticated with check (app.is_member(shop_id));
create policy notes_update on public.pet_notes for update to authenticated using (app.is_member(shop_id)) with check (app.is_member(shop_id));
create policy notes_delete on public.pet_notes for delete to authenticated using (app.is_manager(shop_id));
create policy media_read on public.pet_media for select to authenticated using (app.is_member(shop_id));
create policy media_insert on public.pet_media for insert to authenticated with check (app.is_member(shop_id));
create policy media_delete on public.pet_media for delete to authenticated using (app.is_manager(shop_id));

create or replace function app.stamp_provenance() returns trigger language plpgsql security definer set search_path = public, app, extensions as $$
declare v_name text;
begin
  select display_name into v_name from public.user_profiles where user_id = auth.uid();
  if tg_table_name = 'pet_weight_records' then
    new.recorded_by := auth.uid();
    new.recorded_by_name := coalesce(v_name, new.recorded_by_name, '系統');
  elsif tg_table_name = 'pet_notes' then
    new.updated_by := auth.uid();
    new.updated_by_name := coalesce(v_name, new.updated_by_name, '系統');
    new.updated_at := now();
  elsif tg_table_name = 'pet_media' then
    new.uploaded_by := auth.uid();
  end if;
  return new;
end $$;
create trigger weights_provenance before insert on public.pet_weight_records for each row when (auth.uid() is not null) execute function app.stamp_provenance();
create trigger notes_provenance before insert or update on public.pet_notes for each row when (auth.uid() is not null) execute function app.stamp_provenance();
create trigger media_provenance before insert on public.pet_media for each row when (auth.uid() is not null) execute function app.stamp_provenance();

-- appointments & children: read-only to members (writes via app.* functions)
create policy appointments_read on public.appointments for select to authenticated using (app.is_member(shop_id));
create policy items_read on public.appointment_items for select to authenticated using (app.is_member(shop_id));
create policy events_read on public.appointment_events for select to authenticated using (app.is_member(shop_id));
create policy notifications_read on public.notification_jobs for select to authenticated using (app.is_member(shop_id));
-- money: groomers do not see payments
create policy payments_read on public.payment_transactions for select to authenticated using (app.can_view_finance(shop_id));
create policy audit_read on public.audit_logs for select to authenticated using (shop_id is not null and app.has_role(shop_id, '{owner}'));

-- Microchip: optional & permission-limited (owner/manager), masked to last 4 digits.
create or replace function app.pet_microchip(p_pet uuid) returns text
language sql stable security definer set search_path = public, app, extensions as $$
  select case when app.is_manager(p.shop_id) and p.microchip is not null then '•••• •••• ' || right(p.microchip, 4) end
  from public.pets p where p.id = p_pet
$$;
grant execute on function app.pet_microchip(uuid) to authenticated;
