-- Draft migration: do not apply until database and integration tests pass.
begin;

create table if not exists public.track_energy (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (length(track_id) between 1 and 100),
  energy smallint not null check (energy between 0 and 60),
  refill_at timestamptz,
  primary key (user_id, track_id),
  check ((energy = 60 and refill_at is null) or (energy < 60 and refill_at is not null))
);

create table if not exists public.energy_operations (
  user_id uuid not null,
  track_id text not null,
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id, operation_id),
  foreign key (user_id, track_id) references public.track_energy(user_id, track_id) on delete cascade
);

alter table public.track_energy enable row level security;
alter table public.energy_operations enable row level security;
revoke all on public.track_energy, public.energy_operations from public, anon, authenticated;
grant select on public.track_energy to authenticated;
drop policy if exists "Users read their own energy" on public.track_energy;
create policy "Users read their own energy" on public.track_energy for select to authenticated
  using ((select auth.uid()) = user_id);

-- Called only on first import. Subsequent calls never reset or refill a row.
create or replace function public.initialize_track_energy(p_track_id text, p_energy integer, p_refill_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  safe_refill timestamptz;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_track_id is null or length(p_track_id) not between 1 and 100
     or p_energy is null or p_energy not between 0 and 60 then
    raise exception 'Invalid energy' using errcode = '22023';
  end if;
  if p_energy < 60 then
    safe_refill := least(coalesce(p_refill_at, now() + interval '8 hours'), now() + interval '8 hours');
    if safe_refill <= now() then p_energy := 60; safe_refill := null; end if;
  end if;
  insert into public.track_energy (user_id, track_id, energy, refill_at)
    values (current_user_id, p_track_id, p_energy, safe_refill)
    on conflict (user_id, track_id) do nothing;
end;
$$;

-- The operation UUID must be generated once per submitted answer and reused on retry.
create or replace function public.consume_track_energy(p_track_id text, p_operation_id uuid)
returns table (energy smallint, refill_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_energy public.track_energy%rowtype;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_track_id is null or length(p_track_id) not between 1 and 100 or p_operation_id is null then
    raise exception 'Invalid energy operation' using errcode = '22023';
  end if;
  select * into current_energy from public.track_energy e
    where e.user_id = current_user_id and e.track_id = p_track_id for update;
  if not found then raise exception 'Energy not initialized' using errcode = 'P0001'; end if;

  if current_energy.refill_at is not null and current_energy.refill_at <= now() then
    update public.track_energy e set energy = 60, refill_at = null
      where e.user_id = current_user_id and e.track_id = p_track_id returning * into current_energy;
  end if;
  if exists (select 1 from public.energy_operations o where o.user_id = current_user_id
             and o.track_id = p_track_id and o.operation_id = p_operation_id) then
    return query select current_energy.energy, current_energy.refill_at;
    return;
  end if;
  if current_energy.energy < 1 then raise exception 'Insufficient energy' using errcode = 'P0001'; end if;
  insert into public.energy_operations (user_id, track_id, operation_id)
    values (current_user_id, p_track_id, p_operation_id);
  update public.track_energy e
    set energy = e.energy - 1, refill_at = coalesce(e.refill_at, now() + interval '8 hours')
    where e.user_id = current_user_id and e.track_id = p_track_id returning * into current_energy;
  return query select current_energy.energy, current_energy.refill_at;
end;
$$;

revoke all on function public.initialize_track_energy(text, integer, timestamptz) from public, anon;
revoke all on function public.consume_track_energy(text, uuid) from public, anon;
grant execute on function public.initialize_track_energy(text, integer, timestamptz) to authenticated;
grant execute on function public.consume_track_energy(text, uuid) to authenticated;
commit;
