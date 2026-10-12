# Área 01 — Talk X (campanhas / disparo em massa WhatsApp) + Multiplix

Varredura somente leitura em `HEAD 99aa53f` (main de 2026-10-11). Clone raso (50 commits, a partir de 03/10):
o que veio antes de 03/10 foi confrontado com o ledger de reconciliação `docs/reconciliation/tasks/P046.json`
(baseline `2e7cf81`, 03/10) e `docs/reconciliation/reports/modules/TALKX_MULTIPLIX.md`; tudo o que mudou de 03/10 a
11/10 (commits X028–X034, X047 e os lotes de fábrica #1890, #1897, #1900, #1902, #1905, #1908, #1911) foi
reverificado no código. Nenhum SQL foi executado; "aplicado em produção" foi inferido do `supabase/schema-catalog.json`
regenerado do banco (commits `chore(db): sincronizar artefatos derivados`).

**Critério de "concluído" usado aqui:** o delta da etapa existe no repositório (código + teste versionado) e está
ligado a quem usa. **Nenhum** item está provado em execução real: não há registro de envio do Talk X em produção, não há ensaio
(X035), nem aceite visual do dono (X198). Componente que existe mas não é montado em tela conta como PARCIAL.

---

## 1. Fontes lidas

| Caminho | Tipo | Nº etapas/itens | Data | Vigente/substituído |
|---|---|---|---|---|
| `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` | plano | 200 (X001–X200), 17 telas, 1.135 elementos, 110 capacidades | 01/10 | **vigente** (cabeçalho ainda diz "proposto") |
| `docs/talkx/v4/etapas/F00…F16-*.md` (17 arquivos) | plano detalhado (Hoje/Fazer/Aceite) | 200 | 01/10 | vigente |
| `docs/talkx/v4/etapas.json` | plano (máquina) | 200 | 01/10 | vigente |
| `docs/talkx/v4/STATUS.md` + `scripts/talkx/v4-status.mjs` | status gerado | 2/200 etapas; 217/1.135 elementos | regen. 07/10 | vigente, porém congelado no ledger de 03/10 |
| `docs/talkx/v4/DECISOES.md` | decisões | A1–A18, N01–N45 | 01/10 | vigente (N04, N36, N40 aguardam o dono) |
| `docs/talkx/v4/inventario/A…H_*.md` + README | inventário elemento×código | 1.135 elementos + 110 capacidades | 01/10 | vigente (não recontado desde 01/10) |
| `docs/talkx/PARIDADE.md` | checklist | — | 09/09 | **substituído / desatualizado** (banner) |
| `docs/talkx/ARQUITETURA.md`, `OPERACAO.md`, `CONVERSOES.md`, `CHANGELOG_TALKX.md`, `README.md` | docs | — | 08/09–09/10 | correntes (README/ARQ/OPER retocados em 09/10) |
| `docs/talkx/help/**` (6 `.md`), `docs/talkx/n8n/talkx-alerts.json`, `docs/talkx/recovery/evidence/X023/` | docs/artefatos | 6 artigos; 1 evidência | 03–09/10 | correntes |
| `docs/talkx/_arquivo/` (V3 100, E01–E100, Recuperação 100, Auditoria 29/09, Handoff 03) | planos antigos | 100 + 100 + 100 | 09/09–02/10 | **substituídos** (absorvidos pelo V4 §10) |
| `docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md` | plano | 100 (F01–F100); 61 `[x]` / 39 `[ ]` | 29/09 | **vigente** |
| `docs/multiplix/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_2026-09-26.md` | plano | 200 (E001–E200) | 26/09 | substituído (auditoria 29/09: 11 feitas, 74 parciais, 115 ausentes) |
| `docs/plans/PLANO_MULTIPLIX_200_ETAPAS.md`, `docs/plans/PLANO_IMPLEMENTACAO_MULTIPLIX_200_ETAPAS_v1.1_2026-09-26.md` | cópias do plano 200 | 200 | adicionados 08/10 | substituídos (cópias **sem** o banner de sucessor) |
| `docs/multiplix/AUDITORIA_IMPLEMENTACAO_MULTIPLIX_2026-09-29.md`, `ESTADO_INICIAL.md` | auditoria/medição | 30 achados | 26–29/09 | histórico |
| `docs/multiplix/PONTE_SINGU.md`, `CANAL.md`, `PERMISSOES.md`, `SCHEMA.md`, `ARQUITETURA.md`, `COMPONENTES.md`, `DESIGN_TOKENS_MAP.md` | spec/contrato | — | 26/09–09/10 | correntes |
| `docs/handoffs/HANDOFF_MULTIPLIX_2026-10-08.md`, `docs/audits/RETRO_MULTIPLIX_2026-10-08.md` | handoff/retro | 100 itens recontados | 08/10 | correntes, mas anteriores ao lote de 09/10 |
| `docs/adr/ADR-007-multiplix-ponte-singu-canal-e-aptidao.md` (Aceito), `ADR-007-multiplix-ponte-singu.md` (Superseded), `ADR-007-MULTIPLIX.md` (Proposto, add. 08/10) | ADR | D1–D4 | 26–29/09 | 1 vigente + 2 históricos |
| `docs/design/Multiplix_ZAPP_V2_Especificacao (1).md` (+ protótipo .html) | spec de produto | 3 evoluções futuras | 25/09 | referência |
| `docs/design/MODULO_MULTIPLIX_TALKX_CONFIG_SEGURANCA.md` | spec descritiva | 12 riscos | 07/10 | corrente (com afirmações já superadas) |
| `docs/plans/PLANO_TERCEIRA_LEVA_TALKX_MULTIPLIX_2026-10-08.md` + `TERCEIRA_LEVA_CARTOES_2026-10-08.tsv` | plano de cartões | 180 TL (131 Talk X, 49 Multiplix) | 08/10 | vigente ("sem DDL/migration") |
| `docs/plans/PENDENCIAS_DO_DONO_2026-10-08.md` | pendências do dono | — | 08/10 | corrente |
| `docs/reconciliation/reports/modules/TALKX_MULTIPLIX.md`, `tasks/P046.json`, `RECONCILIATION_WAVE_*` (stubs históricos) | reconciliação | 300 tarefas, 14 achados (MX01–MX09, TX01–TX05) | 03/10 | ponto de partida (baseline `2e7cf81`) |
| Código: `src/components/talkx/**` (52 arq.), `src/components/multiplix/**` (3), `src/components/campaigns/**` (3), `src/hooks/integrations/useTalkX*/useMultiplix*` (19), `supabase/functions/talkx-*` (6 edges), `multiplix-*` (4 edges), `_shared/{talkx*,multiplix*,messaging/*,evolution-webhook*}`, 127 migrations `*talkx*/*multiplix*/*singu*`, 72 scripts `scripts/db-audit/{talkx,multiplix}*`, `e2e/{talkx*,multiplix}.spec.ts` + fixtures | código | — | até 09/10 | — |

---

## 2. Placar por plano

| Plano | Total | Concluído (verificado no código) | Parcial | Não iniciado | Bloqueado | Não verificável |
|---|---:|---:|---:|---:|---:|---:|
| Talk X V4 (X001–X200) | 200 | 37 | 114 | 42 | 7 | 0 |
| Multiplix — finalização (F01–F100) | 100 | 54 | 27 | 11 | 7 | 1 |
| 3ª leva — cartões Talk X (TL) | 131 | 4 | 81 | 36 | 9 | 1 |
| 3ª leva — cartões Multiplix (TL) | 49 | 9 | 24 | 10 | 6 | 0 |
| Talk X — 17 telas do mock | 17 | 0 | 15 (1 órfã) | 2 (telas 14 e 15) | 0 | 0 |
| Talk X — elementos do mock (STATUS) | 1.135 | 217 (número de 01/10, congelado) | — | — | — | recontagem não feita |
| Multiplix 200 etapas (26/09) | 200 | substituído; absorvido por F01–F100 (auditoria 29/09: 11 / 74 / 115) | | | | |
| Talk X V3 / E01–E100 / Recuperação | 300 | substituídos; V01–V26 entregues, V27–V100 absorvidos pelo V4 (§10 do plano) | | | | |

Critério: "Concluído" = delta da etapa no repositório com teste e ligado ao consumidor (sem prova de execução real).
Os cartões TL herdam o estado do X/F que referenciam; 9 cartões sem X/F (P1-7, HOOK-MORTO, N04, N36, N40, E08,
DOC-FALSA, E95, F100) estão classificados à mão na §3.21.

Movimento desde a reconciliação de 03/10 (não refletido no `STATUS.md`): Talk X ganhou X028, X030, X031, X032,
X033, X034, X047, X099, X189 (concluídos em código) e avançou X051, X076, X078, X080, X081, X089, X095, X096, X122,
X126, X137–X139, X146, X156, X184, X190 (parciais). Multiplix fechou no código os achados MX02, MX03, MX05, MX06,
MX07, MX08, MX09 e os itens F74 e F94; **MX01 e MX04 continuam abertos**.

---

## 3. Pendências detalhadas

Colunas: ID | funcionalidade | estado | planejado | existe hoje (evidência) | falta | impacto no negócio | prioridade | dependência.

### 3.1 Talk X — Fase 0 · Régua e governança (X001–X005: 2 concluídos, 3 pendentes)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X002 | Placar automático do V4 | DIVERGENTE / PARCIAL | Placar de etapas e elementos que acompanha as entregas | `scripts/talkx/v4-status.mjs:6-22` só conta `DONE_VERIFIED` de `P046.json` (03/10); `docs/talkx/v4/STATUS.md` diz 2/200 e 217/1.135 | Reauditar P046 ou mudar a fonte; hoje nada entregue depois de 03/10 conta | O dono vê progresso travado e subestimado; ninguém sabe o que de fato andou | P2 | reauditoria |
| X003 | Base de demonstração das 17 telas | PARCIAL | Fixture determinística por tela | `e2e/fixtures/talkx-demo/01-campanhas-visao-geral.json` (31 KB); 02–17 são `{}` (3 bytes) | Popular 16 fixtures | Só a tela 01 pode ser comparada com o desenho | P2 | telas faltantes |
| X004 | Régua visual (print ao lado do mock) | PARCIAL | Captura 1672×941 por tela em toda PR | `e2e/talkx-visual.spec.ts` + `.github/workflows/e2e-talkx.yml`; pula as 16 fixtures vazias | Cobertura 17/17 | Sem prova visual de fidelidade fora da tela 01 | P2 | X003 |

### 3.2 Talk X — Fase 1 · Correções imediatas (X006–X009)
Todas as 4 concluídas em código (`talkxLimits.ts`, `TalkXAnalytics.tsx`, `segmentValidation.ts`, RPC de rascunho). Sem pendência.

### 3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X018 | Limites por minuto/dia/conexão | PARCIAL (regressão MX04) | Teto por número que soma todos os motores | `supabase/migrations/20261002551230_talkx_limits_ritmo.sql:175,189` conta o Multiplix por `multiplix_recipients.sent_at`; o worker novo grava `multiplix_delivery_items.sent_at` | Contar itens do Multiplix e testar 2 motores no mesmo número | Talk X + Multiplix no mesmo chip podem passar do teto diário sem aviso → risco de bloqueio do WhatsApp da empresa | P0 | — |
| X019 | Envio pela conexão escolhida com ritmo | PARCIAL | Edge aplica teto por conexão | `supabase/functions/talkx-send/x019-connection-budget.test.ts`; mesma fonte compartilhada de X018 | Idem X018 | Idem | P0 | X018 |
| X023 | Prova de paridade de deploy das 5 edges | PARCIAL | Preflight remoto conclusivo antes do 1º disparo | Script corrigido para "não verificado" (`scripts/edge-deploy/talkx-preflight.mjs:90-95`); única evidência `docs/talkx/recovery/evidence/X023/preflight-2026-10-03.json` só com hashes locais | Rodar com remoto + secrets e registrar | Não há prova de que o motor no ar é o do repositório | P1 | token/secrets |

### 3.4 Talk X — Fase 3 · Integridade e ensaio real (X024–X035: 11 concluídos, 1 bloqueado)

X028 (recibos de leitura no webhook), X030 (palavras/autoresposta de opt-out), X031 (reenvio e resolução de
`outcome_unknown`), X032 (consentimento + expurgo), X033 (log por destinatário, saúde, alertas) e X034 (provedor
falso + E2E de lançamento) foram entregues **depois** da reconciliação (commits `4e73c77`, `da307ba`, `73bb487`,
`e98e5ab`, `7b8fc4a`, `c5ae464`; tabelas presentes no `schema-catalog.json`). Ressalva: X031 e X033 não têm tela
(o botão é X151; os logs são X155/X167) e X032 não tem seletor de base legal (`legal_basis` aceito pela RPC, ausente
em `useCampaignEditor.ts:765`).

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X035 | Ensaio real com ≥ 50 números da equipe e queda proposital | BLOQUEADO | Campanha interna real antes de qualquer cliente | Nada: sem `docs/talkx/recovery/ENSAIO_MOTOR.md`; `docs/talkx/recovery/evidence/` só tem X023 | Executar o ensaio | Não há registro de envio do motor em produção; se nada foi testado fora do repositório, o primeiro envio real seria para cliente | P0 | N04 (números e chip do ensaio) |

### 3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X036 | Vínculo em lote ZAPP↔CRM 360 com trilha | PARCIAL | Job em lotes + `talkx_data_jobs`/`talkx_crm_link_issues` | `crm_contact_links` existe; 0 ocorrências de `talkx_data_jobs`/`talkx_data_sync_runs`/`talkx_crm_link_issues` em migrations | Job, tabelas, métricas | Público "clientes do CRM" não se resolve | P1 | — |
| X037 | Projeção `talkx_contact_attributes` | NAO_INICIADO | Empresa, cidade, UF, vendedor, estágio, compra, ticket, RFM num lugar | Nada (0 ocorrências) | Migration + RLS | Filtros comerciais do mock devolvem zero | P1 | X036 |
| X038 | Atualizar projeção pelo CRM 360 em lotes | NAO_INICIADO | `attributesBatch` em `crm-integration` | Nada | Edge + RPCs | Idem | P1 | X037 |
| X039 | Negócios ganhos do Bitrix24 → `contact_purchases` | BLOQUEADO | `pull_won_deals` somente leitura | Nada (`pull_won_deals`, `talkx_upsert_purchases_batch` = 0) | Implementar após decisão | Sem venda ligada a contato: sem receita/ROI | P1 | N36 (funil do Bitrix24) |
| X040 | RFM calculado localmente | PARCIAL | `talkx_recompute_purchase_metrics` | RFM legado; filtro RFM desabilitado em `src/components/talkx/TalkXAudienceFilters.tsx:53-57` | Função + job | Segmentação por valor/recência indisponível | P2 | X037, X039 |
| X041 | Negócio ganho vira conversão; receita e ROI | PARCIAL | `talkx_attribute_purchases` na janela | `talkx_conversions` existe (X021); 0 ocorrências de `talkx_attribute_purchases` | Atribuição + receita | Relatório não mostra quanto a campanha vendeu | P1 | X039 |

### 3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X048 | Estados WhatsApp desconectado / CRM indisponível / sem permissão | PARCIAL | Os 3 estados com botões ligados | Só WhatsApp (`TalkXView.tsx:44-45,383-386`); `useTalkXServiceStatus.ts:19-22` declara CRM fora; `TalkXCrmUnavailableState`/`TalkXNoPermissionState` (`kit/states.tsx:161,192`) sem uso | Sinal de CRM e de permissão nas telas | Operador vê tela vazia em vez do motivo | P2 | X014 |
| X049 | Modal único do kit com presets | PARCIAL | Shell + presets do mock | `kit/dialogs.tsx` (`TalkXConfirmDialog`) | Presets e espera uniformes | Confirmações inconsistentes | P3 | — |
| X050 | Trocar `window.confirm` | PARCIAL | Nenhum diálogo nativo | `TalkXTemplateEditor.tsx:124,200,271,356` ainda usam `window.confirm`/`confirm` | Trocar pelo kit | Diálogo do navegador, sem padrão | P3 | X049 |
| X051 | Fluxo único pausar/retomar/cancelar nas 5 telas | PARCIAL | `useTalkXLifecycle` em todas | Usado só em `TalkXCampaignScheduled.tsx:107` e `TalkXLiveMonitor.tsx:30` | Visão geral, Andamento, Pausada | Regras diferentes conforme a tela | P2 | X024/X025 |
| X052 | Aba e campanha na URL | PARCIAL | `talkxRoute` com `campaign=<id>` | `talkxTabRoute.ts` (aba/sub) e `talkxWizardRoute.ts`; monitor/agendada/andamento só em `useState` (`TalkXView.tsx:50-52`) | Rota por campanha | Link de campanha não abre; recarregar volta à lista | P2 | — |
| X053 | Cabeçalho com trilha e indicador | PARCIAL | Breadcrumb + indicador | "Ao vivo" e "Ajuda" (`TalkXView.tsx:320-331`); sem breadcrumb | Breadcrumb | Navegação menos clara | P3 | X052 |
| X054 | Busca ⌘K do módulo | PARCIAL | Itens que abrem o item certo | `useTalkXCommandItems.ts` em `CommandPaletteHost` | Abrir campanha/segmento/template direto | Atalho limitado | P3 | X052 |
| X055 | Prancha `TalkXKit` e matriz tela×estado | NAO_INICIADO | Prancha de referência | Nada (sem `__dev__/TalkXKit`) | Criar | Sem referência visual única | P3 | — |
| X056 | Cidade/UF/origem preenchidas em `contacts` | PARCIAL | Backfill + cobertura por atributo | 0 ocorrências de `talkx_backfill_contact_fields` | Backfill a partir da projeção | Filtro de localização quase sem dado | P1 | X037–X040 |

### 3.7 Talk X — Fase 6 · Capacidades novas do motor (X057–X076: 1 concluído, 19 pendentes)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X057 | Vários segmentos por campanha | PARCIAL | `segment_ids[]` no rascunho, dedupe no snapshot | Só estrutura (`20261002641230_talkx_v4_x057_segmentos.sql`); `useCampaignEditor.ts:339` guarda 1 `segmentId`; `useTalkXSegments.ts:246` manda `p_segment_ids: null` | RPC + snapshot + wizard | Campanha só atinge 1 segmento | P1 | — |
| X058 | Fila por segmento e lista paginada | NAO_INICIADO | `talkx_campaign_segment_queue` | Nada | RPCs | Monitor sem andamento por segmento | P2 | X057 |
| X059 | Campanha recorrente | NAO_INICIADO | Próxima ocorrência no tick | Nada (`parent_campaign_id`/`occurrence_index` = 0) | Migration + tick | Sem repetição automática | P2 | X012 |
| X060 | Dias da semana e "não perturbe" | PARCIAL | `send_weekdays`, `respect_dnd`, `dnd_hours` | `_shared/talkx-window.ts` só janela + horário comercial global | Colunas + edge | Não dá para evitar domingo/feriado por campanha | P2 | X018 |
| X061 | Bucket privado `talkx-media` | NAO_INICIADO | Bucket 16 MB + policies + colunas | Nenhuma migration cria o bucket; código já o usa: `talkx-send/process-recipient.ts:39-42`, expurgo `20261003232707:1260`, front `useTalkXMediaUpload.ts:25` | Migration do bucket | Upload de mídia impossível; telas prontas ficam desligadas | P1 | — |
| X062 | Assinar mídia do bucket no envio | PARCIAL | Referência `talkx-media/…` + nome do arquivo | Implementado na edge (`process-recipient.ts:57-110`) | Depende do bucket existir | Idem X061 | P1 | X061 |
| X063 | Modelo de mensagem interativa | NAO_INICIADO | Coluna `interactive` + validação no banco | Só o validador de front `talkxInteractive.ts` | Migration | Sem botões/enquete | P2 | N03 |
| X064 | Envio interativo com fallback | NAO_INICIADO | `sendButtons/sendList/sendPoll` + texto reserva | Nada no `talkx-send` | Edge | Idem | P2 | X063 |
| X065 | A/B completo com vencedor | PARCIAL | Pesos = 100, métrica, vencedor | Variantes legadas; `ab_winner_variant_id`/`ab_metric` = 0 | Migration + cálculo | Teste A/B não decide vencedor | P2 | X027 |
| X066 | Aprovação interna de template | PARCIAL | Submeter/revisar por outra pessoa | `TalkXTemplateEditor.tsx:39` status padrão `approved`, editável pelo próprio autor; `submit/review_talkx_template` = 0 | RPCs + regra | Qualquer autor "aprova" a própria mensagem | P2 | X063 |
| X067 | Envio de teste com trilha e limite | PARCIAL | `talkx_test_sends` + 5/10 min | Teste existe (`TalkXTemplateEditor.tsx:157`); tabela/limite = 0 | Migration + edge | Testes sem limite nem registro | P2 | X019 |
| X068 | Previsões no servidor (ETA, risco, sobreposição) | NAO_INICIADO | `talkx_campaign_forecast` | Nada; monitor passa `forecast: null` (`TalkXLiveMonitor.tsx:176`) | RPC | Sem previsão de término | P2 | X016 |
| X069 | Escala, realtime, eco no Chat, auditoria | PARCIAL | Mensagem da campanha aparece no Chat; 50k/300 ms | Suites RLS/leases | Inserção em `messages` e medição | Atendente não vê no chat o que a campanha enviou | P2 | X033 |
| X070 | Tabela de motivos de supressão | NAO_INICIADO | `talkx_suppression_reasons` | Nada | Migration | Motivos fixos, não editáveis | P2 | — |
| X071 | Trilha da supressão e fim do DELETE físico | PARCIAL | Trigger de trilha + `removal_reason` | Tela usa soft-delete (`TalkXSuppression.tsx:219`); hook morto ainda com `.delete()` (`useTalkXSuppression.ts:94`); `removal_reason`/`import_batch_id` = 0 | Trigger + colunas | Remoções sem histórico completo | P2 | X070 |
| X073 | Lidas/conversões/receita no `talkx_overview_stats` | PARCIAL | Estender a RPC | RPC X072 sem esses campos | Migration | KPIs sem conversão/receita | P2 | X041 |
| X074 | Mapa de calor, top segmentos, ranking | NAO_INICIADO | 3 RPCs | Nada | RPCs | Analytics sem "melhor horário" | P2 | X057 |
| X075 | Benchmarks e insights no servidor | PARCIAL | `talkx_benchmarks(p_days…)`, `talkx_insights` | `useTalkXInsights.ts` calcula no navegador; `talkx_insights` = 0 | RPCs | Recomendações sem base estatística | P2 | X074 |
| X076 | Infra de IA (`talkx-ai`) | PARCIAL | Edge via `ai-proxy` com teto e trilha | Edge existe (`supabase/functions/talkx-ai/index.ts:24-28`, `supabase/config.toml:83`), mas `talkx_ai_requests` e as chaves de orçamento não existem em migration → recusa tudo; nenhuma tela chama | Migration + consumidores | Nenhuma | P3 | N41 (IA desligada) |

### 3.8 Talk X — Fase 7 · Visão geral (X077–X082: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X077 | KPIs da Visão geral vindos da RPC | PARCIAL | `useTalkXOverviewStats` | RPC `talkx_overview_stats` existe sem consumidor; KPIs calculados no navegador (`TalkXOverview.tsx:173-185,219-223`) | Hook + comparativo | Números dependem de baixar todas as campanhas | P2 | X072 |
| X078 | Listagem paginada no servidor | PARCIAL | Paginação, filtros e realtime no banco | `useTalkXCampaignList.ts` (487 l., testado) **órfão**; tela filtra/pagina em memória (`TalkXOverview.tsx:149-171`) | Ligar o hook | Lentidão com muitas campanhas | P2 | — |
| X079 | Tabela nas colunas do mock | PARCIAL | `TalkXTable` com miniatura, chips | Tabela atual | Colunas do mock | Cosmético | P3 | X078 |
| X080 | Ações de linha persistidas | PARCIAL | Duplicar/excluir com regra/pausar com motivo | `useCampaignRowActions.tsx` em `TalkXOverview.tsx:88` | Regras via `useTalkXLifecycle` | Ações divergentes entre telas | P2 | X051 |
| X081 | Filtros, grade e massa | PARCIAL | Filtros no servidor + seleção em massa | Filtros canal/segmento/criador e grade (`TalkXOverview.tsx:26-28,138-140`), no cliente | Servidor + massa | Idem X078 | P3 | X078 |
| X082 | Painel lateral (3 números, dica do dia) | PARCIAL | Rail com números reais | Ações rápidas/últimas campanhas (`TalkXOverview.tsx:391-405`) | 3 números + dica | Rail sem informação útil | P3 | X072–X075 |

### 3.9 Talk X — Fase 8 · Templates (X083–X098: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X083 | Colunas canal/ícone/mídia/interativo/arquivo | PARCIAL | Migration aditiva | Mídia por URL legada | Migration | Bloqueia upload/botões | P2 | X061, X063 |
| X084 | RPC `save_talkx_template` (versão, nota, restauração) | PARCIAL | RPC única | Salvamento legado V26; RPC = 0 | RPC | Versões sem nota | P2 | X083 |
| X085 | Variantes em conjunto, arquivar, guarda, importação | PARCIAL | Lote transacional | Variantes legadas | RPCs | Template em uso pode ser apagado | P2 | X084 |
| X086 | Métricas de template | NAO_INICIADO | Desempenho/usos/KPIs/sugestões | Nada | 4 RPCs | Não se sabe qual mensagem converte | P2 | X041 |
| X087 | Editor único de mensagem | PARCIAL | Variáveis com padrão, comandos | `TalkXMessageEditor.tsx` compartilhado | Catálogo de variáveis completo | — | P3 | X020 |
| X088 | Prévia fiel ao WhatsApp | PARCIAL | Mídia, interativo, tela cheia | `kit/preview.tsx` | Componente completo | — | P3 | X083 |
| X089 | Galeria do mock 04 | PARCIAL | Cartão fiel, paginação | `TalkXTemplates.tsx:30,206` | Estados/filtros restantes | Cosmético | P3 | X088 |
| X090 | Ações unificadas + aprovação | PARCIAL | Menu ⋮ único | Ações dispersas | Hook/menus | — | P2 | X066 |
| X091 | KPIs e "Desempenho deste template" pelas RPCs | PARCIAL | Fonte no servidor | KPIs contam objetos carregados | Hooks | Números de vitrine | P2 | X086 |
| X092 | Rail: mais convertidos, sugestões | PARCIAL | Dados reais | Rail com mais usados | Conversões | — | P3 | X086 |
| X093 | Importar/exportar templates | NAO_INICIADO | CSV/JSON com prévia | Nada | Tudo | — | P3 | X085 |
| X094 | Tela 05 no shell (rota, sub-abas) | PARCIAL | `talkxTemplateRoute` | Editor dentro da aba | Rota/sub-abas | Link do template não abre | P3 | — |
| X095 | Envio de arquivo no lugar da URL | PARCIAL (órfão) | Dropzone 16 MB | `TalkXMediaDropzone.tsx:25-27` "ainda não está montado em nenhuma tela"; editor segue com URL (`TalkXTemplateEditor.tsx:36,98`) | Montar após o bucket | Usuário precisa hospedar mídia fora | P1 | X061 |
| X096 | Botões/enquete no template | PARCIAL (órfão) | Editor interativo | `TalkXInteractiveEditor.tsx:26-28` sem import | Montar + coluna | Sem CTA clicável | P2 | X063 |
| X097 | Aba Variações A/B | PARCIAL | Lado a lado, vencedora | Edição legada | Resultado/vencedora | — | P3 | X065 |
| X098 | Nota da versão, atalhos, histórico | PARCIAL | ⌘S, proteção de alterações | Histórico existe (`fetchVersionHistory`) | Nota/atalhos | — | P3 | X084 |

### 3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)

X099 (construtor extraído com reducer, desfazer/refazer) concluído: `src/components/talkx/segments/TalkXSegmentBuilder.tsx:26,127-128`.

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X100 | Compilador de regras v2 no servidor | PARCIAL | `talkx_segment_fields` + `talkx_compile_segment_rules` | Ambos = 0; compilador legado | Migration | Filtros comerciais do mock não existem | P1 | X037–X040 |
| X101 | Ciclo de vida do segmento (rascunho, versões, tags) | PARCIAL | `save_talkx_segment_draft`/`publish_talkx_segment` | Ambos = 0 | Migration | Edição publica direto | P2 | X100 |
| X102 | Saúde do segmento | NAO_INICIADO | Risco/composição/sugestões | Nada | RPC | — | P3 | X100 |
| X103 | RPC da biblioteca + histórico diário | PARCIAL | Contagem diária | `talkx_segment_count_history` = 0 | Tabela + cron | Sem tendência do segmento | P3 | X101 |
| X104 | Modelo v2 no front | PARCIAL | `segmentRules.ts` v2 | Modelo legado | Migrar | — | P2 | X100 |
| X105 | Grupos E/OU como no mock | PARCIAL | Selo, divisor, árvore | Grupos básicos | Visual | — | P3 | X104 |
| X106 | Campos de valor por tipo | PARCIAL | Multivalor, período, moeda | Campos básicos | Controles | — | P3 | X104 |
| X107 | Catálogo "Filtros disponíveis" | PARCIAL | Categorias, busca, arrastar | Catálogo básico | Completo | — | P2 | X100 |
| X108 | Resumo do segmento com números do servidor | PARCIAL | Estimativa/variação | Resumo legado | Fonte servidor | — | P3 | X103 |
| X109 | Sub-abas "Prévia e Contatos" e "Sobreposição" | NAO_INICIADO | Tabela paginada e overlap | Nada | Tudo | Não se vê quem entra no segmento | P2 | X068 |
| X110 | Salvar × Publicar, autosave, versões | NAO_INICIADO | Rascunho separado | Botão único "Publicar segmento/Salvar" (`TalkXSegmentBuilder.tsx:118`) | Tudo | Mudança vai direto para campanhas | P2 | X101 |
| X111 | Tela 03 com rota e breadcrumb | PARCIAL | Rota própria | Construtor inline em `TalkXSegments.tsx` | Rota | — | P3 | — |
| X112 | Lista lateral "Meus segmentos" | PARCIAL | Abas/busca/cartões | — | Tudo exceto base | — | P3 | X110 |
| X113 | Abas Regras Avançadas, Audiências, Modelos | NAO_INICIADO | Conteúdo real | Nada | Tudo | — | P3 | X110 |
| X114–X116 | Biblioteca: KPIs, filtros, massa, colunas, painel de detalhes | PARCIAL | Do mock 02 | `TalkXSegments.tsx` (258 l.) | RPCs e colunas | — | P3 | X101, X103 |
| X117 | Insights com IA nos segmentos | NAO_INICIADO | Sugestões aplicáveis | Nada | Tudo | — | P3 | X076, X102 |

### 3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X118 | Gerenciador de links rastreáveis no editor | NAO_INICIADO | Lista/cria links com UTM | RPCs `talkx_upsert_link`/`talkx_delete_link` existem (X021) sem tela; só aviso textual (`TalkXCampaignWizard.tsx:514`) | Componente + hook | Cliques/conversões não são medidos | P1 | X021 |
| X119 | Rascunho com segmentos, mídia, botões, dias | PARCIAL | Campos novos na RPC | `save_talkx_campaign_draft` (`20261003232707…:780-1116`) sem `segment_ids`/`interactive`/dias | Migration | Bloqueia X127/X129/X130 | P1 | X057, X061, X063 |
| X120 | Checagens de lançamento no servidor | NAO_INICIADO | `talkx_campaign_launch_checks` | Nada (0) | RPC | Lançamento sem verificação única (conexão, variáveis, supressão) | P1 | X119 |
| X121 | 3 confirmações gravadas + quem lançou | PARCIAL | `launch_confirmations` + RPC | `launched_by` gravado no start (`20261003172707…:124`); só consentimento persiste | Migration | Sem trilha de quem confirmou o quê | P2 | X120 |
| X122 | Wizard no shell (teclado, saída com pendência) | PARCIAL | Breadcrumb, rodapé fixo | Teclado e aviso de saída (`TalkXCampaignWizard.tsx:61-149`) | Breadcrumb/rodapé | — | P3 | — |
| X123 | Restaurar rascunho inteiro | PARCIAL | Todos os campos | Passo/filtros restauram (V23) | Campos de X119 | — | P2 | X119 |
| X124 | Passo 1: nome, objetivo com ícone, responsável | PARCIAL | Validação e ícones | `TalkXCampaignWizard.tsx:325,350` | Ícones/validação | — | P3 | — |
| X125 | Origem ZAPP / CRM 360 resolvida no servidor | PARCIAL | Ambas as origens | ZAPP via `talkx_resolve_audience`; CRM 360 sem dado | CRM 360 | Público CRM indisponível | P1 | X036, X038 |
| X126 | 7 filtros de audiência | PARCIAL | Os 7 do mock | `TalkXAudienceFilters.tsx:48-57`: 5 ligados; funil e RFM desabilitados | Projeção | Filtros comerciais ausentes | P1 | X037–X040 |
| X127 | Vários segmentos no wizard | PARCIAL | Seleção múltipla sem duplicar | Seleção única | Multi | Idem X057 | P1 | X057 |
| X128 | Editor único no wizard (abas, 4096) | PARCIAL | Abas por tipo de mídia | Limite 4096 (`TalkXCampaignWizard.tsx:473`) | Abas/variáveis do mock | — | P3 | X087 |
| X129 | Anexar mídia por upload | NAO_INICIADO | "Selecionar arquivo" | Só "URL pública" (`TalkXCampaignWizard.tsx:500`) | Upload | Operador precisa hospedar arquivo fora | P1 | X061 |
| X130 | Botões na campanha | NAO_INICIADO | Edição/prévia/fallback | Nada | Tudo | Sem CTA | P2 | X063, X064 |
| X131 | Resumo da campanha calculado no servidor | PARCIAL | Elegíveis, supressos, duração | Cálculo local | Hook servidor | Números divergentes | P2 | X068 |
| X132 | Prévia em moldura de celular com contato real | PARCIAL | "Ver no celular" | Bolha legada | Moldura | — | P3 | — |
| X133 | Passo Entrega completo | PARCIAL | Dias, DND, fuso, limites | `TalkXWizardDelivery.tsx` | Dias/DND/limites | — | P2 | X060 |
| X134–X135 | Revisão com dados reais e "Tudo pronto" por checagens | PARCIAL | Linhas reais + recomendações | Revisão local | Checagens | "Tudo pronto" sem verificação do servidor | P2 | X120 |
| X136 | Modal "Confirmar disparo" com 3 confirmações | PARCIAL | 3 caixas gravadas | Checkboxes (`TalkXWizardDelivery.tsx:238`); só `confirm_consent` gravado; base legal não é escolhida | Persistir as 3 | Sem prova de confirmação | P2 | X121 |
| X137–X139 | Tela 10 agendada: repetição, throttle, calendário pt-BR, resumo | PARCIAL | Do mock 10 | `TalkXCampaignScheduled.tsx` (Calendar, "Resumo da Programação" :297) | Repetição/throttle | Sem agendamento recorrente | P2 | X059, X060 |

### 3.12 Talk X — Fase 11 · Acompanhar campanha (X140–X160: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X140 | RPC `talkx_monitor_panel` | NAO_INICIADO | KPIs, séries, saúde do worker | Nada | RPC | Monitor depende de leituras limitadas | P1 | — |
| X141 | RPCs paginadas de destinatários e linha do tempo | PARCIAL | Cursor no servidor | Leituras diretas com teto: `TalkXCampaignRunning.tsx:198,276,381,626`, `TalkXLiveMonitor.tsx:70` (`limit 200/100/50/2000`) | RPCs | Campanha grande mostra lista truncada | P1 | — |
| X142 | Progresso por segmento e pré-checagem de retomada | PARCIAL | 2 RPCs | Checklist X026 no banco | RPCs | — | P2 | X057 |
| X143 | Rota por situação + URL | PARCIAL | `screenForStatus` | `TalkXView.tsx:213-217`: pausada → Andamento, concluída → Monitor; sem URL | Rota | Pausada e concluída abrem a tela errada | P1 | — |
| X144 | Hooks das RPCs com realtime/degradado | PARCIAL | 5 hooks | `useTalkXMonitor`, `useTalkXEvents` legados | Hooks | — | P2 | X140–X142 |
| X145 | Aba "Monitor" no módulo | PARCIAL | Monitor como aba | Monitor só como sobreposição (`TalkXView.tsx:291-302`) | Aba | — | P3 | X143 |
| X146 | KPIs ao vivo com comparativos | PARCIAL | Mini-gráficos | `tracking/TalkXLiveKpiRow.tsx` em Monitor e Andamento | Comparativos/forecast | — | P2 | X140 |
| X147 | Ritmo, previsto e término | PARCIAL | Séries do servidor | Sem previsão (`forecast: null`) | RPC | Sem ETA | P2 | X068 |
| X148 | "Saúde da campanha" | PARCIAL | Lê saúde do worker | Card por status (`TalkXLiveMonitor.tsx:217`); `talkx_engine_health` (X033) sem leitor | Ligar | Campanha parada não é sinalizada na tela | P2 | X033 |
| X149 | Card "Fila por segmento" | NAO_INICIADO | Tabela por segmento | Nada | Tudo | — | P2 | X058 |
| X150 | Tabela unificada de destinatários | PARCIAL | Busca/filtro/paginação | Tabelas locais | Componente | — | P2 | X141 |
| X151 | Ações por linha: conversa, reenviar, bloquear | PARCIAL | Botões por destinatário | `retry_talkx_recipients` (X031) existe sem botão | Ligar | Operador não consegue reenviar falhas | P1 | X031 |
| X152 | Linha do tempo operacional do servidor | PARCIAL | Tipos, ícones, "Ver todos" | `useTalkXEvents.ts:46` (`limit 50`) | RPC | — | P3 | X141 |
| X153–X155 | Tela 12: cabeçalho, ações, configurações, abas Destinatários/Mensagens/Resultados/Logs | PARCIAL | Do mock 12 | `TalkXCampaignRunning.tsx` (956 l.); `talkx_delivery_log` sem leitor | Abas com dados do servidor | Logs técnicos invisíveis ao operador | P2 | X141, X033 |
| X156 | Tela 13 "Campanha pausada" | PARCIAL (órfão) | Tela própria com Retomar/Encerrar | `TalkXCampaignPaused.tsx` (185 l., testado) sem nenhum import | Ligar na rota | Pausada aparece como "em andamento" | P1 | X143 |
| X157, X158, X160 | Tela 13: 8 abas, KPIs/anel, linha do tempo, resumo | NAO_INICIADO | Do mock 13 | Nada | Tudo | — | P2 | X156 |
| X159 | "Checklist para retomar" | PARCIAL | 5 itens persistidos | RPC X026 no banco, sem tela | UI | Retomada sem roteiro | P2 | X156 |

### 3.13 Talk X — Fase 12 · Relatório (X161–X169: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X161–X162 | RPCs do relatório (KPIs, séries, funil, calor, linhas) | PARCIAL | Reescrever + detalhamentos | `talkx_campaign_report` legado; breakdowns/rows = 0 | RPCs | — | P1 | X041 |
| X163–X167 | Tela 14 "Relatório" (rota, 6 KPIs, 4 séries, funil, calor, resumo, insights, 8 abas) | NAO_INICIADO | Tela dedicada | Nenhum `TalkXCampaignReport`; concluída abre o Monitor (`TalkXView.tsx:216`) | Tela inteira | Gestor não tem relatório de resultado | P1 | X161 |
| X168 | Exportar PDF/CSV | PARCIAL | Sem `window.print`, com trilha | Só e-mail via `talkx-report` (`TalkXCampaignRunning.tsx:831`) | Export | — | P2 | X163 |
| X169 | Compartilhar por link/e-mail | NAO_INICIADO | Link interno + e-mail | E-mail legado (E81) | Link/menu | — | P3 | X163 |

### 3.14 Talk X — Fase 13 · Importação e vínculo CRM (X170–X175)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X170–X175 | Tela 15: ingestão (tabelas/RPCs), tela de importação, duplicados/consentimento/supressão, sugestão de vínculo CRM, progresso, abas "CRM 360" e "Resolver conflitos" | NAO_INICIADO | Importar planilha e trazer contatos do CRM | Nada (`talkx_imports` = 0; sem `src/components/talkx/import/`) | Tudo | Lista externa não entra na campanha sem cadastro manual | P2 | X036 |

### 3.15 Talk X — Fase 14 · Supressão e Analytics (X176–X188: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X176 | RPCs de leitura da supressão | PARCIAL | Lista/KPIs/atividade | Consulta direta (`TalkXSuppression.tsx:142`); RPCs = 0 | RPCs | — | P2 | X070 |
| X177 | Importar/exportar em lote (RPC) | NAO_INICIADO | Prévia e lotes | Nada | RPCs | — | P2 | X176 |
| X178 | Hook único + paginação servidor | PARCIAL | Um ponto de acesso | `useTalkXSuppression()` morto (`useTalkXSuppression.ts:38-110`) | Unificar | — | P3 | X176 |
| X179–X182 | KPIs/centro de proteção, filtros, ações/massa, "Gerenciar motivos" | PARCIAL | Do mock 06 | Tela com KPIs/filtros/adicionar | Motivos, massa, comparativos | — | P3 | X070 |
| X183 | Importar CSV/XLSX/TXT e exportar | NAO_INICIADO | 4 passos | Nada | Tudo | Opt-outs de outra base entram um a um | P2 | X177 |
| X184 | Atividade recente | PARCIAL | Eventos de entidade | `useTalkXSuppressionActivity` (`useTalkXSuppression.ts:300`) | Trigger X071 | — | P3 | X071 |
| X185–X188 | Analytics: barra, 5 KPIs, 4 séries, funil, top segmentos, calor, insights | PARCIAL | Fontes no servidor | `TalkXAnalytics.tsx` calcula no navegador | RPCs X073–X075 | Analytics superficial | P2 | X073–X075 |

### 3.16 Talk X — Fase 15 · Ajuda (X189–X191: 1 concluído)

X189 (central em markdown com índice/busca/leitor) concluído: `src/components/talkx/help/TalkXHelpCenter.tsx`, `talkxHelpIndex.ts`, rota `?screen=help`.

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X190 | 8 tópicos e 5 guias | PARCIAL | Artigos 300–500 palavras | 6 arquivos em `docs/talkx/help/` (3 tópicos + 1 guia) | 5 tópicos, 4 guias | Usuário novo sem orientação completa | P3 | telas futuras |
| X191 | Checklist, suporte, especialista, vídeos | BLOQUEADO | Botões e vídeos | Nada em `TalkXHelpCenter.tsx`; `support_contact`/`talkx_help_views` = 0 | Tudo | Sem canal de ajuda humana | P3 | N40 + gravação dos vídeos |

### 3.17 Talk X — Fase 16 · Qualidade e release (X192–X200: 0 concluídos)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| X192–X194 | Acessibilidade, telas menores, desempenho nas 17 telas | PARCIAL | Teclado/contraste, 1280/1024/390, lazy | Testes pontuais | Passada nas 17 | — | P2 | telas 13–15 |
| X195 | Régua visual como trava | BLOQUEADO (janela) | Regressão visual obrigatória + 2 semanas verdes | Informativa e só tela 01 | Fixtures + janela | — | P2 | X003 |
| X196 | Banco limpo (replay, ledger, permissões) | PARCIAL | Replay do zero sem falhas | Replay local com 21 falhas esperadas e 64 diferenças (CLAUDE.md §0, regra 7) | Reconciliar | — | P2 | — |
| X197 | Documentação refeita por evidência | NAO_INICIADO | PARIDADE regenerada | `docs/talkx/PARIDADE.md` com banner "desatualizado" | Reescrever | Docs enganam quem lê | P3 | X002 |
| X198 | Aceite visual 17/17 com o dono | BLOQUEADO | Caderno `ACEITE.md` | Nada | Aceite | — | P1 | dono + telas |
| X199 | 1ª campanha para clientes + 7 dias | BLOQUEADO | Piloto observado | Nada | Piloto | — | P1 | X035, X198 |
| X200 | Release e encerramento | BLOQUEADO | Tag e pós-release | Nada | — | — | P3 | X198, X199 |

### 3.18 Talk X — as 17 telas do mock × componentes reais

| Tela | Componente real | Como abre | Estado | Principais lacunas |
|---|---|---|---|---|
| 01 Campanhas · visão geral | `TalkXOverview.tsx` | aba `overview` | PARCIAL | KPIs e paginação no navegador; `useTalkXCampaignList` órfão; rail sem números |
| 02 Segmentos · biblioteca | `TalkXSegments.tsx` | aba `segments` (menu "Analytics ▾ → Segmentos") | PARCIAL | Sem RPC de biblioteca, histórico, uso/desempenho |
| 03 Segmentos · criar/editar | `segments/TalkXSegmentBuilder.tsx` (inline) | dentro da aba | PARCIAL | Sem rascunho×publicar, prévia/sobreposição, campos comerciais |
| 04 Templates · biblioteca | `TalkXTemplates.tsx` | aba `templates` (menu) | PARCIAL | Sem métricas por template, import/export |
| 05 Templates · editor | `TalkXTemplateEditor.tsx` | dentro da aba | PARCIAL | Mídia por URL; dropzone e botões órfãos; aprovação livre; `window.confirm` |
| 06 Lista de supressão | `TalkXSuppression.tsx` | aba `suppression` | PARCIAL | Sem motivos, import/export, paginação servidor |
| 07 Analytics | `TalkXAnalytics.tsx` (+`TalkXSettings` em `sub=configuracoes`) | aba `analytics` | PARCIAL | Cálculos no cliente; sem calor/top/funil do servidor |
| 08 Nova campanha | `TalkXCampaignWizard.tsx`, `useCampaignEditor.ts`, `TalkXAudienceFilters.tsx`, `TalkXContactSelector.tsx` | `?wizard=…&step=` | PARCIAL | 1 segmento; mídia URL; sem links/botões; 2 filtros desabilitados |
| 09 Revisão e confirmação | `TalkXWizardDelivery.tsx` (passo 4) | `step=4` | PARCIAL | Sem checagens do servidor; confirmações não gravadas |
| 10 Campanha agendada | `TalkXCampaignScheduled.tsx` | estado interno (sem URL) | PARCIAL | Sem repetição/throttle |
| 11 Monitor ao vivo | `TalkXLiveMonitor.tsx` | estado interno, não é aba | PARCIAL | Teto de leitura, sem previsão, sem fila por segmento |
| 12 Campanha em andamento | `TalkXCampaignRunning.tsx` | `sending` e **também `paused`** | PARCIAL | Abas sem paginação; reenviar sem botão |
| 13 Campanha pausada | `TalkXCampaignPaused.tsx` | **não roteada (órfã)** | PARCIAL | Ligar na rota; 8 abas; checklist |
| 14 Relatório | — (concluída abre o Monitor) | — | NAO_INICIADO | Tela inteira |
| 15 Importação CRM 360° | — | — | NAO_INICIADO | Tela inteira |
| 16 Ajuda | `help/TalkXHelpCenter.tsx` + 6 `.md` | `?screen=help` | PARCIAL | Conteúdo incompleto; suporte/especialista/vídeos/checklist |
| 17 Estados e modais | `kit/states.tsx`, `kit/dialogs.tsx`, `TalkXQueryBoundary` | — | PARCIAL | Estados CRM/sem permissão sem uso; sem prancha `TalkXKit` |

### 3.19 Multiplix — plano de finalização (F01–F100)

Concluídos em código (54): F01–F09, F11–F16, F19–F26, F28–F43, F45–F50, F52–F54, F56–F58, F61, F74, F94
(F08, F11, F13, F25, F37, F41, F42, F43, F45, F46, F48, F50, F54, F56, F57, F74, F94 subiram desde 03/10).

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| MX01 (F10, F44, F51, F55) | Envio pela tela | PARCIAL / regressão ativa | Composer cria rascunho, blocos e fila; confirmação gera itens; worker envia | "Iniciar agora" (`MultiplixComposerDialog.tsx:188`) chama `draft.create` + `multiplix-send start` sem `confirm` (`useMultiplixDispatches.ts:408-417`); `multiplix_create_draft` só insere dispatch e destinatários (`20261001211230_f31…sql:227,236`); sem itens o worker sai (`multiplix-send/index.ts:427`) e `complete_multiplix_dispatch_if_items_drained` marca **concluído com 0 envios** (`20261001231230_f32b…sql:588-640`). "Iniciar" do monitor chama `confirm` (`MultiplixMonitor.tsx:167`), que recusa por falta de bloco e de conexão (`20261002461230_f51c…sql:153-158`); nenhuma tela cria bloco (`blocks.upsert` nunca chamado) | Composer criar bloco de texto e escolher conexão; "Iniciar agora" passar por `confirm`; `start` recusar disparo sem itens | Pela tela, o Multiplix **não envia nada**: ou falha, ou mostra "Concluído" sem ter enviado | P0 | — |
| F17 | Ritmo e teto por conexão | DIVERGENTE (regressão ativa, MX04) | Cota diária compartilhada | `multiplix_connection_daily_usage` (`20260929610000…sql:36`) e `talkx_connection_send_budget` (`20261002551230…sql:175,189`) leem `multiplix_recipients.sent_at` | Contar `multiplix_delivery_items` | Teto do número pode estourar → bloqueio do chip | P0 | — |
| F18 | Drift `20260926180000` | NÃO VERIFICÁVEL | Conferir ao vivo | Precisa banco vivo | Leitura `SELECT` | — | P3 | acesso ao banco |
| F27 | Resolver em lotes de 1.000 | PARCIAL | Paginação na edge + erro nomeado | `scripts/db-audit/multiplix-resolve-escopo.test.sh` (08/10) | Retorno com papéis/`last_interaction_at` | — | P3 | — |
| F59 | Recalcular público agendado | PARCIAL | Recalcular elegibilidade no disparo | Política documentada | Implementação completa | Agendado pode enviar para quem saiu | P2 | — |
| F60 | Capacidades da conexão | PARCIAL | `capabilities` e seleção por departamento | Coluna `capabilities` (`20261002671230…sql:30`); nada no front | Consumidor | — | P2 | — |
| F62 | Leitura/reprodução e respostas | PARCIAL | `READ`/`PLAYED` → `read_at` + resposta | READ e resposta ligados (`_shared/evolution-webhook-msg-handlers.ts:231-240`, `_shared/talkx-reply.ts:33`); `PLAYED` não tratado | PLAYED (voz) | — | P3 | F65 |
| F63 | Teste real de PTT | BLOQUEADO | Enviar opus e mp3 a número interno | `docs/multiplix/CANAL.md` §5 pendente | Teste | Não se sabe se áudio chega como nota de voz | P2 | número interno |
| F64 | Ativos e permissões de voz | PARCIAL | Tabelas + preparação | Tabelas (`20261003132707_f64…`, `20261003252707_f65…`) | Preparação/revogação | — | P2 | F65 |
| F65 | Edge `multiplix-prepare-voice` | NAO_INICIADO | Fila de TTS por roteiro distinto | Nada | Edge | Sem voz IA | P2 | — |
| F66 | Estimativa de consumo de voz e teto | BLOQUEADO | ±5% do realizado | Nada | Decisão de custo | Risco de gasto sem teto | P2 | dono (custo) |
| F67 | Modos `same_audio` / `personalized` | PARCIAL | Contador visível | Só servidor (`_shared/multiplix-content.ts`) | UI | — | P3 | F77 |
| F68 | Gravação no compositor | NAO_INICIADO | Reusar gravador do Chat | Nada | Tudo | — | P3 | — |
| F69 | Falha de TTS → `media_pending` | NAO_INICIADO | Envio não sai pela metade | Enum existe; sem fluxo | Fluxo | — | P3 | F65 |
| F70 | Fundação visual (tokens) | PARCIAL | Zero px arbitrário | 8 ocorrências `[Npx]` em `MultiplixView.tsx`, 3 em `MultiplixMonitor.tsx` | Tokens | Cosmético | P3 | — |
| F71 | Nav + rota `/multiplix` | PARCIAL | Rota além de `?view=` | Nav por permissão (`navigation.service.ts:60`); sem rota `/multiplix` | Rota | Link direto não funciona | P3 | — |
| F72 | Tela de 3 regiões (Público / Composição / Prévia) | NAO_INICIADO | Grid do protótipo | `MultiplixView.tsx` = busca + lista + diálogo | Tela | Operador compõe às cegas, sem prévia | P1 | — |
| F73 | Painel 01 completo | PARCIAL | Debounce, multi-papel, ramo com busca | Busca e filtros básicos | Restante | — | P2 | — |
| F75 | Exclusões e públicos salvos | PARCIAL | Salvar/aplicar público | `multiplix_audiences` sem UI | UI | Refazer filtro a cada disparo | P2 | — |
| F76 | Bloco de texto com contador/validação | NAO_INICIADO | Contador × `max_chars`, validação ao digitar | Textarea + chips no diálogo | Tudo | Placeholder errado só aparece no envio | P1 | — |
| F77 | Blocos de voz IA / gravação / arquivo | NAO_INICIADO | Player com asset real | Nada | Tudo | Sem áudio personalizado | P2 | F65 |
| F78 | N × M sempre visível + autosave | PARCIAL | Contagem + autosave no servidor | Contagem (`MultiplixComposerDialog.tsx:123`); sem autosave | Autosave | Perda de rascunho | P2 | — |
| F79 | Painel 03: prévia, aptidão, revisão | NAO_INICIADO | Bolhas = o que sai | Ação `preview` nunca chamada pelo front | Tudo | Sem revisão antes de enviar | P1 | F72 |
| F80 | Monitor com erro legível e paginação | PARCIAL | Sem `limit(500)` | Monitor com destinatários (teste 07/10) | Restante | — | P2 | — |
| F81 | Detalhe por bloco + histórico com filtros | PARCIAL | Paginação keyset | Parcial | Filtros | — | P3 | — |
| F82 | "Repetir com inteligência" | NAO_INICIADO | Não respondidos / falhas / novos | Nada | Tudo | — | P3 | — |
| F83 | Exportação CSV/JSON pela edge | NAO_INICIADO | Export com escopo | Sem ação `export` (`multiplix-dispatch/index.ts:403-426`) | Ação | — (regra "nada sai do sistema") | P3 | decisão do dono |
| F84 | Sala de retornos | PARCIAL (órfão) | Respostas filtradas no Chat | `useMultiplixReplies.ts` (263 l.) sem consumidor | Tela | Respostas do disparo não são vistas em um lugar | P2 | — |
| F85 | Registrar envio como interação no Singu | NAO_INICIADO | `sync_interaction_from_zapp` | 0 ocorrências | Integração | CRM não sabe que o contato foi acionado | P2 | — |
| F86–F87 | Acessibilidade e responsivo | PARCIAL | Teclado, 4 resoluções | Lista virtualizada | Restante | — | P3 | — |
| F88 | Testes unitários no `ci.yml` | PARCIAL | 7 classes, personalização, backoff | Testes Deno ampliados | Confirmar no CI | — | P3 | — |
| F89 | Integração da fila contra banco | PARCIAL | Confirmar→drenar→concluir | `multiplix-delivery-leases.test.sh` | Cenário com blocos reais | Defeito MX01 passou despercebido | P1 | MX01 |
| F90 | E2E no `e2e-logado.yml` | PARCIAL | Seleção, prévia, confirmação bloqueada | `e2e/multiplix.spec.ts` hermético (mocks devolvem sucesso no confirm); `e2e-logado` na main cancela 96,8% (`PENDENCIAS_DO_DONO…:31`) | Teste com fluxo real; CI que conclua | Teste verde esconde o MX01 | P2 | — |
| F91 | `correlation_id` em envio real | PARCIAL | Clique→webhook | Runbooks (`docs/runbooks/multiplix-incidentes.md`, `slo.md:61`) | Envio real | — | P3 | piloto |
| F92 | Flag por departamento | NAO_INICIADO (decidido não fazer) | `multiplix_enabled_departments` | HANDOFF §6: manter kill switch por permissão | — | — | P3 | decisão 08/10 |
| F93 | Guards do banco regenerados | PARCIAL | Catálogo/manifesto/grants | Sync de artefatos (#1913) | Conferência final | — | P3 | — |
| F95–F96 | Pilotos Compras e Logística | BLOQUEADO | 5 + 3 envios reais | Nada | Pilotos | Sem validação com operador | P1 | MX01 + dono |
| F97 | GATE C (RPCs antigas do Singu com `anon`) | BLOQUEADO | Revogar grants | `docs/multiplix/PONTE_SINGU.md` §7 | Decisão + DDL no Singu | Dados de terceiros expostos por chave anônima | P1 | dono / banco de terceiro |
| F98 | Go-live + 72 h | BLOQUEADO | Monitoramento | Nada | — | — | P2 | F95, F96 |
| F99 | Grafo + CHANGELOG do módulo | PARCIAL | `CHANGELOG_MULTIPLIX.md` | Arquivo não existe | Criar | — | P3 | — |
| F100 | Handoff + aceite | BLOQUEADO (aceite humano) | Encerramento | `docs/handoffs/HANDOFF_MULTIPLIX_2026-10-08.md` | Aceite do dono | — | P3 | dono |

### 3.20 Multiplix — evoluções da especificação (sem ID no plano)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| EVO-1 | Público por linguagem natural | NAO_INICIADO | Frase → filtros mostrados | Nada (HANDOFF §5.1) | Tudo | — | P3 | — |
| EVO-2 | Pressão de contato | NAO_INICIADO | Alertar contato já acionado | Nada (§5.2) | Fonte única de histórico | Cliente acionado em excesso | P2 | F85 |
| EVO-3 | Resposta vira tarefa | NAO_INICIADO | Tarefa a partir do retorno | Nada (§5.3) | Tudo | — | P3 | F84 |

### 3.21 3ª leva — cartões sem X/F correspondente

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prio | Dependência |
|---|---|---|---|---|---|---|---|---|
| TL-001 | E2E "wizard advances to step 2" vermelho | NÃO VERIFICÁVEL | Verde na main | `e2e/talkx.spec.ts` alterado em 09/10; `e2e-logado` na main não conclui | Run verde | — | P2 | CI |
| TL-002 | Hook morto com DELETE físico | NAO_INICIADO | Remover/converter | `useTalkXSuppression.ts:38-110` (`.delete()` :94), sem consumidor | Remover | Risco de alguém reusar e apagar sem trilha | P3 | — |
| TL-096/097/098 | N04, N36, N40 | BLOQUEADO | Informações do dono | — | Respostas | Travam X035, X039, X191 | P0/P1 | dono |
| TL-099 | Revogar token GitHub (E08) | BLOQUEADO | Ação manual | — | — | — | P1 | dono |
| TL-179 | Afirmações falsas nos docs | PARCIAL | Corrigir 40+ | README/ARQ/OPERAÇÃO retocados 09/10; PARIDADE segue desatualizado | X197 | — | P3 | — |
| TL-180 | E95 vínculo/pendentes/sugestões de conversão | PARCIAL | Além do badge | Só badge CRM 360 (`docs/talkx/help/segmentacao-crm-360/badge-crm-360.md`) | Vínculo/pendentes | — | P2 | X036 |

---

## 4. Divergências doc × código

1. **Placar congelado.** `docs/talkx/v4/STATUS.md` diz 2/200 etapas e 217/1.135 elementos; o gerador
   (`scripts/talkx/v4-status.mjs:6-22`) só promove o que está `DONE_VERIFIED` no ledger de 03/10. No código existem,
   depois disso, X028, X030–X034, X047, X099, X189 (commits `4e73c77`…`c5ae464`, lote #1911). Subestima o progresso.
2. **Reconciliação de 03/10 desatualizada (para melhor).** `docs/reconciliation/reports/modules/TALKX_MULTIPLIX.md`
   lista MX02, MX03, MX05, MX06, MX07, MX08, MX09 como abertos; o código corrigiu: `multiplix-send/index.ts:31-41`
   (conteúdo por item), `:1060-1071` (drenagem por itens), `:896-925` (429 reagenda), `:579-587` (variável faltante
   vira `skipped`), `:340-357` (token da instância), `:93-173` (agente inicia o próprio disparo);
   `multiplix-dispatch/index.ts:205-222` (destinatários resolvidos no servidor). **MX01 e MX04 continuam.**
3. **Handoff Multiplix de 08/10 vs lote de 09/10.** `HANDOFF_MULTIPLIX_2026-10-08.md` §3.1 lista F74, F90 e F94
   como "nada no repositório"; hoje existem a lista virtualizada + "Selecionar todos os N" (`MultiplixView.tsx:4,115,214,378`),
   `e2e/multiplix.spec.ts` e `docs/multiplix/{SCHEMA,ARQUITETURA,COMPONENTES}.md`.
4. **Checkbox F94 `[ ]`** no `PLANO_FINALIZACAO…` com os documentos já criados; **F62 `[x]`** sem tratar `PLAYED`.
5. **Comentário que dá MX01 por resolvido.** `useMultiplixDispatches.ts:495-498` explica que o `confirm` existe "por
   causa do MX01"; o botão "Iniciar agora" do composer (`MultiplixComposerDialog.tsx:188` → `useMultiplixDispatches.ts:408-417`)
   continua indo direto para `start` sem `confirm`, e nenhum caminho cria bloco.
6. **`PONTE_SINGU.md` §6.4** diz que o teste de escopo de F24 "não existe"; `scripts/db-audit/multiplix-scope.test.sh`
   existe e roda em `.github/workflows/db-guard.yml:534`.
7. **`MODULO_MULTIPLIX_TALKX_CONFIG_SEGURANCA.md` §6** (07/10): risco 4 (`default_speed_profile='balanced'`) já
   corrigido em `20261002551230_talkx_limits_ritmo.sql:48-53`; risco 5 (matriz papel→permissão pendente) superado por
   `20260930620000_multiplix_role_permissions_matrix.sql`; "500 empresas por disparo" contra o teto real de 10.000
   (`MultiplixView.tsx:49`).
8. **Cartões da 3ª leva que dizem "não implementada" para algo que existe como componente órfão:** X156
   (`TalkXCampaignPaused.tsx`), X095 (`TalkXMediaDropzone.tsx`), X096 (`TalkXInteractiveEditor.tsx`), X078
   (`useTalkXCampaignList.ts`), F84 (`useMultiplixReplies.ts`) — existe código, não existe tela.
9. **`talkx-ai` se apresenta como "infraestrutura de IA do Talk X" (X076)** (`supabase/functions/talkx-ai/index.ts:1-2`,
   `supabase/config.toml:83`), mas a tabela `talkx_ai_requests` e as chaves de orçamento não existem em migration
   nem no catálogo: a função só recusa.
10. **`e2e/multiplix.spec.ts:5-11`** afirma rodar no `e2e-logado.yml`; `PENDENCIAS_DO_DONO_2026-10-08.md:31` mede
    122/126 execuções canceladas na main.
11. **Cabeçalho do plano V4** (`PLANO_TALKX_V4…:4`) diz "Estado: proposto"; README e CLAUDE.md tratam como vigente.
12. **Três ADR-007:** `ADR-007-MULTIPLIX.md` (adicionado 08/10, "Proposto") convive com o aceito
    (`…-ponte-singu-canal-e-aptidao.md`) e o superado (`…-ponte-singu.md`).
13. **Cópias do plano Multiplix 200** em `docs/plans/` (08/10) **sem** o banner "auditado/plano sucessor" que a versão
    em `docs/multiplix/` tem — dá para executar um plano substituído por engano.
14. **Deploy de edge.** CLAUDE.md diz que merge na main não implanta edge; `.github/workflows/deploy-functions.yml:2,34-36`
    voltou a implantar em push na main desde 07/10 (`e5dcb3c`). Muda o "pronto" de todas as etapas com edge.
15. **`useTalkXServiceStatus.ts:19-22`** declara CRM "fora desta entrega", enquanto o kit já tem o estado
    `TalkXCrmUnavailableState` (`kit/states.tsx:161`) que ninguém usa.

---

## 5. Achados fora dos planos

1. **"Campanhas Clássicas" finge enviar.** `src/components/campaigns/CampaignsView.tsx:175,191,249` — "Iniciar"/"Retomar"
   só grava `status='sending'` na tabela `campaigns`; nenhuma edge, cron ou trigger processa `campaigns`/`campaign_contacts`
   (só `update_campaigns_updated_at`). A entrada continua na navegação (`navigation.service.ts:93`). O mesmo vale para
   o A/B legado (`CampaignABTesting.tsx`).
2. **Multiplix "Concluído" sem envio** (detalhe em §3.19, MX01): disparo sem itens é concluído pelo worker como
   sucesso — o histórico mostra campanha concluída que não mandou mensagem.
3. **Componentes/hooks órfãos (sem nenhum import fora de testes):** `TalkXCampaignPaused.tsx`,
   `TalkXInteractiveEditor.tsx` (+ `talkxInteractive.ts`), `TalkXMediaDropzone.tsx` (+ `useTalkXMediaUpload.ts`),
   `useTalkXCampaignList.ts`, `tracking/TalkXKeyMetricsCard.tsx`, `tracking/TalkXSentSummaryChart.tsx`,
   `useMultiplixReplies.ts`; estados `TalkXCrmUnavailableState`/`TalkXNoPermissionState` sem uso.
4. **API do Multiplix sem consumidor:** `draft.get/update/discard`, `blocks.upsert/delete/reorder`, `audience.select`,
   `preview`, `validate`, `eligibility.summary`, `estimate` (`multiplix-dispatch/index.ts:403-426`); o front só chama
   `draft.create`, `confirm`, `status`, `dispatch.list`, `recipients.list`.
5. **Backend do Talk X sem tela:** reenvio/resolução (`retry_talkx_recipients`, X031), log/saúde/alertas
   (`talkx_delivery_log`, `talkx_engine_health`, `talkx_alerts`, X033), palavras e autoresposta de opt-out (X029/X030 —
   sem tela de configuração), links rastreáveis (`talkx_upsert_link`), `talkx_overview_stats` (X072).
6. **Bucket `talkx-media` usado mas não criado:** envio, expurgo e front o referenciam; nenhuma migration cria o bucket.
7. **Hook com DELETE físico morto:** `useTalkXSuppression()` (`useTalkXSuppression.ts:94`).
8. **Régua visual com 16 fixtures vazias** (`e2e/fixtures/talkx-demo/02…17.json` = `{}`), puladas pelo spec.
9. **Base legal (`legal_basis`)** aceita pela RPC de rascunho, sem campo no wizard (só a caixa de consentimento).
10. **`window.confirm` remanescente** em 4 pontos do editor de template.
11. **Edge `talkx-ai` configurada para deploy** e sem tabela — consome deploy e não faz nada (sempre `ai_disabled`).

---

## 6. Top 10 da área

1. **Multiplix não envia pela tela** — "Iniciar agora" conclui com zero envios e "Iniciar" do monitor falha por falta de bloco/conexão (MX01; F10/F44/F51/F55). P0.
2. **Talk X sem ensaio nem envio real registrado** — X035 bloqueado por N04; se nada foi testado fora do repositório, o primeiro envio real seria para cliente. P0.
3. **Teto por número subconta o Multiplix** (MX04: X018/X019/F17) — dois módulos no mesmo chip podem estourar o limite e bloquear o WhatsApp da empresa. P0.
4. **Sem dados comerciais** (X036–X041, X056) — filtros de empresa/cidade/vendedor/funil/RFM vazios e nenhuma receita/ROI por campanha (N36 trava as vendas). P1.
5. **Relatório de campanha concluída não existe** (tela 14, X161–X169) — campanha concluída abre o monitor. P1.
6. **Mídia só por URL** — bucket `talkx-media` não criado (X061) e upload pronto desligado (X095, X129). P1.
7. **Tela "Campanha pausada" pronta e desligada** (X156) + checklist de retomada sem tela (X159); pausada aparece como "em andamento". P1.
8. **Um segmento por campanha e lançamento sem checagem no servidor** (X057/X119/X127, X120). P1.
9. **Monitor com leitura truncada e sem ações por destinatário** — sem painel do servidor, reenviar e previsão (X140, X141, X151, X068). P1.
10. **Multiplix sem a tela de 3 regiões, sem bloco de texto validado e sem prévia** (F72, F76, F79) — e voz IA inteira não iniciada (F65, F68, F69, F77). P1.
