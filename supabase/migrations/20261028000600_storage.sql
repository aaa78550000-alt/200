-- Private pet photos. Object path: "<shop_id>/<pet_id>/<uuid>.<ext>".
-- Only active members of that shop can read/write; reads use short-lived signed URLs from the client.
-- Guarded so the migration also runs on plain Postgres (tests) where the storage schema is absent/partial.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping bucket policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('pet-media', 'pet-media', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false;

  execute $p$
    create policy pet_media_read on storage.objects for select to authenticated
    using (bucket_id = 'pet-media' and app.is_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy pet_media_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'pet-media'
      and app.is_member(((storage.foldername(objects.name))[1])::uuid)
      -- the second segment must be a pet of the same shop (qualify objects.name: pets also has a "name" column)
      and exists (select 1 from public.pets p where p.id = ((storage.foldername(objects.name))[2])::uuid and p.shop_id = ((storage.foldername(objects.name))[1])::uuid)
    )
  $p$;
  execute $p$
    create policy pet_media_delete on storage.objects for delete to authenticated
    using (bucket_id = 'pet-media' and app.is_manager(((storage.foldername(name))[1])::uuid))
  $p$;
end $$;
