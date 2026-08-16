-- Criação da tabela de solicitações do admin2 para aprovação do admin principal
CREATE TABLE IF NOT EXISTS admin_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- 'update_profile', 'delete_profile', 'update_owner_profile', 'create_meeting', 'delete_meeting', 'create_message', 'delete_message'
  target_id text,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz
);

-- Habilitar acesso público para facilitar leitura e escrita dos admins
ALTER TABLE admin_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura geral para usuários autenticados" ON admin_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir inserção para usuários autenticados" ON admin_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Permitir update para usuários autenticados" ON admin_requests FOR UPDATE TO authenticated USING (true);
