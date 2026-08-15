-- ============================================================
-- Tabela e Políticas para Curtidas no Mural (Mensagens)
-- ============================================================
-- Execute este arquivo no Supabase Dashboard > SQL Editor > New query

create table if not exists public.message_likes (
  message_id bigint references public.messages(id) on delete cascade,
  profile_id bigint references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

-- Habilita RLS (Segurança de Linha)
alter table public.message_likes enable row level security;

-- Política: Qualquer usuário logado pode ver as curtidas
create policy "message_likes_select" on public.message_likes
  for select using (true);

-- Política: Qualquer usuário logado pode curtir (inserir curtida)
create policy "message_likes_insert" on public.message_likes
  for insert with check (auth.uid() is not null);

-- Política: O usuário só pode descurtir (deletar) a sua própria curtida
create policy "message_likes_delete" on public.message_likes
  for delete using (
    profile_id in (select id from public.profiles where auth_id = auth.uid())
  );
