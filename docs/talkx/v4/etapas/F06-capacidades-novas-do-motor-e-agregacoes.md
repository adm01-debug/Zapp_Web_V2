# Fase 6 — Capacidades novas do motor e agregações (X057–X076)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: motor. 20 etapas.
>
> **Entrega da fase:** Vários segmentos por campanha, recorrência, dias e horário de silêncio, mídia por upload, botões e enquete, A/B completo, aprovação de template, previsões, números de visão geral e analytics calculados no servidor, base de IA.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de motor, segurança e operação** (etapas X057, X058, X059, X060, X061, X062, X063, X064, X065, X066, X067, X068, X069, X076)

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

**Trilha de supressão e analytics** (etapas X070, X071, X072, X073, X074, X075)

Base: `main` `3d09433` (2026-10-01). Mocks: `docs/talkx/references/06_Lista_de_Supressao.png`, `07_Analytics.png`.

**Abreviações de arquivo**
**SUP** = `src/components/talkx/TalkXSuppression.tsx` · **HSUP** = `src/hooks/integrations/useTalkXSuppression.ts` ·
**ANA** = `src/components/talkx/TalkXAnalytics.tsx` · **INS** = `src/hooks/integrations/useTalkXInsights.ts` ·
**VIEW** = `src/components/talkx/TalkXView.tsx` · **SH** = `src/components/talkx/talkxShared.tsx` ·
**M:<versão>** = `supabase/migrations/<versão>_*.sql` · **CT** = `scripts/db-audit/talkx-analytics-contract.test.mjs`.

**Convenções que valem para todas as etapas com DDL desta trilha** (não repetidas em cada uma)
- Versão da migration reservada com `supabase_migrations.reserve_migration_version`; ordem arquivo → PR → merge → apply
  por `db_query` com o `INSERT` no ledger na mesma transação (`register-migration.mjs`); `supabase/schema-catalog.json`
  e `types.ts` regenerados; `supabase-usage-guard.mjs` com `novas: 0`.
- Teste SQL novo roda em Postgres descartável e é registrado em `.github/workflows/db-guard.yml` (mesmo padrão das
  linhas 344 e 410).
- Função nova: `REVOKE ALL … FROM PUBLIC, anon` e `GRANT EXECUTE … TO authenticated, service_role` explícitos.
- Etapa de tela só fecha com o print 1672×941 ao lado do mock (régua, X004).

Ordem de execução: X007 (não depende de nada e remove uma quebra) → X070…X184 (tela 06: banco, depois tela) →
X072…X188 (tela 07: banco, depois tela).

---

## Etapas

### X057 · Permitir vários segmentos por campanha e gravar o segmento de cada destinatário

- **Fase:** 6 · **Tela:** 09, 11, 12, 13, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X017
- **Fecha:** CAP-012, CAP-014, CAP-099
- **Hoje:** `talkx_campaigns.segment_id` é único (`M:20260908120000:70`) e a RPC de rascunho exige exatamente 1 segmento quando a origem é segmento (`M:20260912130000:108-109`); `talkx_recipients` não tem `segment_id` (`supabase/schema-catalog.json`); `talkx_campaign_segments` não existe (grep em `supabase/` = 0); o V3 deixou o tema em backlog (V100).
- **Fazer:** Migration: tabela `talkx_campaign_segments(campaign_id, segment_id, position smallint, status check in ('pending','sending','paused','done'), paused_at, primary key (campaign_id, segment_id))` com a mesma RLS de campanhas; `talkx_recipients.segment_id uuid` e índice `(campaign_id, segment_id, status)`; `save_talkx_campaign_draft` aceita `segment_ids uuid[]` (1 a 10, na ordem de `position`), mantendo `segment_id` = primeiro por compatibilidade; `snapshot_talkx_campaign_audience` resolve os segmentos na ordem e grava em cada destinatário o primeiro segmento que casou, sem duplicar contato; backfill de 1 linha para campanha existente; publicação realtime de `talkx_recipients` recriada com `segment_id` e `talkx_campaign_segments` publicada.
- **Aceite:** novo `scripts/db-audit/talkx-campaign-segments.test.sh`: 3 segmentos com 10, 8 e 5 contatos e 4 repetidos → 19 destinatários, cada um com o `segment_id` do primeiro segmento que o contém; 11 segmentos → `22023`; campanha antiga com `segment_id` ganha 1 linha na tabela nova. `talkx-draft-save.test.sh` ajustado.
- **V3:** V100 (item de backlog "multi-segmento")
- **Negócio:** uma campanha pode usar vários segmentos e cada contato aparece com o segmento de origem.
- **Entregue parcialmente em 02/10 (X057a):** a parte **estrutural** entrou — `talkx_campaign_segments` com a RLS espelhada de campanhas, `talkx_recipients.segment_id` + índice `(campaign_id, segment_id, status)`, backfill de 1 linha por campanha existente com segmento, e realtime das duas tabelas. A parte de **comportamento (X057b)** ficou para sessão com contexto dedicado: `save_talkx_campaign_draft` aceitando `segment_ids` e `snapshot_talkx_campaign_audience` resolvendo os segmentos em ordem. São duas RPCs `SECURITY DEFINER` que formam o **motor de audiência do disparo** — não cabem como continuação de contexto já gasto — e vão junto com o harness que prova os números deste aceite (19 destinatários / `22023`).
- **Correção de base para quem pegar a X057b:** o corpo de `save_talkx_campaign_draft` **não** está em `M:20260912130000` — a última redefinição é `M:20261002551230_talkx_limits_ritmo.sql`. `snapshot_talkx_campaign_audience` está só em `M:20261002421230_talkx_audience_snapshot.sql:357` (o trecho que resolve o segmento único é o `:421`, hoje via `talkx_segments.rules`).

### X058 · Expor fila por segmento, ordem de envio e lista paginada de destinatários

- **Fase:** 6 · **Tela:** 11, 12, 13, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X056, X057
- **Fecha:** CAP-013, CAP-015, CAP-103
- **Dependências, em detalhe:** X057 ; `dados:origem` (a trilha de dados, relatório e importação popula a origem do contato; hoje `contacts.lead_origin` tem 0 preenchidos)
- **Hoje:** o monitor lê destinatários com `.limit(2000)` (`src/hooks/integrations/useTalkXMonitor.ts:46`); a ordem de envio é só `created_at` (`send:289`); não há RPC de progresso por segmento; a origem do contato não é selecionada no envio (`send:284`).
- **Fazer:** Migration: RPC `talkx_campaign_segment_queue(p_campaign_id)` — por segmento: total, enviadas, entregues, falhas, puladas, restantes, percentual e status; RPC `talkx_campaign_recipients(p_campaign_id, p_filters jsonb, p_limit, p_after)` com keyset e filtros por status, segmento, variante e busca, devolvendo nome, telefone mascarado, segmento, origem (nulo quando vazia), status, tentativas, horários e erro; RPC `set_talkx_campaign_segment_state(p_campaign_id, p_segment_id, p_action)` (`pause|resume`) com evento e ator; `talkx_next_recipients` (X010) passa a ordenar por `position` do segmento e a pular segmento `paused` — a edge não muda; o status de cada segmento passa a `sending`/`done` conforme a fila.
- **Aceite:** novo `scripts/db-audit/talkx-segment-queue.test.sh`: campanha com segmentos de 6 e 4 → `talkx_next_recipients(…, 5)` devolve só o segmento 1; com o segmento 1 pausado devolve o 2; `restantes` da fila bate com a contagem direta; 25 destinatários paginados de 10 em 10 → 3 páginas sem repetição; agente → `42501`.
- **V3:** V33, V34, V35 (fonte de dados dessas telas)
- **Negócio:** o monitor mostra o andamento por segmento e a lista completa de destinatários, sem corte em 2.000.

### X059 · Gerar a próxima ocorrência de campanha recorrente no tick, com chave única

- **Fase:** 6 · **Tela:** 10 · **Camada:** banco + cron · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X012, X017, X024
- **Fecha:** CAP-052
- **Hoje:** não há coluna de recorrência (grep `recurrence` em `supabase/` = 0) e o scheduler não clona nada. O V3 previa o clone no scheduler sem chave de idempotência — dois ticks simultâneos criariam duas campanhas.
- **Fazer:** Migration: `talkx_campaigns.recurrence jsonb` (`type` `none|daily|weekly|monthly|custom`, `interval`, `weekdays`, `until`, `max_occurrences`, validado por função em CHECK), `parent_campaign_id`, `occurrence_index` e índice único `(parent_campaign_id, occurrence_index)`; função `talkx_next_occurrence(p_recurrence, p_after, p_tz)` com virada de horário pelo fuso; função `spawn_talkx_recurrences()` chamada pelo tick: para campanha `completed` com recorrência ativa e sem filha da próxima ocorrência, cria a filha `scheduled` copiando configuração e segmentos, com `on conflict do nothing`; a filha nasce com `audience_snapshot_at` nulo e o tick refaz o snapshot de audiência imediatamente antes do `start`; RPC `stop_talkx_recurrence(p_campaign_id)` com evento; `save_talkx_campaign_draft` aceita `recurrence`; o trigger exige `scheduled_at` ao menos 2 min no futuro.
- **Aceite:** novo `scripts/db-audit/talkx-recurrence.test.sh`: diária concluída → 1 filha agendada para o dia seguinte no mesmo horário local; duas chamadas concorrentes de `spawn_talkx_recurrences` → 1 filha; `until` vencido → nenhuma; semanal segunda/quarta concluída na quarta → próxima segunda; série parada não gera filha; a filha tem destinatários recalculados, não copiados.
- **V3:** V30 (lacuna: idempotência do clone)
- **Negócio:** dá para programar campanha que se repete todo dia ou toda semana, com o público atualizado a cada rodada.

### X060 · Aplicar dias da semana, não perturbe e horário comercial configurável na janela de envio

- **Fase:** 6 · **Tela:** 10, 12 · **Camada:** banco + edge · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X018, X019
- **Fecha:** CAP-040, CAP-041, CAP-042, CAP-110
- **Hoje:** o horário comercial é fixo, 08–18 de segunda a sexta (`window:82-84`); `talkx_settings.business_hours` está semeado com `start/end/days` e ninguém lê (`M:20260930410000:39`); não há coluna de dias da semana; não há regra de não perturbe (grep `dnd` em `talkx-*` = 0); nenhuma função em `supabase/functions` lê `talkx_settings` (grep = 0).
- **Fazer:** Migration: `talkx_campaigns.send_weekdays smallint[]` (0–6; nulo = todos) e `respect_dnd boolean not null default true`; setting `dnd_hours` (`start`, `end`, `sundays`, `holidays[]`); `save_talkx_campaign_draft` e `update_talkx_campaign_limits` aceitam os dois campos; função `talkx_campaign_window_open(p_campaign_id, p_at)` com a mesma regra, para o tick e as previsões. Edge: novo `_shared/talkx-settings.ts` — leitor único das chaves de `talkx_settings`, com cache de 5 min; `deliveryWindowStatus` recebe `business_hours` e `dnd_hours` e passa a recusar por `outside_weekdays` e `dnd`; `pauseReasonForWindow` mapeia para `send_weekdays` e `dnd`, ambos em `AUTO_RESUME_REASONS`. Aplicar a migration antes do deploy (é aditiva).
- **Aceite:** novo `_shared/__tests__/talkx-window.test.ts`: sábado com `send_weekdays=[1..5]` → recusado; 22:00 com DND → recusado e 09:00 → aceito; `business_hours` 09–17 muda o resultado das 08:30; `talkx-resume-policy.test.ts` com os 2 motivos novos. Novo `scripts/db-audit/talkx-window-sql-parity.test.sh`: 8 instantes fixos com o mesmo veredito da função TypeScript. `talkx-schedule-timezone-contract.test.mjs` ajustado. Vale após o deploy.
- **V3:** V20 (lacunas: dias da semana e DND)
- **Negócio:** a campanha só envia nos dias e horários definidos pela empresa, e nunca de madrugada.

### X061 · Criar o bucket privado `talkx-media` e aceitar caminho de mídia nas RPCs

- **Fase:** 6 · **Tela:** 04, 05, 08, 10 · **Camada:** storage + banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014
- **Fecha:** CAP-059
- **Hoje:** o bucket não existe (contexto: há `whatsapp-media`, `audio-messages`, `team-chat-files`, `avatars`); a RPC de rascunho só aceita `^https://` (`M:20260912130000:113`); não há upload no módulo (grep `.upload(` em `src/components/talkx` = 0); o nome do arquivo não é guardado em lugar nenhum.
- **Fazer:** Migration: bucket `talkx-media` privado, limite 16 MB, tipos `image/jpeg|png|webp`, `video/mp4`, `application/pdf`, docx/xlsx, `audio/ogg|mpeg|mp4`; policies em `storage.objects` — INSERT/SELECT/DELETE para admin/supervisor no prefixo `<profile_id>/`; colunas `media_file_name` e `media_size_bytes` em `talkx_campaigns`, `talkx_templates` e `talkx_template_variants`, e `media_file_name_snapshot` em `talkx_recipients`; `save_talkx_campaign_draft`, as RPCs de template e os CHECKs passam a aceitar `^https://` ou `^talkx-media/<uuid>/<arquivo>$`, conferindo que o objeto existe; `persist_talkx_recipient_message_snapshot` grava o nome do arquivo. O upload na tela é etapa de outro bloco; aqui fica o contrato.
- **Aceite:** novo `scripts/db-audit/talkx-media-bucket.test.sh`: bucket com `file_size_limit=16777216` e a lista de tipos; agente não insere objeto; supervisor insere só no próprio prefixo; caminho inexistente no rascunho → `22023`; `https://` continua aceito. `talkx-message-snapshot.test.sh` ajustado com `media_file_name_snapshot`.
- **V3:** V27
- **Negócio:** imagem, vídeo, PDF e áudio da campanha passam a ficar guardados no próprio sistema, com limite de 16 MB.

### X062 · Assinar a mídia do bucket no envio e mandar documento com nome de arquivo

- **Fase:** 6 · **Tela:** 04, 05, 08, 10 · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X019, X061
- **Fecha:** CAP-058
- **Hoje:** `resolvePrivateBucketUrl` só reconhece `whatsapp-media` e `audio-messages`, com validade de 300 s (`proxy:287-301`); o documento vai sem `fileName` (`send:655-657`), embora a rota GO aceite `filename` (`go-routes:75`); o envio de teste não assina mídia privada (`send:182-191`), então o teste falha onde o envio real funcionaria.
- **Fazer:** `talkx-send` passa a lista `whatsapp-media`, `audio-messages`, `talkx-media` e aceita a referência `talkx-media/<caminho>` além de URL completa; mantém a reassinatura a cada 240 s; envia `fileName` do snapshot para `document`; `action=test` usa o mesmo resolvedor. Falha de assinatura é erro anterior ao POST (entra no backoff existente) — nunca envio sem a mídia.
- **Aceite:** Deno: mídia `talkx-media/…/catalogo.pdf` → corpo enviado ao provedor com URL assinada e `filename: 'catalogo.pdf'`; assinatura falha → `reschedule_talkx_recipient` chamado e 0 POST; `test` com mídia privada → 200. Em produção, após o deploy: PDF de teste chega com o nome correto em número interno (o X035 repete com os 4 tipos).
- **V3:** V27 (lacunas: lista fixa de buckets, nome do documento, assinatura no teste)
- **Negócio:** o PDF chega ao cliente com o nome certo, e o envio de teste mostra a mídia igual ao envio real.

### X063 · Modelar mensagem interativa (botões, lista, enquete) em template e campanha

- **Fase:** 6 · **Tela:** 04, 05, 09 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014
- **Fecha:** CAP-060
- **Hoje:** o transporte existe (`go-routes:109-125`: `sendPoll`, `sendList`, `sendButtons`), mas template, variante e campanha não têm coluna para isso, e o envio só usa texto, mídia e áudio (`send:653-667`).
- **Fazer:** Migration: coluna `interactive jsonb` em `talkx_templates`, `talkx_template_variants`, `talkx_template_versions` e `talkx_campaigns`, e `interactive_snapshot jsonb` em `talkx_recipients`; função `talkx_validate_interactive(jsonb)` usada em CHECK — botões (1 a 3, rótulo até 20, tipo `reply|url`), lista (até 10 linhas, título até 24, descrição até 72), enquete (2 a 12 opções), sempre com `fallback_text` obrigatório; as RPCs de template, rascunho e snapshot aceitam o campo; tabela `talkx_interactive_responses(recipient_id, campaign_id, option_id, option_label, message_id, created_at)` com leitura para dono/admin; id reservado `talkx_optout` documentado.
- **Aceite:** novo `scripts/db-audit/talkx-interactive-schema.test.sh`: 4 botões → rejeitado; lista com 11 linhas → rejeitada; sem `fallback_text` → rejeitado; o snapshot copia o JSON para o destinatário; a versão do template guarda `interactive` (`talkx-template-history-behavior.test.sh` ajustado).
- **V3:** — (lacuna 6 do V3)
- **Negócio:** template e campanha passam a guardar botões, lista de opções e enquete.

### X064 · Enviar mensagem interativa com fallback em texto e registrar a resposta

- **Fase:** 6 · **Tela:** 04, 05, 09 · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X028, X030, X063
- **Fecha:** CAP-060
- **Hoje:** `send` nunca chama as rotas interativas (`send:653-667`); o webhook não liga resposta de botão ou voto de enquete ao Talk X. A conexão é Evolution GO, não a API oficial: não há garantia de que o aparelho renderize (diretriz A7).
- **Fazer:** `talkx-send`: quando o snapshot tem `interactive`, chamar `sendButtons`/`sendList`/`sendPoll` com o token da instância; erro 4xx do provedor para tipo interativo → uma única nova tentativa como texto (`fallback_text` mais os links numerados), registrada como `interactive_fallback` e sem contar como falha; setting `interactive_mode` (`native|fallback_only`, padrão `fallback_only` até o aceite real). Webhook: resposta de botão, lista ou voto cujo contexto aponta para o `external_id` de um destinatário grava em `talkx_interactive_responses` e conta como resposta; o id `talkx_optout` aciona o opt-out.
- **Aceite:** Deno: snapshot com 2 botões → POST na rota de botões com os rótulos; 400 do provedor → segundo POST de texto com o fallback e `record_talkx_recipient_sent`; `fallback_only` → só texto; voto de enquete → 1 linha em `talkx_interactive_responses`. **Envio real (A7):** botões, lista e enquete para 2 números internos (Android e iPhone); evidência em `docs/talkx/recovery/evidence/X064/` com print de cada aparelho e as linhas de `talkx_recipients` e `talkx_interactive_responses`; `interactive_mode` só muda para `native` nos tipos que renderizaram nos dois.
- **V3:** — (lacuna 6 do V3)
- **Negócio:** o cliente recebe botão ou enquete quando o aparelho mostra; quando não mostra, recebe o texto com o link.

### X065 · Fechar o A/B no banco: pesos, atribuição estável, métrica por variante e vencedor

- **Fase:** 6 · **Tela:** 05, 14, 17 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X017, X020, X027
- **Fecha:** CAP-069, CAP-070, CAP-071
- **Hoje:** os pesos não têm soma obrigatória (`M:20260909150000:11`); a variante é escolhida na hora do envio (`send:500-502`), então a tela não sabe a divisão antes de enviar; `by_variant` devolve só `recipients` e `sent` (`M:20260916190000:90-98`); não existe conceito de vencedor (grep `winner|vencedor` em `supabase/` = 0).
- **Fazer:** Migration: trigger de constraint deferida exigindo soma dos pesos = 100 por template com variantes; colunas `talkx_campaigns.ab_enabled`, `ab_metric` (`reply_rate|click_rate|delivery_rate`), `ab_min_sample int default 50`, `ab_winner_variant_id`, `ab_winner_decided_at`, `ab_winner_decided_by`; `snapshot_talkx_campaign_audience` atribui `variant_id` por hash estável do destinatário contra a faixa de pesos quando `ab_enabled` — a edge já respeita a variante gravada (`send:480-499`); RPC `talkx_campaign_variant_stats(p_campaign_id)` com destinatários, enviadas, entregues, lidas, respostas, cliques e taxas por variante; RPC `decide_talkx_ab_winner(p_campaign_id, p_variant_id default null)` — automática só com amostra ≥ `ab_min_sample` por variante e diferença ≥ 2 erros-padrão (senão devolve `insufficient_data`); manual por admin/supervisor; evento com ator nos dois casos.
- **Aceite:** novo `scripts/db-audit/talkx-ab.test.sh`: pesos 60/30 → commit rejeitado; 1.000 destinatários 70/30 → 700 ± 40 na variante A e a mesma atribuição ao repetir o snapshot; estatística por variante bate com a fixture; vencedor automático com 10 de amostra → `insufficient_data`; decisão manual grava `ab_winner_decided_by`.
- **V3:** V68
- **Negócio:** o teste A/B mostra o resultado de cada versão e só aponta a vencedora quando há dados suficientes.

### X066 · Exigir aprovação interna de template e gravar a versão usada pela campanha

- **Fase:** 6 · **Tela:** 04, 05, 09, 13, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X024, X063
- **Fecha:** CAP-078
- **Hoje:** o status é `draft|review|approved` (`M:20260908120000:48`), mas o próprio dono grava `approved` pela RPC de edição (`M:20260909210000:533-535,592`) e o `start` não confere aprovação (`M:20260916210000:45-59`); a campanha não guarda qual versão do template usou (ressalva de CAP-077).
- **Fazer:** Migration: colunas `submitted_by/at`, `approved_by/at`, `rejected_reason` em `talkx_templates`; status ganha `rejected`; RPCs `submit_talkx_template(p_id)` e `review_talkx_template(p_id, p_decision, p_reason)` — só admin/supervisor e autor diferente de aprovador (há 5 pessoas com papel em produção); a RPC de edição deixa de aceitar `approved` vindo do cliente, e mudança de conteúdo, mídia ou `interactive` em template aprovado volta para `review`; `talkx_campaigns.template_version_id` gravado por `save_talkx_campaign_draft`; `start` e a passagem para `scheduled` recusam template não aprovado (`talkx_template_not_approved`); texto de campanha diferente da versão aprovada segue a decisão N29 (padrão: só admin lança, com evento registrando a diferença). Os 5 templates existentes mantêm o status atual.
- **Aceite:** novo `scripts/db-audit/talkx-template-approval.test.sh`: autor aprova o próprio → erro; outro admin aprova → `approved_by` gravado; editar conteúdo aprovado → `review`; `start` com template em `review` → `talkx_template_not_approved`; a campanha grava `template_version_id`; supervisor lançando texto alterado → erro, admin → sucesso com evento. `talkx-template-history-behavior.test.sh` ajustado.
- **V3:** V66 (versão), V26 (`template_version_id`)
- **Negócio:** nenhuma campanha sai com template que outra pessoa responsável não aprovou.

### X067 · Refazer o envio de teste com trilha, limite, conexão escolhida e mídia assinada

- **Fase:** 6 · **Tela:** 05, 08 · **Camada:** banco + edge · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X019, X020, X062
- **Fecha:** CAP-057
- **Hoje:** `action=test` usa a primeira conexão `connected` que encontrar (`send:165-170`), dados fictícios "Joao Silva" (`send:172`), telefone apenas sem não-dígitos (`send:179`), sem registro, sem limite e sem assinar mídia privada (`send:182-191`).
- **Fazer:** Migration: tabela `talkx_test_sends(id, template_id, campaign_id, connection_id, to_phone, status, provider_message_id, error, created_by, created_at)` — leitura para dono/admin, escrita só `service_role` — e setting `test_send_limit` (5 por 10 min). Edge: `test` exige `connectionId` de conexão `connected` e usa o token da instância; valida o telefone por `^[0-9]{10,15}$`; aceita `sampleContactId` para personalizar com contato real (sem ele, dados de amostra); aplica a política de variáveis do X020 e a assinatura do X062; grava a linha em sucesso e em erro; devolve 429 acima do limite por usuário. Aplicar a migration antes do deploy.
- **Aceite:** novo `scripts/db-audit/talkx-test-sends.test.sh`: agente não lê; `authenticated` não insere. Deno: 6º teste em 10 min → 429 e linha `rate_limited`; telefone `123` → 400; sem `connectionId` → 400; sucesso grava `provider_message_id`. Vale após o deploy.
- **V3:** V67
- **Negócio:** "Testar" e "Ver no celular" enviam pelo número escolhido e ficam registrados, sem permitir abuso.

### X068 · Calcular no servidor ETA, série prevista, sobreposição de segmentos e risco

- **Fase:** 6 · **Tela:** 02, 03, 08, 09, 10, 11 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X016, X018, X060
- **Fecha:** CAP-087, CAP-094
- **Hoje:** a duração é estimada só no cliente (`editor:417-418`); não existe função `talkx_*` de previsão, sobreposição ou risco; com 0 campanhas em produção não há histórico para projetar taxa.
- **Fazer:** Migration: RPC `talkx_campaign_forecast(p_campaign_id)` → `eta_at`, `remaining`, `effective_rate_per_min` (média dos últimos 15 min de `sent_at`; antes do início, taxa nominal do perfil limitada por `max_per_minute` e pelo orçamento diário), série prevista por hora respeitando janela, dias e DND (`talkx_campaign_window_open`), e `projected_delivery_rate`, `projected_reply_rate`, `optout_risk` — estes três só com base mínima de 5 campanhas `completed` e 500 envios em 90 dias (setting `forecast_min_base`); abaixo disso devolvem nulo com `basis='insufficient_history'` (A9). RPC `talkx_segment_overlap(p_segment_ids uuid[])` → interseção par a par sobre contatos elegíveis. RPC `talkx_audience_risk(p_rules, p_campaign_id)` → contagens de contatos já contatados em 7 dias (Talk X + Multiplix), sem resposta nas 3 últimas campanhas e com opt-out anterior removido. Todas `STABLE`, para admin/supervisor, sem devolver linha de contato.
- **Aceite:** novo `scripts/db-audit/talkx-forecast.test.sh`: 100 restantes a 5 por minuto com janela aberta → `eta_at` = agora + 20 min (± 1); janela que fecha em 10 min → ETA no próximo dia permitido; base vazia → três projeções nulas e `basis='insufficient_history'`; segmentos de 10 e 8 com 4 em comum → sobreposição 4; agente → `42501`.
- **V3:** V33 (ETA e "previsto"), V57 (sobreposição)
- **Negócio:** a tela mostra a hora prevista de término e a sobreposição entre segmentos; previsão de taxa só aparece quando houver histórico.

### X069 · Fechar escala, realtime, histórico da conversa e auditoria de permissões do módulo

- **Fase:** 6 · **Tela:** 06, 07, 11, 12, 14 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X027, X033, X057, X058
- **Fecha:** CAP-097, CAP-099, CAP-103, CAP-108, CAP-110
- **Hoje:** leituras com corte fixo: monitor 2.000 (`useTalkXMonitor.ts:46`), supressão 500 (`src/hooks/integrations/useTalkXSuppression.ts:48`), analytics 5.000 (`src/components/talkx/TalkXAnalytics.tsx:96,109`), relatório 2.000 (`supabase/functions/talkx-report/index.ts:100`). O realtime não publica blacklist nem as tabelas novas. `talkx-send` não insere em `messages`: o histórico da conversa depende do eco do webhook (`wh-msg:77-126`). Não há teste de RLS por tabela do módulo nem teste de volume.
- **Fazer:** Migration: (a) `record_talkx_recipient_sent` passa a inserir a mensagem em `messages` (contato, conexão, `external_id`, remetente agente, texto do snapshot) só quando ainda não existe linha com aquele `external_id` na conexão, para o eco do webhook apenas atualizar; (b) publicação realtime de `talkx_blacklist` (sem telefone), `talkx_alerts` e conferência de que `talkx_recipients` publica `read_at`/`segment_id` e não publica snapshots; (c) índices que o teste de volume apontar. Testes: `scripts/db-audit/talkx-rls-audit.sql` + `.test.sh` com a matriz papel × verbo esperada para tabelas, views e RPCs `talkx_*` (anon sem nenhum grant; agente sem escrita; toda `SECURITY DEFINER` com `search_path` fixo e checagem de papel), ligado ao `db-guard.yml` e ao `db-live-guard.yml`; `scripts/db-audit/talkx-settings-readers.test.mjs` (toda chave de `talkx_settings` tem leitor em `supabase/functions` ou `supabase/migrations`); `scripts/db-audit/talkx-scale.test.sh` com 50.000 destinatários sintéticos em banco descartável. Listar em `docs/talkx/ARQUITETURA.md` cada `.limit` restante do front e a RPC que o substitui (a troca é das etapas de tela).
- **Aceite:** os 3 testes novos verdes no CI; `talkx_next_recipients`, `talkx_campaign_recipients`, `talkx_campaign_segment_queue` e `talkx_resolve_audience` (modo `count`) abaixo de 300 ms no teste de volume, com o `EXPLAIN (ANALYZE)` anexado; auditoria de RLS ao vivo sem linha divergente; teste SQL: 1 envio registrado → 1 linha em `messages` com o `external_id`, e uma segunda gravação com o mesmo id não duplica.
- **V3:** V84 (auditoria de RLS), V94 (`EXPLAIN` com 50 mil), V98
- **Negócio:** as telas deixam de cortar listas grandes e a mensagem da campanha aparece na conversa do contato.

### X070 · Criar tabela de motivos de supressão e ligar `reason_code` a ela

- **Fase:** 6 · **Tela:** 06 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-032
- **Hoje:** os motivos são um enum fixo de 6 valores (`M:20260910090000:6-13`); a tela usa uma constante de textos (`SUP:36`) e insere sem `reason_code` (`SUP:110`). Não existe tabela de motivos no catálogo.
- **Fazer:** Migration cria `talkx_suppression_reasons` (`code` text PK em minúsculas, `label`, `tone`, `is_system`, `active`, `sort_order`, `created_by`, `created_at`) com RLS: leitura para autenticado, escrita só admin/supervisor, sem DELETE (desativa-se com `active=false`); trigger impede alterar `code` e desativar motivo `is_system`. Semear os 6 códigos atuais com os rótulos do mock (Opt-out solicitado, Número inválido, Bloqueio manual, LGPD, Sem permissão comercial, Mensagem devolvida). Converter `talkx_blacklist.reason_code` de enum para text com FK para a tabela (`ON UPDATE CASCADE`, `ON DELETE RESTRICT`) e preencher os nulos a partir de `origin`. O tipo `talkx_blacklist_reason` permanece, porque `talkx_suppress_contact` (trilha do motor) ainda o usa no parâmetro; a coluna continua anulável até a X071.
- **Aceite:** `scripts/db-audit/talkx-suppression-reasons.test.sh`: 6 linhas semeadas; admin cria motivo `cliente_vip`; agente recebe erro de RLS; `UPDATE … SET active=false` em motivo de sistema falha; insert em `talkx_blacklist` com código inexistente dá 23503; `talkx_suppress_contact(…,'opt_out',…)` como service_role continua devolvendo uuid. `talkx-suppress-phone-axis.test.sh` continua passando.
- **V3:** V77 (parte de banco)
- **Negócio:** A empresa passa a poder ter os próprios motivos de bloqueio, além dos seis que vêm prontos.

### X071 · Gravar trilha da supressão por trigger e encerrar o DELETE físico

- **Fase:** 6 · **Tela:** 06 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X070
- **Fecha:** CAP-033
- **Hoje:** os tipos `suppression_add/remove/update` existem no CHECK (`M:20260929730000:33-37`) e ninguém grava (`grep -rn "suppression_add" src supabase/functions` = 0). Autoria vem do cliente (`SUP:110,120`). A policy de DELETE existe (`M:20260409190343:86-89`) e o único chamador é o hook morto (`HSUP:93`). A policy `talkx_blacklist_update` é alterada sem nunca ter sido criada em migration (`M:20260910100000:9-12`).
- **Fazer:** Migration acrescenta `import_batch_id uuid` e `removal_reason text` a `talkx_blacklist`. Trigger `BEFORE INSERT OR UPDATE`: telefone só dígitos e dentro de `^[0-9]{10,15}$`; `reason_code` nulo é preenchido por `origin`; quando há `auth.uid()`, `blocked_by` (insert) e `removed_by` (ao preencher `removed_at`) são forçados para o perfil de quem chama; `contact_id`, `phone` e `created_at` não mudam em UPDATE. Trigger `AFTER` por instrução, com tabela de transição e `SECURITY DEFINER`, grava em `talkx_campaign_events`: linha sem lote → um evento por linha (`entity_type='suppression'`, `entity_id`=id, tipo add/remove/update, ator); linhas com `import_batch_id` → um único evento `suppression_import` por lote (`entity_type='suppression_batch'`). O CHECK de `event_type` ganha `suppression_import` e `suppression_export` (superconjunto do atual). Recriar `talkx_blacklist_update` com `DROP IF EXISTS` + `CREATE`; remover a policy de DELETE e o grant de DELETE de `authenticated`.
- **Aceite:** `scripts/db-audit/talkx-suppression-trail.test.sh`: insert como admin com `blocked_by` de outro perfil → linha e evento ficam com o perfil de quem chamou; preencher `removed_at` → evento `suppression_remove`; mudar `expires_at` → `suppression_update`; 600 linhas do mesmo lote em 2 instruções → exatamente 1 evento `suppression_import`; `DELETE` como authenticated → permissão negada; telefone `abc` → erro; `talkx_suppress_contact` como service_role → evento com `actor_id` nulo. Atualizar `talkx-events-contract.test.sh`, `talkx-blacklist-policy-forward-only.test.sh` e `talkx-blacklist-policy-runtime.sql`. Antes do apply: `grep -rn "useTalkXSuppression" src e2e` só acha a declaração (nenhum caminho vivo usa DELETE).
- **V3:** V79 (trilha), V76 (eventos), V78 (evento do opt-out), V98 (policy sem criação)
- **Negócio:** Toda entrada, alteração e saída da lista fica registrada com quem fez e quando, e ninguém mais consegue apagar um registro sem deixar rastro.

### X072 · Corrigir e parametrizar `talkx_overview_stats` (status, alcance, séries, período anterior)

- **Fase:** 6 · **Tela:** 07 (e 01) · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-080 (parte de visão geral/analytics), CAP-084
- **Hoje:** `active` filtra `status IN ('running','paused')` e `running` não existe (`M:20260916180000:49`); `contacts_reached` é a soma de `total_recipients` (`:43`); a janela é por `created_at`, então rascunho entra (`:58`); `previous` não tem respostas (`:60-72`); a série diária só tem envios (`:82-91`). Nenhum código chama a função (`grep -rn "talkx_overview_stats" src` só acha `types.ts`).
- **Fazer:** Migration remove a assinatura de 2 argumentos e cria `talkx_overview_stats(p_from, p_to, p_audience_source, p_department_id, p_channel, p_timezone)` com os 4 últimos opcionais (fuso padrão `America/Sao_Paulo`), `SECURITY INVOKER`. Campanha conta no período por `started_at`. `current` e `previous` têm os mesmos campos: `campaigns_sent`, `contacts_reached` (contatos distintos com `sent_at` no período), `sent`, `delivered`, `failed`, `unknown`, `replied` (por `sent_at`/`delivered_at`/`replied_at` dos destinatários) e as taxas de entrega e resposta; `previous` vem nulo quando o período anterior não tem campanha iniciada. `active` = `sending`, `scheduled` ou `paused`, sem recorte de período. `daily` devolve um ponto por dia do período, com zeros, para `sent`, `delivered` e `replied`. Filtros: origem do público (`audience_source`), equipe (`created_by` → `profiles.department_id`) e canal (nulo ou `whatsapp`; outro valor devolve zeros — A15). Criar a função auxiliar `talkx_analytics_scope(...)` com esses filtros para as etapas seguintes; índices simples em `talkx_recipients(sent_at)` e `(replied_at)` se faltarem.
- **Aceite:** `scripts/db-audit/talkx-overview-stats.test.sh`: 1 rascunho, 1 agendada, 1 `sending` com 3 `sent` + 2 `delivered` (1 respondeu) e 1 concluída no período anterior → `current.campaigns_sent=1`, `active=2`, `current.sent=5`, `current.replied=1`, `previous.campaigns_sent=1`; `daily` tem um ponto por dia; mesmo contato em 2 campanhas conta 1 em `contacts_reached`; `p_audience_source='segment'` exclui campanha de contatos avulsos; `p_channel='email'` devolve zeros; base sem período anterior devolve `previous: null`; agente só vê as próprias (RLS).
- **V3:** V16, V41 (parte de banco)
- **Negócio:** Os números de visão geral e de Analytics passam a sair de uma única conta no servidor, sem contar rascunho como campanha enviada.

### X073 · Acrescentar lidas, conversões, receita e funil a `talkx_overview_stats`

- **Fase:** 6 · **Tela:** 07 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X021, X022, X028, X041, X057, X072
- **Fecha:** CAP-082
- **Dependências, em detalhe:** X072 ; CAP-017 (`read_at`) ; CAP-065, CAP-066, CAP-067, CAP-068 (conversões e receita legíveis) ; CAP-014 (`segment_id` por destinatário)
- **Hoje:** não existe `read_at` em `talkx_recipients`; `talkx_conversions` não tem grant nem policy para `authenticated` (`M:20260916290000:10-12`); nenhuma RPC soma `talkx_conversions.value`. O funil da tela mostra "Não rastreado" em Lidas e Conversões (`ANA:176-177`).
- **Fazer:** Migration recria `talkx_overview_stats` (mesma assinatura) acrescentando a `current` e `previous`: `read`, `conversions`, `revenue`, taxa de conversão e `segment_conversion_rate_pct` (conversões ÷ enviadas, só de destinatários com segmento); a `daily`: `conversions`; e um bloco `funnel` com 5 degraus (enviadas, entregues, lidas, respostas, conversões) e o percentual de cada um sobre enviadas. Campo cuja fonte nunca recebeu dado (nenhuma leitura registrada, nenhuma conversão registrada) vem nulo, não zero, para a tela mostrar "sem dados ainda" (A9). A leitura de conversões usa o acesso que CAP-067 entregar; esta etapa não cria grant próprio em `talkx_conversions`.
- **Aceite:** o teste da X072 ganha casos: 5 enviadas, 4 entregues, 2 lidas, 1 resposta, 1 conversão de R$ 100,00 → `funnel` = 5/4/2/1/1 com 100/80/40/20/20 %, `revenue=100`; base sem nenhuma conversão → `conversions`, `revenue` e o 5º degrau nulos; conversão de destinatário sem segmento não entra em `segment_conversion_rate_pct`.
- **V3:** V17 (parte do Analytics) ; receita no Analytics não tinha etapa
- **Negócio:** O servidor passa a saber quantas mensagens foram lidas, quantas viraram venda e quanto renderam, para a tela mostrar o caminho completo.

### X074 · Criar RPCs de mapa de calor, top segmentos e ranking de campanhas

- **Fase:** 6 · **Tela:** 07 · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X021, X057, X072
- **Fecha:** CAP-081, CAP-021
- **Dependências, em detalhe:** X072 ; CAP-014 ; CAP-067 (para a métrica de conversão)
- **Hoje:** o mapa de calor é calculado no navegador, só com `status='sent'`, sem paginação e no fuso do navegador (`ANA:45-61`); o hook de insights lê 2.000 linhas sem ordem (`INS:30-35`). Por segmento só existe `talkx_benchmarks().by_segment`: admin, 5 itens, só id, 90 dias fixos (`M:20260916220000:60-76`). O ranking da tela ordena por `sent_count` no cliente (`ANA:149`).
- **Fazer:** Três funções `SECURITY INVOKER` que recebem período, os filtros de `talkx_analytics_scope` e fuso. `talkx_analytics_heatmap` devolve 7×24 células (segunda a domingo) com enviadas, respostas e taxa de resposta por hora de envio; célula com menos de 10 envios vem com taxa nula. `talkx_analytics_top_segments(…, p_metric, p_limit default 7)` agrupa por `talkx_recipients.segment_id` e devolve nome, enviadas e a métrica escolhida (resposta, entrega ou conversão); segmento com menos de 30 envios e destinatário sem segmento somam na linha "Outros". `talkx_analytics_top_campaigns(…, p_sort, p_limit default 5)` devolve nome, objetivo, canal, enviadas e as taxas de entrega, resposta e conversão, ordenado pela métrica pedida, só com campanhas de 10 envios ou mais.
- **Aceite:** `scripts/db-audit/talkx-analytics-breakdowns.test.sh`: 3 `sent` + 2 `delivered` enviados numa segunda às 09h de Brasília → célula (segunda, 9) com `sent=5`; a mesma massa com fuso UTC cai às 12h; 8 segmentos com volume → 7 linhas + "Outros", e a soma de enviadas fecha com o total; ordenar o ranking por cada uma das 4 métricas muda a primeira linha conforme a massa; métrica de conversão sem dado vem nula.
- **V3:** V16 (P2-5 no mapa), V69 (por segmento)
- **Negócio:** O servidor passa a responder em que dia e hora os clientes mais respondem, quais segmentos rendem mais e quais campanhas foram melhores.

### X075 · Benchmarks por período com nomes e `talkx_insights` por regra no servidor

- **Fase:** 6 · **Tela:** 07 (e 01, 02, 04) · **Camada:** banco + testes · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X057, X074
- **Fecha:** CAP-083, CAP-085
- **Dependências, em detalhe:** X074 ; CAP-014
- **Hoje:** `talkx_benchmarks()` tem janela fixa de 90 dias (`M:20260916220000:42`), limite de 5 e só ids (`:72,:89`), com templates ordenados por entrega, e ninguém a chama. As regras de insight rodam no navegador (`INS:90-134`) sobre 2.000 linhas (`INS:35`); a regra de cliques filtra `status='finished'`, valor que não existe (`INS:85`); nenhuma regra tem ação (`INS:101`).
- **Fazer:** Migration troca `talkx_benchmarks()` por `talkx_benchmarks(p_days default 90, p_limit default 5)` (a chamada sem argumentos continua válida; a assinatura antiga é removida para não haver ambiguidade): acrescenta nome de segmento e de template, volume enviado, templates ordenados por taxa de resposta e `has_baseline` (verdadeiro com 5 ou mais campanhas concluídas). Criar `talkx_insights(p_from, p_to)` com regras fixas, cada uma devolvendo `id`, tipo, prioridade, parâmetros numéricos, tamanho da amostra e a ação: (1) melhor faixa de 2 horas contra a média — exige 200 envios no período e 30 na faixa, diferença relativa ≥ 20% → ação "pré-preencher janela"; (2) campanhas com segmento contra campanhas sem segmento — exige 3 campanhas de cada lado → ação "abrir segmentos"; (3) template com maior taxa de resposta contra a média — exige 2 campanhas e 100 envios → ação "abrir template"; (4) cliques baixos, com `completed`. A regra de "contatos inativos" sai (usa `contacts.updated_at`, que não mede inatividade). `summary` devolve o número de regras e `estimated_lift_pct`, que só é preenchido com as 3 primeiras regras ativas e 10 campanhas concluídas em 90 dias (maior ganho medido, teto de 50%); senão nulo.
- **Aceite:** `scripts/db-audit/talkx-insights-rules.test.sh`: para cada regra, massa acima do mínimo gera o insight com os parâmetros esperados e massa abaixo não gera; `summary.estimated_lift_pct` nulo com 9 campanhas e preenchido com 10; `select talkx_benchmarks()` e `select talkx_benchmarks(30, null)` respondem; agente recebe `by_segment` vazio (regra atual mantida).
- **V3:** V69, V83 (regras)
- **Negócio:** As recomendações passam a ser calculadas pelo servidor sobre todo o histórico, e só aparecem quando há dados suficientes para sustentá-las.

### X076 · Criar a infra de IA do Talk X: edge `talkx-ai` via `ai-proxy` com teto de custo e trilha

- **Fase:** 6 · **Tela:** 02, 03, 04, 07, 09, 11, 12, 14 · **Camada:** banco + edge · **DDL:** sim · **Deploy de edge:** sim
- **Exige antes:** X075
- **Fecha:** CAP-086
- **Dependências, em detalhe:** CAP-085 (regras determinísticas de insight, trilha de supressão e analytics)
- **Hoje:** `ai_insights=false` em `talkx_settings` (`M:20260930410000:36`); nenhuma chamada a `ai-proxy` no módulo (única menção: a flag em `src/components/talkx/TalkXSettings.tsx:15`); a edge `supabase/functions/ai-proxy` existe.
- **Fazer:** Migration: tabela `talkx_ai_requests(id, kind, entity_type, entity_id, input_hash, output jsonb, model, tokens_in, tokens_out, cost_usd, status, created_by, created_at)` — leitura admin/supervisor, escrita `service_role` — e settings `ai_monthly_budget_usd` (padrão 0 = desligado) e `ai_daily_requests_per_user` (20). Edge nova `talkx-ai` (`verify_jwt=true`, admin/supervisor) com três tipos: `insight_text` (redige a partir do JSON de uma regra determinística, nunca de dado bruto de contato), `message_variation` (variação de texto preservando as variáveis) e `segment_suggestion` (pedido em linguagem natural → regras dentro da whitelist do X016). Recusa com a flag desligada, com o gasto do mês no teto ou acima do limite por usuário; remove telefone e e-mail do prompt; cache de 24 h por `input_hash`; valida a saída antes de devolver; grava a linha. Incluir a função em `supabase/config.toml` e no manifesto de deploy.
- **Aceite:** novo `supabase/functions/talkx-ai/index.test.ts` com `ai-proxy` falso: flag desligada → 403 `ai_disabled`; teto atingido → 429 `budget_exceeded`; variação que perde `{{nome}}` → 422; mesma entrada duas vezes → 1 chamada ao proxy; o prompt capturado não contém os dígitos de telefone da fixture. Novo `scripts/db-audit/talkx-ai-requests.test.sh` para a RLS. Vale após o deploy.
- **V3:** V83 (parte de IA)
- **Negócio:** sugestões de texto e de segmento por IA ficam disponíveis atrás de uma chave, com teto de gasto mensal definido pelo dono.
