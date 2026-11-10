-- Run in the Supabase SQL editor as the project owner.
-- Each track is a separate document owned by the authenticated user.
-- CREATE TABLE IF NOT EXISTS does not migrate an existing table.
begin;
create table if not exists public.track_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null check (length(track_id) between 1 and 100),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.track_progress enable row level security;

drop policy if exists "Users read their own progress" on public.track_progress;
create policy "Users read their own progress"
  on public.track_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own progress" on public.track_progress;
create policy "Users create their own progress"
  on public.track_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own progress" on public.track_progress;
create policy "Users update their own progress"
  on public.track_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own progress" on public.track_progress;
create policy "Users delete their own progress"
  on public.track_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
