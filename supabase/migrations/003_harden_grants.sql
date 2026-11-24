/*
  Run after 001 and 002. Matches the hardened production grants.

  Supabase's default privileges give anon/authenticated far more than the app
  needs (including UPDATE on every table and TRUNCATE, which bypasses RLS).
  Migration 001 only *adds* grants, so a fresh project would let a student
  promote themselves to admin or mark their own purchase paid.

  This file is idempotent: revoke everything first, then grant back the
  minimum. Safe to re-run.
*/

-- Table-wide privileges (removes default Supabase grants).
revoke all on all tables in schema public from anon, authenticated;

-- Column privileges are separate from table privileges; revoke them explicitly.
revoke update (status) on public.purchase_requests from anon, authenticated;
revoke update (username) on public.profiles from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Anonymous visitors only need the public price catalog.
grant select on public.plans to anon;

-- Signed-in users read their own catalog/profile/entitlements and admin-gated summaries.
grant select on public.plans, public.profiles, public.entitlements,
               public.summary_metadata, public.summary_contents to authenticated;

-- Students may rename themselves; role/email/created_at stay server-controlled.
grant update (username) on public.profiles to authenticated;

-- Insert is trigger-validated (amount/status/user_id forced). No UPDATE:
-- only admin_mark_purchase() may change a request.
grant select, insert on public.purchase_requests to authenticated;

-- RLS still restricts these writes to admins.
grant insert, update, delete on public.summary_metadata, public.summary_contents to authenticated;

-- Trigger-only functions must never be callable as RPCs.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prepare_purchase() from public, anon, authenticated;
revoke all on function public.keep_paid_purchase_intact() from public, anon, authenticated;
revoke all on function public.grant_purchase_tools() from public, anon, authenticated;
revoke all on function public.limit_pending_purchases() from public, anon, authenticated;

-- App RPCs stay executable by signed-in users; each checks is_admin itself.
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_access(text) to authenticated;
grant execute on function public.get_access() to authenticated;
grant execute on function public.read_summary(text) to authenticated;
grant execute on function public.admin_create_summary(text, text, integer, text, text, text, date) to authenticated;
grant execute on function public.admin_purchases(text) to authenticated;
grant execute on function public.admin_mark_purchase(uuid, text) to authenticated;
