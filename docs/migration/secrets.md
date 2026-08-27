# Inventário de Secrets — Edge Functions ZAPP WEB V2

Gerado: 2026-08-27 · Sessão 4 · Fonte: `grep -r Deno.env.get` em `supabase/functions/`

**Total: 19 secrets únicos** (handoff anterior estimava 28; grep real = 19)

| Secret | Funções que usam | Quem fornece | Pode ficar vazio na fase 1? |
|---|---|---|---|
| `SUPABASE_URL` | _shared, ai-*, chatbot-l1, cleanup-*, create-user, detect-new-device, external-db-bridge, gmail-*, promogifts-catalog, recover-*, send-*, sentiment-alert, sicoob-bridge-reply, talkx-* | Supabase auto-inject (destino) | **NÃO** — crítico |
| `SUPABASE_SERVICE_ROLE_KEY` | _shared, ai-*, chatbot-l1, cleanup-*, create-user, detect-new-device, external-db-bridge, gmail-*, recover-*, send-*, sentiment-alert, sicoob-bridge-reply, talkx-* | Supabase auto-inject (destino) | **NÃO** — crítico |
| `SUPABASE_ANON_KEY` | _shared, ai-churn-analysis, ai-classify-tickets, approve-password-reset, bitrix-api, create-user, detect-new-device, external-db-bridge, gmail-*, promogifts-catalog | Supabase auto-inject (destino) | **NÃO** — crítico |
| `SUPABASE_PUBLISHABLE_KEY` | _shared | Joaquim define no dashboard | SIM (só para auth flows) |
| `SUPABASE_FUNCTIONS_URL` | ai-auto-tag | Supabase auto-inject | SIM (fallback interno) |
| `EVOLUTION_API_KEY` | recover-corrupted-audios, talkx-send | Joaquim (Evolution GO) | **NÃO** — whatsapp quebra |
| `EVOLUTION_API_URL` | recover-corrupted-audios, talkx-send | Joaquim (Evolution GO URL) | **NÃO** — whatsapp quebra |
| `EVOLUTION_INSTANCE_NAME` | (referência mas sem função encontrada no grep) | Joaquim | SIM por ora |
| `RESEND_API_KEY` | detect-new-device, send-email, send-scheduled-report | Resend.com — Joaquim | SIM (emails não críticos na fase 1) |
| `CHATBOT_L1_WEBHOOK_SECRET` | chatbot-l1 | Joaquim gera | SIM |
| `WEBHOOK_SECRET` | (referência genérica) | Joaquim gera | SIM |
| `WHATSAPP_VERIFY_TOKEN` | (referência) | Joaquim (Evolution GO) | SIM |
| `BITRIX_WEBHOOK_URL` | (referência — Bitrix24) | Joaquim (Bitrix24 webhook) | SIM |
| `EXTERNAL_SUPABASE_URL` | (referência — proj externo) | Projeto externo | SIM |
| `EXTERNAL_SUPABASE_ANON_KEY` | (referência — proj externo) | Projeto externo | SIM |
| `PROMOGIFTS_SUPABASE_URL` | promogifts-catalog | Supabase projeto Promo Gifts | SIM (catálogo) |
| `PROMOGIFTS_SUPABASE_ANON_KEY` | promogifts-catalog | Supabase projeto Promo Gifts | SIM (catálogo) |
| `SICOOB_GIFTS_URL` | (referência) | SICOOB/bridge | SIM |
| `SICOOB_GIFTS_BRIDGE_SECRET` | (referência) | SICOOB/bridge | SIM |

## Críticos para Go-Live (fase 1)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` são injetados automaticamente pelo Supabase — não precisam de `wrangler secret put`.

Deps manuais obrigatórias para funcionar: `EVOLUTION_API_KEY`, `EVOLUTION_API_URL`.
