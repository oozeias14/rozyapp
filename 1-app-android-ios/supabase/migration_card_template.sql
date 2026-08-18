-- SQL para adicionar as colunas do template do Cartão de Visitas na tabela de configurações do app
-- Execute este comando no console SQL do seu Supabase em Produção!

ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS card_template_url text,
ADD COLUMN IF NOT EXISTS card_qr_x numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS card_qr_y numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS card_qr_size numeric DEFAULT 20;

COMMENT ON COLUMN public.app_settings.card_template_url IS 'URL da imagem de fundo do cartão de visitas';
COMMENT ON COLUMN public.app_settings.card_qr_x IS 'Posição X (%) do QR Code no cartão';
COMMENT ON COLUMN public.app_settings.card_qr_y IS 'Posição Y (%) do QR Code no cartão';
COMMENT ON COLUMN public.app_settings.card_qr_size IS 'Tamanho largura/altura (%) do QR Code no cartão';
