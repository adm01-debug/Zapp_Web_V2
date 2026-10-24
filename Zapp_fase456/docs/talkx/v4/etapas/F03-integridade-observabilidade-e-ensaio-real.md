# Fase 3 — Integridade, observabilidade e ensaio real (X024–X035)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: motor. 12 etapas.
>
> **Entrega da fase:** Eventos gravados pelo servidor, lidas e respostas, pedido de saída configurável, reenvio, LGPD, alertas — e o ensaio com 50 ou mais números da equipe e queda proposital.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de motor, segurança e operação** (etapas X024, X025, X026, X027, X028, X029, X030, X031, X032, X033, X034, X035)

Base: `main` `3d09433` (2026-10-01). Fonte: [`inventario/H_motor_backend.md`](../inventario/H_motor_backend.md) (CAP-001…CAP-110), código conferido em 01/10.

**Abreviações de evidência**
`send` = `supabase/functions/talkx-send/index.ts` · `sched` = `supabase/functions/talkx-scheduler/index.ts` ·
`mx-send` = `supabase/functions/multiplix-send/index.ts` · `reply` / `window` / `resume` =
`supabase/functions/_shared/talkx-{reply,window,resume-policy}.ts` · `evo-send` = `_shared/evolution-send.ts` ·
`go-routes` = `_shared/evolution-go-routes.ts` · `go-adapter` = `_shared/evolution-go-adapter.ts` ·
`wh-msg` = `_shared/evolution-webhook-messages.ts` · `wh-upd` = `_shared/evolution-webhook-msg-handlers.ts` ·
`proxy` = `_shared/evolution-api-proxy.ts` · `M:<versão>` = `supabase/migrations/<versão>_*.sql` ·
`editor` = `src/components/talkx/useCampaignEditor.ts` · `useTalkX` = `src/hooks/integrations/useTalkX.ts` ·
`segs` = `src/hooks/integrations/useTalkXSegments.ts`.

**Convenções que valem para todas as etapas desta trilha (não repetidas em cada uma)**
- **DDL:** versão por `supabase_migrations.reserve_migration_version` (maior do ledger hoje: `20260930530000`); arquivo →
  PR → merge → `register-migration.mjs` → DDL + ledger na mesma chamada → `schema-catalog.json`/`types.ts` regenerados →
  `supabase-usage-guard` `novas: 0`. Restrição (`REVOKE`, `DROP`, policy mais fechada) só depois do deploy do código que
  convive com ela. Todo teste SQL novo em `scripts/db-audit/` entra na lista de `.github/workflows/db-guard.yml`
  (bloco `:287-410`), rodando em Postgres 17 descartável via `retry-disposable-postgres-test.sh`.
- **Edge:** todo teste Deno novo entra na lista de `.github/workflows/ci.yml:76-100`. A etapa **só vale em produção
  depois** de `deploy-functions.yml` disparado e aprovado no environment `producao-edge-functions`; merge não implanta.
- **Segredo:** nenhum valor de token/segredo em log, teste, evidência ou PR.
- Toda RPC nova é `SECURITY DEFINER` com `search_path` fixo, `REVOKE` de `PUBLIC/anon` e checagem de papel explícita.

---

## Etapas

### X024 · Gravar eventos de ciclo de vida no servidor com ator e motivo e fechar a fila ao cancelar

- **Fase:** 3 · **Tela:** 10, 11, 12, 13, 14, 17 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X010
- **Fecha:** CAP-053, CAP-054, CAP-055, CAP-106
- **Hoje:** `transition_talkx_campaign` não recebe ator nem grava evento (`M:20260916210000:17-82`). `created/updated/scheduled/started` são inseridos pelo navegador (`editor:547-583`); `paused`, `cancelled` e `resumed` são gravados pelo navegador (`TalkXLiveMonitor.tsx:226,230,234`); `completed`, `connection_failed` e `skipped_suppressed` ninguém grava; o servidor só grava `limits_updated` e `resumed_auto` (`sched:132-138`). `cancel` não toca destinatários e `cancelled` não existe no CHECK de `talkx_recipients.status` (`M:20260911180000:8-10`).
- **Fazer:** Migration: `transition_talkx_campaign` ganha `p_actor_id uuid default null` e `p_reason text default null` (uma única assinatura — lição do V02) e insere em `talkx_campaign_events` na mesma transação: `started`, `resumed` (com ator) ou `resumed_auto` (sem ator), `paused` (mensagem = motivo), `cancelled`; novas colunas `paused_by`, `cancelled_by`, `cancelled_at`. `cancel` marca `pending` como `cancelled` e solta leases sem dispatch; o CHECK do destinatário ganha `cancelled` e `claim_talkx_recipient`/`talkx_next_recipients` o ignoram. `complete_talkx_campaign_if_drained` grava `completed` com o resumo. `save_talkx_campaign_draft` grava `created`/`updated`, e a passagem para `scheduled` grava `scheduled`/`scheduled_updated` por trigger. Atualizar `check-talkx-transition-contract.sql`. Aplicar no mesmo dia do deploy do X025, para não duplicar evento com o cliente.
- **Aceite:** novo `scripts/db-audit/talkx-lifecycle-events.test.sh`: start → pause (motivo, ator) → resume → cancel gera 4 eventos em ordem, com `actor_id` e mensagem; 5 pendentes → 5 `cancelled`; campanha cancelada não vira `completed`; conclusão grava 1 `completed`. `talkx-events-contract.test.sh` e `talkx-campaign-transitions.test.sh` ajustados; `db-live-guard` verde após o apply.
- **V3:** V12, V13, V14
- **Negócio:** a linha do tempo mostra quem pausou e por quê, e cancelar encerra de fato os envios pendentes.

### X025 · Passar ator e motivo pelo `talkx-send` e remover os eventos gravados pelo navegador

- **Fase:** 3 · **Tela:** 10, 11, 12, 13 · **Camada:** edge + front (hooks) · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X024
- **Fecha:** CAP-051, CAP-054, CAP-055
- **Hoje:** `action=pause|cancel` não repassa motivo nem ator (`send:221-231`); a queda de conexão pausa sem evento (`send:251-260,591-606`); suprimidos pulados só contam em variável local (`send:446,629`); o scheduler insere `resumed_auto` por conta própria (`sched:129-140`); o cliente insere `created/updated/scheduled/started` (`editor:547-583`, `src/hooks/integrations/useTalkXEvents.ts:46-51`).
- **Fazer:** `talkx-send`: resolver o `profiles.id` do JWT e passar `p_actor_id`/`p_reason` em `start|pause|cancel` (`reason` do corpo, até 500 caracteres; cron e worker mandam ator nulo); ao pausar por conexão, gravar `connection_failed` com o status lido; ao fim de cada lote, gravar 1 evento `skipped_suppressed` agregado quando houver pulados por supressão. Remover do scheduler o insert de `resumed_auto` (a transição grava). Front: `pauseCampaign`/`cancelCampaign` de `useTalkX` aceitam `reason`; sair com os `logEvent` de ciclo de vida de `editor` e de `TalkXLiveMonitor.tsx`; `useTalkXEvents.logEvent` passa a aceitar só `note|checklist|segments_reviewed`.
- **Aceite:** Deno: pause com `reason` → a RPC recebe `p_reason` e o `p_actor_id` do perfil; pausa por conexão gera `connection_failed`; lote com 2 suprimidos gera 1 `skipped_suppressed`; teste do scheduler sem insert de evento. Vitest `useCampaignEditor.test.tsx` sem `logEvent('started')`. `grep -rE "logEvent\([^)]*'(started|scheduled|created|updated)'" src/` = 0. Vale após o deploy.
- **V3:** V12, V13, V19 (evento de conexão), V80 (`skipped_suppressed`)
- **Negócio:** a mesma linha do tempo em todas as telas, sem evento duplicado nem faltando.

### X026 · Fechar contadores, uso de template, checklist de retomada e excluir/duplicar no banco

- **Fase:** 3 · **Tela:** 04, 13, 17 · **Camada:** banco + front (hook) · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X025
- **Fecha:** CAP-056, CAP-079, CAP-106, CAP-107, CAP-109
- **Hoje:** `replied_count` está fora do guard de `enforce_talkx_campaign_mutability` (`M:20260930420000:138-145`); destinatário pulado pelo claim não entra em contador (`M:20260912110000:268-294`); `use_count` sobe duas vezes — trigger (`M:20260916130000:18-54`) mais RPC chamada pelo cliente (`src/hooks/integrations/useTalkXTemplates.ts:150-153`, `editor:572`); o tipo `checklist` é aceito sem escritor (`M:20260929730000:36`); excluir vale só para rascunho (`M:20260930420000:74-79`) e duplicar é só estado do cliente (`src/components/talkx/TalkXView.tsx:135-137`); qualquer dono insere qualquer tipo de evento (`M:20260929730000:56-61`).
- **Fazer:** Migration: coluna `talkx_campaigns.skipped_count int not null default 0`, incrementada no ramo bloqueado do claim e em `complete_talkx_recipient('skipped')`, com backfill por agregação; `replied_count` e `skipped_count` entram no guard; `DROP FUNCTION increment_talkx_template_use(uuid)` com o front deixando de chamá-la no mesmo PR (aplicar após o deploy do front); RPC `log_talkx_campaign_checklist(p_campaign_id, p_items jsonb)` grava o evento `checklist` com ator; RPC `duplicate_talkx_campaign(p_campaign_id)` cria rascunho copiando mensagem, mídia, segmentos, limites e janela, sem destinatários nem agendamento; RPC `delete_talkx_campaign(p_campaign_id)` aceita `draft` e `scheduled` sem envio; a policy de INSERT de eventos para `authenticated` fica limitada a `note|checklist|segments_reviewed`.
- **Aceite:** novo `scripts/db-audit/talkx-counters-integrity.test.sh`: UPDATE direto de `replied_count` como `authenticated` → erro; 2 suprimidos no claim → `skipped_count=2`; lançar com template → `use_count` +1 exato; duplicar devolve rascunho com `total_recipients=0`; excluir campanha `sending` → erro; `authenticated` inserindo evento `started` → negado. `grep -r increment_talkx_template_use src/` = 0 fora de `types.ts` regenerado.
- **V3:** V15, V36 (checklist), V43 (duplicar/excluir)
- **Negócio:** os números do topo batem com a lista, e duplicar ou excluir campanha passa a funcionar de verdade.

### X027 · Registrar lidas, respostas e tempo de resposta no banco

- **Fase:** 3 · **Tela:** 01, 07, 11, 12, 13, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-016, CAP-017, CAP-018, CAP-019, CAP-020, CAP-099, CAP-110
- **Hoje:** `talkx_recipients` não tem `read_at` (`supabase/schema-catalog.json`); `record_talkx_recipient_delivered` só trata entrega (`M:20260912110000:113-160`); a resposta é atribuída na edge com 72 h fixas e só por `contact_id` (`reply:13,48-57`); `talkx_settings.reply_window_hours` nunca é lido; nenhuma RPC devolve tempo de resposta (`M:20260916190000:56-106`); a lista de colunas do realtime é fixa (`M:20260927420000:9-36`).
- **Fazer:** Migration: `talkx_recipients.read_at` e `talkx_campaigns.read_count int not null default 0` (no guard). RPC `record_talkx_recipient_receipt(p_external_id, p_connection_id, p_event)` com `delivered|read`: `read` preenche `delivered_at` se estiver vazio e cada contador sobe uma única vez; `record_talkx_recipient_delivered` vira invólucro dela. RPC `attribute_talkx_reply(p_contact_id, p_phone, p_message_id)` (`service_role`): lê `reply_window_hours`, procura o destinatário mais recente por `contact_id` ou por telefone normalizado (cobre contato LID ou duplicado) e grava `replied_at`/`reply_message_id`. RPC `talkx_campaign_reply_stats(p_campaign_id)` (admin/supervisor): `replied`, `avg_reply_seconds`, `median_reply_seconds`. Recriar a publicação de `talkx_recipients` incluindo `read_at`. Índice parcial `(contact_id, sent_at desc) where replied_at is null`.
- **Aceite:** novo `scripts/db-audit/talkx-receipts-replies.test.sh`: `read` sem `delivered` → `delivered_at` e `read_at` preenchidos, `delivered_count=1`, `read_count=1`; repetir o evento → contadores iguais; resposta vinda do mesmo telefone com outro `contact_id` é atribuída; setting 48 → resposta com 60 h não atribui; fixture com respostas em 120 s e 202 s → `avg_reply_seconds=161`. `pg_publication_tables` lista `read_at`.
- **V3:** V17, V18
- **Negócio:** aparecem "Lidas", "Respostas" e "Tempo médio de resposta" com número real.

### X028 · Ligar o webhook aos recibos de leitura e à atribuição de resposta

- **Fase:** 3 · **Tela:** 07, 11, 12, 14 · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X027
- **Fecha:** CAP-016, CAP-017, CAP-018
- **Hoje:** só `DELIVERY_ACK` com `fromMe === true` chama o Talk X (`wh-upd:117-126`); `READ`/`PLAYED` atualizam só `messages` (`wh-upd:82-84`). No GO, `fromMe` é inferido por `Chat === Sender` (`go-adapter:181-182`), nunca exercido com o Talk X — se a inferência falhar, entregues ficam em zero. A resposta é atribuída com `void`, sem aguardar (`wh-msg:329-334`). Não há teste Deno desses caminhos.
- **Fazer:** Em `handleMessagesUpdate`, chamar `record_talkx_recipient_receipt` para `delivered` e `read` sempre que houver `connection.id`, sem depender de `fromMe` — o casamento é pelo `external_id` do destinatário naquela conexão, que só existe para mensagem nossa; manter o log quando não casa. Em `wh-msg`, trocar `attributeTalkXReply` por `await` da RPC `attribute_talkx_reply` com o telefone resolvido. Criar `_shared/__tests__/talkx-webhook-receipts.test.ts` e `talkx-webhook-reply.test.ts` com payloads GO anonimizados em fixture.
- **Aceite:** Deno: recibo GO `read` com `Chat !== Sender` → RPC chamada com `p_event='read'`; `delivered` repetido → sem erro; resposta de contato → o handler só resolve depois da RPC; mensagem de opt-out não chama a atribuição. Em produção, após o deploy: envio de teste interno lido no celular deixa `read_at` preenchido em `talkx_recipients` (repetido no X035).
- **V3:** V17, V18 (lacunas: READ sem ACK, heurística do GO, `void` sem await)
- **Negócio:** "entregue" e "lida" deixam de ficar em zero por causa de um detalhe do provedor.

### X029 · Tornar o opt-out configurável e ligado à campanha no banco

- **Fase:** 3 · **Tela:** 06, 10, 11, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-023, CAP-024, CAP-026, CAP-031
- **Hoje:** as palavras são uma regex fixa, sem "pare" nem "remover" (`reply:29-30`) — e "PARE" é o texto do próprio seed de autoresposta (`M:20260930410000:35`). `talkx_suppress_contact` não recebe campanha (`M:20260930330000:20-27,40-47`). O índice único ativo ignora `expires_at` (`M:20260930160000:24-26`): opt-out novo sobre supressão expirada cai no `on conflict do nothing`.
- **Fazer:** Migration: tabela `talkx_optout_keywords(keyword pk, match_mode check in ('exact','contains'), active, created_by, created_at)` semeada com `sair, parar, pare, stop, cancelar, remover, descadastrar, unsubscribe, optout, nao quero` (todas `exact`), com leitura para admin/supervisor e escrita para admin; função `talkx_match_optout(p_text)` (normaliza acento, caixa e pontuação; devolve a palavra ou nulo); `talkx_suppress_contact` ganha `p_campaign_id uuid default null` e, quando nulo com origem `auto_optout`, usa a campanha do envio mais recente ao contato; se a supressão ativa estiver expirada, encerra-a e cria a nova na mesma transação; `UPDATE` do seed `optout_autoreply` para o texto de confirmação hoje fixo em `wh-msg:309`, só se o valor ainda for o original; view `talkx_campaign_optouts` (`security_invoker`) com a contagem por campanha.
- **Aceite:** novo `scripts/db-audit/talkx-optout.test.sh`: "PARE", "Páre!" e "remover" casam; "quero parar de receber" não casa em `exact` e casa com palavra `contains`; opt-out após supressão expirada cria linha ativa nova; `campaign_id` preenchido com a campanha do último envio. `talkx-suppress-phone-axis.test.sh` ajustado à nova assinatura.
- **V3:** V78
- **Negócio:** quem responde "PARE" ou "remover" sai da lista, e o relatório mostra de qual campanha veio o pedido.

### X030 · Usar palavras, autoresposta e campanha do opt-out no webhook

- **Fase:** 3 · **Tela:** 06, 11 · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X028, X029
- **Fecha:** CAP-022, CAP-023, CAP-024, CAP-026, CAP-110
- **Hoje:** o webhook usa `TALKX_OPT_OUT_RE.test(content)` (`wh-msg:282`), só para texto e só se houve envio Talk X ao contato em 30 dias (`wh-msg:286-291`); a autoresposta é um texto fixo enviado com o token global (`wh-msg:303-311`); o caminho não tem teste.
- **Fazer:** Carregar as palavras ativas com cache de 5 min e casar pela mesma normalização de `talkx_match_optout` (na dúvida, a RPC decide); aceitar também resposta de botão/lista com id `talkx_optout` (X064); gravar a palavra usada em `reason` e deixar a RPC resolver a campanha; a autoresposta lê `talkx_settings.optout_autoreply` e sai pelo token da instância que recebeu a mensagem; manter o limite de 30 dias e a exclusão da atribuição de resposta para a mesma mensagem. Remover `TALKX_OPT_OUT_RE` e o que sobrar de `reply`.
- **Aceite:** novo `_shared/__tests__/talkx-webhook-optout.test.ts`: "PARE" → `talkx_suppress_contact` chamada 1 vez e autoresposta com o texto do setting; repetição → sem segunda autoresposta; contato sem envio em 30 dias → nada; a mensagem de opt-out não chama `attribute_talkx_reply`. Em produção, após o deploy: número interno responde "SAIR" e aparece em `talkx_blacklist` com `campaign_id` (conferido no X035).
- **V3:** V78
- **Negócio:** o pedido de saída do cliente é respeitado com as palavras que ele realmente usa.

### X031 · Criar reenvio manual e resolução de `outcome_unknown` por RPC, com trilha

- **Fase:** 3 · **Tela:** 11, 12, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X012, X024
- **Fecha:** CAP-047, CAP-048, CAP-049
- **Hoje:** a edge só aceita `test|start|pause|cancel` (`send:150,221,233-235`); `outcome_unknown` é terminal e sem ação (`M:20260911190000:67-115`); o retry automático só cobre erro anterior ao POST (`M:20260916210000:85-133`).
- **Fazer:** Migration: coluna `talkx_recipients.manual_retry_count smallint not null default 0`. RPC `retry_talkx_recipients(p_campaign_id, p_recipient_ids uuid[])` (admin/supervisor): aceita `failed` e `skipped` por variável ou telefone, até 3 reenvios manuais por destinatário, revalida supressão e elegibilidade, devolve para `pending` com `retry_after = now()`, ajusta os contadores e grava evento com ator e quantidade; se a campanha está `completed`, reabre para `sending` com evento `resumed` — o tick continua o envio, sem edge nova. RPC `resolve_talkx_outcome_unknown(p_recipient_id, p_resolution, p_note, p_confirm_duplicate_risk)` com `mark_sent|mark_failed|retry`; `retry` exige a confirmação explícita de risco de mensagem em dobro; move o contador de `outcome_unknown_count` para o destino e grava evento com ator. Registrar em `docs/talkx/OPERACAO.md` que não há reconciliação automática sem id do provedor.
- **Aceite:** novo `scripts/db-audit/talkx-retry-resolve.test.sh`: `failed` → retry → `pending` e `failed_count` −1; 4º retry manual → erro; contato suprimido entre a falha e o retry → recusado; campanha `completed` reabre e gera evento; `mark_sent` move o contador; `retry` sem confirmação → erro; agente → `42501`. `talkx-delivery-leases-contract.test.mjs:40-45` continua verdadeiro (o retorno é manual, nunca automático).
- **V3:** V19
- **Negócio:** dá para reenviar para quem falhou e decidir o que fazer com envio de resultado incerto, com registro de quem decidiu.

### X032 · Aplicar LGPD no motor: consentimento no lançamento e expurgo por prazo

- **Fase:** 3 · **Tela:** 03, 09 · **Camada:** banco + cron · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X012, X016, X024, X029
- **Fecha:** CAP-104, CAP-105, CAP-106
- **Hoje:** `contacts.consent_status` é `unknown` em todos os contatos (contexto); a confirmação de consentimento é um checkbox que não é gravado (`src/components/talkx/TalkXWizardDelivery.tsx:232`); o envio não consulta consentimento; não há expurgo — o comentário "job de limpeza (E89+)" nunca virou job (`M:20260910080000:6-8`); `personalized_message` e `talkx_link_clicks.ua/ip_hash` ficam guardados sem prazo.
- **Fazer:** Migration: `talkx_campaigns.consent_confirmed_by`, `consent_confirmed_at` e `legal_basis` (`consent|legitimate_interest|contract`), gravados por `save_talkx_campaign_draft`; agendar e `start` recusam campanha sem a confirmação; `talkx_audience_query` exclui sempre `consent_status='revoked'` e, com o setting `require_granted_consent` ligado (padrão desligado), exige `granted`; o opt-out automático marca o contato como `revoked`. Retenção: settings `retention_days_message` (180), `retention_days_clicks` (365), `retention_days_test_sends` (90), `retention_days_ai` (90); função `purge_talkx_expired_data(p_limit)` chamada pelo tick uma vez por dia (controle em `last_purge_at`): anula texto e snapshots de mídia de destinatários de campanhas terminais vencidas, limpa `ua`/`ip_hash`, apaga linhas vencidas de teste e de IA e objetos de `talkx-media` sem referência, gravando evento com as contagens. Nunca apaga `talkx_blacklist`, contadores nem eventos.
- **Aceite:** novo `scripts/db-audit/talkx-lgpd.test.sh`: contato `revoked` fora da audiência; `start` sem `consent_confirmed_at` → erro; opt-out automático deixa `consent_status='revoked'`; destinatário de campanha concluída há 181 dias → `personalized_message` nulo com contadores intactos; segunda execução no mesmo dia → 0 linhas afetadas; blacklist intacta.
- **V3:** V21 (`confirm_consent`)
- **Negócio:** quem pediu para sair nunca volta a entrar em audiência, e textos pessoais antigos são apagados no prazo definido.

### X033 · Criar log por destinatário, visão de saúde do motor e alertas

- **Fase:** 3 · **Tela:** 12, 14 · **Camada:** banco + edge + cron · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X012, X019, X032
- **Fecha:** CAP-100, CAP-101
- **Hoje:** o `Logger` grava `fn/rid/ms`, sem campanha, destinatário ou tentativa (`supabase/functions/_shared/validation.ts:25-63`); webhook e `reply` usam `console.warn` solto (`reply:71-76`); não há alerta do Talk X (grep `talkx` em `.github/workflows` só acha testes); o resultado do cron só existe em `cron.job_run_details` e `net._http_response`.
- **Fazer:** Migration: tabela `talkx_delivery_log(id, campaign_id, recipient_id, attempt, stage, outcome, http_status, error_code, worker_id, duration_ms, created_at)` — escrita `service_role`, leitura admin/supervisor, sem telefone nem texto, expurgo em 30 dias pelo `purge_talkx_expired_data`; RPC `talkx_campaign_logs(p_campaign_id, p_after, p_limit)`; view `talkx_engine_health` (`security_invoker`): campanha `sending` sem envio novo há mais de 15 min com janela aberta, destinatário `sending` com lease vencido, `outcome_unknown` em 24 h, taxa de falha em 15 min, últimas 60 execuções do cron por status e `return_message`; tabela `talkx_alerts(kind, campaign_id, payload, opened_at, resolved_at)` e função `talkx_engine_alerts()` chamada pelo tick a cada 5 min, com deduplicação por tipo e campanha e fechamento automático. Edge: `talkx-send` grava as etapas de cada destinatário em lote ao fim da passada e inclui `campaign_id/recipient_id/attempt` no `Logger`. Fluxo N8N `talkx-alerts` (export em `docs/talkx/n8n/`) lê alertas abertos e avisa o grupo interno; seção "Alertas e o que fazer" em `docs/talkx/OPERACAO.md`.
- **Aceite:** novo `scripts/db-audit/talkx-engine-health.test.sh`: campanha parada há 20 min → 1 alerta `stalled_campaign`; segunda chamada não duplica; envio novo → `resolved_at` preenchido; cron com 3 `job startup timeout` seguidos → alerta `cron_degraded`. Deno: lote de 3 destinatários grava ao menos 3 linhas de log, nenhuma com telefone. Alerta de fixture recebido no WhatsApp interno, print em `docs/talkx/recovery/evidence/X033/`. Vale após o deploy.
- **V3:** V85, V19 (campos do logger)
- **Negócio:** se uma campanha travar, a equipe é avisada em minutos e consegue ver o que aconteceu com cada contato.

### X034 · Cobrir o motor com provedor falso: integração multi-destinatário e E2E de lançamento

- **Fase:** 3 · **Tela:** 08, 09, 11 · **Camada:** testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X010, X011, X012, X013, X014, X015, X016, X017, X018, X019, X020, X023, X024, X025, X026, X031
- **Fecha:** CAP-007, CAP-096, CAP-102
- **Hoje:** não existe stub da Evolution para E2E (0 `page.route`/MSW em `e2e/`) e nenhum spec lança campanha — `e2e/talkx.spec.ts` tem 7 testes de navegação. Os testes Deno do envio usam Supabase, RPCs e `fetch` falsos, 1 destinatário (`talkx-send/_test-utils.ts:64-166`): nenhum exercita o banco de verdade junto com o loop. Pausar e retomar com o worker antigo ainda vivo é a ressalva de CAP-102.
- **Fazer:** (a) `supabase/functions/_shared/__tests__/fake-evolution.ts`: servidor HTTP local com os modos `ok`, `500`, `timeout`, `sem id` e `400 interativo`, que registra cada POST recebido; (b) `supabase/functions/talkx-send/engine.integration.test.ts` contra Postgres descartável com as migrations aplicadas e PostgREST local (mesmo arranjo de `scripts/db-audit/talkx-transition-postgrest.test.ts`): 60 destinatários em 3 invocações `continue`; morte simulada entre `mark_talkx_recipient_dispatch_started` e `record_talkx_recipient_sent` seguida do sweep; pausa e retomada com o worker antigo vivo; suprimido no meio; limite diário; cancelamento no meio; agente tentando agendar; (c) `e2e/talkx-launch.spec.ts` com `page.route` interceptando `**/functions/v1/talkx-send` e as leituras da campanha por fixtures em `e2e/fixtures/talkx-launch/`: lançar → corpo `{action:'start'}` → ida ao monitor → pausar com motivo → retomar → cancelar; o spec falha se qualquer chamada a `talkx-send` sair do navegador sem passar pelo stub; entra em `.github/workflows/e2e-talkx-pr.yml`; (d) atualizar `e2e/README.md`.
- **Aceite:** integração verde no CI em menos de 3 min, com a asserção final: 0 telefone repetido no provedor falso e `sent + failed + skipped + outcome_unknown + cancelled = 60`; `e2e/talkx-launch.spec.ts` verde nos browsers do workflow; nenhuma mensagem real enviada (o provedor de produção não é endereçado por nenhum dos dois).
- **V3:** V95
- **Negócio:** toda mudança futura no envio é testada automaticamente com dezenas de contatos falsos antes de chegar a um cliente.

### X035 · Executar o ensaio real: campanha interna com ≥ 50 destinatários e queda proposital

- **Fase:** 3 · **Tela:** 10, 11, 12, 13, 14 · **Camada:** testes + docs · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X010, X011, X012, X013, X014, X015, X016, X017, X018, X019, X020, X023, X024, X025, X026, X027, X028, X029, X030, X033
- **Fecha:** CAP-007, CAP-009, CAP-011, CAP-016, CAP-017, CAP-018, CAP-022, CAP-038
- **Dependências, em detalhe:** X010 a X030 no ar (mínimo) ; X023 refeito no dia ; X033 ; decisão N04
- **Hoje:** o motor nunca rodou em produção (0 campanhas, 0 destinatários, 0 eventos). O smoke do V3 (V99) usava 5 contatos, que cabem em uma única invocação e não exercitam continuidade, reaper nem limites.
- **Fazer:** Escrever `docs/talkx/recovery/ENSAIO_MOTOR.md` e executar: (1) preflight do X023 verde no dia; (2) segmento "Ensaio interno" com ao menos 50 números da equipe, com consentimento registrado; (3) campanha com texto, variável, PDF, 2 variantes e 2 segmentos, perfil `slow`, `max_per_minute` 4, agendada para 5 min à frente, fora do horário de atendimento; (4) queda proposital: durante um lote, reimplantar só o `talkx-send` pelo `deploy-functions.yml` (encerra a invocação em curso); (5) para provar o reaper, deixar 1 destinatário de teste com dispatch marcado e lease vencido por SQL documentado no roteiro; (6) pausar com motivo e retomar; (7) números combinados leem, respondem, e um responde "PARE"; (8) cancelar no meio uma segunda campanha de 10 contatos; (9) rodar as consultas de conferência e anexar tudo em `docs/talkx/recovery/evidence/X035/`. Nenhum cliente entra na audiência.
- **Aceite:** consultas com o resultado anexado: `count(distinct external_id)` = número de enviados e nenhum aparelho recebeu em dobro; 5 min após o fim, 0 destinatário em `pending|sending` e campanha `completed` com evento `completed`; depois da queda proposital `sent_at` volta a avançar em até 2 ticks sem ação humana; o destinatário preso vira `outcome_unknown` em até 2 min; `delivered_at` em ≥ 90 % dos enviados; `read_at`, `replied_at` e a linha em `talkx_blacklist` com `campaign_id` nos números que agiram; eventos `scheduled, started, paused (motivo e ator), resumed, completed` em ordem; na campanha cancelada, pendentes = `cancelled`; `talkx_engine_health` sem alerta aberto; envios por minuto ≤ 4 em toda a série. Decisão "segue / não segue" assinada no documento — **é o gate das telas de ciclo de vida (10–14)**.
- **V3:** V99
- **Negócio:** prova, com mensagens reais em aparelhos da equipe, de que a campanha continua sozinha, não duplica e registra tudo, antes de liberar para clientes.
