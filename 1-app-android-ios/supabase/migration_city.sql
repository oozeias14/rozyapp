-- ============================================================
-- MIGRACAO: ADICIONAR COLUNA DE CIDADE/BAIRRO NOS PERFIS
-- Rode no Supabase Editor de SQL.
-- ============================================================

alter table public.profiles
  add column if not exists city text;
