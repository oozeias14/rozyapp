-- ============================================================
-- Adiciona Coluna de Vídeo Diário no Perfil do Proprietário (Dr. Candido)
-- ============================================================
-- Execute este arquivo no Supabase Dashboard > SQL Editor > New query

alter table public.owner_profile add column if not exists video_url text;
