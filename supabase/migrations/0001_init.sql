-- =========================================================
-- Tecnopolis: esquema inicial (productos, ordenes) + RLS
-- =========================================================

-- ---------------------------------------------------------
-- Tabla: productos
-- ---------------------------------------------------------
create table if not exists public.productos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  precio      integer not null check (precio >= 0),
  stock       integer not null default 0 check (stock >= 0),
  imagen_url  text,
  created_at  timestamptz not null default now()
);

alter table public.productos enable row level security;

-- Lectura publica (catalogo de la tienda)
create policy "productos_select_public"
  on public.productos
  for select
  to anon, authenticated
  using (true);

-- Escritura restringida al admin (ce2full@gmail.com)
create policy "productos_insert_admin"
  on public.productos
  for insert
  to authenticated
  with check (auth.email() = 'ce2full@gmail.com');

create policy "productos_update_admin"
  on public.productos
  for update
  to authenticated
  using (auth.email() = 'ce2full@gmail.com')
  with check (auth.email() = 'ce2full@gmail.com');

create policy "productos_delete_admin"
  on public.productos
  for delete
  to authenticated
  using (auth.email() = 'ce2full@gmail.com');

-- ---------------------------------------------------------
-- Tabla: ordenes
-- ---------------------------------------------------------
create table if not exists public.ordenes (
  id               uuid primary key default gen_random_uuid(),
  total            integer not null check (total >= 0),
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'pagado', 'rechazado')),
  transbank_token  text unique,
  items            jsonb not null,
  created_at       timestamptz not null default now()
);

alter table public.ordenes enable row level security;

-- El checkout publico puede crear una orden pendiente.
create policy "ordenes_insert_public"
  on public.ordenes
  for insert
  to anon, authenticated
  with check (estado = 'pendiente');

-- No se definen policies de SELECT/UPDATE/DELETE para anon/authenticated:
-- con RLS activo y sin policy, esas operaciones quedan denegadas.
-- Las Edge Functions acceden con la Service Role Key, que siempre
-- evita RLS, por lo que pueden leer y actualizar sin restricciones.

-- ---------------------------------------------------------
-- Realtime (para el dashboard de inventario en /admin)
-- ---------------------------------------------------------
alter publication supabase_realtime add table public.productos;

-- ---------------------------------------------------------
-- Funcion: confirmar_orden_pagada
-- Marca la orden como 'pagado' y descuenta el stock de cada
-- producto de forma atomica (todo ocurre en una sola
-- transaccion implicita de la funcion). Si algun producto no
-- tiene stock suficiente, revierte todo y lanza una excepcion.
-- Solo puede ser invocada por la Service Role Key (Edge Functions).
-- ---------------------------------------------------------
create or replace function public.confirmar_orden_pagada(p_orden_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_updated integer;
begin
  for v_item in
    select jsonb_array_elements(items) from public.ordenes where id = p_orden_id
  loop
    update public.productos
       set stock = stock - (v_item->>'cantidad')::integer
     where id = (v_item->>'producto_id')::uuid
       and stock >= (v_item->>'cantidad')::integer;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      raise exception 'Stock insuficiente para el producto %', v_item->>'producto_id';
    end if;
  end loop;

  update public.ordenes
     set estado = 'pagado'
   where id = p_orden_id;
end;
$$;

revoke all on function public.confirmar_orden_pagada(uuid) from public, anon, authenticated;
grant execute on function public.confirmar_orden_pagada(uuid) to service_role;
