# S8 — Edge Functions

**Coletado em:** 2026-11-01

## Inventário do Repo

**Total:** 87 diretórios em `supabase/functions/` (86 funções + `_shared`)

### Amostra (primeiros 30)

```
_shared, ai-auto-tag, ai-churn-analysis, ai-classify-tickets,
ai-conversation-analysis, ai-conversation-summary, ai-enhance-message,
ai-jobs-worker, ai-kb-ingest, ai-proxy, ai-suggest-reply,
ai-transcribe-audio, ai-usage-outbox-drain, approve-password-reset,
auth-login, auto-close-conversations, automation-suggest-reply,
batch-fetch-avatars, bitrix-api, chatbot-l1, classify-audio-meme,
classify-emoji, classify-sticker, cleanup-rate-limit-logs,
connection-health-check, copilot-live, create-user, crm-integration,
csp-report, ...
```

## verify_jwt

**NÃO VERIFICADO** — a opção `verify_jwt` por função requer inspeção de cada `index.ts`.

```bash
# Verificar offline:
grep -r "verify_jwt.*false" supabase/functions/
```

Candidatas a `verify_jwt: false`: `csp-report` (endpoint de telemetria), webhooks externos.

## pg_cron → Edge Functions

| Job | Edge Function |
|---|---|
| `gmail-incremental-sync` | `gmail-cron-sync` |
| `connection-health-check` | `connection-health-check` |
| `avatars-refresh` | `batch-fetch-avatars` |

## Logs de Edge Functions

```sql
SELECT date_trunc('day', created) as day, status_code, count(*)
FROM net._http_response
WHERE created >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2 ORDER BY 1 DESC;
```

| Dia | Status | Requests |
|---|---|---|
| 2026-11-01 | 200 | 1208 |
| 2026-11-01 | NULL | 6 |

**Apenas 1 dia de dados** — net._http_response tem retenção ~1h (purgado pelo cleanup job).

## Code Review

**NÃO VERIFICADO** — revisão de código fonte requer leitura de cada `index.ts`.

Funções críticas a revisar:
1. `auth-login` — lógica de autenticação customizada
2. `create-user` — criação de usuários
3. `approve-password-reset` — reset de senha
4. `ai-proxy` — proxy para APIs de IA (validação de budget)
5. `copilot-live` — função ativa em desenvolvimento