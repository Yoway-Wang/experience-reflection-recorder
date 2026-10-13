create table if not exists public.experience_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.experience_records enable row level security;

drop policy if exists "Users can read their own experience records" on public.experience_records;
create policy "Users can read their own experience records"
on public.experience_records
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own experience records" on public.experience_records;
create policy "Users can insert their own experience records"
on public.experience_records
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own experience records" on public.experience_records;
create policy "Users can update their own experience records"
on public.experience_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
