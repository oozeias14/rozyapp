// supabase/functions/admin-reset-password/index.ts
// Deploy com: supabase functions deploy admin-reset-password
//
// Por que isso precisa ser uma Edge Function e não algo direto no app:
// trocar a senha de OUTRA pessoa exige a "service_role key" do Supabase,
// que tem acesso total ao banco e nunca pode ir dentro do app (celular).
// Esta função roda no servidor, usa a service_role key com segurança, e
// só executa a troca depois de confirmar que quem está pedindo é admin.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Metodo nao permitido' }), { status: 405 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const callerJwt = authHeader.replace('Bearer ', '');
    if (!callerJwt) {
      return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Descobre quem esta chamando a funcao
    const { data: callerData, error: callerErr } = await admin.auth.getUser(callerJwt);
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Token invalido' }), { status: 401 });
    }

    // 2) Confere se quem chamou é ADMIN de verdade (olhando o banco, nao o app)
    const { data: callerProfile, error: profErr } = await admin
      .from('profiles')
      .select('role')
      .eq('auth_id', callerData.user.id)
      .maybeSingle();

    if (profErr || !callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Apenas o admin pode trocar a senha de outros cadastros' }), { status: 403 });
    }

    // 3) Le o pedido
    const { targetAuthId, newPassword } = await req.json();
    if (!targetAuthId || !newPassword || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Dados invalidos (senha precisa ter 6+ caracteres)' }), { status: 400 });
    }

    // 4) Troca a senha do usuario-alvo usando a Admin API
    const { error: updateErr } = await admin.auth.admin.updateUserById(targetAuthId, { password: newPassword });
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500 });
  }
});
