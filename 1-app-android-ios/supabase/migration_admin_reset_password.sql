-- ============================================================
-- RPC para Administradores Redefinirem Senhas Diretamente
-- ============================================================
-- Execute este arquivo no Supabase Dashboard > SQL Editor > New query

create or replace function public.admin_reset_password_rpc(target_auth_id uuid, new_password text)
returns json
language plpgsql
security definer -- executa com privilégios de superusuário
as $$
declare
  caller_role public.user_role;
begin
  -- 1) Verifica se quem está chamando a função é admin
  select role into caller_role from public.profiles where auth_id = auth.uid();
  
  if caller_role is null or caller_role != 'admin' then
    raise exception 'Acesso negado: Apenas administradores podem redefinir senhas.';
  end if;

  -- 2) Atualiza a senha encriptada do usuário diretamente na tabela auth.users
  update auth.users
  set 
    encrypted_password = crypt(new_password, gen_salt('bf')),
    updated_at = now()
  where id = target_auth_id;

  return json_build_object('status', 'success');
end;
$$;
