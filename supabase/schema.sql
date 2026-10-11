-- Run once in the Supabase SQL Editor. No private keys belong in the app.
create table if not exists public.daily_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.daily_data enable row level security;
revoke all on public.daily_data from anon, authenticated;
grant select on public.daily_data to authenticated;
create policy "Read own Daily data" on public.daily_data for select to authenticated
  using ((select auth.uid()) = user_id);

-- A single transaction compares revisions and writes; concurrent devices cannot
-- overwrite a revision they have not read. All writes go through this function.
create or replace function public.daily_sync(expected_revision bigint, new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.daily_data;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if new_payload->>'app' is distinct from 'daily-macros-weight'
    or new_payload->>'version' is distinct from '1'
    or jsonb_typeof(new_payload->'entries') is distinct from 'array'
    or jsonb_typeof(new_payload->'meals') is distinct from 'array'
    or jsonb_typeof(new_payload->'weights') is distinct from 'array'
    or octet_length(new_payload::text) > 20971520 then
    raise exception 'Invalid Daily data';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into current_row from public.daily_data where user_id = owner_id;
  if coalesce(current_row.revision, 0) <> expected_revision then
    return jsonb_build_object('conflict', true);
  end if;
  insert into public.daily_data(user_id, revision, payload)
    values(owner_id, expected_revision + 1, new_payload)
    on conflict(user_id) do update set revision = excluded.revision,
      payload = excluded.payload, updated_at = now();
  return jsonb_build_object('revision', expected_revision + 1);
end $$;
revoke all on function public.daily_sync(bigint,jsonb) from public, anon;
grant execute on function public.daily_sync(bigint,jsonb) to authenticated;

create or replace function public.daily_delete_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.daily_delete_account() from public, anon;
grant execute on function public.daily_delete_account() to authenticated;
