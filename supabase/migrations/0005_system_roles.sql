-- ============================================================================
-- Roles de sistema (user / delegate / admin) + base administrativa
-- ============================================================================
-- Introduce un rol de sistema por usuario, ortogonal a la pertenencia a una
-- Casa (home_members). Un admin o delegate NO obtiene por ello acceso a
-- ninguna Casa ajena: eso lo sigue decidiendo exclusivamente home_members +
-- las políticas RLS existentes (get_my_home_ids()).
--
-- Piezas:
--   - enum public.system_role ('user' | 'delegate' | 'admin')
--   - profiles.system_role (default 'user')
--   - trigger que impide escribir system_role salvo desde las funciones
--     privilegiadas de abajo (protege el campo aunque alguien intente un
--     UPDATE directo vía el cliente de Supabase)
--   - get_my_system_role(): helper para políticas RLS futuras (mismo patrón
--     que get_my_home_ids())
--   - set_user_role() / set_user_role_by_email(): único camino para cambiar
--     el rol de otro usuario, sólo ejecutable por un admin
--   - bootstrap_first_admin(): alta controlada del primer admin, sólo
--     ejecutable mientras no exista ninguno y sólo desde SQL Editor/CLI
--     (se revoca el EXECUTE a anon/authenticated)
--   - admin_audit_log: registro de operaciones administrativas sensibles
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Enum + columna
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'system_role') then
    create type public.system_role as enum ('user', 'delegate', 'admin');
  end if;
end $$;

alter table public.profiles
  add column if not exists system_role public.system_role not null default 'user';

-- ----------------------------------------------------------------------------
-- 2. admin_audit_log
-- ----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;

-- ----------------------------------------------------------------------------
-- 3. get_my_system_role(): helper reutilizable en RLS y en la app
-- ----------------------------------------------------------------------------
create or replace function public.get_my_system_role()
returns public.system_role
language sql
security definer
set search_path = public
stable
as $$
  select system_role from public.profiles where id = auth.uid();
$$;

-- admin_audit_log: sólo un admin puede leer el registro; ninguna política de
-- insert/update/delete para el cliente, todas las escrituras pasan por las
-- funciones SECURITY DEFINER de abajo.
create policy "admin_audit_log_select_admin" on public.admin_audit_log
  for select using (public.get_my_system_role() = 'admin');

-- ----------------------------------------------------------------------------
-- 4. Proteger profiles.system_role frente a escritura directa del cliente
-- ----------------------------------------------------------------------------
-- profiles_update_own (0001_init.sql) es "using (id = auth.uid())" sin WITH
-- CHECK explícito, así que Postgres reutiliza el USING como CHECK: eso
-- permite actualizar cualquier columna de la propia fila, incluida
-- system_role, si no añadimos una barrera adicional. Un trigger es más
-- robusto aquí que un WITH CHECK porque también protege frente a service
-- roles o clientes que hagan bypass de RLS.
create or replace function public.protect_system_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.system_role is distinct from old.system_role then
    if coalesce(current_setting('app.system_role_change_authorized', true), '') <> 'true' then
      raise exception 'No autorizado para modificar system_role directamente; usa set_user_role()';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_system_role on public.profiles;
create trigger profiles_protect_system_role
  before update on public.profiles
  for each row execute procedure public.protect_system_role();

-- ----------------------------------------------------------------------------
-- 5. set_user_role() / set_user_role_by_email(): cambio de rol, sólo admin
-- ----------------------------------------------------------------------------
create or replace function public.set_user_role(p_target_user_id uuid, p_new_role public.system_role)
returns public.system_role
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role public.system_role;
  v_previous_role public.system_role;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select system_role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;

  select system_role into v_previous_role from public.profiles where id = p_target_user_id;
  if v_previous_role is null then
    raise exception 'No existe ningún usuario con ese id';
  end if;

  if p_target_user_id = auth.uid() and p_new_role <> 'admin' then
    raise exception 'No puedes retirarte a ti mismo el rol de administrador';
  end if;

  perform set_config('app.system_role_change_authorized', 'true', true);
  update public.profiles set system_role = p_new_role where id = p_target_user_id;
  perform set_config('app.system_role_change_authorized', 'false', true);

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'role_change',
    'profile',
    p_target_user_id,
    jsonb_build_object('previous_role', v_previous_role, 'new_role', p_new_role)
  );

  return p_new_role;
end;
$$;

create or replace function public.set_user_role_by_email(p_email text, p_new_role public.system_role)
returns public.system_role
language plpgsql
security definer set search_path = public
as $$
declare
  v_target_id uuid;
begin
  select id into v_target_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_target_id is null then
    raise exception 'No existe ningún usuario con ese email';
  end if;

  return public.set_user_role(v_target_id, p_new_role);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. bootstrap_first_admin(): alta controlada del primer administrador
-- ----------------------------------------------------------------------------
-- Sólo funciona si todavía no existe ningún admin (se auto-desactiva después
-- del primer uso salvo que ese admin sea degradado y no quede ninguno otro,
-- lo cual es un fallback razonable, no un agujero). Se revoca EXECUTE a
-- anon/authenticated para que sólo pueda invocarse desde el SQL Editor o la
-- CLI de Supabase (conectados como el rol propietario/postgres), nunca desde
-- la API pública de la app -- así no hay ventana en la que cualquier usuario
-- autenticado pueda auto-ascenderse antes de que exista el primer admin.
create or replace function public.bootstrap_first_admin(p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target_id uuid;
begin
  if exists (select 1 from public.profiles where system_role = 'admin') then
    raise exception 'Ya existe al menos un administrador; usa set_user_role_by_email() en su lugar';
  end if;

  select id into v_target_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_target_id is null then
    raise exception 'No existe ningún usuario con ese email';
  end if;

  perform set_config('app.system_role_change_authorized', 'true', true);
  update public.profiles set system_role = 'admin' where id = v_target_id;
  perform set_config('app.system_role_change_authorized', 'false', true);

  insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
  values (v_target_id, 'bootstrap_first_admin', 'profile', v_target_id, jsonb_build_object('email', p_email));
end;
$$;

revoke all on function public.bootstrap_first_admin(text) from public, anon, authenticated;

commit;
