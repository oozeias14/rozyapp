-- ============================================================
-- ORBITA — STORAGE (fotos de perfil) com limite de 1 MB
-- Rode depois do schema.sql, no mesmo SQL Editor.
-- ============================================================

-- Cria o bucket "avatars" publico (leitura livre, upload so autenticado)
-- file_size_limit em bytes: 1048576 = 1 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

-- Qualquer pessoa logada pode enviar sua propria foto (pasta com o proprio auth_id)
create policy "avatar_upload_own"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Qualquer pessoa logada pode atualizar/substituir sua propria foto
create policy "avatar_update_own"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Leitura publica (para aparecer no app de quem visualizar o perfil)
create policy "avatar_read_public"
on storage.objects for select
using (bucket_id = 'avatars');

-- Admin pode enviar/atualizar a foto de qualquer pasta (ex: substituir foto do Dr. Candido,
-- que fica numa pasta separada "owner/")
create policy "avatar_admin_all"
on storage.objects for all
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.profiles
    where auth_id = auth.uid() and role = 'admin'
  )
);

-- ============================================================
-- IMPORTANTE SOBRE O LIMITE DE 1 MB:
-- O "file_size_limit" acima bloqueia no servidor (o Supabase recusa
-- o arquivo e devolve erro). Mas para o USUARIO ver a mensagem de erro
-- na hora, ANTES de gastar dados enviando o arquivo, o app tambem
-- checa o tamanho no celular antes de comecar o upload — isso esta
-- implementado em src/screens/ProfileScreen.js (funcao pickAndUploadPhoto).
-- ============================================================
