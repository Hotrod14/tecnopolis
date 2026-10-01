-- =========================================================
-- Tecnopolis: envio a domicilio + cuentas de cliente
-- =========================================================

-- ---------------------------------------------------------
-- productos: datos fisicos para cotizar envio (peso/dimensiones).
-- Se usan valores por defecto razonables para productos ya
-- existentes (ej. los traidos de Fake Store API, que no traen
-- estos datos).
-- ---------------------------------------------------------
alter table public.productos
  add column if not exists peso_kg  numeric not null default 1 check (peso_kg > 0),
  add column if not exists alto_cm  integer not null default 20 check (alto_cm > 0),
  add column if not exists ancho_cm integer not null default 20 check (ancho_cm > 0),
  add column if not exists largo_cm integer not null default 15 check (largo_cm > 0);

-- ---------------------------------------------------------
-- ordenes: datos de envio, costo de envio, dueño de la orden
-- (nullable -> compra como invitado) y nuevos estados de
-- seguimiento post-pago.
-- ---------------------------------------------------------
alter table public.ordenes
  add column if not exists usuario_id       uuid references auth.users(id) on delete set null,
  add column if not exists email_contacto   text not null default '',
  add column if not exists direccion_envio  jsonb not null default '{}'::jsonb,
  add column if not exists costo_envio      integer not null default 0 check (costo_envio >= 0),
  add column if not exists subtotal         integer not null default 0 check (subtotal >= 0);

-- "total" se mantiene como el monto que se cobra en Transbank
-- (subtotal + costo_envio), para no tocar la logica de pago ya
-- probada en crear-pago-webpay / confirmar-pago-webpay.

alter table public.ordenes drop constraint if exists ordenes_estado_check;
alter table public.ordenes add constraint ordenes_estado_check
  check (estado in ('pendiente', 'pagado', 'rechazado', 'preparando', 'enviado', 'entregado'));

-- El insert publico debe seguir dejando la orden en 'pendiente', y si
-- viene con usuario_id debe ser el del usuario autenticado que la crea
-- (o null, para compra como invitado).
drop policy if exists "ordenes_insert_public" on public.ordenes;
create policy "ordenes_insert_public"
  on public.ordenes
  for insert
  to anon, authenticated
  with check (
    estado = 'pendiente'
    and (usuario_id is null or usuario_id = auth.uid())
  );

-- Un cliente logueado puede ver sus propias ordenes (para "Mis pedidos").
create policy "ordenes_select_dueño"
  on public.ordenes
  for select
  to authenticated
  using (usuario_id = auth.uid());

-- El admin puede ver y actualizar todas las ordenes (para marcarlas
-- como preparando/enviado/entregado desde /admin).
create policy "ordenes_select_admin"
  on public.ordenes
  for select
  to authenticated
  using (auth.email() = 'ce2full@gmail.com');

create policy "ordenes_update_admin"
  on public.ordenes
  for update
  to authenticated
  using (auth.email() = 'ce2full@gmail.com')
  with check (auth.email() = 'ce2full@gmail.com');

alter publication supabase_realtime add table public.ordenes;
