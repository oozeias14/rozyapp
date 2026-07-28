# Órbita — app completo (React Native + Expo + Supabase)

Todas as telas do protótipo agora existem aqui como app nativo de verdade:
**Login/Cadastro, Início, Rede (visual em órbita), Agenda, Perfil (foto,
redes sociais, código de indicação, QR Code), Dr. Cândido, e o Painel
Admin/Coordenador completo** (Cadastros, Reuniões, Mensagens, editar
Dr. Cândido, Estatísticas, Configurações).

---

## Passo 1 — Banco de dados (Supabase)

1. Crie uma conta grátis em **https://supabase.com** (veja limites do plano
   gratuito em https://supabase.com/pricing)
2. Crie um projeto novo
3. **Authentication > Providers > Email** → desative a opção **"Confirm
   email"**. Isso é importante: sem isso, toda conta nova precisa confirmar
   o e-mail antes de conseguir usar o app, o que atrapalha os testes.
   (Quando for lançar de vez, você pode reativar e configurar o envio de
   e-mails.)
4. **SQL Editor > New query** → cole e rode `supabase/schema.sql`
5. Nova query → cole e rode `supabase/storage_setup.sql`
6. **Settings > API** → copie a **Project URL** e a **anon public key**
7. Cole essas duas informações em `src/lib/supabase.js`

### Criar o primeiro admin
1. **Authentication > Users > Add user** → e-mail `oozeias2024@gmail.com`,
   senha `123456`
2. Copie o **UID** gerado
3. No SQL Editor, rode (trocando o UUID):
   ```sql
   insert into public.profiles (auth_id, name, email, role)
   values ('COLE-O-UUID-AQUI', 'Admin', 'oozeias2024@gmail.com', 'admin');
   ```

### Deploy da função de troca de senha (admin resetar senha de qualquer cadastro)
Isso roda no servidor do Supabase (não pode rodar no celular por segurança).
Com a **Supabase CLI** instalada (`npm install -g supabase`):
```bash
supabase login
supabase link --project-ref SEU-PROJECT-REF
supabase functions deploy admin-reset-password
```
Não precisa configurar nenhuma chave extra — o Supabase já injeta
automaticamente as variáveis que a função usa.

---

## Passo 2 — Preparar o computador

- **Node.js** 18+ → https://nodejs.org
- Dentro da pasta do projeto:
  ```bash
  npm install
  ```

---

## Passo 3 — Testar no seu Android agora mesmo

1. Instale o app **Expo Go** na Play Store
2. `npx expo start`
3. Escaneie o QR Code do terminal com o Expo Go
4. O app abre no seu celular, já conectado ao seu Supabase de verdade

Toda mudança que você (ou eu) fizer no código aparece na hora, sem precisar
reinstalar nada — é o jeito mais rápido de revisar e ajustar telas.

---

## Passo 4 — Gerar o `.apk` instalável

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```
Ao final, você recebe um link de download do `.apk`. Baixe direto no
Android e instale (autorizando "fontes desconhecidas" quando pedir).
Funciona a partir do Android 6.0 (2015+) — cobre a grande maioria dos
aparelhos em uso hoje.

---

## Passo 5 — Publicar na Google Play (quando estiver pronto)

1. Conta de desenvolvedor em https://play.google.com/console (US$ 25, única vez)
2. `eas build -p android --profile production` → gera o `.aab`
3. Preencha a ficha da loja (descrição, capturas de tela, política de
   privacidade) e envie para revisão (1–3 dias, normalmente)

---

## O que cada papel pode fazer

| Ação | Membro | Coordenador | Admin |
|---|---|---|---|
| Ver todos os cadastros e seus dados | ❌ (só o próprio) | ✅ | ✅ |
| Editar o próprio perfil e redes sociais | ✅ | ✅ | ✅ |
| Agendar / excluir reuniões | ❌ | ✅ | ✅ |
| Enviar mensagem para toda a rede | ❌ | ✅ | ✅ |
| Editar dados de qualquer cadastro | ❌ | ❌ | ✅ |
| Promover para Coordenador / rebaixar | ❌ | ❌ | ✅ |
| Excluir qualquer cadastro | ❌ | ❌ | ✅ |
| Trocar a senha de outro cadastro | ❌ | ❌ | ✅ |
| Editar o perfil do Dr. Cândido | ❌ | ❌ | ✅ |
| Editar domínio do app / dados da própria conta admin | ❌ | ❌ | ✅ |

---

## Sobre o limite de 1 MB nas fotos

Garantido em duas camadas: o app confere o tamanho do arquivo escolhido na
galeria **antes** de enviar (mensagem de erro imediata), e o bucket
`avatars` no Supabase tem `file_size_limit = 1048576` configurado no
servidor — então nem burlando o app dá pra passar de 1 MB.

---

## Estrutura do projeto

```
App.js                          → login + navegação principal (abas)
src/theme.js                    → cores e estilos compartilhados
src/lib/supabase.js             → conexão com seu projeto Supabase
src/lib/api.js                  → todas as chamadas ao banco (uma função por ação)
src/components/TopBar.js        → cabeçalho com contador de cadastros
src/components/BottomNav.js     → barra de navegação inferior
src/components/PersonModal.js   → cartão público (foto + redes sociais de alguém)
src/screens/AuthScreen.js       → login / cadastro com validação do código
src/screens/HomeScreen.js       → início (resumo, mensagens, próximas reuniões)
src/screens/NetworkScreen.js    → rede (órbita de 10 slots + lista completa)
src/screens/AgendaScreen.js     → reuniões
src/screens/ProfileScreen.js    → perfil, foto, redes sociais, código/QR, senha
src/screens/OwnerScreen.js      → página pública do Dr. Cândido
src/screens/AdminScreen.js      → painel Admin/Coordenador (todas as sub-abas)
supabase/schema.sql             → tabelas e regras de permissão
supabase/storage_setup.sql      → bucket de fotos com limite de 1 MB
supabase/functions/admin-reset-password/  → troca de senha segura (servidor)
```

Qualquer ajuste de tela, cor ou regra é só me chamar de novo com o que
quer mudar.
