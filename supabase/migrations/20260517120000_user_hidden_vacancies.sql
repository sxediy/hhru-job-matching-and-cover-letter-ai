-- User-dismissed vacancy ids (hh.ru vacancy_id only; no HH payload).

create table if not exists public.user_hidden_vacancies (
  user_id uuid not null references auth.users (id) on delete cascade,
  vacancy_id text not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, vacancy_id)
);

create index if not exists user_hidden_vacancies_user_hidden_at_idx
  on public.user_hidden_vacancies (user_id, hidden_at desc);

alter table public.user_hidden_vacancies enable row level security;

create policy "user_hidden_vacancies_select_own"
  on public.user_hidden_vacancies
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_hidden_vacancies_insert_own"
  on public.user_hidden_vacancies
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_hidden_vacancies_update_own"
  on public.user_hidden_vacancies
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_hidden_vacancies_delete_own"
  on public.user_hidden_vacancies
  for delete
  to authenticated
  using (auth.uid() = user_id);
