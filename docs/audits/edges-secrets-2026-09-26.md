# Auditoria de edges `verify_jwt=false` e secrets — E28/E29 (PLANO_MELHORIAS_50)

## E28 — 10 edges com `verify_jwt=false`

Fonte: `supabase/config.toml`. Todas conferidas contra o código-fonte de cada function.

| Function | Por que não exige JWT | Proteção compensatória |
|---|---|---|
| `evolution-webhook` | Webhook do provedor Evolution GO (WhatsApp), não tem como enviar JWT do Supabase | `WEBHOOK_SECRET` + HMAC + `timingSafeEqual` + rate-limit |
| `whatsapp-webhook` | Webhook do Meta/WhatsApp Business API | Assinatura `x-hub-signature` (HMAC, `WHATSAPP_APP_SECRET`) |
| `gmail-webhook` | Webhook do Google Pub/Sub (Gmail push) | HMAC de verificação própria |
| `gmail-cron-sync` | Disparado por cron externo (Actions/N8N), não é um usuário logado | `CRON_SECRET` via header `x-cron-secret` |
| `elevenlabs-webhook` | Webhook do provedor ElevenLabs (TTS) | `ELEVENLABS_WEBHOOK_SECRET` + HMAC |
| `crm-integration` | Worker acionado por cron externo | `CRON_SECRET` + `timingSafeEqual` |
| `public-api` | — | **Desativada**: handler sempre retorna `410 Public API is disabled`. Zero risco — é código mantido só como marcador de rota removida. Candidato a exclusão física em faxina futura (fora de escopo aqui). |
| `auth-login` | É o próprio endpoint de login — por definição o cliente ainda não tem JWT | Lockout de tentativas (`attempts`/`locked_until`, RPC `clear_login_attempts`) — decidido server-side (ADR-006), independente do que o cliente envia |
| `csp-report` | Endpoint de CSP report-uri — o browser envia via `navigator.sendBeacon`/fetch nativo, sem JWT | Rate-limit (30 req/60s por IP), corpo limitado a 8KB, sem persistência (só log) |
| `talkx-link` | Link de clique público de campanha (`/talkx-link?s=slug`) — precisa funcionar pra qualquer destinatário, logado ou não | Rate-limit (60 req/60s por IP), slug como capability token |

**Conclusão E28: as 10 têm justificativa e proteção compensatória real.** Nenhuma migra para
`verify_jwt=true` — forçar JWT quebraria o propósito de cada uma (webhooks externos e endpoint de
login não têm sessão Supabase). Nenhuma ação de código necessária; item fecha com esta tabela.

## E29 — Inventário de secrets

### Achado — gap real, sem workaround seguro

Os secrets sensíveis das edges (`EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_TOKEN`, `WEBHOOK_SECRET`,
`WHATSAPP_APP_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`,
`SICOOB_GIFTS_BRIDGE_SECRET`, `TALKX_LINK_IP_SALT`, `SIP_PASSWORD`, `INTERNAL_ALERT_SECRET`,
`CRON_SECRET`) **não estão nos GitHub Actions secrets** (`github_list_actions_secrets` lista 16
secrets — nenhum destes) — foram setados direto no Supabase via `supabase secrets set` manual/CLI.

Consequência: **não existe data de última rotação rastreável em lugar nenhum** — nem GitHub
(não gerencia), nem MCP/Management API (sem tool de `list_secrets` disponível nesta sessão para o
projeto oficial), nem documentação. Não fabrico datas: registro o gap como está.

### Inventário — secret → functions que usam

| Secret | Functions que usam (grep `Deno.env.get`) |
|---|---|
| `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE_TOKEN` / `EVOLUTION_API_URL` / `EVOLUTION_API_FLAVOR` | Todas as edges de envio/instância WhatsApp via `_shared/evolution-go-routes.ts` |
| `EVOLUTION_WEBHOOK_SECRET` / `EVOLUTION_WEBHOOK_ENFORCE` | `evolution-webhook` |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` | `whatsapp-webhook` |
| `ELEVENLABS_WEBHOOK_SECRET` | `elevenlabs-webhook` |
| `WEBHOOK_SECRET` | `evolution-webhook` (genérico) |
| `CRON_SECRET` | `gmail-cron-sync`, `crm-integration` (também no GH Actions, usado pelo workflow) |
| `OPENROUTER_API_KEY` | Edges de IA (análise de conversa, sugestões) |
| `RESEND_API_KEY` | Envio de e-mail transacional |
| `SICOOB_GIFTS_BRIDGE_SECRET` / `SICOOB_GIFTS_URL` | Integração SICOOB |
| `TALKX_LINK_IP_SALT` | `talkx-link` (hash de IP para rate-limit sem guardar IP cru) |
| `SIP_PASSWORD` | Integração de voz/SIP |
| `INTERNAL_ALERT_SECRET` | Alertas internos entre edges |
| `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY` / `PROMOGIFTS_SUPABASE_URL` | Bridge com projeto externo Catálogo de Produtos — **está** no GH Actions (`updated_at: 2026-08-31`) |
| `PREVIEW_EGRESS_SHARED_SECRET` / `PREVIEW_EGRESS_PROXY_URL` | Proxy de preview — **está** no GH Actions (`updated_at: 2026-09-11`) |
| `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` / `EXTERNAL_SUPABASE_URL` | Bridge com projeto externo Gestão de Clientes — **está** no GH Actions (`updated_at: 2026-09-09`) |

### 0 secrets órfãos detectados

Todo secret referenciado em `Deno.env.get(...)` no código de `supabase/functions/` tem pelo menos
um consumidor identificado acima — nenhum candidato a remoção nesta rodada.

### Recomendação (decisão sua — não é algo que eu aplico sozinho)

Não há como eu rotacionar `EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE_TOKEN`/chaves de IA sem:
1. Gerar o novo valor no provedor (Evolution GO / OpenRouter / ElevenLabs / Resend — acesso que
   não tenho neste MCP);
2. Trocar via `supabase secrets set` (escrita em produção, precisa de você ou de um dispatch
   aprovado);
3. Confirmar que a troca não derruba sessões WhatsApp ativas (reconexão da instância `PRINCIPAL`).

Fica registrado como pendência real de segurança, não como "falso-positivo" — mas a execução (gerar
+ trocar + validar) não é uma etapa que eu deva rodar sem o seu ok explícito, dado o risco de
derrubar o WhatsApp em produção se a troca sair errada.

---
*Gerado em 2026-09-26, sessão de execução do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` (E28/E29).*
