-- =========================================================
-- Tecnopolis: endurecimiento ante abuso / DDoS de capa 7
-- =========================================================

-- ---------------------------------------------------------
-- 1. Las ordenes solo las crean las Edge Functions (service_role).
--    Antes cualquiera con la anon key podia insertar filas sin
--    limite directamente via PostgREST.
-- ---------------------------------------------------------
drop policy if exists "ordenes_insert_public" on public.ordenes;

-- ---------------------------------------------------------
-- 2. Indices para las consultas frecuentes (RLS de "Mis pedidos",
--    limpieza de pendientes y listado admin).
-- ---------------------------------------------------------
create index if not exists ordenes_usuario_id_idx on public.ordenes (usuario_id);
create index if not exists ordenes_estado_created_at_idx on public.ordenes (estado, created_at);
create index if not exists productos_created_at_idx on public.productos (created_at);

-- ---------------------------------------------------------
-- 3. Rate limiting (ventana fija) usado por las Edge Functions.
--    No requiere servicios externos.
-- ---------------------------------------------------------
create table if not exists public.rate_limits (
  clave         text        not null,
  ventana_inicio timestamptz not null,
  contador      integer     not null default 0,
  primary key (clave, ventana_inicio)
);

alter table public.rate_limits enable row level security;
-- Sin policies: anon/authenticated no pueden leer ni escribir.

create or replace function public.check_rate_limit(
  p_clave text,
  p_max integer,
  p_ventana_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_contador integer;
begin
  v_inicio := to_timestamp(
    floor(extract(epoch from now()) / p_ventana_segundos) * p_ventana_segundos
  );

  insert into public.rate_limits as rl (clave, ventana_inicio, contador)
  values (p_clave, v_inicio, 1)
  on conflict (clave, ventana_inicio)
  do update set contador = rl.contador + 1
  returning contador into v_contador;

  return v_contador <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------
-- 4. Limpieza automatica con pg_cron:
--    - ordenes 'pendiente' con mas de 1 hora -> 'rechazado'
--      (Webpay expira el token mucho antes).
--    - contadores de rate limit con mas de 1 dia -> borrar.
-- ---------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'tecnopolis-expirar-ordenes-pendientes',
  '*/15 * * * *',
  $$update public.ordenes
       set estado = 'rechazado'
     where estado = 'pendiente'
       and created_at < now() - interval '1 hour'$$
);

select cron.schedule(
  'tecnopolis-limpiar-rate-limits',
  '17 * * * *',
  $$delete from public.rate_limits
     where ventana_inicio < now() - interval '1 day'$$
);
