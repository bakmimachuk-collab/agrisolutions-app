create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  date_of_birth date,
  phone_verified_at timestamptz,
  gender text check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  avatar_url text,
  region text,
  farm_location text,
  experience_level text not null default 'beginner'
    check (experience_level in ('beginner', 'intermediate', 'expert')),
  language text not null default 'en' check (language in ('en', 'ha', 'pcm')),
  ai_language text not null default 'app' check (ai_language in ('app', 'en', 'ha', 'pcm')),
  timezone text not null default 'Africa/Lagos'
    check (timezone in ('Africa/Lagos','Africa/Accra','Africa/Abidjan','Europe/London','America/New_York','UTC')),
  notification_preferences jsonb not null default '{"crop":true,"livestock":true,"weather":true,"activity":true,"ai":true,"community":true,"inApp":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, phone, date_of_birth, gender)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    case
      when coalesce(new.raw_user_meta_data ->> 'date_of_birth', '') ~ '^\d{4}-\d{2}-\d{2}$'
        and to_char(to_date(new.raw_user_meta_data ->> 'date_of_birth', 'YYYY-MM-DD'), 'YYYY-MM-DD') = new.raw_user_meta_data ->> 'date_of_birth'
      then (new.raw_user_meta_data ->> 'date_of_birth')::date
      else null
    end,
    case
      when new.raw_user_meta_data ->> 'gender' in ('female','male','non_binary','prefer_not_to_say')
      then new.raw_user_meta_data ->> 'gender'
      else null
    end
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        phone = coalesce(new.phone, public.profiles.phone),
        phone_verified_at = case
          when tg_op = 'UPDATE' and new.phone is distinct from old.phone then null
          when new.phone_confirmed_at is not null then new.phone_confirmed_at
          else public.profiles.phone_verified_at
        end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
create trigger on_auth_user_phone_updated
  after update of phone on auth.users
  for each row execute procedure public.handle_new_user();
create trigger on_auth_user_phone_verified
  after update of phone_confirmed_at on auth.users
  for each row execute procedure public.handle_new_user();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table public.crop_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  variety text,
  area numeric(12,2),
  status text not null default 'healthy',
  planted_on date,
  expected_harvest_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.livestock_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  animal_type text not null,
  breed text,
  count integer not null default 1 check (count > 0),
  status text not null default 'healthy',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  crop_record_id uuid references public.crop_records(id) on delete set null,
  livestock_record_id uuid references public.livestock_records(id) on delete set null,
  subject_type text not null check (subject_type in ('crop', 'livestock', 'unknown')),
  symptoms text not null,
  image_url text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  category text not null default 'custom'
    check (category in ('planting','watering','fertilizing','spraying','weed_control','soil_inspection','crop_inspection','harvesting','livestock_feeding','livestock_vaccination','livestock_inspection','medication','breeding','equipment_maintenance','custom')),
  start_date date not null,
  start_time time,
  end_date date,
  end_time time,
  timezone text not null default 'Africa/Lagos'
    check (timezone in ('Africa/Lagos','Africa/Accra','Africa/Abidjan','Europe/London','America/New_York','UTC')),
  related_crop_id uuid references public.crop_records(id) on delete set null,
  related_livestock_id uuid references public.livestock_records(id) on delete set null,
  location text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'scheduled' check (status in ('scheduled','completed','missed','cancelled')),
  recurrence_rule jsonb not null default '{"frequency":"none","interval":1}'::jsonb,
  recurrence_parent_id uuid references public.calendar_events(id) on delete cascade,
  reminder_settings jsonb not null default '{"enabled":true,"minutes_before":[0]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (end_date is distinct from start_date or end_time is null or start_time is null or end_time >= start_time)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  priority text not null default 'information'
    check (priority in ('critical','warning','reminder','information')),
  title text not null,
  message text not null,
  title_key text,
  message_key text,
  params jsonb not null default '{}'::jsonb,
  event_key text,
  related_type text,
  related_id uuid,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  content text not null check (length(trim(content)) between 1 and 10000),
  category text not null default 'general_questions'
    check (category in ('crop_farming','livestock_farming','soil_management','pest_disease','farm_business','agricultural_technology','general_questions','success_stories')),
  image_urls text[] not null default '{}',
  location text,
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.community_comments(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null default 'helpful' check (reaction_type in ('helpful')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction_type)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 1 and 100),
  description text not null default '',
  status text not null default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)
);

create table public.user_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.ensure_related_records_belong_to_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_owner uuid;
begin
  if tg_table_name = 'calendar_events' then
    if new.related_crop_id is not null then
      select user_id into related_owner from public.crop_records where id = new.related_crop_id;
      if related_owner is distinct from new.user_id then
        raise exception 'Related crop must belong to the event owner.';
      end if;
    end if;
    if new.related_livestock_id is not null then
      select user_id into related_owner from public.livestock_records where id = new.related_livestock_id;
      if related_owner is distinct from new.user_id then
        raise exception 'Related livestock must belong to the event owner.';
      end if;
    end if;
  elsif tg_table_name = 'diagnoses' then
    if new.crop_record_id is not null then
      select user_id into related_owner from public.crop_records where id = new.crop_record_id;
      if related_owner is distinct from new.user_id then
        raise exception 'Related crop must belong to the diagnosis owner.';
      end if;
    end if;
    if new.livestock_record_id is not null then
      select user_id into related_owner from public.livestock_records where id = new.livestock_record_id;
      if related_owner is distinct from new.user_id then
        raise exception 'Related livestock must belong to the diagnosis owner.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger calendar_event_related_owner
  before insert on public.calendar_events
  for each row execute procedure public.ensure_related_records_belong_to_user();
create trigger calendar_event_related_owner_update
  before update of user_id, related_crop_id, related_livestock_id on public.calendar_events
  for each row execute procedure public.ensure_related_records_belong_to_user();
create trigger diagnosis_related_owner
  before insert on public.diagnoses
  for each row execute procedure public.ensure_related_records_belong_to_user();
create trigger diagnosis_related_owner_update
  before update of user_id, crop_record_id, livestock_record_id on public.diagnoses
  for each row execute procedure public.ensure_related_records_belong_to_user();

create or replace function public.ensure_community_images_belong_to_author()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  image_path text;
begin
  foreach image_path in array new.image_urls loop
    if split_part(image_path, '/', 1) <> new.user_id::text or image_path like '%..%' then
raise exception 'Community images must be stored in the author''s own folder.';
    end if;
  end loop;
  return new;
end;
$$;

create trigger community_post_image_owner
  before insert on public.community_posts
  for each row execute procedure public.ensure_community_images_belong_to_author();
create trigger community_post_image_owner_update
  before update of user_id, image_urls on public.community_posts
  for each row execute procedure public.ensure_community_images_belong_to_author();

create or replace function public.notify_community_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
  parent_owner uuid;
  preferences jsonb;
begin
  if tg_table_name = 'community_comments' then
    select user_id into post_owner from public.community_posts where id = new.post_id;
    select notification_preferences into preferences from public.profiles where id = post_owner;
    if post_owner is not null and post_owner <> new.user_id
      and coalesce(preferences ->> 'inApp','true') <> 'false'
      and coalesce(preferences ->> 'community','true') <> 'false' then
      insert into public.notifications(user_id, category, priority, title, message, title_key, message_key, event_key, related_type, related_id, href)
      values (post_owner, 'community', 'information', 'New community reply', 'A farmer replied to your community post.',
        'community.post.reply.title', 'community.post.reply.message',
        'community-post-reply:' || new.id::text, 'community_post', new.post_id, '/community?post=' || new.post_id::text)
      on conflict (user_id, event_key) do nothing;
    end if;
    if new.parent_comment_id is not null then
      select user_id into parent_owner from public.community_comments where id = new.parent_comment_id;
      if parent_owner is not null and parent_owner <> new.user_id and parent_owner is distinct from post_owner then
        select notification_preferences into preferences from public.profiles where id = parent_owner;
      else
        preferences := null;
      end if;
      if parent_owner is not null and parent_owner <> new.user_id and parent_owner is distinct from post_owner
        and coalesce(preferences ->> 'inApp','true') <> 'false'
        and coalesce(preferences ->> 'community','true') <> 'false' then
        insert into public.notifications(user_id, category, priority, title, message, title_key, message_key, event_key, related_type, related_id, href)
        values (parent_owner, 'community', 'information', 'New reply to your comment', 'A farmer replied to your community comment.',
          'community.comment.reply.title', 'community.comment.reply.message',
          'community-comment-reply:' || new.id::text, 'community_comment', new.parent_comment_id, '/community?post=' || new.post_id::text)
        on conflict (user_id, event_key) do nothing;
      end if;
    end if;
  elsif tg_table_name = 'community_reactions' then
    select user_id into post_owner from public.community_posts where id = new.post_id;
    select notification_preferences into preferences from public.profiles where id = post_owner;
    if post_owner is not null and post_owner <> new.user_id
      and coalesce(preferences ->> 'inApp','true') <> 'false'
      and coalesce(preferences ->> 'community','true') <> 'false' then
      insert into public.notifications(user_id, category, priority, title, message, title_key, message_key, event_key, related_type, related_id, href)
      values (post_owner, 'community', 'information', 'Your post was marked helpful', 'A farmer found your community post helpful.',
        'community.post.helpful.title', 'community.post.helpful.message',
        'community-helpful:' || new.id::text, 'community_post', new.post_id, '/community?post=' || new.post_id::text)
      on conflict (user_id, event_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger community_comment_notification
  after insert on public.community_comments
  for each row execute procedure public.notify_community_activity();
create trigger community_reaction_notification
  after insert on public.community_reactions
  for each row execute procedure public.notify_community_activity();

create or replace function public.ensure_comment_thread_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_post_id uuid;
begin
  if new.parent_comment_id is not null then
    select post_id into parent_post_id
    from public.community_comments
    where id = new.parent_comment_id;
    if parent_post_id is distinct from new.post_id then
      raise exception 'A reply must belong to the same post as its parent comment.';
    end if;
  end if;
  return new;
end;
$$;
create trigger community_comment_thread_consistency
  before insert on public.community_comments
  for each row execute procedure public.ensure_comment_thread_consistency();
create trigger community_comment_thread_consistency_update
  before update of post_id, parent_comment_id on public.community_comments
  for each row execute procedure public.ensure_comment_thread_consistency();

create index conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index crop_records_user_idx on public.crop_records(user_id);
create index livestock_records_user_idx on public.livestock_records(user_id);
create index diagnoses_user_created_idx on public.diagnoses(user_id, created_at desc);
create index calendar_events_user_start_idx on public.calendar_events(user_id, start_date, start_time);
create index calendar_events_recurrence_idx on public.calendar_events(recurrence_parent_id);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index community_posts_created_idx on public.community_posts(created_at desc) where status = 'published';
create index community_posts_category_created_idx on public.community_posts(category, created_at desc) where status = 'published';
create index community_comments_post_created_idx on public.community_comments(post_id, created_at);
create index community_reports_status_idx on public.community_reports(status, created_at);
create index user_activity_user_created_idx on public.user_activity(user_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger conversations_updated_at before update on public.conversations
  for each row execute procedure public.set_updated_at();
create trigger crop_records_updated_at before update on public.crop_records
  for each row execute procedure public.set_updated_at();
create trigger livestock_records_updated_at before update on public.livestock_records
  for each row execute procedure public.set_updated_at();
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute procedure public.set_updated_at();
create trigger community_posts_updated_at before update on public.community_posts
  for each row execute procedure public.set_updated_at();
create trigger community_comments_updated_at before update on public.community_comments
  for each row execute procedure public.set_updated_at();

create view public.community_profiles
with (security_invoker = false)
as
  select id, display_name, avatar_url, region
  from public.profiles;
grant select on public.community_profiles to authenticated;

create view public.community_post_stats
with (security_invoker = true)
as
  select
    p.id as post_id,
    count(distinct c.id)::integer as comment_count,
    count(distinct r.id)::integer as helpful_count
  from public.community_posts p
  left join public.community_comments c on c.post_id = p.id
  left join public.community_reactions r on r.post_id = p.id and r.reaction_type = 'helpful'
  group by p.id;
grant select on public.community_post_stats to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.crop_records enable row level security;
alter table public.livestock_records enable row level security;
alter table public.diagnoses enable row level security;
alter table public.calendar_events enable row level security;
alter table public.notifications enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;
alter table public.user_activity enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy "Profiles are private to their owner" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "Users update their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Owners manage conversations" on public.conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners manage conversation messages" on public.messages for all to authenticated
  using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
create policy "Owners manage crop records" on public.crop_records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners manage livestock records" on public.livestock_records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners manage diagnoses" on public.diagnoses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners manage calendar events" on public.calendar_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners manage notifications" on public.notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Authenticated users read published posts" on public.community_posts for select to authenticated
  using (status = 'published' or user_id = (select auth.uid()) or (select private.is_admin()));
create policy "Authors create posts" on public.community_posts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Authors and admins update posts" on public.community_posts for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "Authors and admins delete posts" on public.community_posts for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "Authenticated users read comments on visible posts" on public.community_comments for select to authenticated
  using (exists (
    select 1 from public.community_posts p
    where p.id = post_id and (p.status = 'published' or p.user_id = (select auth.uid()) or (select private.is_admin()))
  ));
create policy "Authors create comments on visible posts" on public.community_comments for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.community_posts p where p.id = post_id and p.status = 'published'
    ) and (
      parent_comment_id is null or exists (
        select 1 from public.community_comments parent
        where parent.id = parent_comment_id and parent.post_id = post_id
      )
    )
  );
create policy "Authors and admins update comments" on public.community_comments for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "Authors and admins delete comments" on public.community_comments for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "Authenticated users read helpful reactions" on public.community_reactions for select to authenticated
  using (exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'published'
  ));
create policy "Users manage their own reactions" on public.community_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.community_posts p where p.id = post_id and p.status = 'published'
  ));
create policy "Users remove their own reactions" on public.community_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users submit reports" on public.community_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "Reporters and admins read reports" on public.community_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "Admins update reports" on public.community_reports for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "Users read own activity" on public.user_activity for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users create own activity" on public.user_activity for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Admins read audit logs" on public.admin_audit_logs for select to authenticated
  using ((select private.is_admin()));
create policy "Admins insert audit logs" on public.admin_audit_logs for insert to authenticated
  with check (admin_id = (select auth.uid()) and (select private.is_admin()));

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.conversations,
  public.messages,
  public.crop_records,
  public.livestock_records,
  public.diagnoses,
  public.calendar_events,
  public.notifications,
  public.community_posts,
  public.community_comments,
  public.community_reactions,
  public.community_reports,
  public.user_activity,
  public.admin_audit_logs
to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, date_of_birth, gender, avatar_url, region, farm_location, experience_level, language, ai_language, timezone, notification_preferences)
  on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-images', 'community-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "Authenticated users read community images" on storage.objects for select to authenticated
  using (bucket_id = 'community-images');
create policy "Users upload community images to their folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users update their own community images" on storage.objects for update to authenticated
  using (bucket_id = 'community-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'community-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete their own community images" on storage.objects for delete to authenticated
  using (bucket_id = 'community-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['calendar_events','community_posts','community_comments','community_reactions','notifications'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
