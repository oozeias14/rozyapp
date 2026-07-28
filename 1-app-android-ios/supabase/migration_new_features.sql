-- ============================================================
-- MIGRACAO: NOVAS FUNCOES DO APLICATIVO
-- Rode no Supabase Editor de SQL.
-- ============================================================

-- 1. Adicionar live_enabled nos perfis
alter table public.profiles
  add column if not exists live_enabled boolean not null default true;

-- 2. Adicionar novas colunas nas reunioes
alter table public.meetings
  add column if not exists status text not null default 'agendada',
  add column if not exists duration_minutes integer default 0,
  add column if not exists attendees_count integer default 0,
  add column if not exists presence_list jsonb default '[]'::jsonb,
  add column if not exists presence_photo_url text,
  add column if not exists photos text[] default '{}'::text[],
  add column if not exists live_started_at timestamptz;

-- Garantir constraint de status
do $$
begin
  alter table public.meetings add constraint check_meeting_status check (status in ('agendada', 'em_andamento', 'realizada'));
exception
  when duplicate_object then null;
end $$;

-- 3. Adicionar colunas de contadores no owner_profile
alter table public.owner_profile
  add column if not exists instagram_redirects integer not null default 0,
  add column if not exists profile_redirects integer not null default 0;

-- 4. RPCs seguras para incrementacao dos contadores (Security Definer para burlar RLS)
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

-- 5. Criar tabela de comentarios da live
create table if not exists public.live_comments (
  id          bigint generated always as identity primary key,
  meeting_id  bigint references public.meetings(id) on delete cascade,
  profile_id  bigint references public.profiles(id) on delete cascade,
  text        text not null check (char_length(text) <= 1000),
  created_at  timestamptz not null default now()
);

-- Habilitar RLS para live_comments
alter table public.live_comments enable row level security;

-- Politicas para live_comments
do $$
begin
  create policy "live_comments_select_all" on public.live_comments
    for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy "live_comments_insert_auth" on public.live_comments
    for insert with check (auth.uid() is not null and profile_id = public.my_profile_id());
exception when duplicate_object then null; end $$;

-- Habilitar Realtime para live_comments
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_comments;
  end if;
end $$;

-- 6. Setup do Bucket de Meetings
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meetings', 'meetings', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Politicas de storage para meetings
do $$
begin
  create policy "meetings_upload_auth" on storage.objects
    for insert with check (bucket_id = 'meetings' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy "meetings_update_auth" on storage.objects
    for update using (bucket_id = 'meetings' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$
begin
  create policy "meetings_delete_admin_coord" on storage.objects
    for delete using (
      bucket_id = 'meetings'
      and exists (
        select 1 from public.profiles
        where auth_id = auth.uid() and role in ('admin', 'coord')
      )
    );
exception when duplicate_object then null; end $$;

do $$
begin
  create policy "meetings_read_public" on storage.objects
    for select using (bucket_id = 'meetings');
exception when duplicate_object then null; end $$;
