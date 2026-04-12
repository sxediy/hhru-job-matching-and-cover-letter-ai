-- Full vacancy payloads from api.hh.ru/vacancies/{id} for signed-in users.

create table if not exists public.user_vacancy_details (
  user_id uuid not null references auth.users (id) on delete cascade,
  vacancy_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, vacancy_id)
);

create index if not exists user_vacancy_details_updated_at_idx
  on public.user_vacancy_details (user_id, updated_at desc);

alter table public.user_vacancy_details enable row level security;

create policy "user_vacancy_details_select_own"
  on public.user_vacancy_details
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_vacancy_details_insert_own"
  on public.user_vacancy_details
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_vacancy_details_update_own"
  on public.user_vacancy_details
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_vacancy_details_delete_own"
  on public.user_vacancy_details
  for delete
  to authenticated
  using (auth.uid() = user_id);
