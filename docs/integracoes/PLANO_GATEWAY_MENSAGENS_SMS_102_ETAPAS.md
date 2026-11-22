# Plano de implementação — Gateway de Mensagens (WhatsApp + SMS SMSDev) no Zapp Web V2

**Repo:** `adm01-debug/Zapp_Web_V2` · **Banco:** Supabase Cloud `tnnnlkbymytvtqngbbqh` (MCP `SUPABASE - ZAPP WEB V2 - MCP`) · **Data:** 22/11/2026
**Primeiro cliente:** Promo Supply V2 (mensagens para fornecedores e motoristas) · **Provedor de SMS:** SMSDev (`https://api.smsdev.com.br/v1`)

Objetivo de negócio: qualquer sistema da Promo Brindes (começando pelo Promo Supply) pede "mande esta mensagem para este telefone" e o Zapp entrega por WhatsApp, com SMS como alternativa. Tudo fica no histórico do contato no Zapp, as respostas caem na fila de Compras, e o sistema de origem é avisado de cada mudança de status e de cada resposta.

---

## 0. Estado atual verificado (base do plano)

| Fato | Evidência |
|---|---|
| Envio de WhatsApp existe, mas só para usuário logado no Zapp | `supabase/functions/evolution-api/index.ts:93-98` (401 sem JWT) |
| API pública desligada | `supabase/functions/public-api/index.ts` → `410 'Public API is disabled'` |
| Fila atômica de saída já existe: `enqueue_outbound_message` → edge `message-delivery` (claim/lease, carimbo PD-79, pausa C121, reconciliação IA-047, `log_message_attempt`) | `src/services/outbound-message.service.ts` (`enqueueAndDispatch` → `invokeEdge('message-delivery')`); funções no banco: `claim/complete/fail_outbound_message`, `mark_outbound_post_started`, `resolve_outbound_whatsapp_connection` |
| `enqueue_outbound_message` exige `auth.role()='authenticated'` + permissão `send_messages` | `pg_get_functiondef` ao vivo (primeiras linhas do corpo) |
| `message-delivery` aceita dependências injetadas (`deps.requireAuth`, `deps.createClient`, `deps.evoFetch`) e só roda o servidor sob `import.meta.main` → dá para reaproveitar o handler inteiro a partir de outra edge | `supabase/functions/message-delivery/index.ts` (`MessageDeliveryDeps`, `handleMessageDeliveryRequest`, última linha) |
| `message-delivery` só exige `profiles.is_active = true` e `messages.agent_id = profile.id` | mesmo arquivo, bloco `profiles … is_active` e checagem `existing.agent_id !== profile.id` |
| Modelo omnichannel já existe: `messages.channel_type` (text), `messages.channel_connection_id → channel_connections`, enum `channel_type` = whatsapp, instagram, telegram, messenger, webchat, email (**sem `sms`**) | consultas ao banco ao vivo |
| Hoje 100% das mensagens e contatos são `whatsapp` (62.132 mensagens, 5.021 contatos) | `select channel_type, count(*)` ao vivo |
| Opt-out já existe: `talkx_recipient_is_suppressed(p_contact_id, p_phone)` e `talkx_suppress_contact(...)` | `pg_proc` ao vivo |
| Não existe nenhuma tabela/edge de SMS, de cliente de integração ou de chave de API | `information_schema.tables` ao vivo + busca de código (Twilio/Zenvia/Comtele/Infobip/TotalVoice/smsdev = 0) |
| Última migration no ledger: `20261121190000` | `select max(version)` ao vivo |
| 94 edge functions; padrão de teste Deno `*.test.ts` com injeção de dependência | árvore do repo (`talkx-send/*.test.ts`, `message-delivery`, `multiplix-send`) |

**SMSDev (o que a API oferece):** `POST /v1/send` (`key`, `type=9`, `number`, `msg`, `refer` ≤100 caracteres, agendamento opcional `jobdate DD/MM/YYYY` e `jobtime HH:MM`), resposta `situacao` (OK/ERROR), `codigo`, `id`, `descricao`; `POST /v1/dlr` (status de entrega pelo `id`); `POST /v1/inbox` (respostas recebidas); `POST /v1/balance` (`sms_balance`); `POST /v1/cancel`; `POST /v1/report/total`; avisos automáticos de status (DLR) e de resposta (MO). 160 caracteres por SMS; texto maior gasta mais créditos. Sem mensalidade, paga por SMS enviado/recebido.
**NÃO VERIFICADO:** formato exato do corpo dos avisos automáticos (DLR/MO), se eles trazem assinatura, como a SMSDev trata acentos e o preço por SMS → as etapas 4 e 5 capturam isso antes de qualquer código.

---

## Arquitetura (decisão)

```
Promo Supply ──POST /functions/v1/integration-send (x-zapp-key + Idempotency-Key)──▶ Zapp
                                                                                    │
            ┌───────────────── canal whatsapp/auto ─────────────────────────────────┤
            │  integration_find_or_create_contact → enqueue_integration_outbound_message
            │  → handleMessageDeliveryRequest (MESMO motor do inbox, identidade técnica do cliente)
            │       falha definitiva (número sem WhatsApp, conexão fora, recusa) → SMS
            │       resultado ambíguo (POST saiu, sem recibo) → NUNCA SMS (evita duplicar)
            └───────────────── canal sms ──▶ enqueue_sms_message → sms-delivery → SMSDev /v1/send
SMSDev ──avisos DLR/MO──▶ smsdev-webhook ──▶ apply_sms_dlr / ingest_inbound_sms (resposta vira mensagem no inbox)
messages (status muda / contato responde) ──trigger──▶ integration_webhook_outbox ──cron──▶ integration-webhook-dispatch ──HMAC──▶ Promo Supply
```

Princípios: reaproveitar o motor de entrega existente (zero mudança em `message-delivery`); SMS vira um canal de verdade (`channel_type='sms'`) no mesmo contato e no mesmo histórico; segredos só em secrets/Vault; cada cliente de integração tem chave própria, identidade técnica própria e pode ser desligado sozinho.

### Contrato da API (v1)

`POST /functions/v1/integration-send`
Cabeçalhos: `x-zapp-key: zk_live_…` · `Idempotency-Key: <uuid>` · `Content-Type: application/json`
```json
{
  "to": { "phone": "5562999998888", "name": "Fornecedor XBZ - Comercial" },
  "channel": "auto",
  "text": "Olá! Pedido de compra #1234 enviado. Confirme o prazo de liberação, por favor.",
  "fallback": { "sms": true, "sms_text": "Promo Brindes: pedido #1234 enviado. Responda pelo WhatsApp." },
  "reference": { "type": "pedido_compra", "id": "1234", "url": "https://…/pedidos/1234" },
  "metadata": { "fornecedor_id": "…" }
}
```
Resposta `202`: `{ "request_id", "status": "accepted|sent|failed", "channel_used": "whatsapp|sms|null", "message_id", "idempotent": false, "error": null }`
`GET /functions/v1/integration-status?request_id=…` (mesma chave) → estado atual + linha do tempo.
Eventos devolvidos ao cliente (POST assinado no `webhook_url` dele): `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.fallback_sms`, `message.replied`.
Códigos de erro estáveis: `unauthorized`, `rate_limited`, `idempotency_conflict`, `invalid_payload`, `channel_not_allowed`, `recipient_suppressed`, `invalid_number`, `instance_unavailable`, `provider_rejected`, `receipt_unconfirmed`, `sms_cap_reached`, `insufficient_balance`, `disabled`.

### Ordem das PRs (uma tarefa = uma branch `claude/<tipo>-<slug>-<AAMMDD-HHMM>` = uma PR)

| PR | Conteúdo | Etapas | Merge |
|---|---|---|---|
| 1 | Migration A — enum `sms` | 9 | **Dono aprova** (DDL) |
| 2 | Migration B — tabelas, RLS, coluna `profiles.kind` | 10–21 | **Dono aprova** |
| 3 | Migration C — RPCs e triggers | 22–31 | **Dono aprova** |
| 4 | Filtro `profiles.kind` nas listas de atendentes | 32–33 | automático (CI verde) |
| 5 | Módulos `_shared/sms/*` + `_shared/integration-*` | 34–43 | automático |
| 6 | Edges `integration-send` + `integration-status` | 44–58 | automático (config.toml muda só `verify_jwt`) |
| 7 | Edges `sms-delivery`, `smsdev-webhook`, `sms-dlr-poll`, `smsdev-balance-check` | 59–70 | automático |
| 8 | Fallback por tempo + `integration-webhook-dispatch` | 71–78 | automático |
| 9 | Migration D — jobs `pg_cron` | 79 | **Dono aprova** |
| 10 | Front: Configurações › Integrações e SMS | 80–85 | automático |
| 11 | Front: inbox (selo SMS, seletor de canal, origem do pedido) + monitor | 86–92 | automático |
| 12 | Docs, LGPD, runbook | 93–95 | automático |
| — | Go-live (sem código) | 96–102 | — |

---

## Fase 0 — Pré-voo e decisões travadas (1–8)

1. **Ler o contexto obrigatório.** `git show origin/contexto:docs/contexto/00-INDEX.md`, `docs/agentes/banco.md`, `docs/agentes/regras-dominio.md`, `docs/agentes/evolution-go.md`, `docs/JORNADA_MENSAGEM_WHATSAPP.md`, `docs/PRONTO_PRODUCAO.md`. Pronto quando: os pontos de contato de `messages`, `contacts` e `message-delivery` estão anotados.
2. **Checar conflito com outros agentes.** `github_graphql` listando PRs abertas que tocam `supabase/functions/message-delivery/`, `supabase/functions/_shared/messaging/`, `supabase/migrations/`, `src/services/outbound-message.service.ts`, `src/components/inbox/`. Havendo PR aberta nos mesmos arquivos → parar e avisar o dono.
3. **(Dono) Conta SMSDev.** Criar a conta, gerar a chave de API no painel, comprar o primeiro pacote de créditos e anotar o preço por SMS (decisão de custo). Pronto quando: há chave ativa e saldo > 0.
4. **Capturar o formato real do envio.** Com a chave, enviar 1 SMS para um celular interno (`POST /v1/send`, `type=9`, `refer=teste-001`) e consultar `POST /v1/dlr`; salvar as respostas, sem telefone, em `supabase/functions/_shared/sms/__fixtures__/send-ok.json`, `send-error.json`, `dlr-delivered.json`. Testar também uma mensagem com acento ("ç", "ã") e registrar quantos créditos ela gastou.
5. **Capturar o formato real dos avisos automáticos.** Apontar no painel da SMSDev as URLs de status (DLR) e de resposta (MO) para um coletor temporário, responder ao SMS de teste e salvar método, content-type e campos de cada aviso em `__fixtures__/callback-dlr.json` e `callback-mo.json`. Registrar se há assinatura/IP fixo. Sem isso o parser da etapa 64 é chute.
6. **(Dono) Decisões de roteamento.** Qual `whatsapp_connections.id` envia pelo Promo Supply; qual fila (`queue_id`) e/ou responsável (`assigned_to`) recebe as respostas dos fornecedores; teto diário de SMS (ex.: 200/dia); se o SMS de alternativa entra automaticamente (sim/não).
7. **Gravar os segredos da edge** no projeto `tnnnlkbymytvtqngbbqh` (via `supabase secrets set` ou MCP `create_edge_function_secret`): `SMSDEV_API_KEY`, `SMSDEV_WEBHOOK_TOKEN` (32+ bytes aleatórios), `INTEGRATION_KEY_PEPPER` (32+ bytes), `SMS_DAILY_CAP`, `INTEGRATION_SEND_ENABLED=true`, `SMS_LOW_BALANCE_THRESHOLD`. Nunca em código, PR ou chat.
8. **Reservar as versões das migrations.** `select supabase_migrations.reserve_migration_version('<sessao>', '<motivo>')` para A, B, C e D (ledger atual: `20261121190000`) + `ls supabase/migrations/*.sql | tail` + PRs abertas em `supabase/migrations/`. Anotar as 4 versões.

## Fase 1 — Banco (9–31)

9. **Migration A — canal `sms`.** Arquivo próprio só com `alter type public.channel_type add value if not exists 'sms'` (o valor novo não pode ser usado na mesma transação que o cria; por isso fica isolado).
10. **Tabela `integration_clients`.** `id uuid pk`, `slug text unique` (ex.: `promo-supply`), `name`, `key_prefix text` (8 primeiros caracteres, para exibir), `key_hash text unique` (HMAC-SHA256 com pepper), `agent_profile_id uuid not null → profiles(id)`, `allowed_channels text[] not null default '{whatsapp}'`, `default_whatsapp_connection_id → whatsapp_connections(id)`, `default_queue_id`, `default_assigned_to → profiles(id)`, `contact_tag text`, `sms_fallback_enabled bool default false`, `fallback_after_minutes int null`, `sms_daily_cap int`, `rate_limit_per_minute int default 60`, `reply_window_days int default 30`, `webhook_url text`, `webhook_secret_id uuid` (Vault, mesmo padrão de `whatsapp_connections.instance_token_secret_id`), `sms_sender_prefix text default 'Promo Brindes:'`, `is_active bool default true`, `revoked_at`, `last_used_at`, `created_by`, `created_at`, `updated_at`.
11. **Restrições de `integration_clients`.** `check (allowed_channels <@ array['whatsapp','sms'])`, `check (webhook_url is null or webhook_url ~ '^https://')`, `check (rate_limit_per_minute between 1 and 600)`, trigger `updated_at`.
12. **Tabela `integration_message_requests`.** `id`, `client_id → integration_clients`, `idempotency_key uuid`, `request_hash text` (sha256 do corpo normalizado, detecta reuso da chave com outro conteúdo), `contact_id → contacts`, `channel_requested text check in ('whatsapp','sms','auto')`, `channel_used text null`, `whatsapp_message_id → messages null`, `sms_message_id → messages null`, `status text check in ('accepted','sent','delivered','read','failed','replied')`, `error_code text`, `fallback_reason text`, `fallback_at`, `reference_type`, `reference_id`, `reference_url`, `metadata jsonb`, `created_at`, `updated_at`.
13. **Índices de `integration_message_requests`.** `unique (client_id, idempotency_key)`; `(whatsapp_message_id)` e `(sms_message_id)` parciais `where … is not null` (usados pelo trigger da etapa 30); `(client_id, created_at desc)`; `(contact_id, created_at desc)`; `(reference_type, reference_id)`.
14. **Tabela `sms_deliveries`.** `message_id uuid pk → messages on delete cascade`, `provider text default 'smsdev'`, `provider_message_id text unique`, `refer text` (= `message_id`), `segments int`, `encoding text check in ('gsm7','ucs2')`, `provider_status`, `provider_code`, `provider_description`, `dlr_status`, `operator`, `claim_token uuid`, `claimed_at`, `claim_expires_at`, `post_started_at`, `attempts int default 0`, `sent_at`, `delivered_at`, `failed_at`, `error_code`, `created_at`, `updated_at`.
15. **Tabela `integration_webhook_outbox`.** `id bigserial`, `client_id`, `request_id → integration_message_requests`, `event_type text`, `payload jsonb` (sem telefone), `attempts int default 0`, `next_attempt_at timestamptz default now()`, `delivered_at`, `dead_at`, `last_http_status int`, `last_error_code text`, `created_at`; índice parcial `(next_attempt_at) where delivered_at is null and dead_at is null`; `unique (request_id, event_type, (payload->>'message_status'))` para não repetir evento.
16. **Identidade técnica.** `alter table profiles add column kind text not null default 'human' check (kind in ('human','integration'))`. Cada cliente de integração tem um usuário de autenticação e um `profiles` próprio (`kind='integration'`, `is_active=true`, nome "Promo Supply (integração)"). É ele que aparece como autor das mensagens no inbox e que passa na checagem `existing.agent_id === profile.id` do `message-delivery`.
17. **RLS ligada nas 4 tabelas novas.** `enable row level security` + `force row level security` em `integration_clients`, `integration_message_requests`, `sms_deliveries`, `integration_webhook_outbox`.
18. **Políticas de `integration_clients` e outbox.** `select` só para `is_admin_or_supervisor(auth.uid())`; nenhuma política de `insert/update/delete` para `authenticated` (escrita só por RPC `SECURITY DEFINER` ou `service_role`). `key_hash` e `webhook_secret_id` nunca saem para o front: criar a view `integration_clients_safe` sem essas colunas e dar `select` só nela.
19. **Política de `integration_message_requests`.** `select` para admin/supervisor e para quem enxerga o contato (`is_contact_visible_to_user(contact_id, auth.uid())`).
20. **Política de `sms_deliveries`.** `select` quando o usuário enxerga o contato da mensagem (join `messages.contact_id` + `is_contact_visible_to_user`).
21. **Grants.** `revoke all … from anon` nas 4 tabelas; `grant select` para `authenticated` (a RLS filtra); `grant all` para `service_role`. Conferir com `has_table_privilege` no replay.
22. **RPC `integration_find_or_create_contact(p_client_id, p_phone, p_name, p_reference jsonb)`** — `SECURITY DEFINER`, `search_path` fixo, `execute` só para `service_role`. Normaliza dígitos, busca por `phone_search_digits` (ignora `deleted_at`), cria se não existir com `channel_type='whatsapp'`, `whatsapp_connection_id`/`queue_id`/`assigned_to` vindos do cliente, adiciona a tag do cliente; nunca sobrescreve o nome de um contato existente. Contato bloqueado (`blocked_at`) → erro `recipient_blocked`.
23. **RPC `enqueue_integration_outbound_message(p_client_id, p_contact_id, p_client_message_id, p_content, p_whatsapp_connection_id)`** — espelha o `insert` de `enqueue_outbound_message` (só `text` na v1), com `agent_id = client.agent_profile_id`, `sender='agent'`, `channel_type='whatsapp'`, conexão por `resolve_outbound_whatsapp_connection`; idempotente por `client_message_id` (mesmo id → devolve a mesma linha). `execute` só para `service_role`.
24. **RPC `enqueue_sms_message(p_contact_id, p_client_message_id, p_content, p_agent_profile_id)`** — insere em `messages` (`channel_type='sms'`, `sender='agent'`, `status='sending'`) e em `sms_deliveries` (`segments`, `encoding` calculados pela edge e passados como parâmetro); idempotente. `execute` só para `service_role`.
25. **RPC `enqueue_agent_sms_message(...)`** — versão para o atendente no inbox: exige `auth.role()='authenticated'`, `user_has_permission(auth.uid(),'send_messages')` e contato visível; chama a lógica da etapa 24 com o `profile.id` do usuário.
26. **RPCs da fila de SMS.** `claim_sms_delivery(p_message_id, p_worker, p_lease_seconds)` (só `status='sending'` sem lease vivo; devolve telefone, texto, `claim_token`, tentativa), `mark_sms_post_started`, `complete_sms_delivery(p_message_id, p_claim_token, p_provider_message_id, p_provider_code)`, `fail_sms_delivery(p_message_id, p_claim_token, p_error_code, p_retryable)`; mesmo cercamento por `claim_token` do PD-79.
27. **RPC `apply_sms_dlr(p_provider_message_id, p_status, p_operator, p_occurred_at)`** — atualiza `sms_deliveries` e `messages.status` de forma monotônica (`sending → sent → delivered`; `failed` só se ainda não entregou); repetir o mesmo aviso não muda nada.
28. **RPC `ingest_inbound_sms(p_phone, p_text, p_provider_message_id, p_received_at)`** — acha o contato pelos dígitos (ou cria como desconhecido), insere `messages` `sender='contact'`, `channel_type='sms'`, com deduplicação por `provider_message_id`; se o texto for `SAIR`, `PARAR`, `STOP` ou `CANCELAR` → `talkx_suppress_contact(...)`. Antes de codar, conferir os valores aceitos de `p_origin`/`p_reason_code` (`talkx_suppression_reasons`, `talkx_suppression_reasons_guard`).
29. **RPC `integration_check_suppressed(p_contact_id, p_phone)`** — envelope de `talkx_recipient_is_suppressed` para uso pela edge, e consulta extra a `contacts.consent_status = 'revoked'`.
30. **Trigger de status → outbox.** `after update of status on messages for each row when (old.status is distinct from new.status)` → se `new.id` estiver em `integration_message_requests` (índices da etapa 13), atualiza `status` do request e insere o evento `message.sent|delivered|read|failed` na outbox. Função leve; `messages` tem 62 mil linhas e é tabela quente — medir com `explain` no replay.
31. **Trigger de resposta → outbox.** `after insert on messages for each row when (new.sender = 'contact')` → se o contato tem request do mesmo cliente dentro de `reply_window_days`, marca o request mais recente como `replied` e insere `message.replied` com o texto da resposta e o canal. Junto: atualizar `supabase/schema-catalog.json`, `scripts/db-audit/known-violations.json` (se o guard mudar) e escrever `scripts/db-audit/integration-gateway.test.sh` (Postgres descartável: idempotência, `anon` negado, RLS por contato, DLR monotônico, opt-out por SMS, trigger não dispara para mensagem comum).

## Fase 2 — Identidade técnica fora das listas de atendentes (32–33)

32. **Mapear quem lê `profiles` como "lista de atendentes".** Grafo (`graphify query "profiles atendentes distribuição"`) e depois `grep`: distribuição/round-robin, presença, `max_chats`, relatórios de produtividade, seletores de transferência, SLA. Listar arquivo:linha de cada consumidor na PR.
33. **Filtrar `kind = 'human'`** em cada consumidor listado (front e RPCs de distribuição). Teste vitest/SQL provando que o perfil de integração não recebe conversa nem aparece no seletor de transferência.

## Fase 3 — Módulos compartilhados (`supabase/functions/_shared/`) (34–43)

34. **`_shared/sms/smsdev-client.ts`** — funções `sendSms`, `getDlr`, `getBalance`, `getInbox`, `cancelSms`; base `https://api.smsdev.com.br/v1`; chave só de `SMSDEV_API_KEY`; timeout de 15 s com `AbortController`; injeção de `fetch` para teste; nunca loga telefone, texto nem chave.
35. **`_shared/sms/errors.ts`** — traduz `situacao/codigo/descricao` e status HTTP da SMSDev para os códigos estáveis (`invalid_number`, `insufficient_balance`, `auth_failed`, `provider_rejected`, `provider_unavailable`, `receipt_unconfirmed`), com a mesma regra de ambiguidade do `classifyProviderFailure` do `message-delivery` (timeout/5xx depois do POST = ambíguo, sem reenvio automático).
36. **`_shared/sms/segments.ts`** — detecta GSM-7 x UCS-2, conta partes (160/153 e 70/67), `normalizeForSms` (troca acento por letra sem acento quando o cliente pedir, para não cair no limite de 70), corte por `max_segments` (padrão 2) com reticências. Usa a medição da etapa 4.
37. **`_shared/sms/phone.ts`** — reaproveita `_shared/messaging/phone.ts` (`normalizePhone`) e valida celular brasileiro (`55` + DDD + `9` + 8 dígitos); fixo → `invalid_number` sem gastar crédito.
38. **`_shared/integration-auth.ts`** — lê `x-zapp-key`, calcula HMAC-SHA256(`INTEGRATION_KEY_PEPPER`, chave), busca `integration_clients` ativo por `key_hash`; resposta 401 única e genérica (não revela se a chave existe); `last_used_at` atualizado no máximo 1x por minuto; respeita `INTEGRATION_SEND_ENABLED`.
39. **`_shared/integration-keys.ts`** — gera a chave `zk_live_` + 32 bytes base62 (`crypto.getRandomValues`), devolve `{ plaintext, prefix, hash }`; o texto da chave só existe na resposta da criação/rotação.
40. **`_shared/integration-contract.ts`** — validação do corpo (usar o padrão de `_shared/contract-kit.ts`/`contracts.ts`), limites (`text` ≤ 4.096, `sms_text` ≤ 480, `reference.id` ≤ 100, `metadata` ≤ 4 KB), envelope de resposta e tabela de códigos de erro → status HTTP.
41. **`_shared/integration-webhook-sign.ts`** — assina o evento com o segredo do cliente lido do Vault (`webhook_secret_id`), cabeçalho `x-zapp-signature: t=<unix>,v1=<hmac>`; reaproveita `_shared/webhook-signature.ts`/`hmac-validation.ts`.
42. **`_shared/integration-egress.ts`** — guarda contra SSRF no `webhook_url`: só `https`, resolve DNS e bloqueia IP privado/loopback/link-local/metadata; reaproveitar `_shared/media-egress.ts` se ele já fizer isso (conferir antes).
43. **Testes Deno dos módulos 34–42** em `_shared/sms/__tests__/` e `_shared/__tests__/` usando as fixtures reais das etapas 4–5: sucesso, erro, saldo zero, número fixo, acento, 3 partes, assinatura válida/inválida, IP privado bloqueado.

## Fase 4 — Edge `integration-send` e `integration-status` (44–58)

44. **Criar `supabase/functions/integration-send/index.ts`** com `handleIntegrationSendRequest(req, deps)` exportado e `if (import.meta.main) Deno.serve(...)` (mesmo idioma do `message-delivery`).
45. **`supabase/config.toml`:** `[functions.integration-send] verify_jwt = false` e `[functions.integration-status] verify_jwt = false` (a autenticação é a chave do cliente). Conferir no `deploy-functions.yml` se pastas novas entram sozinhas no deploy; se houver lista fixa, incluir.
46. **Portão de entrada.** Só `POST`; corpo ≤ 16 KB; sem CORS (servidor-para-servidor); `INTEGRATION_SEND_ENABLED=false` → 503 `disabled`.
47. **Autenticação** pela etapa 38; cliente revogado → 401.
48. **Limite de envio** com `enforceRateLimit('integration-send:'+client.id, client.rate_limit_per_minute, 60_000)` → 429 `rate_limited`.
49. **Idempotência.** `Idempotency-Key` obrigatório (uuid). Mesma chave + mesmo `request_hash` → devolve o estado atual com `idempotent:true` e não reenvia; mesma chave + corpo diferente → 409 `idempotency_conflict`.
50. **Validação** pela etapa 40; canal pedido fora de `allowed_channels` → 403 `channel_not_allowed`; `auto` exige `whatsapp` liberado.
51. **Contato:** `integration_find_or_create_contact` (etapa 22).
52. **Opt-out:** `integration_check_suppressed` (etapa 29) → 422 `recipient_suppressed`, request gravado como `failed` (para o Promo Supply saber por quê).
53. **Gravar o request** (`status='accepted'`) antes de qualquer envio, na mesma idempotência.
54. **WhatsApp:** `enqueue_integration_outbound_message` com `p_client_message_id = idempotency_key` → chamar `handleMessageDeliveryRequest` em processo com `deps.requireAuth = () => ({ userId: <user_id do perfil técnico> })` e um `Request` interno `{ messageId }`. Isso reaproveita claim, pausa C121, carimbo PD-79, reconciliação IA-047 e `log_message_attempt` sem tocar em `message-delivery`.
55. **Tabela de decisão de alternativa (SMS)** aplicada à resposta do passo 54: `invalid_number`, `instance_unavailable`, `provider_rejected`, `media_invalid` → SMS se `sms_fallback_enabled` e `sms` permitido; `receipt_unconfirmed`, `in_progress`, `provider_unavailable` ambíguo, `rate_limited` → **nunca** SMS (risco de mensagem duplicada); grava `fallback_reason` e evento `message.fallback_sms`.
56. **SMS direto ou alternativa:** texto = `fallback.sms_text` ou `text`, com `sms_sender_prefix`, `normalizeForSms` e corte da etapa 36 → `enqueue_sms_message` → `deliverSms` (etapa 60) em processo.
57. **Resposta** `202` com o envelope do contrato; nunca devolve telefone, texto do provedor ou dado de outro cliente. Logs só com `request_id`, `client.slug`, código e duração.
58. **`integration-status`** (`GET ?request_id=` ou `?idempotency_key=`), mesma autenticação, só enxerga requests do próprio cliente; devolve status, canal, `error_code` e linha do tempo (`message_attempts` + `sms_deliveries`). Testes Deno de 44–58: chave inválida, revogada, limite, idempotência (repetição e conflito), opt-out, WhatsApp ok, número sem WhatsApp → SMS, resultado ambíguo → sem SMS, SMS proibido para o cliente, kill switch.

## Fase 5 — SMS: envio, avisos e saldo (59–70)

59. **Criar `supabase/functions/sms-delivery/index.ts`** com `deliverSms(service, messageId, deps)` exportado.
60. **`deliverSms`:** `claim_sms_delivery` → checar teto diário (global `SMS_DAILY_CAP` e `client.sms_daily_cap`, contando `sms_deliveries` do dia) → `mark_sms_post_started` → `sendSms` com `refer = message_id` → `complete_sms_delivery` ou `fail_sms_delivery`; cada tentativa em `log_message_attempt` (mesma tabela do WhatsApp).
61. **Resultado ambíguo de SMS** (timeout/5xx depois do POST): não reenvia; deixa `post_started_at` preenchido e status `sending` para a reconciliação da etapa 66 achar pelo `refer`.
62. **Entrada HTTP do `sms-delivery`** para o atendente (inbox): `requireAuth`, perfil ativo, mensagem do próprio agente (mesmas checagens do `message-delivery`), limite de envio por usuário.
63. **Criar `supabase/functions/smsdev-webhook/index.ts`** com `verify_jwt = false`; aceita só o método/content-type registrados na etapa 5; valida `SMSDEV_WEBHOOK_TOKEN` (na URL, comparação em tempo constante) e o IP de origem, se a SMSDev publicar a faixa.
64. **Parser dos avisos** a partir das fixtures reais: DLR → `apply_sms_dlr`; MO (resposta) → `ingest_inbound_sms`; formato desconhecido → grava em `webhook_failures` (tabela já existe) e responde 200 (para a SMSDev não insistir).
65. **Responder rápido:** processar e devolver 200 em < 2 s; erro de banco → 500 para a SMSDev repetir (só quando a etapa 5 confirmar que ela repete; senão 200 + `webhook_failures`).
66. **Criar `supabase/functions/sms-dlr-poll/index.ts`** (cron, `_shared/cron-secret-auth.ts`): SMS `sent` há mais de 10 min sem status final, ou `sending` com `post_started_at` vencido → consulta `/v1/dlr` em lote e aplica `apply_sms_dlr`; após 48 h sem resposta → `failed` com `receipt_unconfirmed`.
67. **Polling de respostas como rede de segurança:** o mesmo cron consulta `/v1/inbox` (não lidas) e passa por `ingest_inbound_sms` (dedupe por `provider_message_id` evita duplicar com o aviso automático).
68. **Criar `supabase/functions/smsdev-balance-check/index.ts`** (cron diário + sob demanda pelo admin): `getBalance`; abaixo de `SMS_LOW_BALANCE_THRESHOLD` → alerta pelo mecanismo já usado em `send-rate-limit-alert`/`_shared/notification-events.ts`; grava o último saldo para a tela da etapa 84.
69. **Realtime/inbox:** conferir que a publicação realtime de `messages` e os hooks do inbox não filtram `channel_type='whatsapp'` (grep em `src/hooks` por `channel_type`); onde filtrarem, incluir `sms`.
70. **Testes Deno de 59–68** com as fixtures: envio ok, saldo zero, teto diário, ambíguo, DLR repetido, DLR fora de ordem, MO com "SAIR", token inválido, formato desconhecido.

## Fase 6 — Alternativa por tempo e eventos de volta ao cliente (71–79)

71. **Alternativa por tempo (opcional por cliente):** `fallback_after_minutes` preenchido → cron acha requests `channel_used='whatsapp'` em `sent` (sem `delivered`) há mais que N minutos e dispara o SMS uma única vez (`fallback_at` como trava). Padrão: desligado.
72. **Criar `supabase/functions/integration-webhook-dispatch/index.ts`** (cron 1 min): RPC `claim_integration_webhooks(p_limit)` com `for update skip locked` (criar na Migration C junto com as RPCs).
73. **Envio do evento:** POST no `webhook_url` com o corpo do evento, assinatura (etapa 41), guarda SSRF (etapa 42), timeout de 10 s, sem seguir redirect.
74. **Repetição:** 2xx → `delivered_at`; senão backoff exponencial (1, 2, 4… min, teto 6 h); 12 falhas → `dead_at` + alerta. 410 do cliente → `dead_at` na hora.
75. **Contrato do evento:** `{ event, request_id, idempotency_key, reference, channel, status, error_code, occurred_at, reply?: { text, channel, received_at } }`; sem telefone; `reply.text` só em `message.replied`.
76. **RPC `integration_replay_webhooks(p_client_id, p_from)`** (admin) para reenviar eventos mortos depois de o cliente corrigir a URL.
77. **Teste de ponta do `webhook_url`:** ação "Enviar evento de teste" (usada pela tela da etapa 82) gera `event=ping` assinado.
78. **Testes Deno de 71–77:** assinatura conferível por quem recebe, backoff, morto após 12, 410, SSRF bloqueado, sem telefone no payload.
79. **Migration D — jobs `pg_cron`:** `integration-webhook-dispatch` a cada 1 min, `sms-dlr-poll` a cada 5 min, `smsdev-balance-check` diário às 08:10, alternativa por tempo a cada 2 min, retenção da outbox (entregues > 30 dias). Mesmo padrão dos jobs existentes (`20261120080000_scheduled_report_cron.sql`); PR aberta para o dono.

## Fase 7 — Front (80–92)

80. **Tipos:** depois do apply das migrations, rodar o `types-sync.yml` e usar `src/integrations/supabase/types.ts` regenerado (sem tipos à mão).
81. **Permissão `manage_integrations`:** conferir o catálogo usado por `user_has_permission`; se não existir, criar na Migration C e dar a admin/supervisor.
82. **Página Configurações › Integrações** (rota + item de menu só para quem tem `manage_integrations`): lista de clientes (`integration_clients_safe`), criar cliente (a chave aparece uma única vez, com botão copiar), rotacionar chave, revogar, editar canais/alternativa/teto/conexão/fila/responsável/`webhook_url`, botão "Enviar evento de teste". Criação e rotação chamam a edge `integration-admin` (etapa 83).
83. **Edge `integration-admin`** (JWT + `manage_integrations`): criar cliente (gera chave pela etapa 39, cria usuário e perfil técnico `kind='integration'`, grava segredo do webhook no Vault), rotacionar, revogar, testar webhook. Testes Deno.
84. **Página Configurações › SMS:** saldo atual (etapa 68), SMS enviados e partes gastas por dia/mês (`sms_deliveries`), teto diário, "Enviar SMS de teste para meu celular".
85. **Estados de tela** nas páginas 82 e 84: carregando, vazio, erro com mensagem fixa, sem permissão. Testes vitest dos componentes e do serviço.
86. **Inbox — selo de canal:** bolha com selo "SMS" quando `channel_type='sms'`; ícones de status (enviando/enviado/entregue/falhou) também para SMS.
87. **Inbox — seletor de canal no campo de envio:** WhatsApp | SMS quando o contato tem celular válido e o usuário tem `send_messages`; no modo SMS, contador de caracteres/partes (mesma regra da etapa 36) e aviso de custo.
88. **Serviço `src/services/outbound-sms.service.ts`:** `enqueue_agent_sms_message` → `invokeEdge('sms-delivery')`, com o mesmo controle de clique duplo/idempotência do `outbound-message.service.ts`. Testes vitest.
89. **Painel do contato — origem:** selo "Promo Supply · Pedido de compra 1234" com link (`reference_url`) quando o contato tem requests de integração.
90. **Monitor de integrações** (dentro de Configurações › Integrações): lista de requests com filtros (cliente, status, canal, período), linha do tempo de cada um, contadores de falha e eventos mortos, botão "Reenviar eventos".
91. **Mensagem da integração no inbox:** autor "Promo Supply (integração)" + selo "automática" — o comprador vê que não foi um colega que mandou.
92. **E2E Playwright** (`e2e/`): admin cria cliente e vê a chave uma vez; selo SMS na conversa; composer em modo SMS conta partes; atendente sem permissão não vê Integrações.

## Fase 8 — Segurança, documentação, CI e entrada em produção (93–102)

93. **Revisão de segurança antes de abrir as PRs 6–8:** nenhum log com chave, telefone ou texto; 401 uniforme; RPCs novas com `execute` revogado de `public/anon/authenticated` onde é só `service_role`; `supabase-usage-guard.mjs` com `novas: 0`; rodar o `get_advisors` de segurança do projeto depois do apply.
94. **LGPD:** incluir `sms_deliveries` e `integration_webhook_outbox` em `docs/LGPD-RETENTION-POLICY.md` (outbox 30 dias; SMS acompanha a retenção de `messages`).
95. **Documentação:** `docs/integracoes/GATEWAY_MENSAGENS.md` (contrato da API, eventos, assinatura, códigos de erro, exemplos curl sem chave real), `docs/integracoes/SMSDEV.md` (formatos reais das etapas 4–5, custos, teto, saldo), atualizar `docs/agentes/regras-dominio.md` (perfil técnico, SMS como canal) e `docs/PRONTO_PRODUCAO.md` (onde fica cada fluxo novo); runbook "integração parou" em `docs/INCIDENT-RUNBOOK.md`.
96. **Qualidade antes de cada PR:** `deno test` das funções tocadas, `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint <arquivos>`, `npx vitest run <caminhos>`, `node --test scripts/ci/*.unit.mjs`; só erro introduzido conta.
97. **Aplicar as migrations** na ordem A → B → C → D, cada uma só depois de merge + deploy do código que depende dela, pelo fluxo de `banco.md`: `node scripts/db-audit/register-migration.mjs <arquivo>` (dry-run) → DDL + `INSERT` no ledger na mesma chamada com `RETURNING` → conferir com `pg_get_functiondef`/`pg_policies`.
98. **Confirmar o deploy das edges** pelo run do `deploy-functions.yml` e `functions_ping` em `integration-send`, `integration-status`, `integration-admin`, `sms-delivery`, `smsdev-webhook`, `sms-dlr-poll`, `smsdev-balance-check`, `integration-webhook-dispatch`.
99. **Cadastrar o cliente `promo-supply`** pela tela da etapa 82 (canais whatsapp+sms, conexão e fila da etapa 6, teto, `webhook_url` da edge receptora do Promo Supply) e gravar a chave direto como secret `ZAPP_INTEGRATION_KEY` (e `ZAPP_WEBHOOK_SECRET`) no projeto Supabase do Promo Supply (`lmypcdfsrgfftzhxawao`).
100. **Teste real em produção com celulares internos:** (a) WhatsApp normal → `message.sent`/`delivered` no Promo Supply; (b) número sem WhatsApp → SMS de alternativa + `message.fallback_sms`; (c) `channel=sms` → DLR `delivered`; (d) resposta por WhatsApp e por SMS → aparecem no inbox na fila de Compras + `message.replied`; (e) "SAIR" por SMS → próximo envio volta `recipient_suppressed`; (f) repetir a mesma `Idempotency-Key` → nada é reenviado. Evidência: query em `integration_message_requests`, `sms_deliveries` e `integration_webhook_outbox`.
101. **Plano de desligamento** testado: `integration_clients.is_active=false` para um cliente; `INTEGRATION_SEND_ENABLED=false` para todos; saldo zero → `insufficient_balance` sem travar o WhatsApp.
102. **Fechamento:** atualizar este documento no Project com links das PRs e estado de cada uma, registrar em `inventario/estado/` o que entrou, e liberar o lado do Promo Supply (cliente HTTP + receptor de eventos) como plano separado no repo `Promo_Supply_V2`.

---

## Riscos e pontos NÃO VERIFICADOS

| Ponto | Por que importa | Onde se resolve |
|---|---|---|
| Formato e assinatura dos avisos automáticos da SMSDev | Sem isso, status e respostas de SMS não entram | Etapas 5, 63–65 |
| Acentos na SMSDev (custo ×2 ou ×3) | Custo por mensagem | Etapas 4 e 36 |
| Preço por SMS | Teto diário e decisão de alternativa automática | Etapa 3 (dono) |
| Consumidores de `profiles` que listam atendentes | Perfil técnico pode receber conversa por engano | Etapas 32–33 |
| `deploy-functions.yml` publica pastas novas sozinho? | Edge nova pode não subir | Etapa 45 |
| Valores aceitos por `talkx_suppress_contact` | Opt-out por SMS | Etapa 28 |
| Trigger em `messages` (tabela quente, 62 mil linhas) | Latência de todo envio do inbox | Etapa 30 (explain no replay) |
| Alternativa por tempo pode duplicar (WhatsApp entregue sem confirmação + SMS) | Fornecedor recebe 2 vezes | Desligado por padrão (etapa 71) |
