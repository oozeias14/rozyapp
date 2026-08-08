-- ============================================================
-- ORBITA — SCHEMA DO SUPABASE
-- Rode este arquivo inteiro em: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Extensão usada para gerar IDs, caso precise
create extension if not exists "uuid-ossp";

-- ── TIPOS ─────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('admin','coord','user');
exception when duplicate_object then null; end $$;

-- ── PERFIS (estende auth.users do Supabase) ──────────────
-- auth.users já guarda email e senha (gerenciado pelo Supabase Auth).
-- Esta tabela guarda os dados extras do seu app.
create table if not exists public.profiles (
  id            bigint generated always as identity primary key, -- este é o "codigo de indicacao"
  auth_id       uuid unique references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  phone         text,
  birth         date,
  role          user_role not null default 'user',
  coord_id      bigint references public.profiles(id),   -- coordenador responsavel
  parent_id     bigint references public.profiles(id),   -- quem indicou de fato (spillover)
  instagram     text,
  facebook      text,
  tiktok        text,
  whatsapp      text,
  photo_url     text,
  username      text unique,
  created_at    timestamptz not null default now()
);

create index if not exists idx_profiles_parent on public.profiles(parent_id);
create index if not exists idx_profiles_coord on public.profiles(coord_id);
create index if not exists idx_profiles_referrer on public.profiles(referrer_id);

-- ── REUNIOES ──────────────────────────────────────────────
create table if not exists public.meetings (
  id          bigint generated always as identity primary key,
  title       text not null,
  date        date not null,
  time        text,
  location    text,
  lat         double precision,
  lng         double precision,
  created_by  bigint references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ── MENSAGENS DA COORDENACAO ──────────────────────────────
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  text        text not null check (char_length(text) <= 5000),
  from_id     bigint references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ── PERFIL DO DR. CANDIDO (linha unica, id fixo = 1) ─────
create table if not exists public.owner_profile (
  id          int primary key default 1,
  name        text not null default 'Dr. Candido',
  photo_url   text,
  bio         text,
  instagram   text,
  facebook    text,
  tiktok      text,
  whatsapp    text,
  youtube     text,
  updated_at  timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.owner_profile (id, name, bio, instagram) values (
  1,
  'Dr. Candido',
  E'⚖️ Advogado e especialista em regularização fundiária\n🌱 Voz de quem vive e produz no DF\n📍 Pré-candidato a Deputado Distrital',
  '@drcandidoteles'
)
  on conflict (id) do nothing;

-- ── CONFIGURACOES GERAIS DO APP ───────────────────────────
create table if not exists public.app_settings (
  id          int primary key default 1,
  app_domain  text not null default 'amigosdrcandido.com.br',
  constraint single_row_settings check (id = 1)
);
insert into public.app_settings (id, app_domain) values (1, 'amigosdrcandido.com.br') on conflict (id) do update set app_domain = excluded.app_domain;

-- ============================================================
-- FUNCAO: achar a primeira vaga livre na rede (spillover)
-- Uso: select public.find_slot(15);  -> devolve o id onde a pessoa deve entrar
-- ============================================================
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

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — regras de quem pode ver/editar o que
-- ============================================================
alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.messages enable row level security;
alter table public.owner_profile enable row level security;
alter table public.app_settings enable row level security;

-- Funcao auxiliar: pega o role do usuario logado
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

-- PROFILES: todos (mesmo deslogados) podem ver os perfis (necessario para verificar indicacao no cadastro)
create policy "profiles_select_all" on public.profiles
  for select using (true);

-- PROFILES: qualquer pessoa (mesmo deslogada) pode criar seu proprio cadastro no signup
create policy "profiles_insert_self" on public.profiles
  for insert with check (true);

-- PROFILES: usuario comum só edita o proprio registro (nome, fotos, redes sociais)
create policy "profiles_update_self" on public.profiles
  for update using (auth_id = auth.uid());

-- PROFILES: admin pode editar qualquer cadastro (dados, senha via auth admin API, role)
create policy "profiles_update_admin" on public.profiles
  for update using (public.my_role() = 'admin');

-- PROFILES: só admin pode excluir
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.my_role() = 'admin');

-- MEETINGS: todos podem ver
create policy "meetings_select_all" on public.meetings
  for select using (auth.uid() is not null);

-- MEETINGS: só admin/coord podem criar, editar, excluir
create policy "meetings_write_admin_coord" on public.meetings
  for all using (public.my_role() in ('admin','coord'))
  with check (public.my_role() in ('admin','coord'));

-- MESSAGES: todos podem ver
create policy "messages_select_all" on public.messages
  for select using (auth.uid() is not null);

-- MESSAGES: só admin/coord podem escrever
create policy "messages_write_admin_coord" on public.messages
  for insert with check (public.my_role() in ('admin','coord'));
create policy "messages_delete_admin_coord" on public.messages
  for delete using (public.my_role() in ('admin','coord'));

-- OWNER PROFILE (Dr. Candido): todos veem, só admin edita
create policy "owner_select_all" on public.owner_profile
  for select using (auth.uid() is not null);
create policy "owner_update_admin" on public.owner_profile
  for update using (public.my_role() = 'admin');

-- APP SETTINGS: todos veem (para montar o link), só admin edita
create policy "settings_select_all" on public.app_settings
  for select using (auth.uid() is not null);
create policy "settings_update_admin" on public.app_settings
  for update using (public.my_role() = 'admin');

-- ============================================================
-- PRIMEIRO ADMIN
-- Depois de criar sua conta pelo app (ou pelo Authentication > Add user
-- no painel do Supabase) com o email oozeias2024@gmail.com, rode isto
-- trocando o UUID pelo auth_id gerado (aparece em Authentication > Users):
-- ============================================================
-- insert into public.profiles (auth_id, name, email, role)
-- values ('COLE-O-UUID-AQUI', 'Admin', 'oozeias2024@gmail.com', 'admin');
