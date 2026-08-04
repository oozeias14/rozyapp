// supabase/functions/exchange-oauth-token/index.ts
// Deploy com: supabase functions deploy exchange-oauth-token
//
// Esta função recebe o 'code' temporário enviado pelo Instagram após a autorização do usuário,
// faz o POST seguro no servidor do Instagram usando o Client Secret do desenvolvedor para obter
// o token de acesso e, por fim, consulta a API Graph do Instagram para retornar o @username real.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { provider, code, redirectUri } = await req.json();

    if (!provider || !code) {
      return new Response(JSON.stringify({ error: 'Faltam parametros provider e code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (provider === 'instagram') {
      const clientId = Deno.env.get('INSTAGRAM_CLIENT_ID');
      const clientSecret = Deno.env.get('INSTAGRAM_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ error: 'Credenciais do Instagram nao configuradas no painel Supabase (INSTAGRAM_CLIENT_ID / INSTAGRAM_CLIENT_SECRET).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Troca o código pelo token de acesso de curta duração
      const tokenForm = new URLSearchParams();
      tokenForm.append('client_id', clientId);
      tokenForm.append('client_secret', clientSecret);
      tokenForm.append('grant_type', 'authorization_code');
      tokenForm.append('redirect_uri', redirectUri);
      tokenForm.append('code', code);

      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        body: tokenForm,
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error_message) {
        return new Response(JSON.stringify({ error: tokenData.error_message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const accessToken = tokenData.access_token;
      
      // Obtém o perfil do usuário usando o token obtido
      const profileRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
      );
      const profileData = await profileRes.json();

      if (profileData.error) {
        return new Response(JSON.stringify({ error: profileData.error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ username: profileData.username }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Provider nao suportado para troca de token automatica.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
