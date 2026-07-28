# Órbita — pacote completo

Tudo que foi construído está aqui dentro, organizado em 3 pastas. As três
usam **o mesmo banco de dados Supabase** — configure uma vez e cole a
mesma URL/chave nas duas primeiras pastas.

```
1-app-android-ios/          → App nativo (React Native + Expo)
                               Vira o .apk para Android (Play Store) e,
                               se um dia quiser, também o app de iOS.

2-site-versao-web/          → Site em React, mesmas telas do app,
                               instalável no iPhone como PWA
                               ("Adicionar à Tela de Início" no Safari).

3-site-pagina-de-download/  → Página simples (HTML puro) para a raiz
                               do seu domínio na HostGator, com o botão
                               de baixar o Android e o link/instruções
                               para instalar no iPhone.
```

---

## Ordem recomendada para configurar

### Passo 1 — Criar o banco (uma vez só)
Entre em **1-app-android-ios/supabase/**, siga o `README.md` dessa pasta
para criar o projeto no Supabase, rodar os SQLs (`schema.sql` e
`storage_setup.sql`) e criar o primeiro admin.

Se você já tinha criado o banco antes desta versão, rode também
`1-app-android-ios/supabase/migration_add_location.sql` — ele adiciona as
colunas novas de localização GPS das reuniões sem apagar nada que já existe.

### Passo 2 — Conectar o app e o site ao mesmo banco
No painel do Supabase, em **Settings > API**, copie a **Project URL** e a
**anon public key**. Cole essas duas informações em:
- `1-app-android-ios/src/lib/supabase.js`
- `2-site-versao-web/src/lib/supabase.js`

Prontinho — a partir daqui, quem se cadastra pelo app aparece no site, e
quem se cadastra pelo site aparece no app. É o mesmo banco de dados e o
mesmo bucket de fotos (limite de 1 MB) para os dois.

### Passo 3 — Testar
- **App**: siga o `README.md` de `1-app-android-ios/` (Expo Go no celular)
- **Site**: siga o `README.md` de `2-site-versao-web/` (`npm run dev`)

### Passo 4 — Publicar
- **Android**: gere o `.apk` com o EAS Build (comando no README da pasta 1)
  e coloque o arquivo dentro de `3-site-pagina-de-download/downloads/orbita.apk`
- **Site + página de download**: rode `npm run build` dentro de
  `2-site-versao-web/`, e suba o conteúdo da pasta `dist/` junto com os
  arquivos de `3-site-pagina-de-download/` para a HostGator (veja o
  `README.md` de `2-site-versao-web/` para os detalhes de onde cada coisa
  vai no cPanel)

Cada uma das 3 pastas tem seu próprio `README.md` com o passo a passo
detalhado e os comandos exatos.

---

## Sobre o botão "🔔 Notificar" nas reuniões

Quando alguém toca em "Notificar", o app dispara uma **notificação
local** — aparece só no aparelho de quem tocou, na hora, como um lembrete
pessoal. Não é um push que chega no celular dos outros membros. Isso
agora está restrito a **admin e coordenadores** (membros comuns só
visualizam a reunião, sem esse botão).

Para notificar todos os membros de verdade (push chegando mesmo com o
app fechado), seria necessário montar um sistema de push notification
completo — é mais infraestrutura do que o app tem hoje; posso construir
isso se você quiser.

---

## Sobre a localização das reuniões (novo)

Agora, ao criar uma reunião, o admin/coordenador pode tocar em **"📍 Usar
minha localização atual"** — o app pega o GPS exato do aparelho na hora
(a mesma ideia do WhatsApp: chegue no local, abra o app, toque no botão).
Essa localização fica salva junto com a reunião.

Quem for visualizar a reunião (qualquer membro) vê um botão **"📍 Abrir
no Google Maps"**, que leva direto pro pino exato daquele lugar — no
celular, se o Google Maps estiver instalado, abre nele; senão abre no
navegador.

O campo de texto "Local" continua existindo separadamente (para escrever
o nome do lugar, tipo "Sala Órbita — Brasília/DF") — a localização GPS é
um complemento opcional, não substitui o texto.

---

## Sobre o "Esqueceu a senha?" (novo)

Agora tem um link "Esqueceu a senha?" embaixo do botão Entrar. A pessoa
digita o e-mail, e o Supabase manda um link de recuperação de verdade
(usa o sistema de e-mail que já vem pronto no Supabase, sem precisar
configurar nada extra pra começar a testar).

**Duas coisas para configurar no painel do Supabase antes de funcionar
de verdade:**

1. Vá em **Authentication > URL Configuration** e adicione o endereço do
   seu site (`2-site-versao-web`, depois de publicado) tanto no **Site
   URL** quanto em **Redirect URLs**. Sem isso, o Supabase recusa o link
   de redirecionamento por segurança.
2. No app nativo (`1-app-android-ios/src/screens/AuthScreen.js`), troque
   a constante `PASSWORD_RESET_REDIRECT_URL` pelo endereço real do seu
   site. É pra lá que o link do e-mail leva a pessoa — o app nativo não
   tem como abrir a tela de "criar nova senha" sozinho (isso exigiria um
   sistema de deep link mais complexo), então usamos o site pra essa
   parte, mesmo para quem usa o app Android.

No site, isso já funciona de ponta a ponta: a pessoa pede o link →
recebe o e-mail → clica → cai numa tela de "criar nova senha" → depois
disso já pode fazer login normalmente, no app ou no site.

---

## Novas Funções Implementadas (Julho/2026)

Adicionamos um pacote de recursos focados em engajamento transparente, transmissões ao vivo e controle administrativo no aplicativo e na web:

1. **Dr. Candido como Home Page**: O perfil dele agora é a tela inicial padrão (primeira aba). A antiga página inicial foi renomeada para **"Mural"** (segunda aba) para visualização de mensagens e agenda.
2. **Cartão de Visita Digital**: Novo bloco premium e estilizado com botão de compartilhar dados profissional e links de contato (via folha nativa no celular e via link copiado/Web Share no site).
3. **Contadores de Tráfego de Redirecionamento**: Registra silenciosamente visitas ao perfil (`profile_redirects`) e cliques para seguir no Instagram (`instagram_redirects`). Exibido em tempo real no topo do Painel Admin (aba Dr. Candido) para fácil auditoria.
4. **Suspensão de Live por Penalidade**: O administrador pode bloquear a capacidade de transmissões de qualquer usuário pelo painel. Se suspenso (`live_enabled = false`), o botão de iniciar Live na Agenda é bloqueado.
5. **Reuniões ao Vivo (Live)**:
   - **Host (anfitrião)**: Transmite o vídeo utilizando a câmera frontal. Tira e faz upload automático de prints a cada 10 min (máximo de 3 fotos) no bucket de storage público `meetings`. Possui um botão "Tirar Print (Testar)" para validações imediatas.
   - **Espectador**: Acessa a Live ativa com um player conceitual premium de waveform.
   - **Chat de Live**: Comentários rápidos com sincronização instantânea em tempo real para todos os participantes via canais de Realtime do Supabase.
6. **Fechamento e Listas de Presença de Reuniões**:
   - Ao finalizar a live ou ao encerrar uma reunião agendada, o host acessa o modal de **Finalizar Reunião**.
   - Permite registrar a duração real da reunião e o número total de presentes.
   - Permite marcar digitalmente perfis cadastrados que participaram (Lista de Presenças Digital).
   - Permite tirar foto da lista física de assinaturas (enviada ao storage).
   - Permite anexar até 3 fotos da reunião.
7. **Estatísticas Transparentes**: As reuniões finalizadas mudam o status para `'realizada'`. O app e o site calculam de forma transparente e automática a soma total de reuniões efetuadas, horas acumuladas e quantidade de presenças, exibindo-as em painéis estatísticos na Agenda e no Mural.

Para que as tabelas e funções adicionadas funcionem de forma integrada, aplique as modificações do arquivo SQL localizado em:
`1-app-android-ios/supabase/migration_new_features.sql`

