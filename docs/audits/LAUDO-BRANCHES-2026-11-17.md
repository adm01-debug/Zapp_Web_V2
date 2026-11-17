# Laudo das branches vivas — 2026-11-17

Varredura de **todas** as branches do repositório contra a `main` em `472810a4`, com prova
byte/linha. Nome de branch, PR ou commit **não** foi usado como prova de incorporação em
nenhum ponto.

> **Errata do mesmo dia.** Duas correções entraram depois da primeira redação, e as duas vêm
> do mesmo erro de método: classificar por **caminho** em vez de por **conteúdo**. (1) A seção
> "Buracos REAIS" listava cinco itens; dois não eram buraco — a `main` preserva o arquivo em
> `docs/_arquivo/` e em `supabase/migrations/_superseded/`, com a decisão de não aplicar
> escrita ao lado. (2) Seis nomes de branch estavam grafados com `/` onde o remoto usa `_`
> (`claude/pink_…` em vez de `claude_pink/…`) — quem seguisse o laudo levaria 404. Detalhe na
> própria seção.

## Por que `ahead_by` não serve neste repo

O repo usa **squash-merge**. Toda branch já mergeada continua `ahead_by > 0` para sempre,
porque seu commit original nunca entra na `main`. Medido: **das 115 branches auditadas,
0 tinham `ahead_by == 0`** — inclusive as cujo conteúdo está integralmente na `main`.
Quem apagar branch por `ahead_by` não apaga nada; quem confiar nele para dizer
"não incorporada" erra em 100% dos casos aqui.

## Método (3 camadas, da mais barata para a mais cara)

1. **Árvore x árvore.** `git ls-tree -r origin/main` local (10 816 blobs) contra
   `GET /git/trees/<branch>?recursive=1` de cada branch (nenhuma resposta truncada).
   Dá o SHA de cada blob dos dois lados: blob igual = conteúdo idêntico, byte a byte.
2. **Linha a linha.** `GET /compare/main...<branch>` (paginado, as 3 branches com mais de
   300 arquivos incluídas) para pegar o patch de cada arquivo que a branch mudou desde o
   merge-base. De cada patch extraem-se as linhas **adicionadas** (descartando linha com
   menos de 10 caracteres e linha só de pontuação, que dariam falso positivo) e pergunta-se:
   essa linha está no arquivo da `main` hoje? **103 989 linhas adicionadas conferidas.**
3. **Objeto a objeto, contra produção.** Para migration, arquivo no repo não prova nada: o
   que vale é o banco. Cada migration ausente da `main` foi baixada da sua branch, teve os
   objetos que cria extraídos (tabela, função, policy, índice, trigger, tipo, coluna) e cada
   objeto foi consultado no projeto oficial `tnnnlkbymytvtqngbbqh`.

A camada 3 é a que desfaz o erro mais perigoso: **o ledger de versões mente**. Das 27
versões de migration ausentes da `main`, só 1 aparece como aplicada em
`supabase_migrations.schema_migrations` — mas 18 delas têm **todos** os objetos vivos em
produção, criados por outro arquivo com outro timestamp. Olhar só o ledger diria
"26 migrations perdidas"; olhar o objeto diz a verdade.

## Números

| Medida | Valor |
|---|---:|
| branches vivas no início | 117 |
| auditadas (fora `main` e `contexto`) | 115 |
| linhas adicionadas conferidas contra a `main` | 103 989 |
| linhas adicionadas ausentes da `main` | 59 284 |
| dessas, em relatório/inventário/gerado | 21 071 (35,5 %) |
| dessas, em camada funcional após descontar migration obsoleta | **25 491** |
| arquivos funcionais com pendência | 861 |
| arquivos funcionais **ausentes** da `main` | 56 |
| branches apagadas com prova | 4 |
| branches ainda pendentes | 107 |

Distribuição das 59 284 linhas ausentes, por camada:

| linhas | % | camada |
|---:|---:|---|
| 21 071 | 35,5 | `analise-prs/`, `inventario/`, `auditoria-supabase/` (relatório de agente) |
| 12 681 | 21,4 | `src/` (front) |
| 7 850 | 13,2 | raiz (`PENDENCIAS.md`, `RELATORIO_CI.md`, …) |
| 7 165 | 12,1 | `scripts/` |
| 3 817 | 6,4 | `supabase/migrations/` |
| 2 320 | 3,9 | `supabase/functions/` |
| 2 123 | 3,6 | `.github/` |
| 1 567 | 2,6 | `docs/` |
| 467 | 0,8 | `supabase/deployment-manifest.json` (gerado) |
| 220 | 0,4 | `e2e/` |

## Apagadas — com prova e com SHA para voltar atrás

O commit continua recuperável pelo SHA mesmo depois de a ref ir embora.

| branch | head | prova |
|---|---|---|
| `codex/consolida-docs-deploy-ga98` | `dc65649add980b32ee86cc6f3a66b42f448d3e11` | 28 linhas adicionadas, **todas** presentes na `main`; nenhum arquivo ausente |
| `claude/fix-talkx-cron-startup-timeout-261101-2200` | `9db8ac785490c8a6d5e0b15a39b28bcb27d36aff` | única contribuição é `20261026200300_fix-talkx-cron-startup-timeout.sql`; `talkx_engine_cron_runs` e `trigger_talkx_engine_tick` **existem em produção**; o índice `idx_job_run_details_jobid_start` está na `main` em `20261117160000` |
| `claude/fix-talkx-cron-startup-timeout-261025-1700` | `671b5294f2cfedb1c769aec4531a4f7fdb84e102` | mesma migration acima; resto é `auditoria-supabase/progresso.json` (rastreador de progresso de auditoria) |
| `claude/chore-plano-E19-E20-E21-261101-1740` | `40f7bb3d3c010b402c05d621279ff46f4c4d36c9` | 7 linhas, em `docs/reconciliation/PLAN_REGISTRY.json`, `ARTIFACT_MANIFEST.json` e `CONTRIBUTING.md` |

## Migrations ausentes da `main` cujos objetos estão VIVOS em produção (obsoletas)

O arquivo não está na `main`, mas o objeto existe no banco — o trabalho entrou por outro
arquivo. Apagar a branch não perde nada destas:

| migration ausente | objeto conferido vivo |
|---|---|
| `20261101133000_outbound_post_started.sql` | `claim_outbound_message`, `mark_outbound_post_started`, `resolve_unconfirmed_message`, `guard_message_delivery_internal_fields`, `messages.delivery_post_started_at`, `messages.manually_resolved_at` |
| `20261113130200_conversation_status_regras_e_so_por_rpc.sql` | `set_conversation_status`, `set_conversations_status`, `enforce_conversation_status_transition`, `guard_conversation_status_direct_update`, trigger `trg_contacts_conversation_status_rpc_only` |
| `20261113130400_varredura_mensagens_presas_em_enviando.sql` | `sweep_stuck_outbound_messages` |
| `20261113130500_transfer_conversation_cas_sem_dono.sql` | `transfer_conversation` |
| `20261113130600_agendadas_conexao_do_contato_caida.sql` | `dispatch_scheduled_messages` |
| `20261113140000_remove_enum_special_agent.sql` | tipo `app_role`, `has_role`, `effective_role`, `admin_set_role` |
| `20261026200300_fix-talkx-cron-startup-timeout.sql` | `talkx_engine_cron_runs`, `trigger_talkx_engine_tick` |
| `20261101223000_talkx_suppression_reasons.sql` | tabela `talkx_suppression_reasons`, `talkx_suppress_contact`, `talkx_suppression_reasons_guard`, trigger `talkx_suppression_reasons_guard_trigger` |
| `20261111180000_resolve_unconfirmed_somente_sending.sql` | `resolve_unconfirmed_message` |
| `20261023100000_talkx_campaign_recipients_page_add_segment.sql` | `talkx_campaign_recipients_page` |
| `20261026100000_search_event_rpc.sql` | `log_search_event`, `search_events.client_event_id` (a **policy** desta migration NÃO entrou — ver achado 2) |
| `20261026120300_log_search_event_rpc.sql` | `log_search_event` |
| `20261030200000_copilot_live_motor.sql` | `enqueue_copilot_tick_on_contact_message`, trigger `trg_copilot_tick_on_contact_message`, `copilot_insights.tier`, `copilot_sessions.last_contact_message_at` |
| `20261016193100_copilot_insights.sql` | tabela `copilot_insights` |
| `20261016193300_copilot_tick_trigger.sql` | `enqueue_copilot_tick_on_contact_message` + trigger |
| `20261016193500_copilot_retention.sql` | tabela `copilot_retention_aggregates`, `run_copilot_retention` |
| `20261108180000_copilot_tick_trigger.sql` | mesmo trigger, sob o nome que vigora |
| `20261108180200_copilot_retention.sql` | tabela + `run_copilot_retention` |

## Buracos REAIS — objeto que não existe em produção nem na `main`

**Corrigido no mesmo dia.** A primeira versão desta seção listava cinco itens; **dois saíram**.
O grep que a sustentava cobria só `src`, `supabase/functions`, `e2e` e `scripts`, e por isso
não via as duas pastas em que este projeto **preserva de propósito** o que decidiu não aplicar:
`docs/_arquivo/` e `supabase/migrations/_superseded/`. Arquivo preservado com decisão escrita
não é trabalho perdido — é trabalho arquivado. Tratar um pelo outro é o erro que este laudo
existe para evitar, e ele aconteceu aqui.

Sobra isto, que de fato não chegou a lugar nenhum:

| objeto | não existe | mora em |
|---|---|---|
| tabela `copilot_insight_feedback` + `guard_copilot_insight_feedback_retained_at` + trigger de retenção | produção, `main`, `_arquivo/`, `_superseded/` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` (`20261016193200`) |
| `touch_copilot_sessions_updated_at` + trigger `trg_touch_copilot_sessions` | produção, `main`, `_arquivo/`, `_superseded/` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` (`20261016193000`) |
| hook `src/hooks/chat/useCopilotSession.ts` (93 ln) + `src/components/inbox/copilot/index.ts` | `main` | `claude/feat-copilot-radar-20261108-1800` |

Prova de ausência dos dois primeiros: `git grep` na `main` inteira (não só em `src`) devolve
ocorrência **apenas** em `analise-prs/` e `docs/_arquivo/analise*/` — isto é, em dossiê que
*descreve* a branch. Nenhum arquivo `.sql` da `main`, em pasta nenhuma, cria esses objetos.

### Saíram da lista: arquivo preservado na `main`, decisão documentada

| item | onde a `main` guarda | o que a decisão diz |
|---|---|---|
| `copilot_presence` + `copilot_has_presence` + `upsert_copilot_presence` | `docs/_arquivo/copilot-presence-261108/20261108180100_copilot_presence.sql` + `README.md` ao lado | O README registra a decisão de 16/11 de **não** aplicar, com o SHA do blob (`35b6d6e7…`) e a medição que a sustenta: `tabela 0 | rpc 0 | policies 0 | indices 0 | ledger 0` |
| `e2e_fixture_message` | `supabase/migrations/_superseded/20261020120000_e2e_fixture_message_rpc.sql` + `README.md` da pasta | Versão **mais completa** que a da branch: assinatura `e2e_fixture_message(p_op text default 'insert')` contra `(p_op text)` da branch. O arquivo da branch (`20261016250000`) é rascunho anterior da mesma função |

Nos dois casos o objeto continua sem existir em produção — isso a primeira versão acertou.
O que ela errou foi a conclusão: apagar essas branches não perderia nada, porque o arquivo
e o motivo já estão na `main`.

### O hook de nome igual **não** é o mesmo hook

A `main` tem `src/hooks/copilot/useCopilotSession.ts`. É tentador concluir "então o hook da
branch é só um arquivo movido" — e é falso. São dois hooks diferentes com o mesmo nome:

| | `main` (`hooks/copilot/`) | branch (`hooks/chat/`) |
|---|---|---|
| chave de busca | `contact_id`, mais recente por `started_at` | `conversation_id`, `maybeSingle` |
| estado | mapeia as letras B·R·I·N·D·E, `brinde_evidence`, `stakeholders` | devolve a linha crua de `copilot_sessions` |
| insights | não lê | lê `copilot_insights` (10 mais recentes) |
| ação | nenhuma | `tick` → `POST /functions/v1/copilot-live`, com invalidação de cache |
| infra | `useState`/`useEffect` | `@tanstack/react-query` |

Ou seja: a `main` tem a leitura do RADAR; a branch tem **a leitura mais a chamada do motor**.
O que falta na `main` é o gatilho do lado do front — a edge `copilot-live` nunca é chamada por
tela nenhuma. É o item a terminar, e é decisão de produto, não de limpeza.

**O copilot está meio implantado.** `copilot_sessions`, `copilot_insights` e
`copilot_retention_aggregates` estão vivos, com o trigger de tick; `copilot_presence` e
`copilot_insight_feedback` não. **Não há regressão viva**: nenhum arquivo executável da `main`
(`src`, `supabase/functions`, `e2e`, `scripts`) menciona `copilot_presence`,
`copilot_insight_feedback`, `upsert_copilot_presence`, `copilot_has_presence` ou
`touch_copilot_sessions_updated_at` — zero ocorrência de cada um. A metade que falta não
quebra nada hoje.

`e2e_fixture_message` tem um detalhe que merece atenção e que segue valendo: a versão
`20261016250000` **aparece como aplicada** no ledger e a função **não existe** no banco. Foi
aplicada e depois perdida, ou aplicada com outro conteúdo. A versão que vale é a de
`_superseded/`, e ela também não está no banco.

## Achados de auditoria de outro agente, abandonados e ainda verdadeiros

A branch `claude/festive-faraday-kv669k` carrega uma auditoria de Supabase com duas
propostas de correção escritas e nunca aplicadas (`auditoria-supabase/propostas/`). As duas
foram remedidas contra a produção **hoje**:

1. **`FIX-S02-001` — ledger sem `statements`.** A auditoria (26/10) achou 63 versões com
   `statements = NULL`, o que impede replay do schema. Medido agora:
   **63 de 1 141 registros** — não mudou nada em três semanas. Confirmado pendente.
2. **`FIX-S03-002` — RLS ligado sem nenhuma policy.** A auditoria achou 17 tabelas.
   Medido agora: **19** — mas **a proposta não deve ser resgatada**, e a redação anterior
   deste item ("Piorou") estava errada. Ver a errata ao fim desta seção. A lista atual:
   `_rb_message_reactions_contato_20261007001008`, `_zapp_fn_before`, `_zapp_mig133_log`,
   `agent_mini_game_xp_daily`, `ai_budget_reservations`, `ai_jobs`, `away_message_log`,
   `catalog_rate_limit_hits`, `catalog_rate_limits`, `edge_rate_limits`,
   `gmail_oauth_states`, `link_preview_cache`, `search_events`,
   `searchbox_budget_alert_cron`, `searchbox_budget_alert_emails`,
   `talkx_storage_purge_queue`, `talkx_test_send_claims`,
   `team_chat_media_acl_r2_db_020_rb`, `voip_profile_credentials`.

   **Não é feature quebrada**: conferido com `git grep` que nenhuma dessas tabelas é lida
   direto pelo front (`.from('<tabela>')` em `src/` = 0 em todas); só edges as tocam, e edge
   usa `service_role`, que ignora RLS. Quatro delas (`_rb_*`, `_zapp_*`, `*_rb`) são sobra de
   rollback/backup e o caminho certo para elas é remoção, não policy.

   ### Errata — `FIX-S03-002` não está pendente: é decisão já implementada

   A redação original ("Piorou", "endurecimento e conformidade de auditoria") tratava as 19
   tabelas como lacuna aberta. Está errado, e o erro tem consequência: seguir a proposta
   adicionaria policies a tabelas cujo isolamento **deny-all é intencional e documentado**,
   ou seja, **enfraqueceria** a proteção em vez de reforçá-la. Apontado pelo Codex na #3233 e
   conferido na produção oficial (`tnnnlkbymytvtqngbbqh`) em 17/11:

   - `supabase/migrations/20261026220300_classificar_rls_sem_policy.sql` percorre essas
     tabelas e grava em cada uma `COMMENT ON TABLE ... '[RLS-sem-policy: intencional] ...'`,
     dizendo por que não há policy e quem acessa (worker, edge ou RPC `security definer`).
   - Medido ao vivo: das 19 tabelas com RLS e zero policy, **17 carregam esse comentário**.
     As 2 restantes são `away_message_log` e `search_events`, e nelas
     `information_schema.role_table_grants` devolve grant **somente para `service_role`** —
     nada para `anon` nem `authenticated`. Portanto **zero exposição** também nessas duas.
   - Caso mais explícito: `supabase/migrations/20261013230011_voip_profile_credentials.sql`
     define deny-all e revoga acesso direto até de `service_role`, deixando a leitura e a
     escrita apenas pela RPC `set_voip_profile_credentials`.

   **O que sobra de verdade**: dar a `away_message_log` e `search_events` o mesmo
   `COMMENT ON TABLE ... [RLS-sem-policy: intencional]` das outras 17, para que a próxima
   auditoria não volte a contá-las como lacuna. É DDL em produção, então fica para o dono
   decidir pelo fluxo de `docs/agentes/banco.md` — não é correção de segurança.

Essa branch **não foi apagada** justamente por causa dessas duas propostas.

## Branches pendentes — as 38 com mais volume funcional fora da `main`

`ausentes` = arquivo que não existe na `main` de forma alguma (o que se perderia ao apagar).
`linhas` = linhas adicionadas pela branch que não estão na `main` hoje, já descontados
relatório, inventário, arquivo gerado e migration provada obsoleta acima.

| branch | arq. pendentes | linhas | ausentes |
|---|---:|---:|---:|
| `claude/fix-logger-vitest-mock-261017-1000` | 294 | 2937 | 4 |
| `claude_pink/cool-dijkstra-xk9ek2` | 73 | 2154 | 13 |
| `claude/fix-ga-resto-dbmigrate-20261021-0729` | 19 | 1647 | 10 |
| `claude/ga-ci-verde-261020` | 104 | 1413 | 0 |
| `claude_pink/nice-hypatia-iikl82` | 291 | 1341 | 9 |
| `claude/ecstatic-bardeen-twiveb` | 75 | 822 | 2 |
| `claude/fix-unit-tests-pre-existentes-261024-1700` | 83 | 804 | 2 |
| `claude/fix-ga-fase78-perimetro-custo-261020-2200` | 20 | 799 | 3 |
| `codex/publish-followup-20261021` | 42 | 708 | 1 |
| `claude/feat-copiloto-edges-261101-1330` | 19 | 575 | 1 |
| `claude/feat-copilot-radar-20261108-1800` | 11 | 568 | 3 |
| `claude_juca/practical-rubin-8xnw0u` | 18 | 549 | 1 |
| `fix/ci-workflows-vermelhos` | 282 | 496 | 3 |
| `claude/charming-mccarthy-jbxy56` | 40 | 479 | 3 |
| `claude/fix-ga-fase23-edge-e2e-261020-2200` | 14 | 435 | 0 |
| `claude/feat-radar-fase6-261108-1933` | 6 | 389 | 1 |
| `fix/ci-verde-261021` | 32 | 379 | 0 |
| `claude/fix-radar-fase6-cv056-shortcuts-261108-2335` | 5 | 343 | 1 |
| `claude_05/zen-feynman-29b7ix` | 17 | 332 | 2 |
| `claude/feat-copiloto-edge-fns-fases8-15-261024-1615` | 7 | 323 | 0 |
| `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423` | 6 | 317 | 1 |
| `claude/feat-copiloto-edge-fases8-10-261024-1700` | 7 | 304 | 0 |
| `claude/fix-ga-resto-typessync-20261021-0730` | 5 | 304 | 1 |
| `claude/feat-copiloto-edges-fases8-10-261024-1545` | 7 | 297 | 0 |
| `claude/fix-pd79-compat-pre-migration-261111` | 10 | 291 | 1 |
| `claude/fix-ga-resto-sonar-contracts-20261021-0726` | 24 | 290 | 0 |
| `claude/chore-db-guard-testes-resgatados-261117-1140` | 3 | 287 | 2 |
| `claude/chore-fila-merge-resgatada-261117-1520` | 2 | 284 | 2 |
| `claude/fix-ga-fase0-banco-e2e-261020-2200` | 12 | 230 | 3 |
| `claude/fix-unit-tests-src-261024-1630` | 31 | 220 | 0 |
| `claude/confident-bardeen-ndq0ch` | 16 | 199 | 0 |
| `claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023` | 10 | 196 | 1 |
| `claude/fix-talkx-segmentos-regressao-261101-1944` | 2 | 190 | 0 |
| `claude/feat-copiloto-hooks-261101-1500` | 7 | 176 | 0 |
| `claude/feat-talkx-x048-estados-servico-261101-2100` | 6 | 153 | 2 |
| `claude/feat-talkx-x070-suppression-reasons-261101-2230` | 1 | 145 | 1 |
| `claude/fix-z017-z020-auth-cors-261018-1950` | 1 | 144 | 1 |
| `claude/feat-copiloto-cv011-020-migrations-261016-1930` | 3 | 140 | 3 |

As duas branches `chore-db-guard-testes-resgatados` e `chore-fila-merge-resgatada` são
resgates desta mesma sessão, com PR aberta — a pendência delas se fecha no merge.

## Branches cujo conteúdo é histórico (dossiê de PR fechada)

`claude_05/awesome-ramanujan-ufxolu`, `claude_pink/dreamy-wright-j0bser` e
`claude/wizardly-meitner-aejx3i` não têm **nenhuma** linha funcional fora da `main`: tudo que
elas carregam é `analise-prs/` — dossiê por PR (#2087 a #2545) e snapshots intermediários do
mesmo relatório que a `main` já tem na versão final. Amostra conferida: #2087, #2129 e #2519
estão fechadas sem merge; #2545 fechada e mergeada. **Não foram apagadas** porque
`analise-prs/prs_inventory.json` (2 176 linhas) e ~150 dossiês não existem na `main`, e a
regra do dono é não perder trabalho sem ter certeza.

A consolidação **saiu do papel** e está em `claude/chore-dossies-resgatados-261117-1629`, e no
caminho apareceu um achado que vale registrar como regra: dos 65 dossiês resgatados dessas três
branches, **só 17 são caminho novo**. Os outros 48 têm caminho igual a um arquivo que a `main`
já tem — e publicá-los por cima **perderia** conteúdo, porque as duas versões não se contêm.
Medido em `docs/_arquivo/analise-prs/dossies/PR-2129.md`: a da `main` tem 35 linhas e carrega
`Head SHA`, `Base SHA`, nome da branch, rótulo de status e a tabela de veredito de 4 perguntas;
a da branch tem 123 linhas de análise de diff e **nenhum** desses campos. Nos 48 casos a versão
da branch é mais longa (0 de 48 é menor), o que torna o engano fácil: parece upgrade e não é.
Por isso as duas convivem — a `main` mantém `dossies/` como está e a segunda análise entra em
`docs/_arquivo/analise-prs/dossies-analise-261116/`. As três branches só podem ser apagadas
depois que essa PR mergear, e `analise-prs/prs_inventory.json` (2 176 linhas) continua pendente.

## O que este laudo NÃO resolve

- As 25 491 linhas funcionais pendentes nas 107 branches **não foram lidas uma a uma**.
  O que está provado é onde cada uma está e quanto é; o julgamento "isto é melhoria a
  reaproveitar" x "isto é churn que a `main` já superou" exige ler o trecho.
- Nenhuma das 107 pode ser apagada com base só neste laudo.
- Branch `contexto` é gerada por automação e está fora da auditoria de propósito.

## Como refazer / continuar

A varredura é reprodutível com `gh api` (leitura) + `git ls-tree` local, sem nenhuma
escrita. Três chamadas por branch: `/compare/main...<branch>` (paginado),
`/git/trees/<branch>?recursive=1` e, para migration ausente, `/contents/<arquivo>?ref=<branch>`.
A conferência de objeto vivo é SQL de leitura no projeto oficial contra `pg_class`,
`pg_proc`, `pg_trigger`, `pg_policy`, `pg_type` e `information_schema.columns`.
