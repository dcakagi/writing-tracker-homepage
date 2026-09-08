-- Optional cloud-sync storage for Homepage Template.
-- Safe to run more than once in the Supabase SQL Editor.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  writing_data jsonb not null default '{}'::jsonb,
  paper_data jsonb not null default '{}'::jsonb,
  habit_data jsonb not null default '{}'::jsonb,
  todo_data jsonb not null default '{}'::jsonb,
  bookmark_counts jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bring an older copy of this schema forward without retaining email addresses.
alter table public.user_state drop column if exists email;
alter table public.user_state add column if not exists writing_data jsonb default '{}'::jsonb;
alter table public.user_state add column if not exists paper_data jsonb default '{}'::jsonb;
alter table public.user_state add column if not exists habit_data jsonb default '{}'::jsonb;
alter table public.user_state add column if not exists todo_data jsonb default '{}'::jsonb;
alter table public.user_state add column if not exists bookmark_counts jsonb default '{}'::jsonb;
alter table public.user_state add column if not exists preferences jsonb default '{}'::jsonb;
alter table public.user_state add column if not exists created_at timestamptz default now();
alter table public.user_state add column if not exists updated_at timestamptz default now();

update public.user_state
set
  writing_data = coalesce(writing_data, '{}'::jsonb),
  paper_data = coalesce(paper_data, '{}'::jsonb),
  habit_data = coalesce(habit_data, '{}'::jsonb),
  todo_data = coalesce(todo_data, '{}'::jsonb),
  bookmark_counts = coalesce(bookmark_counts, '{}'::jsonb),
  preferences = coalesce(preferences, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  writing_data is null
  or paper_data is null
  or habit_data is null
  or todo_data is null
  or bookmark_counts is null
  or preferences is null
  or created_at is null
  or updated_at is null;

alter table public.user_state alter column writing_data set default '{}'::jsonb;
alter table public.user_state alter column writing_data set not null;
alter table public.user_state alter column paper_data set default '{}'::jsonb;
alter table public.user_state alter column paper_data set not null;
alter table public.user_state alter column habit_data set default '{}'::jsonb;
alter table public.user_state alter column habit_data set not null;
alter table public.user_state alter column todo_data set default '{}'::jsonb;
alter table public.user_state alter column todo_data set not null;
alter table public.user_state alter column bookmark_counts set default '{}'::jsonb;
alter table public.user_state alter column bookmark_counts set not null;
alter table public.user_state alter column preferences set default '{}'::jsonb;
alter table public.user_state alter column preferences set not null;
alter table public.user_state alter column created_at set default now();
alter table public.user_state alter column created_at set not null;
alter table public.user_state alter column updated_at set default now();
alter table public.user_state alter column updated_at set not null;

-- Require object-shaped JSON and cap each payload. These limits leave ample room
-- for normal tracker history while rejecting accidentally or maliciously huge rows.
alter table public.user_state drop constraint if exists user_state_writing_data_valid;
alter table public.user_state
  add constraint user_state_writing_data_valid check (
    jsonb_typeof(writing_data) = 'object'
    and octet_length(writing_data::text) <= 1048576
  );

alter table public.user_state drop constraint if exists user_state_habit_data_valid;
alter table public.user_state
  add constraint user_state_habit_data_valid check (
    jsonb_typeof(habit_data) = 'object'
    and octet_length(habit_data::text) <= 65536
  );

alter table public.user_state drop constraint if exists user_state_paper_data_valid;
alter table public.user_state
  add constraint user_state_paper_data_valid check (
    jsonb_typeof(paper_data) = 'object'
    and octet_length(paper_data::text) <= 4194304
  );

alter table public.user_state drop constraint if exists user_state_todo_data_valid;
alter table public.user_state
  add constraint user_state_todo_data_valid check (
    jsonb_typeof(todo_data) = 'object'
    and octet_length(todo_data::text) <= 524288
  );

alter table public.user_state drop constraint if exists user_state_bookmark_counts_valid;
alter table public.user_state
  add constraint user_state_bookmark_counts_valid check (
    jsonb_typeof(bookmark_counts) = 'object'
    and octet_length(bookmark_counts::text) <= 65536
  );

alter table public.user_state drop constraint if exists user_state_preferences_valid;
alter table public.user_state
  add constraint user_state_preferences_valid check (
    jsonb_typeof(preferences) = 'object'
    and octet_length(preferences::text) <= 65536
  );

create or replace function public.set_user_state_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_state_updated_at on public.user_state;
create trigger set_user_state_updated_at
before update on public.user_state
for each row
execute function public.set_user_state_updated_at();

revoke all on function public.set_user_state_updated_at() from public, anon, authenticated;

alter table public.user_state enable row level security;
alter table public.user_state force row level security;

revoke all on table public.user_state from public, anon, authenticated;
grant select, insert, update, delete on table public.user_state to authenticated;

drop policy if exists "Users can read their own state" on public.user_state;
create policy "Users can read their own state"
on public.user_state
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own state" on public.user_state;
create policy "Users can insert their own state"
on public.user_state
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own state" on public.user_state;
create policy "Users can update their own state"
on public.user_state
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own state" on public.user_state;
create policy "Users can delete their own state"
on public.user_state
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
