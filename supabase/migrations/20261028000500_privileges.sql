-- Function privileges. Postgres (and Supabase's default privileges) grant EXECUTE on new functions broadly.
-- app.apply_function_grants() closes everything in `app` and opens exactly what each role needs.
-- Every later migration that adds functions must update this procedure and CALL it again.
create or replace procedure app.apply_function_grants()
language plpgsql security definer set search_path = public, app, extensions as $$
begin
  execute 'revoke execute on all functions in schema app from public, anon, authenticated';

  -- RLS helpers (used inside policies as the querying role)
  grant execute on function app.current_roles(uuid), app.is_member(uuid), app.has_role(uuid, app.member_role[]),
    app.can_view_finance(uuid), app.is_manager(uuid), app.pet_microchip(uuid) to authenticated;

  -- Staff operations
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

  if to_regprocedure('app.create_shop(text, text, text, boolean)') is not null then
    grant execute on function app.create_shop(text, text, text, boolean), app.add_time_off(uuid, timestamptz, timestamptz, text),
      app.create_customer_pet(uuid, uuid, text, text, text, app.species, text, app.sex, date, numeric) to authenticated;
  end if;

  if to_regprocedure('app.set_line_channel(uuid, text, text, text)') is not null then
    grant execute on function app.set_line_channel(uuid, text, text, text), app.clear_line_channel(uuid), app.line_status(uuid),
      app.create_link_code(uuid) to authenticated;
    grant execute on function app.public_link_code(text, uuid, text) to anon, authenticated;
    grant execute on function app.line_channel(uuid), app.line_link_customer(uuid, text, text), app.notification_message(uuid),
      app.invoke_notify_worker(), app.assert_can_manage(uuid, uuid, app.member_role), app.add_staff_member(uuid, uuid, uuid, text, text, app.member_role, boolean),
      app.set_member_active(uuid, uuid, uuid, boolean), app.assert_can_reset(uuid, uuid, uuid) to service_role;
  end if;

  -- Public booking (customers are anonymous; staff testing their own page are authenticated)
  grant execute on function
    app.public_booking_info(text),
    app.public_slots(text, date, uuid, uuid),
    app.request_otp(text, text),
    app.verify_otp(text, text, text),
    app.submit_booking_request(text, uuid, timestamptz, uuid, text, text, text, uuid, jsonb)
  to anon, authenticated;

  -- Worker
  grant execute on function app.claim_notification_jobs(int), app.complete_notification_job(uuid, boolean, text, jsonb, boolean) to service_role;
end $$;

revoke all on procedure app.apply_function_grants() from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public;
call app.apply_function_grants();

-- PostgREST: expose the `app` schema for RPC (config.toml `api.schemas` includes "app").
grant usage on schema app to anon, authenticated, service_role;
