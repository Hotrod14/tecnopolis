-- =========================================================
-- Tecnopolis: admin por rol (app_metadata) + MFA obligatorio
-- =========================================================
-- Antes el admin se identificaba solo por email; bastaba una
-- contraseña filtrada para controlar productos, ordenes y storage.
-- Ahora una operacion de admin exige:
--   1. app_metadata.role = 'admin' (solo editable con service_role /
--      SQL; user_metadata NO sirve porque lo edita el propio usuario).
--   2. aal2 en el JWT, es decir, un factor TOTP verificado en la sesion.
--
-- Idempotente: se puede volver a ejecutar sin errores.

-- ---------------------------------------------------------
-- 1. Funcion es_admin()
-- ---------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    and (auth.jwt() ->> 'aal') = 'aal2',
    false
  );
$$;

revoke all on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- ---------------------------------------------------------
-- 2. Asignar el rol al admin actual ANTES de cambiar policies.
--    (El JWT solo lo reflejara tras un refresh: cerrar sesion y
--    volver a entrar.)
-- ---------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where email = 'ce2full@gmail.com';

-- ---------------------------------------------------------
-- 3. productos (antes en 0001_init.sql)
-- ---------------------------------------------------------
drop policy if exists "productos_insert_admin" on public.productos;
create policy "productos_insert_admin"
  on public.productos
  for insert
  to authenticated
  with check ((select public.es_admin()));

drop policy if exists "productos_update_admin" on public.productos;
create policy "productos_update_admin"
  on public.productos
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

drop policy if exists "productos_delete_admin" on public.productos;
create policy "productos_delete_admin"
  on public.productos
  for delete
  to authenticated
  using ((select public.es_admin()));

-- ---------------------------------------------------------
-- 4. ordenes (antes en 0003_envio_y_cuentas.sql)
--    ordenes_select_dueño no se toca.
-- ---------------------------------------------------------
drop policy if exists "ordenes_select_admin" on public.ordenes;
create policy "ordenes_select_admin"
  on public.ordenes
  for select
  to authenticated
  using ((select public.es_admin()));

drop policy if exists "ordenes_update_admin" on public.ordenes;
create policy "ordenes_update_admin"
  on public.ordenes
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- ---------------------------------------------------------
-- 5. storage.objects, bucket 'productos' (antes en 0002_storage.sql)
--    productos_imagenes_select_public no se toca.
-- ---------------------------------------------------------
drop policy if exists "productos_imagenes_insert_admin" on storage.objects;
create policy "productos_imagenes_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'productos' and (select public.es_admin()));

drop policy if exists "productos_imagenes_update_admin" on storage.objects;
create policy "productos_imagenes_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()));

drop policy if exists "productos_imagenes_delete_admin" on storage.objects;
create policy "productos_imagenes_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()));
