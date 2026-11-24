/*
  Run after 003. Fixes two defects found by the end-to-end probe.

  1. Pending-request cap was never enforced.
     `limit_pending_purchases_trigger` and `prepare_purchase_trigger` are both
     BEFORE INSERT, and Postgres fires them alphabetically: "limit..." runs
     before "prepare...". The limit function counted `new.user_id`, which is
     still NULL for the normal client insert (the frontend does not send
     user_id), so the count was always 0 and a user could queue unlimited
     pending requests. Counting `auth.uid()` instead of `new.user_id` makes the
     result independent of trigger order and immune to a forged user_id.

  2. Admin approval was broken by 003.
     `admin_mark_purchase` was SECURITY INVOKER and runs
     `update public.purchase_requests`. 003 revoked UPDATE from authenticated
     (correct: only this RPC may change a request), so an admin got
     "permission denied for table purchase_requests" and could never approve.
     Making the RPC SECURITY DEFINER restores it while keeping the table
     read-only for clients. The is_admin() check stays inside the function.

  Idempotent: safe to re-run.
*/

create or replace function public.admin_mark_purchase(request_id uuid, decision text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Hanya admin'; end if;
  if decision not in ('paid','rejected') then raise exception 'Keputusan tidak valid'; end if;
  update public.purchase_requests set status = decision where id = request_id and status = 'pending';
  if not found then raise exception 'Permintaan tidak ditemukan atau sudah diproses'; end if;
end;
$$;

create or replace function public.limit_pending_purchases()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who uuid := coalesce(auth.uid(), new.user_id);
begin
  if who is null then
    raise exception 'Harus login untuk membuat permintaan pembayaran.';
  end if;
  if (select count(*) from public.purchase_requests
      where user_id = who and status = 'pending') >= 3 then
    raise exception 'Kamu sudah memiliki 3 permintaan pembayaran yang menunggu. Tunggu konfirmasi admin.';
  end if;
  return new;
end;
$$;

-- Trigger-only function: never callable as an RPC.
revoke all on function public.limit_pending_purchases() from public, anon, authenticated;

-- Approval is an app RPC for signed-in users; it checks is_admin() itself.
revoke all on function public.admin_mark_purchase(uuid, text) from public, anon;
grant execute on function public.admin_mark_purchase(uuid, text) to authenticated;
