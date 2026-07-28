-- ============================================================
-- MIGRACAO: atualiza a bio e o Instagram padrao do Dr. Candido
-- Rode isto no SQL Editor do Supabase SOMENTE SE voce ja tinha
-- criado o banco antes (o insert original nao roda de novo em cima
-- de uma linha que ja existe). Se voce esta criando o banco do
-- zero agora, ignore este arquivo — o schema.sql ja inclui isso.
--
-- A foto continua precisando ser enviada pelo painel Admin > Dr.
-- Candido > escolher da galeria, porque ela precisa ir para o
-- Storage do Supabase — nao da pra colocar isso direto por SQL.
-- ============================================================

update public.owner_profile
set
  bio = E'⚖️ Advogado e especialista em regularização fundiária\n🌱 Voz de quem vive e produz no DF\n📍 Pré-candidato a Deputado Distrital',
  instagram = '@drcandidoteles'
where id = 1;
