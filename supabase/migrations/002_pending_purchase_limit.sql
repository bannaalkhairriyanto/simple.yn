/* Run after 001. Caps open (pending) purchase requests per user to stop spam and admin-queue flooding. */
create or replace function public.limit_pending_purchases()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.purchase_requests where user_id = new.user_id and status = 'pending') >= 3 then
    raise exception 'Kamu sudah memiliki 3 permintaan pembayaran yang menunggu. Tunggu konfirmasi admin.';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_pending_purchases() from public;

create trigger limit_pending_purchases_trigger
before insert on public.purchase_requests for each row execute function public.limit_pending_purchases();
