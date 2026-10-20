-- ============================================================
-- SCRIPT DE SETUP COMPLETO - AMIGOS DO DR. CANDIDO / ORBITA
-- Execute este script completo no Supabase Dashboard:
-- SQL Editor > New query > Colar tudo > Run
-- ============================================================

-- 1. EXTENSÕES
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 2. TIPOS DE USUÁRIOS
do $$ begin
  create type user_role as enum ('admin', 'coord', 'user');
exception when duplicate_object then null; end $$;

-- 3. TABELA DE PERFIS (public.profiles)
create table if not exists public.profiles (
  id            bigint generated always as identity primary key,
  auth_id       uuid unique references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  phone         text,
  birth         date,
  role          user_role not null default 'user',
  coord_id      bigint references public.profiles(id),
  parent_id     bigint references public.profiles(id),
  city          text,
  instagram     text,
  facebook      text,
  tiktok        text,
  whatsapp      text,
  photo_url     text,
  username      text unique,
  live_enabled  boolean not null default true,
  vcf_exported  boolean default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_profiles_parent on public.profiles(parent_id);
create index if not exists idx_profiles_coord on public.profiles(coord_id);

-- 4. TABELA DE REUNIÕES / EVENTOS (public.meetings)
create table if not exists public.meetings (
  id                  bigint generated always as identity primary key,
  title               text not null,
  date                date not null,
  time                text,
  location            text,
  lat                 double precision,
  lng                 double precision,
  created_by          bigint references public.profiles(id),
  inserted_by         uuid default auth.uid(),
  status              text not null default 'agendada',
  duration_minutes    integer default 0,
  attendees_count     integer default 0,
  presence_list       jsonb default '[]'::jsonb,
  presence_photo_url  text,
  photos              text[] default '{}'::text[],
  live_started_at     timestamptz,
  created_at          timestamptz not null default now()
);

do $$ begin
  alter table public.meetings add constraint check_meeting_status check (status in ('agendada', 'em_andamento', 'realizada'));
exception when duplicate_object then null; end $$;

-- 5. TABELA DE MENSAGENS DO MURAL (public.messages)
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  text        text not null check (char_length(text) <= 5000),
  from_id     bigint references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- 6. TABELA DE CURTIDAS DO MURAL (public.message_likes)
create table if not exists public.message_likes (
  message_id  bigint references public.messages(id) on delete cascade,
  profile_id  bigint references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (message_id, profile_id)
);

-- 7. TABELA DE COMENTÁRIOS DA LIVE (public.live_comments)
create table if not exists public.live_comments (
  id          bigint generated always as identity primary key,
  meeting_id  bigint references public.meetings(id) on delete cascade,
  profile_id  bigint references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) <= 1000),
  created_at  timestamptz not null default now()
);

-- 8. TABELA DO PERFIL DO DR. CANDIDO (public.owner_profile)
create table if not exists public.owner_profile (
  id                  int primary key default 1,
  name                text not null default 'Dr. Candido',
  photo_url           text,
  video_url           text,
  bio                 text,
  instagram           text,
  facebook            text,
  tiktok              text,
  whatsapp            text,
  youtube             text,
  instagram_redirects integer not null default 0,
  profile_redirects   integer not null default 0,
  updated_at          timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into public.owner_profile (id, name, bio, instagram) values (
  1,
  'Dr. Candido',
  E'⚖️ Advogado e especialista em regularização fundiária\n🌱 Voz de quem vive e produz no DF\n📍 Pré-candidato a Deputado Distrital',
  '@drcandidoteles'
) on conflict (id) do update set
  bio = excluded.bio,
  instagram = excluded.instagram;

-- 9. CONFIGURAÇÕES DO APP (public.app_settings)
create table if not exists public.app_settings (
  id                int primary key default 1,
  app_domain        text not null default 'amigosdrcandido.com.br',
  card_template_url text,
  card_qr_x         numeric default 10,
  card_qr_y         numeric default 10,
  card_qr_size      numeric default 20,
  constraint single_row_settings check (id = 1)
);

insert into public.app_settings (id, app_domain)
values (1, 'amigosdrcandido.com.br')
on conflict (id) do update set app_domain = excluded.app_domain;

-- 10. TABELA DE SOLICITAÇÕES ADMIN (admin_requests)
create table if not exists public.admin_requests (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  created_by  bigint references public.profiles(id) on delete cascade,
  action_type text not null,
  target_id   text,
  payload     jsonb not null,
  status      text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by bigint references public.profiles(id),
  approved_at timestamptz
);

-- ============================================================
-- FUNÇÕES RPC
-- ============================================================

-- Encontrar primeira vaga na rede (spillover)
create or replace function public.find_slot(ref_id bigint)
returns bigint
language plpgsql
as $$
declare
  queue bigint[];
  current_id bigint;
  child_count int;
begin
  if ref_id is null then return null; end if;
  queue := array[ref_id];
  while array_length(queue,1) > 0 loop
    current_id := queue[1];
    queue := queue[2:array_length(queue,1)];
    select count(*) into child_count from public.profiles where parent_id = current_id;
    if child_count < 10 then
      return current_id;
    end if;
    queue := queue || (select array_agg(id) from public.profiles where parent_id = current_id);
  end loop;
  return ref_id;
end;
$$;

-- Incremento de redirecionamentos (Dr. Candido)
create or replace function public.increment_instagram_redirects()
returns void
language plpgsql
security definer
as $$
begin
  update public.owner_profile
  set instagram_redirects = instagram_redirects + 1
  where id = 1;
end;
$$;

create or replace function public.increment_profile_redirects()
returns void
language plpgsql
security definer
as $$
begin
  update public.owner_profile
  set profile_redirects = profile_redirects + 1
  where id = 1;
end;
$$;

-- Redefinição de senha por admin
create or replace function public.admin_reset_password_rpc(target_auth_id uuid, new_password text)
returns json
language plpgsql
security definer
as $$
declare
  caller_role public.user_role;
begin
  select role into caller_role from public.profiles where auth_id = auth.uid();
  if caller_role is null or caller_role != 'admin' then
    raise exception 'Acesso negado: Apenas administradores podem redefinir senhas.';
  end if;

  update auth.users
  set 
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at = now()
  where id = target_auth_id;

  return json_build_object('status', 'success');
end;
$$;

-- Auxiliares de RLS
create or replace function public.my_role()
returns user_role
language sql stable
as $$
  select role from public.profiles where auth_id = auth.uid();
$$;

create or replace function public.my_profile_id()
returns bigint
language sql stable
as $$
  select id from public.profiles where auth_id = auth.uid();
$$;

-- ============================================================
-- SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.messages enable row level security;
alter table public.message_likes enable row level security;
alter table public.live_comments enable row level security;
alter table public.owner_profile enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_requests enable row level security;

-- PROFILES
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert with check (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (auth_id = auth.uid());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (public.my_role() = 'admin');

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete using (public.my_role() = 'admin');

-- MEETINGS
drop policy if exists "meetings_select_all" on public.meetings;
create policy "meetings_select_all" on public.meetings for select using (auth.uid() is not null);

drop policy if exists "meetings_insert_auth" on public.meetings;
create policy "meetings_insert_auth" on public.meetings for insert with check (auth.uid() is not null);

drop policy if exists "meetings_update_admin_coord" on public.meetings;
create policy "meetings_update_admin_coord" on public.meetings for update using (public.my_role() in ('admin','coord'));

drop policy if exists "meetings_update_owner" on public.meetings;
create policy "meetings_update_owner" on public.meetings for update using (
  created_by = (select id from public.profiles where auth_id = auth.uid() limit 1)
);

drop policy if exists "meetings_delete_admin" on public.meetings;
create policy "meetings_delete_admin" on public.meetings for delete using (public.my_role() = 'admin');

-- MESSAGES
drop policy if exists "messages_select_all" on public.messages;
create policy "messages_select_all" on public.messages for select using (auth.uid() is not null);

drop policy if exists "messages_write_admin_coord" on public.messages;
create policy "messages_write_admin_coord" on public.messages for insert with check (public.my_role() in ('admin','coord'));

drop policy if exists "messages_delete_admin_coord" on public.messages;
create policy "messages_delete_admin_coord" on public.messages for delete using (public.my_role() in ('admin','coord'));

-- MESSAGE LIKES
drop policy if exists "message_likes_select" on public.message_likes;
create policy "message_likes_select" on public.message_likes for select using (true);

drop policy if exists "message_likes_insert" on public.message_likes;
create policy "message_likes_insert" on public.message_likes for insert with check (auth.uid() is not null);

drop policy if exists "message_likes_delete" on public.message_likes;
create policy "message_likes_delete" on public.message_likes for delete using (
  profile_id in (select id from public.profiles where auth_id = auth.uid())
);

-- LIVE COMMENTS
drop policy if exists "live_comments_select_all" on public.live_comments;
create policy "live_comments_select_all" on public.live_comments for select using (auth.uid() is not null);

drop policy if exists "live_comments_insert_auth" on public.live_comments;
create policy "live_comments_insert_auth" on public.live_comments for insert with check (
  auth.uid() is not null and profile_id = public.my_profile_id()
);

-- Realtime para live comments
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_comments;
  end if;
end $$;

-- OWNER PROFILE & SETTINGS
drop policy if exists "owner_select_all" on public.owner_profile;
create policy "owner_select_all" on public.owner_profile for select using (true);

drop policy if exists "owner_update_admin" on public.owner_profile;
create policy "owner_update_admin" on public.owner_profile for update using (public.my_role() = 'admin');

drop policy if exists "settings_select_all" on public.app_settings;
create policy "settings_select_all" on public.app_settings for select using (true);

drop policy if exists "settings_update_admin" on public.app_settings;
create policy "settings_update_admin" on public.app_settings for update using (public.my_role() = 'admin');

-- ADMIN REQUESTS
drop policy if exists "admin_requests_select" on public.admin_requests;
create policy "admin_requests_select" on public.admin_requests for select to authenticated using (true);

drop policy if exists "admin_requests_insert" on public.admin_requests;
create policy "admin_requests_insert" on public.admin_requests for insert to authenticated with check (true);

drop policy if exists "admin_requests_update" on public.admin_requests;
create policy "admin_requests_update" on public.admin_requests for update to authenticated using (true);

-- ============================================================
-- STORAGE BUCKETS (avatars e meetings)
-- ============================================================

-- Bucket avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Políticas Storage Avatars
drop policy if exists "avatar_upload_own" on storage.objects;
create policy "avatar_upload_own" on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatar_update_own" on storage.objects;
create policy "avatar_update_own" on storage.objects for update
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatar_read_public" on storage.objects;
create policy "avatar_read_public" on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatar_admin_all" on storage.objects;
create policy "avatar_admin_all" on storage.objects for all
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.profiles
    where auth_id = auth.uid() and role = 'admin'
  )
);

-- Bucket meetings
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meetings', 'meetings', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Políticas Storage Meetings
drop policy if exists "meetings_upload_auth" on storage.objects;
create policy "meetings_upload_auth" on storage.objects
  for insert with check (bucket_id = 'meetings' and auth.uid() is not null);

drop policy if exists "meetings_update_auth" on storage.objects;
create policy "meetings_update_auth" on storage.objects
  for update using (bucket_id = 'meetings' and auth.uid() is not null);

drop policy if exists "meetings_delete_admin_coord" on storage.objects;
create policy "meetings_delete_admin_coord" on storage.objects
  for delete using (
    bucket_id = 'meetings'
    and exists (
      select 1 from public.profiles
      where auth_id = auth.uid() and role in ('admin', 'coord')
    )
  );

drop policy if exists "meetings_read_public" on storage.objects;
create policy "meetings_read_public" on storage.objects
  for select using (bucket_id = 'meetings');
