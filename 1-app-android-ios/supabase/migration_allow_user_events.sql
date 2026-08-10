-- ============================================================
-- MIGRACAO: PERMITIR QUE QUALQUER MEMBRO CADASTRE EVENTOS
-- Rode este script no Editor SQL do seu painel do Supabase.
-- ============================================================

-- 1. Remover a política restritiva de escrita antiga
DROP POLICY IF EXISTS "meetings_write_admin_coord" ON public.meetings;

-- 2. Qualquer usuário autenticado (role 'user', 'coord', 'admin') pode criar (insert) eventos
CREATE POLICY "meetings_insert_auth" ON public.meetings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Admins e Coordenadores podem atualizar (update) qualquer reunião/evento
CREATE POLICY "meetings_update_admin_coord" ON public.meetings
  FOR UPDATE USING (public.my_role() IN ('admin','coord'));

-- 4. Usuários comuns podem atualizar apenas as reuniões/eventos que eles mesmos criaram
CREATE POLICY "meetings_update_owner" ON public.meetings
  FOR UPDATE USING (
    created_by = (SELECT id FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1)
  );

-- 5. Apenas Admins podem excluir (delete) reuniões/eventos
CREATE POLICY "meetings_delete_admin" ON public.meetings
  FOR DELETE USING (public.my_role() = 'admin');

-- 6. Adicionar coluna inserted_by para rastrear quem realizou o cadastro
ALTER TABLE public.meetings 
  ADD COLUMN IF NOT EXISTS inserted_by uuid DEFAULT auth.uid();

-- 7. Restringir leitura (select) de eventos
DROP POLICY IF EXISTS "meetings_select_all" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select_admin_coord" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select_owner" ON public.meetings;

CREATE POLICY "meetings_select_admin_coord" ON public.meetings
  FOR SELECT USING (public.my_role() IN ('admin', 'coord'));

CREATE POLICY "meetings_select_owner" ON public.meetings
  FOR SELECT USING (
    created_by = (SELECT id FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1)
    OR
    inserted_by = auth.uid()
  );
