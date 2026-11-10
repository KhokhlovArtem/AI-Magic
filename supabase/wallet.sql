-- Draft migration. Apply only after integration and database tests are complete.
begin;

create table if not exists public.wallet_operations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (length(track_id) between 1 and 100),
  kind text not null check (kind in ('legacy_import', 'reward', 'purchase')),
  amount bigint not null,
  reference_id text,
  created_at timestamptz not null default now(),
  check ((kind = 'legacy_import' and amount >= 0 and reference_id is null)
      or (kind = 'reward' and amount > 0 and reference_id is not null)
      or (kind = 'purchase' and amount < 0 and reference_id is not null))
);

create unique index if not exists wallet_one_legacy_import
  on public.wallet_operations (user_id, track_id) where kind = 'legacy_import';
create unique index if not exists wallet_one_question_reward
  on public.wallet_operations (user_id, track_id, reference_id) where kind = 'reward';

alter table public.wallet_operations enable row level security;
revoke all on public.wallet_operations from public, anon, authenticated;
grant select on public.wallet_operations to authenticated;
drop policy if exists "Users read their own wallet operations" on public.wallet_operations;
create policy "Users read their own wallet operations"
  on public.wallet_operations for select to authenticated
  using ((select auth.uid()) = user_id);

-- Legacy balances are browser-controlled and cannot be independently verified.
-- A zero-value import also records that migration has already happened.
create or replace function public.import_legacy_wallet(p_track_id text, p_amount bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  imported bigint;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_track_id is null or length(p_track_id) not between 1 and 100
     or p_amount is null or p_amount < 0 or p_amount > 100 then
    raise exception 'Invalid import' using errcode = '22023';
  end if;
  insert into public.wallet_operations (user_id, track_id, kind, amount)
  values (current_user_id, p_track_id, 'legacy_import', p_amount)
  on conflict (user_id, track_id) where kind = 'legacy_import' do nothing;

  select amount into imported from public.wallet_operations
  where user_id = current_user_id and track_id = p_track_id and kind = 'legacy_import';
  return imported;
end;
$$;

revoke all on function public.import_legacy_wallet(text, bigint) from public, anon;
grant execute on function public.import_legacy_wallet(text, bigint) to authenticated;

commit;
