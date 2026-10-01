# Fase 2 — Motor seguro para o primeiro disparo (X010–X023)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: motor. 14 etapas.
>
> **Entrega da fase:** Envio em lotes que continua sozinho, lançamento que responde na hora, papel checado no banco, audiência montada pelo servidor, teto de ritmo, conversão autenticada e prova de que o que está no ar é o que está no repositório.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de motor, segurança e operação** (etapas X010, X011, X012, X013, X014, X015, X016, X017, X018, X019, X020, X023)

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

**Trilha de dados, links, relatório, importação e ajuda** (etapas X021, X022)

28 etapas, na ordem de execução. Base: `main` @ `3d09433` (2026-10-01).

- **CRM 360 = banco `pgxfvjmuubtbowutlide`, sempre somente leitura**, pela edge `crm-integration`. Bitrix24 só leitura, pela edge
  `bitrix-api`. Nenhuma etapa escreve no CRM nem no Bitrix; `sync_contacts` (`bitrix-api/index.ts:137-175`) não é chamada nem alterada.
- **Migration:** versão reservada por `supabase_migrations.reserve_migration_version` (> `20260930530000`); arquivo → PR → merge →
  apply + ledger no mesmo `db_query` → `schema-catalog.json`, `types.ts`, `known-violations.json`.
- **Edge só vale depois de `deploy-functions.yml` disparado e aprovado.** Etapa com "Deploy de edge: sim" só fecha com o deploy confirmado.
- **Um único job no pg_cron para os dados desta trilha** (`talkx-data-jobs`, a cada 5 min, criado em X036). Os demais jobs são linhas em
  `talkx_data_jobs`, disparadas por `talkx_run_data_jobs()`. Motivo: o pg_cron já falha com `job startup timeout`; não somar jobs.
- **E2E não grava em produção:** os testes Playwright desta trilha interceptam as RPCs; a lógica real é provada por teste SQL
  (Postgres descartável) e teste Deno.
- **Chaves `dados:*` entregues** (para os outros blocos citarem): `vinculo_crm`, `vendedor`, `regiao`, `uf`, `cidade`, `empresa`, `ramo`,
  `pessoa_juridica`, `estagio_funil`, `status_cliente`, `score`, `genero`, `aniversario`, `ultima_interacao`, `compras`, `ultima_compra`,
  `ticket_medio`, `total_pedidos`, `valor_total`, `rfm_segmento`, `rfm_recencia`, `rfm_frequencia`, `rfm_monetario`, `origem_lead`,
  `cobertura`.

---

## Etapas

### X010 · Aceitar `start` repetido em `sending` e criar lease de worker, fila e segredo do cron

- **Fase:** 2 · **Tela:** motor · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-007, CAP-098
- **Hoje:** `transition_talkx_campaign('start')` recusa origem `sending` (`M:20260916210000:46-48`), e o teste fixa essa recusa (`scripts/db-audit/talkx-campaign-transitions.test.sh:78`). Não há trava por campanha: dois workers no mesmo `sending` só são separados pelo lease por destinatário (`M:20260912110000:223-314`), o que dobra o ritmo. A fila é lida por `SELECT` direto na edge (`send:282-290`). Não existe segredo de cron do Talk X (grep `talkx_cron_secret` em `supabase/` = 0).
- **Fazer:** Migration com: (a) `transition_talkx_campaign` devolve `sending → sending` sem erro e sem tocar `started_at` quando a ação é `start` e a campanha já está `sending`; (b) colunas `talkx_campaigns.worker_id text` e `worker_lease_expires_at timestamptz`, protegidas no trigger `enforce_talkx_campaign_mutability`; (c) RPCs só para `service_role`: `claim_talkx_campaign_worker(p_campaign_id, p_worker, p_lease_seconds)` (verdadeiro só sem lease vivo de outro worker; renova o próprio), `release_talkx_campaign_worker(p_campaign_id, p_worker)` e `talkx_next_recipients(p_campaign_id, p_limit)` (próximos `pending` ou `sending` com lease vencido sem dispatch, `retry_after` vencido, ordenados por `created_at, id`, com os dados do contato que o envio usa); (d) segredo `talkx_cron_secret` no Vault criado se não existir e `get_talkx_cron_secret()` só para `service_role` (cópia de `M:20260927320000:9-34`). Atualizar `talkx-campaign-transitions.test.sh:78` e conferir `scripts/db-audit/check-talkx-transition-contract.sql` (guard vivo). A edge depende do erro em `send:273-279` (trata a recusa de `start` em `sending`); X011 deve estar deploiado antes de aplicar esta migration.
- **Aceite:** novo `scripts/db-audit/talkx-campaign-worker-lease.test.sh`: `start` duas vezes → a segunda devolve `sending:sending`; `claim` do worker A = true, do B com lease vivo = false, do B após expirar = true; `talkx_next_recipients(…, 20)` com 45 pendentes devolve 20 e nunca devolve destinatário com dispatch iniciado; `authenticated` chamando qualquer das 4 funções → `42501`. `talkx-campaign-transitions.test.sh` verde com a nova expectativa.
- **V3:** V13 (retomada idempotente; aqui o `start` em `sending` passa a significar "continuar a fila")
- **Negócio:** nada muda na tela ainda; é a trava que impede dois robôs de enviarem a mesma campanha ao mesmo tempo.

### X011 · Processar a campanha em lotes com orçamento de tempo no `talkx-send`

- **Fase:** 2 · **Tela:** motor · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X010
- **Fecha:** CAP-007, CAP-047, CAP-103
- **Hoje:** um `SELECT` sem limite traz todos os `pending|sending` (`send:282-290`) e um `for` com `sleep` percorre tudo na mesma requisição (`send:402-787`); com o perfil padrão cabem ≈ 8 destinatários em 150 s. Destinatário reagendado por `retry_after` não é revisitado (`send:708-727`). `complete_talkx_campaign_if_drained` só roda no fim do loop (`send:789-793`). Os 29 testes Deno usam sempre 1 destinatário e intervalo 0 (`supabase/functions/talkx-send/_test-utils.ts:64-166`). O Multiplix já trabalha em passadas de 20 (`mx-send:246-252,315-323`).
- **Fazer:** Criar a ação `continue`, aceita só com service key ou cabeçalho `x-cron-secret` conferido contra `get_talkx_cron_secret` (padrão `mx-send:82-92`; a chamada continua levando o Bearer da anon key porque `verify_jwt=true`). Ela reivindica o lease de worker da campanha (sem lease → responde `{skipped:'worker_alive'}` sem tocar no provedor), lê passadas de `TALKX_BATCH_SIZE` (padrão 20, teto 200) por `talkx_next_recipients`, repete enquanto houver fila e o relógio estiver abaixo de `TALKX_BATCH_BUDGET_MS` (padrão 50 000), não começa destinatário novo se o tempo restante for menor que `typing_delay_max + 25 s`, e solta o lease ao sair. A pré-carga de campos customizados passa a ser por passada. `complete_talkx_campaign_if_drained` só é chamada quando a passada volta vazia. Resposta: `{success, processed, remaining, has_more}`. Extrair o corpo "por destinatário" para `talkx-send/process-recipient.ts` sem mudar comportamento. Ajustar `scripts/db-audit/talkx-delivery-leases-contract.test.mjs` e `talkx-e90-links-contract.test.mjs`, que fixam trechos de `index.ts`.
- **Aceite:** Deno em `talkx-send/index.test.ts` (com `_test-utils.ts` ampliado para N destinatários e relógio falso): (1) 45 destinatários, lote 20 → três invocações `continue` enviam 45, nenhum id repetido no provedor falso; (2) orçamento estourado → `has_more:true` e `complete_…` não é chamada; (3) destinatário com `retry_after` vencido é enviado na invocação seguinte; (4) segunda invocação com lease vivo faz 0 POST; (5) `continue` com JWT de admin → 403. Só vale após o deploy.
- **V3:** — (lacuna 1 do V3: continuidade do worker)
- **Negócio:** campanha grande deixa de parar sozinha depois dos primeiros contatos.

### X012 · Criar o tick do motor: reaper, conclusão, re-invocação e cron com segredo e timeout

- **Fase:** 2 · **Tela:** motor · **Camada:** banco + cron · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X010, X011
- **Fecha:** CAP-006, CAP-007, CAP-009, CAP-011, CAP-037, CAP-098
- **Hoje:** destinatário `sending` com `provider_dispatch_started_at` e lease vencido é excluído do claim (`M:20260912110000:257-263`) e ninguém o recicla; campanha `sending` não é re-invocada (`sched:32-36,49-54`); a conclusão exige zero `pending|sending` (`M:20260911170000:37-44`) e só é tentada pela própria invocação. O cron chama `net.http_post` sem `timeout_milliseconds` e só com a anon key (`M:20260909000000:13-26`). Em 24 h o job teve 16 falhas `job startup timeout` — o pg_cron não conseguiu iniciar o job (diretrizes §6). O Multiplix já tem o padrão completo (`M:20260929600000:239-290`, `M:20260929610000:156-255`).
- **Fazer:** Migration com: (a) `sweep_talkx_stuck_recipients(p_limit int default 500)` — lease vencido com dispatch iniciado vira `outcome_unknown` e soma em `outcome_unknown_count`; (b) `kick_talkx_campaign(p_campaign_id)` — um `net.http_post` para `talkx-send` `{action:'continue'}` com anon key + `x-cron-secret` e `timeout_milliseconds := 30000`; (c) `trigger_talkx_engine_tick()` — declara o papel de serviço localmente (como `M:20260929610000:171`), roda o sweep, chama `complete_talkx_campaign_if_drained` para cada `sending` sem fila, dá `kick` em no máximo 1 campanha `sending` por `whatsapp_connection_id` (a de `updated_at` mais antigo; limite 10 por tick) e faz 1 POST para `talkx-scheduler` com o mesmo segredo e timeout; (d) troca do comando do job existente `talkx-scheduler-1min` por `SELECT public.trigger_talkx_engine_tick()` via `cron.alter_job` — sem criar job novo, para não aumentar a disputa por worker que gera `job startup timeout`; (e) segredo `talkx_send_url` no Vault. Todas as funções só para `service_role`. Documentar em `docs/talkx/OPERACAO.md` a consulta de saúde do cron (`cron.job_run_details` por `status`/`return_message` e `net._http_response`). Um tick perdido só atrasa 1 min: o desenho não depende de nenhuma execução isolada.
- **Aceite:** novo `scripts/db-audit/talkx-engine-tick.test.sh` (com `net.http_post` trocado por tabela de captura): destinatário com dispatch e lease vencido → `outcome_unknown`, contador +1; campanha `sending` drenada → `completed`; 3 campanhas `sending` em 2 conexões → 2 POSTs `continue`, todos com `x-cron-secret`; `authenticated` → `42501`. Ao vivo após o apply: `SELECT command FROM cron.job WHERE jobname='talkx-scheduler-1min'` contém `trigger_talkx_engine_tick`, e as 30 últimas linhas de `net._http_response` do tick não têm `timed_out`.
- **V3:** V19 (lacuna: reaper), V85 (lacuna: o alerta detectava a campanha órfã, não corrigia)
- **Negócio:** se o envio cair no meio, o sistema retoma sozinho no minuto seguinte e a campanha consegue terminar.

### X013 · Tornar o lançamento assíncrono: `start` só transiciona e dispara o primeiro lote

- **Fase:** 2 · **Tela:** 09, 10, 11 · **Camada:** edge + front (hook) · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X011, X012
- **Fecha:** CAP-007, CAP-096
- **Hoje:** `startCampaign` aguarda o `invoke` do loop inteiro (`useTalkX:353-368`) e o wizard só grava `started` se a resposta voltar (`editor:578-583`); passado o tempo do gateway o operador vê "Erro ao iniciar" com mensagens saindo. O `start` roda o envio dentro da própria requisição (`send:273-806`). O papel é conferido com `.in('role', […]).maybeSingle()` (`send:135-143`), que falha para quem tem as duas roles — defeito já corrigido no Multiplix (`mx-send:107-116`). O repo não usa `EdgeRuntime.waitUntil` (grep = 0), então o primeiro lote não pode depender dele.
- **Fazer:** `action=start` passa a: validar papel pela RPC `is_admin_or_supervisor`, conferir conexão e janela como hoje, chamar `transition_talkx_campaign('start')`, chamar `kick_talkx_campaign` (o lote roda em outra invocação, via `continue`) e responder `{success:true, accepted:true, status:'sending'}` sem ler destinatários. Fora da janela continua devolvendo `{ok:false, reason, next_window}`. Retomar (`paused → sending`) usa o mesmo caminho. No hook, `assertTalkXActionAccepted` (`useTalkX:91`) aceita `accepted` e o texto de sucesso vira "Envio iniciado; acompanhe no monitor". Migrar os 6 testes de `start` de `talkx-send/index.test.ts` para `continue`.
- **Aceite:** Deno: `start` de campanha com 500 destinatários responde 200 com 0 POST ao provedor e 1 chamada a `kick_talkx_campaign`; usuário com as roles admin e supervisor → 200; agente → 403. Vitest em `src/components/talkx/__tests__/useCampaignEditor.test.tsx`: `launch` resolve com `accepted` sem esperar envio. Vale após o deploy.
- **V3:** V13
- **Negócio:** ao clicar em "Lançar", a tela responde em segundos e não mostra mais erro falso enquanto as mensagens saem.

### X014 · Exigir papel admin/supervisor no banco para criar, agendar e alterar campanha

- **Fase:** 2 · **Tela:** 08, 17 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** CAP-096, CAP-097
- **Hoje:** `save_talkx_campaign_draft` aceita qualquer `authenticated` com perfil ativo (`M:20260912130000:58-72`); as policies "Users can create/update own campaigns" não olham papel (`M:20260409000457:57-63`); o trigger deixa o dono passar `draft → scheduled` (`M:20260930420000:118-131`) e o cron dispara com a service key (`sched:112-118`). `talkx_settings` tem `GRANT ALL` para `anon` (`M:20260930410000:31`). A policy de UPDATE de `talkx_blacklist` é alterada sem nunca ter sido criada em migration (`M:20260910100000:9-12`). Cliques só são legíveis pelo dono, sem ramo admin (`M:20260922130000:44-55`). Papéis em produção: 4 admin, 1 supervisor, 3 agent.
- **Fazer:** Migration com: (a) `save_talkx_campaign_draft`, `replace_talkx_draft_recipients` e `update_talkx_campaign_limits` exigem `is_admin_or_supervisor(auth.uid())`; (b) policies de INSERT/UPDATE/DELETE de `talkx_campaigns` ganham a mesma condição; (c) `enforce_talkx_campaign_mutability` recusa `status='scheduled'` vindo de quem não tem papel; (d) `REVOKE ALL ON public.talkx_settings FROM anon`; (e) policy de UPDATE de `talkx_blacklist` criada de forma idempotente; (f) ramo admin/supervisor na leitura de `talkx_link_clicks`. A leitura que o agente já tem não muda. É restrição: aplicar só após o merge; o front já esconde o módulo de agente (`src/services/navigation.service.ts:34`).
- **Aceite:** novo `scripts/db-audit/talkx-role-gates.test.sh`: agente chamando as 3 RPCs → `42501`; agente com UPDATE direto para `scheduled` → erro; admin e supervisor → sucesso; `has_table_privilege('anon','public.talkx_settings','SELECT')` = false. Ajustar os testes que usam sessão sem papel: `talkx-draft-save.test.sh`, `talkx-draft-recipients.test.sh`, `talkx-update-limits-rpc.test.sh`, `talkx-settings-rls.test.sh`, `talkx-campaign-state-transitions.test.sh`. Ao vivo: 0 campanhas cujo `created_by` não tenha papel.
- **V3:** V84 (auditoria de RLS), V98 (policy da blacklist)
- **Negócio:** atendente não consegue criar nem agendar disparo em massa, mesmo chamando o sistema por fora da tela.

### X015 · Autenticar o `talkx-scheduler` por segredo e limitar o tempo de cada chamada

- **Fase:** 2 · **Tela:** motor · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X012, X013
- **Fecha:** CAP-006, CAP-051, CAP-098
- **Hoje:** o handler não confere credencial nenhuma (`sched:17-27`); aguarda cada `talkx-send` em série (`sched:110-119`); o `Deno.serve` inline impede testar o handler e não existe teste Deno dele (`ci.yml:76-100`). O contrato estático fixa trechos do arquivo (`scripts/db-audit/talkx-scheduler-contract.test.mjs`).
- **Fazer:** Exportar `handleTalkxScheduler(req, injected)`. Exigir `x-cron-secret` igual a `get_talkx_cron_secret()` (comparação em tempo constante) ou service key; qualquer outra chamada → 401. Continuar chamando `talkx-send` `action=start` para agendadas vencidas e pausas automáticas elegíveis — a resposta agora é imediata (X013) —, com `AbortController` de 10 s por chamada, no máximo 10 campanhas por tick e no máximo 1 retomada por conexão. O scheduler deixa de ter qualquer responsabilidade sobre `sending` (isso é do tick, X012). Atualizar `talkx-scheduler-contract.test.mjs`.
- **Aceite:** novo `supabase/functions/talkx-scheduler/index.test.ts`: sem segredo → 401; com segredo e 3 pausadas (manual, janela, conexão restabelecida) → 2 chamadas `start`; um `talkx-send` que não responde em 10 s não impede as demais; 12 vencidas → 10 chamadas. Vale após o deploy; conferir ao vivo que o tick recebe 200.
- **V3:** V03 (aceite pendente: teste Deno do scheduler), V30 (lacuna: autenticação do scheduler)
- **Negócio:** ninguém de fora consegue acionar o agendador, e uma campanha lenta não atrasa as outras.

### X016 · Criar a RPC única de audiência com elegibilidade, supressão e paginação

- **Fase:** 2 · **Tela:** 03, 08, 09 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014
- **Fecha:** CAP-003, CAP-004, CAP-028, CAP-029, CAP-094, CAP-103
- **Dependências, em detalhe:** X014 ; `dados:*` (os campos da projeção `talkx_contact_attributes` entram na whitelist quando a trilha de dados, relatório e importação criá-la)
- **Hoje:** `countAudience`/`resolveAudience` rodam no navegador via PostgREST, filtram só `phone not null` e cortam em 5.000 (`segs:161-183`). A supressão é filtrada no cliente com a lista inteira e um `.in('id', contactIds)` (`editor:325-338,563-570`). O SELECT da blacklist é só de admin/supervisor (`M:20260410103218:20-24`) e não há RPC de contagem. Base: 3.106 contatos, 2.504 visíveis.
- **Fazer:** Migration com a função interna `talkx_audience_query(p_rules jsonb, p_contact_ids uuid[], p_respect_suppression boolean)` — traduz `{groups:[{match, rules:[{field, op, value}]}]}` para SQL com whitelist de campo e operador igual a `RULE_FIELDS`/`RULE_OPS` (`segs:15-80`), valores sempre parametrizados — e a RPC `talkx_resolve_audience(p_rules, p_segment_ids uuid[], p_mode text, p_limit int, p_after uuid)` com modos `count` (`matched`, `eligible`, `suppressed`, `invalid_phone`, `legacy_or_deleted`), `sample` (até 50 linhas, telefone mascarado) e `page` (keyset por `id`, até 1.000). Elegível = `deleted_at IS NULL`, `is_lid_legacy = false`, `phone ~ '^[0-9]{10,15}$'` (critério de `M:20260930450000`) e visível ao usuário. Suprimido = por `contact_id` ou por telefone normalizado, respeitando `removed_at`/`expires_at`. Exige admin/supervisor. Índices de apoio entram na mesma migration se o `EXPLAIN` do teste mostrar varredura completa.
- **Aceite:** novo `scripts/db-audit/talkx-audience-rpc.test.sh`: fixture de 12 contatos (2 excluídos, 1 LID, 1 telefone inválido, 2 suprimidos — um por id, um por telefone formatado —, 1 com supressão expirada) → `count` devolve `eligible=6`, `suppressed=2`, `legacy_or_deleted=3`, `invalid_phone=1`; `page` com limite 4 percorre os 6 em 2 páginas sem repetição; tabela de 10 casos regra → ids esperados cobrindo cada operador; operador fora da whitelist → `22023`; agente → `42501`.
- **V3:** V24 (parte de servidor), V80
- **Negócio:** "Elegíveis para envio" e "Bloqueados por supressão" passam a ser exatamente o que será enviado.

### X017 · Gerar os destinatários no servidor a partir do rascunho salvo

- **Fase:** 2 · **Tela:** 06, 08, 09, 10 · **Camada:** banco + front (hook) · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X016
- **Fecha:** CAP-004, CAP-028, CAP-030, CAP-103
- **Hoje:** o wizard resolve os ids no navegador e os envia a `replace_talkx_draft_recipients(p_campaign_id, p_contact_ids)` (`editor:555-571`; `M:20260911140000:5-97`), que confere visibilidade mas não `deleted_at`/LID/formato do telefone. `respectSuppression` só existe em estado do wizard (`editor:563`), sem coluna.
- **Fazer:** Migration com: colunas `talkx_campaigns.respect_suppression boolean not null default true` e `audience_snapshot_at timestamptz`; `save_talkx_campaign_draft` aceita a flag (valor `false` recusado até a decisão N12); RPC `snapshot_talkx_campaign_audience(p_campaign_id, p_expected_revision)`, que lê do próprio rascunho a origem, os segmentos, `audience_filters` e a seleção manual, chama `talkx_audience_query` e regrava `talkx_recipients` e `total_recipients` numa transação, devolvendo `{eligible, suppressed, skipped_invalid}`; `replace_talkx_draft_recipients` aplica o mesmo critério de elegível. No front, `editor` troca resolução + filtro de blacklist + `replace` por uma chamada, e `segs` passa `countAudience`/`resolveAudience` para a RPC do X016; a query `talkx-blacklist-ids` (`editor:325-338`) sai.
- **Aceite:** novo `scripts/db-audit/talkx-audience-snapshot.test.sh`: segmento com 6 elegíveis e 2 suprimidos → 6 linhas e `total_recipients=6`; `respect_suppression=false` → `22023`; revisão antiga → conflito; `talkx-draft-recipients.test.sh` estendido com contato excluído e LID rejeitados. Vitest `useCampaignEditor.test.tsx`: `persist` não chama `.from('talkx_blacklist')` nem `.in('id', …)`; `useTalkXSegments.test.ts` ajustado.
- **V3:** V21 (flag persistida), V80
- **Negócio:** a lista de quem vai receber é montada pelo sistema ao salvar, sem corte silencioso e sem depender do navegador.

### X018 · Criar no banco os limites por minuto, por dia e por conexão e os perfis de velocidade

- **Fase:** 2 · **Tela:** 09, 11, 12, 13 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014
- **Fecha:** CAP-035, CAP-036, CAP-044, CAP-110
- **Hoje:** o ritmo é só um intervalo aleatório entre envios (`send:785-786`) com valores vindos do cliente (`src/components/talkx/talkxShared.tsx:54-58`; `M:20260912130000:94-98`). `daily_limit_per_connection=500` está semeado (`M:20260930410000:37`) e só o Multiplix o lê, já somando Talk X + Multiplix (`M:20260929610000:91-131`). O seed `default_speed_profile='balanced'` (`M:20260930410000:38`) está fora do CHECK `slow|moderate|fast` (`M:20260908120000:82`).
- **Fazer:** Migration com: coluna `talkx_campaigns.max_per_minute smallint` (nulo = padrão); settings `max_per_minute_per_connection` (padrão 6) e `speed_profiles` (jsonb com faixas de intervalo e digitação de `slow|moderate|fast`); correção do seed para `moderate`; `save_talkx_campaign_draft` e `update_talkx_campaign_limits` passam a derivar `send_interval_*`/`typing_delay_*` do perfil (valor do cliente só vale dentro da faixa) e aceitam `max_per_minute` até o teto do setting; RPC `talkx_connection_send_budget(p_connection_id)` (`service_role`) com `minute_limit/sent/remaining`, `day_limit/sent/remaining`, `next_day_at`, contando `sent_at` de Talk X + Multiplix na conexão (último minuto; dia local de São Paulo); RPC `talkx_campaign_pace(p_campaign_id)` com os mesmos números para a tela (admin/supervisor).
- **Aceite:** novo `scripts/db-audit/talkx-send-budget.test.sh`: 4 envios no último minuto com limite 6 → `minute_remaining=2`; 500 no dia → `day_remaining=0`; envio do Multiplix na mesma conexão entra na conta; perfil `fast` com intervalo 0 vindo do cliente → gravado no mínimo do perfil; `max_per_minute` acima do setting → `22023`. Ajustar `talkx-settings-replay-idempotent.test.sh` e os quatro `talkx-update-limits-*.test.sh`.
- **V3:** V20, V84 (lacuna: seed inválido)
- **Negócio:** passa a existir um teto real de mensagens por minuto e por dia para proteger o número.

### X019 · Enviar pela conexão escolhida e aplicar os limites de ritmo no `talkx-send`

- **Fase:** 2 · **Tela:** 09, 10, 11, 13 · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X011, X018
- **Fecha:** CAP-035, CAP-036, CAP-037, CAP-038
- **Hoje:** `evoFetch` é chamado sem `instanceToken` (`send:569-571,653-667`) e cai no `EVOLUTION_INSTANCE_TOKEN` global (`evo-send:40-46`) — a mensagem sai pela instância do token, não pela conexão escolhida. `get_instance_token(p_instance_id)` e `whatsapp_connections.instance_token_secret_id` já existem (`M:20260925190000`) e o Talk X não usa. Não há teto por minuto nem por dia (grep `daily_limit` em `send` = 0). `AUTO_RESUME_REASONS` não tem motivo de limite (`resume:25`).
- **Fazer:** No `continue`: resolver o token da instância da campanha com `get_instance_token` (uma vez por invocação) e passá-lo a todos os `evoFetch` (presença, texto, mídia); sem token cadastrado, usar o fallback só se a conexão for a instância padrão (`EVOLUTION_INSTANCE_NAME`), senão pausar com `connection_lost`. Carregar `talkx_connection_send_budget` no início do lote, decrementar a cada envio e recarregar a cada 20: minuto esgotado → esperar a virada ou encerrar o lote se não couber no orçamento de tempo; dia esgotado → `transition('pause')` com motivo `daily_limit` e encerrar. `daily_limit` entra em `AUTO_RESUME_REASONS` com a regra "retoma quando `day_remaining > 0`". O lote recusa começar se outra campanha da mesma conexão tem lease de worker vivo.
- **Aceite:** Deno: (1) campanha na conexão B envia com `apikey` igual ao token de B (o `fetch` falso captura o cabeçalho; o valor do teste é fictício); (2) limite diário 3 → o 4º não é enviado e a campanha fica `paused` com `daily_limit`; (3) limite por minuto 2 com relógio falso → o 3º só sai após a virada do minuto; (4) `_shared/__tests__/talkx-resume-policy.test.ts`: `daily_limit` só retoma com orçamento. `evolution-send-instance-token.test.ts` continua verde. Vale após o deploy.
- **V3:** V20 (lacuna: limite por minuto e uma campanha por conexão)
- **Negócio:** a campanha sai pelo número escolhido na tela e para sozinha ao atingir o teto do dia, voltando no dia seguinte.

### X020 · Impedir texto errado: variável sem valor, variável desconhecida e precedência do A/B

- **Fase:** 2 · **Tela:** 05, 08, 09 · **Camada:** edge + front (lib de prévia) · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X011 · **Integra com (não bloqueia):** X118
- **Fecha:** CAP-069, CAP-074, CAP-075, CAP-076
- **Dependências, em detalhe:** X011 ; CAP-062 (cadastro de link, trilha de dados, relatório e importação) para `{{link}}`
- **Hoje:** variável sem valor vira `[variavel]` e é enviada (`send:65-70`); `vendedor`, `data_atual`, `data` e `telefone` não existem em `contactValues` (`send:37-42`); `{{link}}` sem link cadastrado sai `[link]` (`send:59`) e a URL usa o domínio `…supabase.co` (`send:302-305`). Se o template tem variantes, o texto editado na campanha é ignorado (`send:504`). O sorteio usa `Math.random` e não tem teste (`send:75-86`).
- **Fazer:** Em `personalize()`: aceitar `{{chave|padrão}}`; resolver `vendedor` (`contacts.assigned_to → profiles.name`, carregado por passada), `data_atual`/`data` (dd/mm/aaaa no fuso da campanha) e `telefone`; devolver também a lista do que ficou sem valor. Política: variável sem valor e sem padrão → destinatário `skipped` com `error_message='missing_variable:<nome>'`, sem POST; variável cujo nome não é nativo, nem campo customizado existente, nem link cadastrado → `start` responde 422 com a lista. Precedência: se o texto da campanha difere do conteúdo do template, vale o da campanha e nenhuma variante é sorteada; senão vale a variante. `pickVariant` passa a decidir por hash estável do id do destinatário. Base do link por `TALKX_LINK_BASE_URL`. Replicar a regra em `personalizePreview` (`talkxShared.tsx`) e criar `scripts/db-audit/talkx-personalize-parity.test.mjs` com o mesmo fixture dos dois lados; ajustar `talkx-e90-links-contract.test.mjs`.
- **Aceite:** Deno: contato sem empresa com `{{empresa}}` → `skipped/missing_variable:empresa` e 0 POST; `{{empresa|sua empresa}}` → enviado com o padrão; `{{vendedor}}` traz o nome do responsável; `start` com `{{xpto}}` → 422; campanha com texto editado e template com 2 variantes → todos recebem o texto da campanha; 10.000 ids com pesos 70/30 → 70 % ± 2 p.p. e mesmo resultado ao repetir. Paridade front/edge 12 de 12 casos. Vale após o deploy.
- **V3:** V65, V68 (teste do sorteio)
- **Negócio:** nenhum cliente recebe mensagem com "[vendedor]" nem com o texto antigo do template.

### X021 · Abrir no banco a escrita de links, a leitura de cliques/conversões e o investimento

- **Fase:** 2 · **Tela:** motor, 08, 14 · **Camada:** banco · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X014
- **Fecha:** CAP-062 (banco), CAP-064 (colunas), CAP-065 (deduplicação e validação no banco), CAP-067, CAP-068 (coluna e escrita)
- **Dependências, em detalhe:** CAP-096 (papel no banco, trilha do motor)
- **Hoje:** `talkx_links` não tem UTM, autor nem unicidade de rótulo (`supabase/migrations/20260916200000_talkx_e90_links.sql:3-10`). `authenticated` só lê, e o arquivo que dá essa leitura diz "NÃO aplicada em produção" no cabeçalho (`20260924224823_fix_talkx_link_clicks_rls.sql:31-54`). Cliques: policy só do dono. `talkx_conversions`: sem grant nem policy (`20260916290000_harden_e90_table_grants.sql:10-12`) e sem chave de deduplicação (`20260916200000:21-29`). `talkx_campaigns` não tem coluna de investimento.
- **Fazer:** Uma migration. (1) `talkx_links`: `utm_source/medium/campaign/content/term`, `created_by`, único `(campaign_id, lower(label))`, CHECK de rótulo `^[a-z0-9][a-z0-9_-]{0,39}$` e de destino `^https://`; RPCs `talkx_upsert_link` e `talkx_delete_link` (DEFINER, admin/supervisor, campanha `draft|scheduled`, slug gerado no servidor, exclusão só sem cliques). (2) Leitura: conferir no ledger se `20260924224823` foi aplicada e reemitir de forma idempotente; ramo admin/supervisor em `talkx_link_clicks`; `GRANT SELECT` + policies (admin/supervisor e dono da campanha) em `talkx_conversions`. (3) `talkx_conversions`: `external_ref`, `occurred_at`, `currency`, `attribution`, único parcial `(campaign_id, source, external_ref)`, CHECK `value >= 0`; RPC `record_talkx_conversion(...)` só `service_role`: teto de valor (`talkx_settings.conversion_max_value`), lista de origens, recusa `link_id` de outra campanha, janela de atribuição, `ON CONFLICT DO NOTHING` devolvendo `duplicate`. (4) `talkx_campaigns.investment numeric(12,2)` + RPC `talkx_set_campaign_investment` (DEFINER, admin/supervisor, qualquer status; o guard `20260930420000` só trava status e contadores). (5) Novos `event_type`: `link_created`, `link_updated`, `link_deleted`, `investment_updated`, `report_exported`, `report_shared`, `import_created`, `import_completed` — ajustar `scripts/db-audit/talkx-events-contract.test.sh`.
- **Aceite:** `scripts/db-audit/talkx-links-conversions.test.sh`: agente em `talkx_upsert_link` → 42501; rótulo repetido → 23505; supervisor lê cliques e conversões de campanha alheia, agente só das suas; conversão repetida com o mesmo `external_ref` → 1 linha; valor negativo ou acima do teto → erro; investimento em campanha `completed` grava e gera evento com ator. `supabase-usage-guard.mjs` com `novas: 0`.
- **V3:** V81, V82, V39 (coluna de investimento)
- **Negócio:** O banco passa a aceitar links criados pela equipe e a guardar conversões sem duplicar; supervisor consegue ler cliques e vendas de qualquer campanha.

### X022 · Enviar vários links por rótulo com UTM e domínio próprio; autenticar a conversão

- **Fase:** 2 · **Tela:** motor, 08, 14 · **Camada:** edge · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X020, X021
- **Fecha:** CAP-061 (domínio), CAP-063, CAP-064 (redirecionamento), CAP-065, CAP-066, CAP-076
- **Dependências, em detalhe:** X021 ; CAP-074 (variável sem valor, trilha do motor)
- **Hoje:** `talkx-send` usa só o link mais antigo da campanha e monta a URL com o domínio `…supabase.co` (`supabase/functions/talkx-send/index.ts:292-304`). `talkx-link` grava conversão sem autenticação, sem validar `value` e sem deduplicar (`supabase/functions/talkx-link/index.ts:71-137`; `supabase/config.toml:65-66`), devolve o texto de erro do banco (`:136`) e, em erro de clique, redireciona para a URL do projeto (`:61`). Não existe `talkx-link/index.test.ts`.
- **Fazer:** `talkx-send`: aceitar `{{link:rotulo}}` (um por rótulo, vários por mensagem) no passe único de `personalize()`, mantendo `{{link}}` = link mais antigo; base da URL por `TALKX_LINK_BASE_URL` (sem o secret, URL atual); rewrite `/l/:slug` em `vercel.json` para a edge. `talkx-link` GET: acrescentar os UTM do link ao destino sem sobrescrever parâmetro existente; slug inexistente → 404 neutro. `talkx-link` POST: exigir `x-talkx-timestamp` (±5 min) e `x-talkx-signature` = HMAC-SHA256 do corpo com `TALKX_CONVERT_SECRET`, comparação em tempo constante; sem o secret → 503; corpo até 4 KB; gravação só por `record_talkx_conversion`; resposta sem texto do banco; repetição devolve `duplicate:true`. Rótulo usado na mensagem e não cadastrado entra na validação de lançamento (CAP-074), nunca sai como `[link:rotulo]`. Ajustar `scripts/db-audit/talkx-e90-links-contract.test.mjs` (ordem dos ramos e base de URL), criar `supabase/functions/talkx-link/index.test.ts` e incluí-lo em `.github/workflows/ci.yml`; documentar o trecho de conversão do site em `docs/talkx/CONVERSOES.md`.
- **Aceite:** Deno: POST sem assinatura → 401; assinatura errada → 401; timestamp vencido → 401; válido → 200 e 1 linha; repetido → 200 `duplicate:true` e 1 linha; `value` −1, 1e12 ou texto → 422; GET com UTM → `Location` com `utm_*`. Envio real para número interno com 2 rótulos: mensagem chega com 2 URLs distintas; após clicar nas duas, `SELECT link_id, count(*) FROM talkx_link_clicks GROUP BY 1` devolve 2 linhas e `talkx_recipients.click_count = 2`.
- **V3:** V81, V82
- **Negócio:** Uma mensagem pode levar vários links medidos separadamente, com endereço da empresa; ninguém de fora consegue inflar vendas de uma campanha.

### X023 · Provar a paridade de deploy das 5 edges e dos segredos antes do primeiro disparo

- **Fase:** 2 · **Tela:** motor · **Camada:** docs + testes · **DDL:** não · **Deploy de edge:** sim
- **Exige antes:** X011, X013, X015, X019, X020, X022
- **Fecha:** CAP-046, CAP-051
- **Dependências, em detalhe:** X011 ; X013 ; X015 ; X019 ; X020 ; CAP-066 (autenticação do POST de conversão, trilha de dados, relatório e importação)
- **Hoje:** `supabase/deployment-manifest.json` guarda o `source_sha256` de cada função e `scripts/edge-deploy/collect-remote.mjs`/`verify-remote.mjs` comparam com o remoto, mas exigem token e não foram executados. O último registro de deploy de `talkx-send`/`talkx-scheduler` é de setembro, sem run id (`docs/talkx/HANDOFF_SESSAO_03.md:54`); não há registro posterior às correções de 30/09–01/10 nem do webhook com `talkx_suppress_contact`. Merge não implanta (`.github/workflows/deploy-functions.yml:21-33`).
- **Fazer:** Criar `scripts/edge-deploy/talkx-preflight.mjs`, que: compara o digest de `talkx-send`, `talkx-scheduler`, `talkx-link`, `talkx-report` e `evolution-webhook` com o manifesto; confere `verify_jwt` de cada uma contra `supabase/config.toml`; lista por nome (nunca por valor) os secrets exigidos — `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_TOKEN`, `RESEND_API_KEY`, `TALKX_LINK_IP_SALT`, `TALKX_LINK_BASE_URL`; e traz a query documentada que confere a existência de `talkx_cron_secret`, `talkx_send_url`, `talkx_scheduler_url` no Vault e o comando do job. Saída em `docs/talkx/recovery/evidence/X023/preflight-<data>.json`. Disparar `deploy-functions.yml` para o que divergir, aguardar aprovação e repetir. Regras novas em `docs/talkx/OPERACAO.md`: sem preflight verde do dia não se lança campanha real; enquanto CAP-066 não estiver no ar, campanha real não usa `{{link}}`.
- **Aceite:** `node scripts/edge-deploy/talkx-preflight.mjs` com `diverged: 0` nas 5 funções e `missing: 0` nos segredos, anexado; tag `edge-deploy/*` do run citada no arquivo de evidência; teste unitário `scripts/edge-deploy/talkx-preflight.unit.mjs` (digest divergente → saída ≠ 0).
- **V3:** V99 (pré-condição que o V3 não tinha)
- **Negócio:** garantia de que o que foi corrigido é o que está no ar antes de enviar para cliente.
