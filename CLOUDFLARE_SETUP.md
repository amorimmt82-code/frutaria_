# Cloudflare — Guia completo para `frutariaemcasa.pt`

> **Importante:** não consigo executar nada na sua conta Cloudflare em seu
> nome — não tenho acesso à sua sessão GitHub nem ao seu registar de
> domínio. Tem de seguir os passos abaixo manualmente (demora cerca de
> 30 minutos da primeira vez). Onde diz `<IP-DO-SEU-SERVIDOR>` substitua
> pelo IP público da máquina onde o `npm start` (Express) corre.

---

## 1. Criar/entrar na conta Cloudflare

1. Abra https://dash.cloudflare.com/login
2. Clique em **Continue with GitHub** e autentique-se com a conta
   `amorimmt82@gmail.com`.
3. Na primeira vez aceite os termos e crie a "workspace" (Free plan).

## 2. Adicionar o domínio

1. No dashboard → **Add a Site** → escreva `frutariaemcasa.pt` → **Continue**.
2. Escolha o plano **Free** → **Continue**.
3. O Cloudflare faz scan dos registos DNS existentes. Reveja a lista e
   guarde uma fotografia/captura caso precise reverter mais tarde.

## 3. Mudar nameservers no registar do domínio

1. O Cloudflare mostra dois nameservers parecidos com
   `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`. Copie-os.
2. Vá ao painel do **registar** onde comprou `frutariaemcasa.pt`
   (ex.: PTisp, Amen, GoDaddy, Namecheap…), entre na gestão do domínio
   e substitua os nameservers atuais pelos da Cloudflare.
3. Volte ao Cloudflare e clique **Done, check nameservers**. A
   propagação demora normalmente 5–60 minutos (pode ir até 24h).
   Receberá email quando o domínio ficar **Active**.

## 4. Registos DNS

No separador **DNS → Records** crie/edite (a "nuvem laranja" = proxied):

| Tipo  | Nome              | Conteúdo                | Proxy   |
|-------|-------------------|-------------------------|---------|
| A     | `@`               | `<IP-DO-SEU-SERVIDOR>`  | Proxied |
| A     | `www`             | `<IP-DO-SEU-SERVIDOR>`  | Proxied |
| A     | `fruta`           | `<IP-DO-SEU-SERVIDOR>`  | Proxied |

> Notas sobre o admin host:
> - O código está hoje a usar `ADMIN_HOST=fruta.segura.pt`. Se `segura.pt`
>   **não** é seu, esse hostname **não funciona** — não pode criar registos
>   DNS num domínio que não é seu.
> - Recomendo mudar para `admin.frutariaemcasa.pt` (acima já está como
>   `fruta`; se preferir `admin` substitua o nome) e atualizar `.env`:
>     `ADMIN_HOST=fruta.frutariaemcasa.pt`
>   (ou `admin.frutariaemcasa.pt`).

## 5. SSL / HTTPS

1. **SSL/TLS → Overview** → modo **Full (strict)**.
   (Se o seu servidor ainda não tem certificado próprio, comece em
   **Full** e instale depois um Let's Encrypt no servidor para passar
   a strict — a Cloudflare Origin CA também é uma opção.)
2. **SSL/TLS → Edge Certificates**:
   - **Always Use HTTPS** → ON
   - **Automatic HTTPS Rewrites** → ON
   - **Minimum TLS Version** → 1.2
   - **Opportunistic Encryption** → ON
3. Quando estiver tudo verde, ative **HSTS** (Strict-Transport-Security)
   com `max-age=15552000`, include subdomains ON.

## 6. Email (Gmail, conta consumidor)

> Estes registos só são necessários se quiser **enviar a partir de
> `algo@frutariaemcasa.pt`** com Google Workspace. Para a configuração
> atual (envio via `notificacaofrutaria@gmail.com` / `frutariaemcasa2021@gmail.com`,
> que são contas gratuitas em `gmail.com`), **não precisa de mexer em
> nada de DNS** — o envio vai pela conta Gmail diretamente.

Se mais tarde subscrever **Google Workspace** em `frutariaemcasa.pt`:

| Tipo | Nome     | Conteúdo                                                | Prioridade |
|------|----------|---------------------------------------------------------|------------|
| MX   | `@`      | `aspmx.l.google.com`                                    | 1          |
| MX   | `@`      | `alt1.aspmx.l.google.com`                               | 5          |
| MX   | `@`      | `alt2.aspmx.l.google.com`                               | 5          |
| MX   | `@`      | `alt3.aspmx.l.google.com`                               | 10         |
| MX   | `@`      | `alt4.aspmx.l.google.com`                               | 10         |
| TXT  | `@`      | `v=spf1 include:_spf.google.com ~all`                   | —          |
| TXT  | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:frutariaemcasa2021@gmail.com` | — |
| TXT  | `google._domainkey` | (DKIM gerada no admin do Workspace)          | —          |

## 7. Segurança (defesa em profundidade)

1. **Security → Bots → Bot Fight Mode** → ON.
2. **Security → WAF → Custom rules** → criar:
   - **Block /admin externo**
     - Field: `URI Path` `starts with` `/admin`
     - AND `Hostname` `does not equal` `fruta.frutariaemcasa.pt`
     - Action: **Block**
   - **Block /api/admin externo**
     - Field: `URI Path` `starts with` `/api/admin`
     - AND `Hostname` `does not equal` `fruta.frutariaemcasa.pt`
     - Action: **Block**
   - O servidor Express já faz isto, mas a regra na borda
     bloqueia antes de bater no servidor → menos ruído.
3. **Security → Settings → Security Level** → Medium.

## 8. Cache

1. **Caching → Cache Rules** → criar:
   - **Bypass cache: API**
     - When: `URI Path` `starts with` `/api/`
     - Then: **Bypass cache**
   - **Bypass cache: admin**
     - When: `URI Path` `starts with` `/admin`
     - Then: **Bypass cache**
2. **Caching → Configuration → Browser Cache TTL** → "Respect existing headers".

## 9. Redirects

1. **Rules → Redirect Rules** → criar:
   - **WWW → apex**
     - When: `Hostname` `equals` `www.frutariaemcasa.pt`
     - Then: 301 → `https://frutariaemcasa.pt${uri}` (preserve query string)

## 10. Verificação final

Depois da propagação:

```bash
curl -I https://frutariaemcasa.pt          # 200 + cabeçalho cf-ray
curl -I http://frutariaemcasa.pt           # 301 → https
curl -I https://www.frutariaemcasa.pt      # 301 → apex
curl -I https://fruta.frutariaemcasa.pt/admin  # 200 (página de login)
curl -I https://frutariaemcasa.pt/admin    # 404 (bloqueado)
```

Se tudo der as respostas acima, está concluído.
