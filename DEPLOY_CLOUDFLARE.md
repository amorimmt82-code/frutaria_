# Deploy — Cloudflare Workers (Frutaria em Casa)

Este guia leva o site para Cloudflare Workers + D1 + KV.
Custo: **0 € / mês** dentro do free plan (até 100 000 pedidos/dia, D1 com 5 GB e 5 milhões de reads/dia, KV com 100 000 reads/dia, Resend com 3 000 emails/mês).

---

## 0. Pré-requisitos

- Conta gratuita em https://dash.cloudflare.com (criar com `amorimmt82@gmail.com`)
- Conta gratuita em https://resend.com (para enviar emails)
- Node.js já instalado (já tens)

---

## 1. Login no Cloudflare a partir do terminal

```powershell
cd C:\Users\amori\Downloads\frutaria-em-casa
npx wrangler login
```

Abre o browser e autoriza. Depois confirma:

```powershell
npx wrangler whoami
```

---

## 2. Criar a base de dados D1

```powershell
npx wrangler d1 create frutaria
```

A saída tem algo como:

```
[[d1_databases]]
binding = "DB"
database_name = "frutaria"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

→ **Copia o `database_id`** e cola dentro do `wrangler.toml` no lugar de `REPLACE_WITH_D1_ID`.

---

## 3. Criar o namespace KV (sessões + rate-limit)

```powershell
npx wrangler kv namespace create SESSIONS
```

A saída tem algo como:

```
[[kv_namespaces]]
binding = "SESSIONS"
id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

→ **Copia o `id`** e cola dentro do `wrangler.toml` no lugar de `REPLACE_WITH_KV_ID`.

---

## 4. Criar as tabelas D1 (1ª vez)

```powershell
npm run d1:init
```

(Internamente faz `wrangler d1 execute frutaria --remote --file=./migrations/0001_init.sql`.)

---

## 5. Importar os dados existentes do `data/store.json`

```powershell
npm run d1:seed:gen
npm run d1:seed
```

O primeiro comando gera o ficheiro `migrations/0002_seed.sql` a partir do `data/store.json`.
O segundo aplica-o no D1 remoto.

---

## 6. Definir os secrets

```powershell
npx wrangler secret put ADMIN_PASSCODE
```
→ Cola uma senha **nova** com 12+ caracteres (a antiga foi exposta no chat, troca-a).

```powershell
npx wrangler secret put RESEND_API_KEY
```
→ Cola a API key que obtiveres em https://resend.com/api-keys

```powershell
npx wrangler secret put STRIPE_SECRET_KEY
```
→ Cola a tua **nova** `sk_test_...` (a que partilhaste no chat tem de ser rodada em https://dashboard.stripe.com/test/apikeys).

> Também abre o `wrangler.toml` e cola a tua **nova** `pk_test_...` na variável `STRIPE_PUBLISHABLE_KEY` (esta é pública, pode ficar no ficheiro).

> Não te esqueças de verificar o domínio em Resend, ou ficas limitado a enviar de `onboarding@resend.dev` (já configurado por defeito em `MAIL_FROM`).

---

## 7. Build do SPA e deploy

```powershell
npm run worker:deploy
```

Faz `vite build` e `wrangler deploy`. No final terás um URL `https://frutaria-em-casa.workers.dev`.

---

## 8. Testar localmente (opcional)

```powershell
npm run d1:init:local
npm run d1:seed:gen
npm run d1:seed:local
npm run worker:dev
```

Abre http://localhost:8787.

---

## 9. Atualizações futuras

Sempre que mudares código:

```powershell
npm run worker:deploy
```

Sempre que mudares o schema do D1, cria uma nova migração `migrations/000N_xxx.sql` e corre:

```powershell
npx wrangler d1 execute frutaria --remote --file=./migrations/000N_xxx.sql
```

---

## Notas

- **Stripe**: integrado via REST direta (sem SDK). Em modo de teste podes simular cartões com `4242 4242 4242 4242` (qualquer data futura, qualquer CVC). Quando estiveres pronto para receber dinheiro a sério, completa a ativação da conta em https://dashboard.stripe.com/settings/account e troca as chaves `pk_test_` / `sk_test_` por `pk_live_` / `sk_live_`.
- **Outros métodos (MBWay, transferência, dinheiro)** não têm confirmação automática — marca como "pago" no back-office quando confirmares a entrada.
- **Email**: usa Resend (a alternativa MailChannels deixou de ser gratuita em junho de 2024).
- **Sessões admin**: ficam no KV com TTL de 2h. Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, scope `/api/admin`.
- **Rate-limit de login**: 3 tentativas / 5 min → bloqueio 30 min (também no KV).
- **Image proxy**: aceita apenas `images.unsplash.com` e `plus.unsplash.com` (lista em `ALLOWED_IMAGE_HOSTS` em `wrangler.toml`).
- **Domínio próprio**: posteriormente podes ligar um domínio em **Workers → Custom domains** sem custo extra (a Cloudflare emite o certificado).
