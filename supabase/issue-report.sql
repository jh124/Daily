-- Run once in Supabase SQL Editor. Only the server can use these counters.
create table if not exists public.daily_issue_limits (
  bucket text primary key,
  count integer not null,
  expires_at timestamptz not null
);
alter table public.daily_issue_limits enable row level security;
revoke all on public.daily_issue_limits from public, anon, authenticated;
create or replace function public.daily_issue_allow(client_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  now_at timestamptz := now();
  hour_at timestamptz := date_trunc('hour', now_at);
  day_at timestamptz := date_trunc('day', now_at at time zone 'UTC') at time zone 'UTC';
  client_bucket text;
  global_bucket text;
begin
  if client_hash is null or client_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  perform pg_advisory_xact_lock(738291049);
  delete from public.daily_issue_limits where expires_at <= now_at;
  client_bucket := 'client:' || client_hash || ':' || hour_at::text;
  global_bucket := 'global:' || day_at::text;
  if coalesce((select count from public.daily_issue_limits where bucket=client_bucket),0) >= 3
     or coalesce((select count from public.daily_issue_limits where bucket=global_bucket),0) >= 50 then return false; end if;
  insert into public.daily_issue_limits values (client_bucket,1,hour_at+interval '1 hour')
    on conflict(bucket) do update set count=public.daily_issue_limits.count+1;
  insert into public.daily_issue_limits values (global_bucket,1,day_at+interval '1 day')
    on conflict(bucket) do update set count=public.daily_issue_limits.count+1;
  return true;
end $$;
revoke all on function public.daily_issue_allow(text) from public, anon, authenticated;
grant execute on function public.daily_issue_allow(text) to service_role;
