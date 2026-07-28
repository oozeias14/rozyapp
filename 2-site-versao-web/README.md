# Órbita — versão Web (PWA)

Esta é a versão para navegador do Órbita — mesmas telas, mesmas regras,
conectada **ao mesmo banco de dados Supabase** do app Android/iOS. Quem se
cadastra pelo site aparece no app, e vice-versa: é tudo a mesma rede.

Funciona em qualquer navegador (Android, iPhone, computador) e pode ser
"instalada" na tela de início do celular como se fosse um app nativo (PWA).

---

## 1) Configurar

Abra `src/lib/supabase.js` e cole a URL e a chave "anon" do **mesmo projeto
Supabase** que você já configurou para o app Android/iOS (Dashboard >
Settings > API).

## 2) Testar localmente

```bash
npm install
npm run dev
```
Abre em `http://localhost:5173`.

## 3) Gerar os arquivos finais (para subir na HostGator)

```bash
npm run build
```
Isso cria uma pasta `dist/` com só arquivos HTML/CSS/JS estáticos — é
exatamente isso que você sobe na HostGator, não precisa rodar Node lá.

## 4) Publicar na HostGator

1. Entre no **cPanel** da sua conta HostGator > **Gerenciador de Arquivos**
   (ou use um cliente FTP como o FileZilla)
2. Se você quer o app em `seudominio.com/app`, crie a pasta `app` dentro de
   `public_html` e suba todo o conteúdo de `dist/` para dentro dela
   - Nesse caso, antes de rodar `npm run build`, edite `vite.config.js` e
     troque `base: '/'` por `base: '/app/'`
3. Se preferir o app na raiz do domínio (`seudominio.com`), suba o conteúdo
   de `dist/` direto para dentro de `public_html`
4. Pronto — acesse pelo navegador do celular e teste

---

## Por que manter o banco de dados no Supabase (e não na HostGator)

A HostGator é uma hospedagem tradicional (cPanel, PHP, MySQL) — ótima para
sites, mas não foi feita para ser o backend de um app com login seguro,
upload de fotos com limite de tamanho, permissões por papel (admin/
coordenador/membro) e sincronização em tempo real entre Android, iPhone e
site. Tudo isso já está pronto e testado no Supabase (que tem plano
gratuito generoso para o seu tamanho atual — veja em
https://supabase.com/pricing).

A divisão que faz mais sentido:
- **HostGator** → hospeda o **site** (esta pasta `dist/` + a página de
  download em `orbita-landing/`)
- **Supabase** → guarda os **cadastros, reuniões, mensagens e fotos**

Se ainda assim você quiser migrar o banco de dados para dentro da
HostGator (MySQL + PHP), é possível, mas significa reconstruir do zero
todo o sistema de login, permissões e upload de fotos que já está pronto
e seguro no Supabase — é bastante trabalho extra e a HostGator
compartilhada tende a ter limites de conexões simultâneas que atrapalham
um app em crescimento. Recomendo manter como está.

---

## Sobre o app para iPhone sem pagar os US$ 99/ano da Apple

Isso é uma exigência da própria Apple, não uma limitação técnica que dá
pra contornar: **qualquer app publicado na App Store, ou instalado de
forma permanente em iPhones de outras pessoas, exige a assinatura do
Apple Developer Program (US$ 99/ano)**. Não existe forma legítima de
burlar isso.

A alternativa real e gratuita é exatamente esta versão web: no Safari do
iPhone, a pessoa toca em **Compartilhar > Adicionar à Tela de Início**, e
o Órbita passa a ter um ícone próprio, abre em tela cheia, sem barra de
navegador — para quem usa, a experiência é quase idêntica a um app
instalado. Não passa pela App Store e não custa nada.

A única diferença prática: notificações push funcionam de forma mais
limitada no Safari/iOS do que num app nativo (a partir do iOS 16.4 o
Safari já suporta notificações push para PWAs instalados, mas com
algumas particularidades). Para reuniões e mensagens, o app ainda mostra
tudo normalmente ao abrir.

Se um dia vocês decidirem que vale a pena pagar os US$ 99/ano, o projeto
nativo (pasta `orbita-app/`) já está pronto para ir para a App Store sem
precisar reconstruir nada.
