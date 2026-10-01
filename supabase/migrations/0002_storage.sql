-- Bucket publico para las imagenes de productos subidas desde /admin.
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

create policy "productos_imagenes_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'productos');

create policy "productos_imagenes_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'productos' and auth.email() = 'ce2full@gmail.com');

create policy "productos_imagenes_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'productos' and auth.email() = 'ce2full@gmail.com');

create policy "productos_imagenes_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'productos' and auth.email() = 'ce2full@gmail.com');
