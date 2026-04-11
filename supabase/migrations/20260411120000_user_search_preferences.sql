-- Run in Supabase SQL editor or via supabase db push.
-- Requires: Auth → Anonymous sign-ins enabled.

create table if not exists public.user_search_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_search_preferences_updated_at_idx
  on public.user_search_preferences (updated_at desc);

alter table public.user_search_preferences enable row level security;

create policy "user_search_preferences_select_own"
  on public.user_search_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_search_preferences_insert_own"
  on public.user_search_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_search_preferences_update_own"
  on public.user_search_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
