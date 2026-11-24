/* 005: handle_new_user must never abort the auth.users insert.
 *
 * Defect found live: creating a user from the Supabase dashboard
 * (Authentication -> Users -> Add user) failed with
 *
 *   null value in column "username" of relation "profiles" violates not-null constraint
 *   SQLSTATE 23502
 *
 * The dashboard does not send raw_user_meta_data.username, so
 * lower(trim(new.raw_user_meta_data ->> 'username')) evaluated to NULL and the
 * profile insert failed. Because handle_new_user runs in the same transaction as
 * the auth.users insert, the whole admin request rolled back with a 500:
 * "failed to close prepared statement: current transaction is aborted".
 *
 * Any signup path that omits username metadata (dashboard, admin API, future
 * OAuth providers) would break the same way. Derive a valid, unique username
 * instead of trusting metadata to be present.
 *
 * Idempotent and re-runnable.
 */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  suffix text;
  n integer := 1;
begin
  base := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if base = '' then
    base := lower(split_part(coalesce(new.email, ''), '@', 1));
  end if;

  -- keep only characters allowed by profiles.username check (^[a-z0-9_]{3,24}$)
  base := regexp_replace(base, '[^a-z0-9_]+', '_', 'g');
  base := trim(both '_' from base);

  -- short or empty local parts ("a@x.com", "a+b@x.com") get a stable id-based name
  if length(base) < 3 then
    base := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  base := left(base, 24);

  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    n := n + 1;
    suffix := '_' || n::text;
    candidate := left(base, 24 - length(suffix)) || suffix;
  end loop;

  insert into public.profiles (id, email, username)
  values (new.id, coalesce(new.email, candidate || '@invalid'), candidate);

  return new;
end;
$$;

/* Keep it out of the RPC surface, same rule as 003. */
revoke all on function public.handle_new_user() from public, anon, authenticated;
