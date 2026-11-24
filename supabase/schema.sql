-- FitTrack database schema. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.

-- 1) One generic table holds every record (workouts, routines, food entries, body, profile, steps…)
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  kind       text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists records_user_server_ts on public.records (user_id, server_ts);

-- server_ts is set by the server on every write; clients pull "everything newer than X"
create or replace function public.touch_server_ts() returns trigger
language plpgsql as $$
begin
  new.server_ts := clock_timestamp();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_server_ts();

alter table public.records enable row level security;
drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2) Secret token used by the iPhone Shortcut to post daily steps
create table if not exists public.step_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token   text not null unique
);
alter table public.step_tokens enable row level security;
drop policy if exists "own token" on public.step_tokens;
create policy "own token" on public.step_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) Endpoint called by the Shortcut: POST /rest/v1/rpc/log_steps {p_token, p_steps[, p_date]}
--    p_date is optional (YYYY-MM-DD); if missing or unreadable, today's date in Paris time is used.
drop function if exists public.log_steps(text, date, integer);
create or replace function public.log_steps(p_token text, p_steps numeric, p_date text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  d date;
  n integer;
begin
  select user_id into uid from public.step_tokens where token = trim(p_token);
  if uid is null then
    raise exception 'invalid token';
  end if;
  n := round(p_steps);
  if n is null or n < 0 or n > 200000 then
    raise exception 'invalid step count';
  end if;
  begin
    d := nullif(trim(p_date), '')::date;
  exception when others then
    d := null;
  end;
  if d is null then
    d := (now() at time zone 'Europe/Paris')::date;
  end if;
  insert into public.records (user_id, id, kind, data, updated_at, deleted)
  values (uid, 'steps-' || d::text, 'steps',
          jsonb_build_object('date', d::text, 'steps', n, 'source', 'health'), now(), false)
  on conflict (user_id, id) do update
    set data = excluded.data, updated_at = now(), deleted = false;
  return 'ok: ' || n || ' steps on ' || d;
end $$;

revoke all on function public.log_steps(text, numeric, text) from public;
grant execute on function public.log_steps(text, numeric, text) to anon, authenticated;
