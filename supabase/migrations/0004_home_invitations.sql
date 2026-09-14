-- ============================================================================
-- Invitaciones a Casas: el propietario ("owner") de una Casa invita a otra
-- persona por email; si acepta, se convierte en "member" de esa Casa.
-- Funciona aunque la persona invitada todavía no tenga cuenta -- la
-- invitación queda pendiente por email y la verá en cuanto se registre y
-- entre a /inicio (se compara contra profiles.email, que se fija al
-- registrarse con el mismo email de auth.users).
-- ============================================================================

begin;

create table public.home_invitations (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  -- Nombre de la Casa en el momento de invitar (evita depender de una
  -- política RLS extra sobre "homes" para que el invitado, que todavía no
  -- es miembro, pueda ver a qué Casa le están invitando).
  home_name text not null,
  invited_email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null
);

create index home_invitations_home_id_idx on public.home_invitations(home_id);
create index home_invitations_invited_email_idx on public.home_invitations(lower(invited_email));

-- Como mucho una invitación pendiente por (Casa, email) a la vez; se puede
-- volver a invitar libremente tras un rechazo o cancelación.
create unique index home_invitations_pending_unique_idx
  on public.home_invitations (home_id, lower(invited_email))
  where status = 'pending';

alter table public.home_invitations enable row level security;

-- Visible para miembros de la Casa (para ver/cancelar lo que han invitado)
-- y para la persona invitada (comparando su email de perfil).
create policy "home_invitations_select_member_or_invitee" on public.home_invitations
  for select using (
    home_id in (select public.get_my_home_ids())
    or lower(invited_email) = lower(coalesce((select email from public.profiles where id = auth.uid()), ''))
  );

-- Sin políticas de insert/update/delete: todas las mutaciones pasan por las
-- funciones SECURITY DEFINER de abajo (mismo patrón que create_home() en
-- 0003), así no hace falta codificar en RLS "solo el owner invita" ni
-- "solo el invitado responde".

-- ----------------------------------------------------------------------------
-- invite_to_home(): el owner de una Casa invita a otra persona por email.
-- ----------------------------------------------------------------------------
create or replace function public.invite_to_home(p_home_id uuid, p_email text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_home_name text;
  new_invitation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Introduce un email válido';
  end if;

  select name into v_home_name from public.homes where id = p_home_id;
  if v_home_name is null then
    raise exception 'Casa no encontrada';
  end if;

  if not exists (
    select 1 from public.home_members
    where home_id = p_home_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Solo el propietario de la Casa puede invitar';
  end if;

  if exists (
    select 1 from public.home_members hm
    join public.profiles p on p.id = hm.user_id
    where hm.home_id = p_home_id and lower(p.email) = v_email
  ) then
    raise exception 'Ese email ya pertenece a la Casa';
  end if;

  if exists (
    select 1 from public.home_invitations
    where home_id = p_home_id and lower(invited_email) = v_email and status = 'pending'
  ) then
    raise exception 'Ya hay una invitación pendiente para ese email';
  end if;

  insert into public.home_invitations (home_id, home_name, invited_email, invited_by)
  values (p_home_id, v_home_name, v_email, auth.uid())
  returning id into new_invitation_id;

  return new_invitation_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- respond_to_invitation(): la persona invitada acepta o rechaza.
-- ----------------------------------------------------------------------------
create or replace function public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_invitation public.home_invitations;
  v_my_email text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select email into v_my_email from public.profiles where id = auth.uid();

  select * into v_invitation
  from public.home_invitations
  where id = p_invitation_id and status = 'pending';

  if v_invitation.id is null or lower(v_invitation.invited_email) <> lower(coalesce(v_my_email, '')) then
    raise exception 'Invitación no encontrada';
  end if;

  if p_accept then
    insert into public.home_members (home_id, user_id, role)
    values (v_invitation.home_id, auth.uid(), 'member')
    on conflict (home_id, user_id) do nothing;

    update public.home_invitations
    set status = 'accepted', responded_at = now(), responded_by = auth.uid()
    where id = p_invitation_id;
  else
    update public.home_invitations
    set status = 'declined', responded_at = now(), responded_by = auth.uid()
    where id = p_invitation_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_invitation(): el owner cancela una invitación pendiente que envió.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update public.home_invitations
  set status = 'cancelled', responded_at = now(), responded_by = auth.uid()
  where id = p_invitation_id
    and status = 'pending'
    and home_id in (
      select home_id from public.home_members
      where user_id = auth.uid() and role = 'owner'
    );
end;
$$;

commit;
