# E32 — Contrato de Segurança do `evolution-webhook`

> Documento criado em 2026-09-29 para fechar a etapa E32 do
> `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`.
> Baseado em leitura direta de `supabase/functions/evolution-webhook/index.ts` e
> `supabase/functions/_shared/hmac-validation.ts`.

## Por que `verify_jwt=false`

A Evolution GO (`evoapicloud/evolution-go`) envia webhooks via HTTP POST sem nenhum
cabeçalho de autenticação — `webhook_producer.go` só inclui `Content-Type: application/json`.
Exigir JWT forçaria a rejeição de 100% dos eventos da GO. O `verify_jwt=false` é
**intencional** e documentado no manifesto (`deployment-manifest.json`).

## Camadas de proteção compensatórias

### 1. HMAC (modo shadow por padrão)

```ts
const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')
  || Deno.env.get('WEBHOOK_SECRET') || '';
const hmacSecurity = new WebhookSecurityService(webhookSecret, /* strictMode */ false);
```

- `strictMode=false` (atual): requests **sem** assinatura são aceitos; requests **com**
  assinatura inválida recebem 401. Backwards-compatible com a Evolution GO.
- Para habilitar modo estrito (rejeitar tudo sem assinatura válida): mudar para
  `strictMode=true` via redeploy — **só quando a Evolution GO passar a assinar**.
- Secret: `EVOLUTION_WEBHOOK_SECRET` no Supabase Dashboard → Edge Functions → Secrets.

### 2. Gate por instanceToken (corpo do evento)

```ts
const instanceToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') || '';
const enforceMode = Deno.env.get('EVOLUTION_WEBHOOK_ENFORCE') || 'shadow';
```

A Evolution GO injeta o `instanceToken` no corpo de todo evento
(`webhook_producer.go`). O gate compara com `EVOLUTION_INSTANCE_TOKEN` via
`timingSafeEqual` (sem timing side-channel).

| `EVOLUTION_WEBHOOK_ENFORCE` | Comportamento |
|---|---|
| `'shadow'` (padrão) | Loga token ausente/divergente; aceita o request |
| `'token'` | Rejeita com 401 se token ausente ou inválido |

Para ligar modo estrito: `EVOLUTION_WEBHOOK_ENFORCE=token` no Supabase Secrets
(sem redeploy). Se `enforce=token` e `instanceToken` não estiver configurado,
a function **falha no boot** — proteção contra configuração inválida.

### 3. Rate limiting

Implementado via `checkRateLimit` de `_shared/validation.ts`:
- Limite: **60 requests / 60s por IP** (verifique parâmetros ao vivo em `validation.ts`)
- Excedido: retorna 429 com header `Retry-After`

### 4. CORS

`handleCors` só permite origens autorizadas via `getCorsHeaders` (preflight retorna
204). Webhooks externos não chegam por CORS (são server-to-server).

## Estado atual

| Proteção | Estado |
|---|---|
| `verify_jwt=false` | Intencional — Evolution GO não suporta auth |
| HMAC | Shadow mode; strictMode disponível quando GO assinar |
| instanceToken gate | Shadow mode; `token` mode disponível via secret |
| Rate limiting | Ativo (60/60s por IP) |
| Documentação | Este arquivo |

## Para habilitar enforcement total (quando possível)

1. `EVOLUTION_WEBHOOK_ENFORCE=token` no Supabase Secrets
2. Confirmar que `EVOLUTION_INSTANCE_TOKEN` está preenchido
3. Quando a Evolution GO suportar assinatura: `strictMode=true` via redeploy
   (editar `index.ts`, linha `new WebhookSecurityService(webhookSecret, false)`)

## Verificação

```sh
# Confirmar que os dois secrets estão definidos (sem exibir valores)
# No Supabase Dashboard → Project → Edge Functions → Secrets
# EVOLUTION_WEBHOOK_SECRET ✓
# EVOLUTION_INSTANCE_TOKEN ✓
# EVOLUTION_WEBHOOK_ENFORCE = 'shadow' (padrão até enforcement total)
```

Etapa E32 fechada em 2026-09-29.
