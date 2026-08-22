-- Adicionar coluna para rastrear contatos exportados via vCard
alter table public.profiles add column if not exists vcf_exported boolean default false;
