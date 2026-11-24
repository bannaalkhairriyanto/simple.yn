/* Run once as the database owner. Never expose a service-role key in the website. */
create type public.app_role as enum ('student', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null check (username ~ '^[a-z0-9_]{3,24}$'),
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));

create table public.plans (
  id text primary key check (id ~ '^[a-z-]+$'),
  name text not null,
  price integer not null check (price > 0 and price < 1000000000),
  tools text[] not null
);
insert into public.plans (id, name, price, tools) values
  ('hemat', 'Hemat', 10000, array['money','planner']),
  ('plus', 'Plus', 17000, array['summaries']),
  ('lengkap', 'Lengkap', 22000, array['money','planner','summaries']),
  ('money', 'Money Tracker', 9000, array['money']),
  ('planner', 'Study Planner', 9000, array['planner']),
  ('summaries', 'Course Summaries', 12000, array['summaries']);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  selected_tool text check (selected_tool is null or selected_tool in ('money', 'planner')),
  amount integer not null,
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  created_at timestamptz not null default now()
);
create index purchase_requests_status_idx on public.purchase_requests (status, created_at);

create table public.entitlements (
  user_id uuid references public.profiles(id) on delete cascade,
  tool text not null check (tool in ('money','planner','summaries')),
  source_purchase uuid not null references public.purchase_requests(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, tool)
);

create table public.summary_metadata (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  course text not null check (char_length(trim(course)) between 1 and 100),
  week integer not null check (week between 1 and 52),
  title text not null check (char_length(trim(title)) between 1 and 100),
  type text not null check (type in ('md','pdf')),
  updated_on date not null default current_date
);
create unique index summary_course_week_unique on public.summary_metadata (lower(course), week);

create table public.summary_contents (
  id text primary key references public.summary_metadata(id) on delete cascade,
  body_md text,
  pdf_path text check (pdf_path is null or pdf_path ~ '^[a-z0-9-]{1,80}\.pdf$'),
  check ((body_md is not null) or (pdf_path is not null)),
  check (body_md is null or pdf_path is null)
);

create or replace function public.is_admin(user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = user_id and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, lower(trim(new.raw_user_meta_data ->> 'username')));
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.prepare_purchase()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected_price integer;
begin
  select price into expected_price from public.plans where id = new.plan_id;
  if expected_price is null then raise exception 'Plan tidak ditemukan'; end if;
  new.amount := expected_price;
  new.status := 'pending';
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  if new.plan_id = 'plus' then
    if new.selected_tool not in ('money','planner') then raise exception 'Pilih satu alat tambahan'; end if;
  else
    new.selected_tool := null;
  end if;
  return new;
end;
$$;
create trigger prepare_purchase_trigger
before insert on public.purchase_requests for each row execute function public.prepare_purchase();

create or replace function public.keep_paid_purchase_intact()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status in ('paid','rejected') then raise exception 'Permintaan yang sudah selesai tidak dapat diubah'; end if;
  return new;
end;
$$;
create trigger keep_paid_purchase_trigger
before update on public.purchase_requests for each row execute function public.keep_paid_purchase_intact();

create or replace function public.grant_purchase_tools()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and old.status = 'pending' then
    insert into public.entitlements (user_id, tool, source_purchase)
    select new.user_id, tool_name, new.id
    from unnest((select tools from public.plans where id = new.plan_id)) as tool_name
    on conflict (user_id, tool) do nothing;
    if new.plan_id = 'plus' then
      insert into public.entitlements (user_id, tool, source_purchase)
      values (new.user_id, new.selected_tool, new.id)
      on conflict (user_id, tool) do nothing;
    end if;
  end if;
  return new;
end;
$$;
create trigger grant_purchase_tools_trigger
after update of status on public.purchase_requests for each row execute function public.grant_purchase_tools();

create or replace function public.can_access(tool_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case when auth.uid() is null then false
    when public.is_admin(auth.uid()) then true
    else exists(select 1 from public.entitlements where user_id = auth.uid() and tool = tool_name)
  end;
$$;

create or replace function public.get_access()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'role', coalesce((select role::text from public.profiles where id = auth.uid()), 'student'),
    'tools', jsonb_build_object(
      'money', public.can_access('money'),
      'planner', public.can_access('planner'),
      'summaries', public.can_access('summaries')
    )
  );
$$;

create or replace function public.read_summary(summary_id text)
returns table(id text, course text, week integer, title text, type text, updated_on date, body_md text, pdf_path text)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.course, m.week, m.title, m.type, m.updated_on, c.body_md, c.pdf_path
  from public.summary_metadata m join public.summary_contents c on c.id = m.id
  where m.id = summary_id and (m.week = 1 or public.can_access('summaries'));
$$;

create or replace function public.admin_create_summary(
  summary_id text, course_name text, week_number integer, summary_title text,
  summary_type text, markdown_body text, updated_date date default current_date
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Hanya admin'; end if;
  if summary_id !~ '^[a-z0-9-]{1,80}$' then raise exception 'ID tidak valid'; end if;
  if summary_type = 'md' then
    if markdown_body is null or char_length(trim(markdown_body)) = 0 or char_length(markdown_body) > 200000 then raise exception 'Isi Markdown tidak valid'; end if;
    insert into public.summary_metadata (id, course, week, title, type, updated_on)
      values (summary_id, trim(course_name), week_number, trim(summary_title), 'md', coalesce(updated_date, current_date));
    insert into public.summary_contents (id, body_md) values (summary_id, markdown_body);
  elsif summary_type = 'pdf' then
    insert into public.summary_metadata (id, course, week, title, type, updated_on)
      values (summary_id, trim(course_name), week_number, trim(summary_title), 'pdf', coalesce(updated_date, current_date));
    insert into public.summary_contents (id, pdf_path) values (summary_id, summary_id || '.pdf');
  else
    raise exception 'Jenis ringkasan tidak valid';
  end if;
end;
$$;

create or replace function public.admin_purchases(status_filter text default 'pending')
returns setof jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Hanya admin'; end if;
  return query
    select jsonb_build_object('id', r.id, 'email', p.email, 'username', p.username, 'plan_id', r.plan_id,
      'amount', r.amount, 'selected_tool', r.selected_tool, 'status', r.status, 'created_at', r.created_at)
    from public.purchase_requests r join public.profiles p on p.id = r.user_id
    where r.status = status_filter order by r.created_at;
end;
$$;

create or replace function public.admin_mark_purchase(request_id uuid, decision text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Hanya admin'; end if;
  if decision not in ('paid','rejected') then raise exception 'Keputusan tidak valid'; end if;
  update public.purchase_requests set status = decision where id = request_id and status = 'pending';
  if not found then raise exception 'Permintaan tidak ditemukan atau sudah diproses'; end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.entitlements enable row level security;
alter table public.summary_metadata enable row level security;
alter table public.summary_contents enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin(auth.uid()));
create policy profiles_own_name on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy plans_public_read on public.plans for select to anon, authenticated using (true);
create policy purchases_insert_own on public.purchase_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy purchases_read on public.purchase_requests for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy purchases_admin_update on public.purchase_requests for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy entitlements_read on public.entitlements for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy summaries_metadata_read on public.summary_metadata for select to authenticated using (true);
create policy summaries_content_read on public.summary_contents for select to authenticated using (
  public.can_access('summaries') or exists(select 1 from public.summary_metadata m where m.id = summary_contents.id and m.week = 1)
);
create policy summaries_admin_metadata on public.summary_metadata for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy summaries_admin_content on public.summary_contents for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public) values ('summary-private', 'summary-private', false) on conflict (id) do update set public = false;
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/pdf'] where id = 'summary-private';
create policy summary_pdf_read on storage.objects for select to authenticated using (
  bucket_id = 'summary-private' and (
    public.can_access('summaries') or exists(select 1 from public.summary_metadata m where m.week = 1 and name = m.id || '.pdf')
  )
);
create policy summary_pdf_admin on storage.objects for all to authenticated
  using (bucket_id = 'summary-private' and public.is_admin(auth.uid()))
  with check (bucket_id = 'summary-private' and public.is_admin(auth.uid()));

grant usage on schema public to authenticated;
grant select on public.plans to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant select, insert on public.purchase_requests to authenticated;
grant update (status) on public.purchase_requests to authenticated;
grant select on public.entitlements to authenticated;
grant select on public.summary_metadata to authenticated;
grant select on public.summary_contents to authenticated;
grant insert, update, delete on public.summary_metadata to authenticated;
grant insert, update, delete on public.summary_contents to authenticated;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.prepare_purchase() from public;
revoke all on function public.keep_paid_purchase_intact() from public;
revoke all on function public.grant_purchase_tools() from public;
revoke all on function public.can_access(text) from public;
revoke all on function public.get_access() from public;
revoke all on function public.read_summary(text) from public;
revoke all on function public.admin_create_summary(text,text,integer,text,text,text,date) from public;
revoke all on function public.admin_purchases(text) from public;
revoke all on function public.admin_mark_purchase(uuid,text) from public;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_access(text) to authenticated;
grant execute on function public.get_access() to authenticated;
grant execute on function public.read_summary(text) to authenticated;
grant execute on function public.admin_create_summary(text,text,integer,text,text,text,date) to authenticated;
grant execute on function public.admin_purchases(text) to authenticated;
grant execute on function public.admin_mark_purchase(uuid,text) to authenticated;
