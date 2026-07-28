-- ============================================================
-- MIGRACAO: adiciona localizacao GPS precisa nas reunioes
-- Rode isto no SQL Editor do Supabase SOMENTE SE voce ja tinha
-- criado o banco antes (rodado o schema.sql de uma versao anterior).
-- Se voce esta criando o banco do zero agora, ignore este arquivo —
-- o schema.sql atualizado ja inclui essas colunas.
-- ============================================================

alter table public.meetings
  add column if not exists lat double precision,
  add column if not exists lng double precision;
