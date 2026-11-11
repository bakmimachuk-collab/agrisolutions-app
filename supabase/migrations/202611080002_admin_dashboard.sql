alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'deactivated')),
  add column if not exists status_reason text,
  add column if not exists status_updated_at timestamptz;

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;
create policy "Users manage their own presence"
  on public.user_presence for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_presence to authenticated;

create index if not exists user_presence_last_seen_idx
  on public.user_presence(last_seen_at desc);
create index if not exists profiles_account_status_idx
  on public.profiles(account_status);

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
  );
$$;
grant execute on function private.is_active_user() to authenticated;

create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  attempted_email text not null default '',
  succeeded boolean not null default false,
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_login_attempts enable row level security;
create policy "Admins read login attempts"
  on public.admin_login_attempts for select to authenticated
  using ((select private.is_admin()));
grant select on public.admin_login_attempts to authenticated;
revoke insert, update, delete on public.admin_login_attempts from anon, authenticated;
create index if not exists admin_login_attempts_created_idx
  on public.admin_login_attempts(created_at desc);

create or replace function public.prevent_admin_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Administrative audit records are append-only.';
end;
$$;

drop trigger if exists admin_audit_logs_append_only on public.admin_audit_logs;
create trigger admin_audit_logs_append_only
  before update or delete on public.admin_audit_logs
  for each row execute procedure public.prevent_admin_audit_log_mutation();
drop policy if exists "Admins insert audit logs" on public.admin_audit_logs;
revoke insert, update, delete on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

drop policy if exists "Profiles are private to their owner" on public.profiles;
create policy "Active users read their own profiles" on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Users update their own profile" on public.profiles;
create policy "Active users update their own profiles" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()) and (select private.is_active_user()));

drop policy if exists "Owners manage conversations" on public.conversations;
create policy "Active users manage conversations" on public.conversations for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Owners manage conversation messages" on public.messages;
create policy "Active users manage conversation messages" on public.messages for all to authenticated
  using (
    user_id = (select auth.uid()) and (select private.is_active_user()) and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and (select private.is_active_user()) and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners manage crop records" on public.crop_records;
create policy "Active users manage crop records" on public.crop_records for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Owners manage livestock records" on public.livestock_records;
create policy "Active users manage livestock records" on public.livestock_records for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Owners manage diagnoses" on public.diagnoses;
create policy "Active users manage diagnoses" on public.diagnoses for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Owners manage calendar events" on public.calendar_events;
create policy "Active users manage calendar events" on public.calendar_events for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Owners manage notifications" on public.notifications;
create policy "Active users manage notifications" on public.notifications for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));

drop policy if exists "Authenticated users read published posts" on public.community_posts;
create policy "Active users read community posts" on public.community_posts for select to authenticated
  using (
    (select private.is_active_user())
    and (status = 'published' or user_id = (select auth.uid()) or (select private.is_admin()))
  );
drop policy if exists "Authors create posts" on public.community_posts;
create policy "Active users create posts" on public.community_posts for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Authors and admins update posts" on public.community_posts;
create policy "Active authors and admins update posts" on public.community_posts for update to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()))
  with check ((user_id = (select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()));
drop policy if exists "Authors and admins delete posts" on public.community_posts;
create policy "Active authors and admins delete posts" on public.community_posts for delete to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()));

drop policy if exists "Authenticated users read comments on visible posts" on public.community_comments;
create policy "Active users read comments on visible posts" on public.community_comments for select to authenticated
  using ((select private.is_active_user()) and exists (
    select 1 from public.community_posts p
    where p.id = post_id and (p.status = 'published' or p.user_id = (select auth.uid()) or (select private.is_admin()))
  ));
drop policy if exists "Authors create comments on visible posts" on public.community_comments;
create policy "Active users create comments on visible posts" on public.community_comments for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select private.is_active_user()) and exists (
      select 1 from public.community_posts p where p.id = post_id and p.status = 'published'
    ) and (
      parent_comment_id is null or exists (
        select 1 from public.community_comments parent
        where parent.id = parent_comment_id and parent.post_id = post_id
      )
    )
  );
drop policy if exists "Authors and admins update comments" on public.community_comments;
create policy "Active authors and admins update comments" on public.community_comments for update to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()))
  with check ((user_id = (select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()));
drop policy if exists "Authors and admins delete comments" on public.community_comments;
create policy "Active authors and admins delete comments" on public.community_comments for delete to authenticated
  using ((user_id = (select auth.uid()) and (select private.is_active_user())) or (select private.is_admin()));

drop policy if exists "Authenticated users read helpful reactions" on public.community_reactions;
create policy "Active users read helpful reactions" on public.community_reactions for select to authenticated
  using ((select private.is_active_user()) and exists (
    select 1 from public.community_posts p where p.id = post_id and p.status = 'published'
  ));
drop policy if exists "Users manage their own reactions" on public.community_reactions;
create policy "Active users manage their own reactions" on public.community_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_user()) and exists (
    select 1 from public.community_posts p where p.id = post_id and p.status = 'published'
  ));
drop policy if exists "Users remove their own reactions" on public.community_reactions;
create policy "Active users remove their own reactions" on public.community_reactions for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));

drop policy if exists "Users submit reports" on public.community_reports;
create policy "Active users submit reports" on public.community_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Reporters and admins read reports" on public.community_reports;
create policy "Active reporters and admins read reports" on public.community_reports for select to authenticated
  using ((select private.is_active_user()) and (reporter_id = (select auth.uid()) or (select private.is_admin())));
drop policy if exists "Admins update reports" on public.community_reports;
create policy "Admins update reports" on public.community_reports for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "Users read own activity" on public.user_activity;
create policy "Active users read own activity" on public.user_activity for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists "Users create own activity" on public.user_activity;
create policy "Active users create own activity" on public.user_activity for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));

drop policy if exists "Users manage their own presence" on public.user_presence;
create policy "Active users manage their own presence" on public.user_presence for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
