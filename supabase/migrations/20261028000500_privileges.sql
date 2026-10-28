-- Function privileges: Postgres grants EXECUTE to PUBLIC by default. Close everything in `app`,
-- then open exactly what each role needs. Internal helpers stay callable only from definer functions.
revoke execute on all functions in schema app from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public;

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

-- PostgREST: expose the `app` schema for RPC (config.toml `api.schemas` must include "app").
grant usage on schema app to anon, authenticated, service_role;
