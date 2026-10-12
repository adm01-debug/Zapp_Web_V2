# Área 05 — Tarefas/Quadro · Catálogo · Mapa/Busca · Etiquetas · Multi-conexão Evolution GO, Filas, SLA, War Room e Distribuição

Varredura de leitura em `main` @ `99aa53f` (11/10/2026). Toda pendência abaixo foi conferida no código. Os documentos de status serviram só de ponto de partida. Quando não deu para provar no código, o item aparece como "não verificável". Nada foi alterado no repositório, e nenhum banco nem MCP de escrita foi tocado.

---

## 1. Fontes lidas

| caminho | tipo | nº etapas/itens | data | vigente/substituído |
|---|---|---|---|---|
| docs/design/PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md | plano | 100 | 29/09 (fecho 02/10) | vigente (nota de superação parcial no topo, item "2 menus") |
| docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md | plano | 150 | 28/09 | **substituído** em 29/09 (só a spec de produto vale) |
| docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md | plano | 50 | 07/10 | vigente |
| docs/design/TAREFAS_QUADRO_STATUS.md | status/ledger | CP0–CP-N + fusão | 02/10–07/10 | vigente (com divergências, ver §4) |
| docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md | auditoria | 150 etapas + B1–B15 | 29/09 (+ fechamento em 07/10) | histórico |
| docs/design/MODULO_TAREFAS_QUADRO_DASHBOARD.md | spec de módulo | 14 riscos | 07/10 | vigente (desatualizado na fusão) |
| docs/tasks/README.md | handoff/README | resíduos | 07/10 | vigente |
| docs/audits/AUDITORIA_A11Y_MOBILE_TAREFAS_QUADRO_DASH_2026-10-07.md (Y16) | auditoria | 14 achados | 07/10 | vigente |
| docs/audits/SEGURANCA_RLS_TAREFAS_EMAIL_LIGACOES_2026-10-07.md | auditoria | 7 achados | 07/10 | vigente |
| docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md | plano | 100 (CT-01..CT-100) | 29/09 (atualizado em 03/10) | vigente |
| docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md | plano | 100 × 10 | 11/09 | **substituído** (cabeçalho SUPERSEDIDO) |
| docs/catalogo/AUDITORIA_CATALOGO_2026-09-29.md | auditoria | 41 DONE/1 DESC/38 PARC/20 AUS | 29/09 | histórico (insumo do plano CT) |
| docs/catalogo/HANDOFF_v1.md | handoff | bloqueios + 2 decisões | 02/10 | vigente (1 divergência) |
| docs/catalogo/PARIDADE.md, ENVIO_E2E.md, QA_E40_F3.md, SECURITY.md, PERF.md, CONTRASTE.md, README.md | spec/status | — | 22/09–03/10 | vigentes |
| docs/reconciliation/RECONCILIATION_WAVE_CATALOGO_2026-10-03.md | reconciliação | — | 03/10 | substituído (aponta para o relatório final) |
| docs/design/MODULO_CATALOGO_FILAS_SLA_WARROOM.md (Y22) | spec de módulo | 12 riscos + 7 itens não verificados | 07/10 | vigente |
| docs/audits/AUDITORIA_A11Y_MOBILE_CATALOGO_FILAS_SLA_2026-10-07.md (Y17) | auditoria | 14 achados | 07/10 | vigente |
| docs/mapa/PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md | plano | 100 | 29/09 (fecho 02/10) | vigente |
| docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md | plano | 50 | set/26 | **substituído** |
| docs/mapa/AUDITORIA_PLANO_50_ETAPAS_2026-09-29.md, AUDITORIA_ADVERSARIAL_E98.md, mapeamento-fase7.md | auditoria | 33 DONE/17 PARC; 16 itens | 29/09–02/10 | histórico (mapeamento-fase7 marcado SUPERADO) |
| docs/mapa/ENCERRAMENTO_FASE8_E100.md | status | 6 itens fora | 02/10 | vigente (1 divergência) |
| docs/audits/PLANO_REMOCAO_ETIQUETAS_100_ETAPAS_2026-09-27.md | plano | 100 | 27/09 | executado (#999); cabeçalho já reconciliado |
| docs/reconciliation/reports/modules/ETIQUETAS_100.md | reconciliação | 100 | 03/10 | baseline 2e7cf81, desatualizado em 11 itens |
| docs/audits/PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS_2026-09-25.md | plano | 50 | 25/09 | vigente |
| docs/reconciliation/reports/modules/MULTI_CONEXAO_50.md | reconciliação | 50 | 03/10 | baseline 2e7cf81, desatualizado em 6 itens |
| docs/migration/PLANO.md · HANDOFF.md · DECISIONS.md · PARITY-REPORT.md | plano/handoff | 100 + D1–D7 | 26–28/08 | **substituído na prática** (front foi para a Vercel, não para a VPS) |
| docs/migration/GO_GAPS.md | spec de gaps | D1–D7 + rotas | 28/08 | vigente como inventário |
| docs/EVOLUTION_API_GAPS_ANALYSIS.md | análise | — | 12/04 (v2 1.0.1) | **obsoleto** (E46 manda substituir) |
| docs/HANDOFF_EVOLUTION_SECURITY_2026-04-12.md | handoff | 10 melhorias | 12/04 | substituído (repo zapp-web antigo) |
| docs/DISTRIBUTION-FALLBACKS.md (DOC-DIST-001) | spec | checklist de 7 itens | 11/04 | vigente como spec, **não implementado** |
| docs/SLA-ESCALATION-CRON.md (DOC-CRON-001) | spec | ~6 artefatos | 11/04 | vigente como spec, **não implementado** |
| docs/adr/ADR-001..007 + README | ADR | 8 | jun–set/26 | ADR-001 e ADR-002 tratam de tabelas que não existem mais |
| docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md (só 027, 028, 077, 078) | plano | 4 etapas da área | 01/09 | vigente (cruzamento) |
| docs/plans/SEGUNDA_LEVA_CARTOES_2026-10-08.tsv / TERCEIRA_LEVA… / PENDENCIAS_DO_DONO_2026-10-08.md | cartões | ~20 da área | 08/10 | vigentes |
| docs/reconciliation/reports/modules/OTHER_MODULES.md (Catálogo, Mapa, Tarefas) | reconciliação | — | 03/10 | parcialmente desatualizado |
| docs/runbooks/bloqueio-meta.md, mapa-searchbox.md | runbook | — | 10/26 | vigentes |
| Código: src/components/{tasks,catalog,queues,sla,connections,dashboard/war-room}, src/hooks/{tasks,evolution,sla,business,inbox,chat}, supabase/functions/{evolution-api,evolution-webhook,evolution-sync,message-delivery,connection-health-check,promogifts-catalog,_shared/evolution-*}, migrations, schema-catalog.json, known-violations.json, e2e/, playwright.config.ts | código | — | HEAD | — |

---

## 2. Placar por plano

Critério: "concluído" = artefato encontrado no código ou no banco versionado. Aceite que só existe em produção conta como "não verificável", exceto quando o próprio plano registra medição com SHA ou PR. Nos planos substituídos, só os resíduos foram contados.

| plano | total | concluído (verificado) | parcial | não iniciado | bloqueado | não verificável |
|---|---|---|---|---|---|---|
| Tarefas — Finalização 100 | 100 | 98 | 0 | 0 | 2 (96, 100) | 0 |
| Tarefas — resíduos do contrato v1 e das auditorias (sem numeração) | 9 | 0 | 3 | 6 | 0 | 0 |
| Fusão Quadro→Tarefas 50 | 50 | 30 | 1 (E31) | 4 (E12, E15, E45, E46; E15 é DIVERGENTE) | 0 | 15 (portões manuais E30, E32–E44, E50) |
| Catálogo — Finalização 100 (CT) | 100 | 77 | 7 | 2 | 13 | 0 (+1 DIVERGENTE: CT-52) |
| Catálogo — Implementação 100 (11/09) | 100 | substituído pelo CT (não pontuado) | — | — | — | — |
| Mapa/Search Box — Finalização 100 | 100 | 95 | 2 (E65, E91) | 1 (E53, deliberado) | 2 (E90, E94) | 0 |
| Search Box 50 (antigo) | 50 | substituído | — | — | — | — |
| Remoção de Etiquetas 100 | 100 | 54 (+4 substituídos/N.A.) | 2 | 1 | 7 | 32 (evidência histórica pré-DROP) |
| Multi-conexão Evolution GO 50 | 50 | 19 | 10 | 7 | 7 | 7 |
| DOC-DIST-001 (distribuição) — checklist | 7 | 0 | 2 | 5 | 0 | 0 |
| DOC-CRON-001 (escalonamento de SLA) | 6 | 0 | 0 | 6 | 0 | 0 |
| Paridade V1/V3 — etapas 027, 028, 077, 078 | 4 | 1 (027, breaker por instância no proxy) | 1 (077) | 2 (028, 078) | 0 | 0 |
| Auditoria A11Y Y17 (Catálogo/Filas/SLA/War Room) | 14 achados | 0 | 0 | 14 (amostra de 01, 02, 09 confirmada aberta) | 0 | 0 |
| Auditoria A11Y Y16 (Tarefas/Quadro/Dashboard) | 14 achados | 0 | 0 | 14 (01 confirmado aberto; demais não reconferidos) | 0 | 0 |
| Migração fresh install (PLANO.md 100) | 100 | substituído pela operação real (Supabase Cloud + Vercel) | 1 (CSP) | — | 2 (rotação de credenciais, firewall/SSH) | resto |

---

## 3. Pendências detalhadas

### 3.1 Tarefas — Plano de Finalização (100) e resíduos

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| 96 | Conferência dos lembretes migrados | BLOQUEADO | Abrir a tarefa migrada na Lista e no Sheet do dono | Query `migrated_task_id IS NULL`=0 registrada (docs/design/TAREFAS_QUADRO_STATUS.md:819) | O dono abrir a tarefa com o login Admin 01 | Só aceite; não há risco operacional | P3 | Joaquim (credencial) |
| 100 | Verificação final em produção | BLOQUEADO | Conferência presencial | Prints J-100 + cron `tasks-notify-due` ativo (STATUS:822) | Conferência do dono | Só aceite | P3 | Joaquim |
| v1-item 9 | Lista de alarmes pendentes do contato | PARCIAL | Ver todos os lembretes de um cliente | Alarme aparece só como chip no card (STATUS:776) | Visão "com alarme" na aba do contato | O atendente não vê de relance os lembretes de um cliente | P3 | — |
| Res-1 | Delegar tarefa a outra pessoa (`assigned_to`) | NAO_INICIADO | Delegação (backlog v2) | Trigger força `assigned_to := created_by` (MODULO_TAREFAS_QUADRO_DASHBOARD.md:286) | UI e regra de delegação | O supervisor não consegue passar tarefa para um atendente | P2 | decisão de produto |
| Res-2 | Recorrência, subtarefas, colunas personalizáveis, anexos, comentários, arrastar na Agenda, parser de linguagem natural, virtualização, push do navegador | NAO_INICIADO | v2 do módulo | nada (STATUS:805-809) | Tudo | Funções avançadas de produtividade ausentes | P3 | — |
| Res-3 | Segurança: INSERT de tarefa com `contact_id` de qualquer contato | NAO_INICIADO | Mesmo predicado de visibilidade de contato no INSERT | Trigger anti-falsificação só em BEFORE UPDATE (20260924110946; audit SEGURANCA_RLS_…:72-76); nenhuma migration posterior a 07/10 trata disso | WITH CHECK ou trigger BEFORE INSERT com `is_contact_visible_to_user` | Agente pode vincular tarefa a cliente que não é dele | P1 | migration no lote diário |
| Res-4 | Resíduos técnicos | PARCIAL | Limpeza da auditoria de 29/09 | `update()` ignora status; WIP contado no global; sem índice em completed_at/position; import `Filter` morto (src/components/tasks/TasksModule.tsx:3); alias `useMyWorkItemsBadge` sem consumidor (src/hooks/tasks/useMyWorkItems.ts:715) | Limpeza | Nenhum visível ao usuário | P3 | — |
| Y16-01 | Botões Lista/Quadro/Agenda sem nome no celular | NAO_INICIADO | `aria-label` nos botões | Rótulo só `hidden sm:inline`, sem aria-label (src/components/tasks/shared/ModeSwitcher.tsx:46) | aria-label | Leitor de tela anuncia "botão" sem nome | P1 | — |
| Y16-02..14 | Demais achados (combobox sem nome, card `role=button` com focáveis dentro, contraste, alvos < 44px, gráficos sem texto) | NAO_INICIADO (não reconferidos um a um) | Correções do relatório | docs/audits/AUDITORIA_A11Y_MOBILE_TAREFAS_QUADRO_DASH_2026-10-07.md:63-156 | Correções | Acessibilidade e uso no celular | P2 | — |

### 3.2 Fusão Quadro→Tarefas (50)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| E12 | Preset órfão "Pipeline vazio/Criar Deal" e placeholder da paleta | NAO_INICIADO | Remover o preset; placeholder "ex: tarefas, chatbot" | Preset ainda presente (src/components/ui/EmptyState.tsx:70-76); placeholder "ex: pipeline, chatbot" (src/components/CommandPalette.tsx:97) | Remover e trocar | A paleta sugere um módulo que não existe mais | P3 | — |
| E15 | Gutter interno de Lista e Agenda | DIVERGENTE | Com `tasks` em `layout:'full'`, Lista e Agenda recebem o padding por dentro | `tasks` virou `layout:'full'` (src/services/navigation.service.ts:63); `ViewContainer` não aplica wrapper (src/components/layout/ViewContainer.tsx:33); a raiz do módulo não tem padding (src/components/tasks/TasksModule.tsx:235); nenhum `layout-gutter` em TasksListMode/TasksAgendaMode | Padding/scroll nas raízes de Lista, Agenda, cabeçalho e KPIs | Tela de Tarefas encostada nas bordas: regressão visual | P2 | — |
| E31 | Varredura final sem "pipeline" como id | PARCIAL | `git grep` limpo | Falha por E12 | Fechar E12 | — | P3 | E12 |
| E45 | Evidências em `docs/evidencias/plano-quadro-tarefas/` | NAO_INICIADO | Guardar saídas e capturas | Pasta inexistente | Evidências | Rastreabilidade | P3 | — |
| E46 | §7 "Estado de execução" do plano | NAO_INICIADO | Preencher | Seção vazia (PLANO_FUSAO…:256-258) | Preencher | Documental | P3 | — |
| E30, E32–E44, E50 | Portões manuais (preview, mobile 390px, atalhos, CRM360, axe, E2E local, pós-deploy) | não verificável | Execução pelo Claude e pelo dono | O E2E existe e é coletado (e2e/tarefas-quadro.spec.ts; projeto `chromium-authenticated`) | Registro da execução | — | P3 | — |

### 3.3 Catálogo — Finalização (CT-01..CT-100)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| CT-10 | Primeiro envio real de produto (2 fotos + legenda) | BLOQUEADO | Envio real em produção com ids registrados | Procedimento escrito; "evidência AINDA NÃO COLETADA" (docs/catalogo/ENVIO_E2E.md:54) | Envio real | O fluxo central do catálogo **nunca foi provado em produção** | P0 | Joaquim + conexão WhatsApp ativa |
| CT-11 | Envio com falha induzida → `partial` | BLOQUEADO | Linha `partial` no log | Lógica de parcial existe (CatalogBulkSendDialog / useSendProduct) | Envio real | O tratamento de falha parcial não foi provado | P1 | CT-10 |
| CT-12 | Fechamento do bloco A | BLOQUEADO | 5 evidências commitadas | CT-01/02 aplicados; falta CT-03 e CT-10 | — | — | P2 | CT-03, CT-10 |
| CT-18 | Envio real pelo chat | BLOQUEADO | 1 evento originado do chat | Fluxo único implementado (CT-14) | Envio real | Não provado | P1 | CT-10 |
| CT-03 | REVOKE de `zapp_catalog_stats()` para `authenticated` no PromoGifts | BLOQUEADO | DDL no banco externo | Decisão: não fazer DDL externa (PLANO_FINALIZACAO:60-68) | O responsável pelo PromoGifts aplicar | Qualquer usuário autenticado do PromoGifts pode chamar a RPC | P2 | dono do PromoGifts |
| CT-22 | "Mais pedidos" volta sozinho quando houver dado | PARCIAL | Flag `has_order_data` na RPC | A opção foi ocultada de forma incondicional no front | Flag no PromoGifts | Ordenação por popularidade indisponível | P3 | PromoGifts (sync parado desde 05/09) |
| CT-49 | Rail "Envios hoje / 7 dias" | NAO_INICIADO (DIVERGENTE do handoff) | Rail lendo a view `catalog_send_stats` | A view existe (20260930740000; types.ts:9974), mas **nenhum consumidor no front** (grep `send_stats` em src = 0) | Componente que leia a view | O gestor não vê o volume de envios do catálogo | P2 | — |
| CT-50, CT-56, CT-88 | Fechamentos E/F/I (smoke + e2e verde) | BLOQUEADO | Evidência de envio ponta a ponta | Specs e PRs existem | Envio real + e2e verde | — | P2 | CT-10 |
| CT-52 | Botão "Enviar produto" no perfil do contato | DIVERGENTE | Botão + evento com contact_id | Botão implementado (src/components/contacts/ContactDetailPanel.tsx:304-329); checkbox ainda aberto | Prova com envio real | — | P3 | CT-10 |
| CT-60 | Select de fornecedor com contagem | PARCIAL | Categoria e fornecedor com contagem | Categoria feita; fornecedor impossível com o dado atual | Contagem por fornecedor no PromoGifts | Pequeno | P3 | PromoGifts |
| CT-64 | Filtro "Novidades" com contagem vinda da edge | PARCIAL | Ação `new_or_recent`/`new_30d` | KPI mostra 366; a edge não tem a ação (só 6 ações no `ActionSchema`) | Ação + contagem na edge | Número do filtro sem conferência | P3 | deploy de edge |
| CT-69 | Contraste dos badges Novo/Top/Promo ≥ 4,5:1 | PARCIAL | Tokens que sigam os 4 temas | `alt` feito; 13 de 24 pares abaixo de 4,5:1 (docs/catalogo/CONTRASTE.md; DEC-2 / SL-038) | Decisão de cor | Badges ilegíveis para baixa visão | P2 | decisão de produto |
| CT-73 | Payload de `list_products` < 30 KB por página | PARCIAL | Cortar campos | Medido 81,5 KB (186 KB no bootstrap) | Enxugar campos | Lentidão em 4G | P2 | deploy de edge |
| CT-74 | Lighthouse ≥ 90 e CLS < 0,05 | PARCIAL | Desempenho em 4G | Medido perf 44 / CLS 0,2452; a correção da faixa de KPIs não moveu o número (PLANO_FINALIZACAO:1190) | Nova atribuição do layout-shift | Tela pula e demora no celular | P2 | — |
| CT-82 | `e2e/catalog.spec.ts` verde nos 3 browsers | BLOQUEADO | Fluxo completo com envio | Spec existe e está nos projetos `firefox-catalog`/`webkit-catalog` (.github/workflows/e2e-logado.yml:110-130) | Envio real (conexão ativa) | — | P2 | Joaquim |
| CT-91 | RLS testada com 2 usuários reais | BLOQUEADO | Agente × supervisor | Estado medido por leitura (SECURITY.md §7) | Duas sessões reais | Isolamento só provado por definição | P2 | Joaquim (sessões) |
| CT-93 | Breadcrumbs `catalog.*` + alerta no Sentry | NAO_INICIADO | Sentry | **Não há SDK do Sentry no app** (`@sentry` ausente; só um formulário de DSN em src/components/integrations/SentryIntegrationView.tsx:81) | SDK + alerta | Falha do PromoGifts não alerta ninguém | P2 | Sentry / Joaquim |
| CT-94 | Print da UI reagindo ao 429 | BLOQUEADO | Print | O 429 passou a existir (CT-19 medido em 03/10) | Print autenticado | — | P3 | Joaquim |
| CT-97 | Manifesto de edges = versão deployada | BLOQUEADO | `--check` remoto | Nível local ok | `SUPABASE_ACCESS_TOKEN` | — | P3 | token |
| CT-99 | Checkboxes do plano de 11/09 | PARCIAL | Marcar e manter o validador verde | Cabeçalho SUPERSEDIDO feito; o validador quebra se marcar (validate-plan.mjs:17) | Corrigir o validador ou o aceite | Documental | P3 | — |
| CT-100 | Release v1 (tag `catalog-v1.0.0` + seção no CLAUDE.md) | BLOQUEADO | Tag + docs | HANDOFF_v1 feito | Tag e CLAUDE.md, por instrução | Documental | P3 | Joaquim |
| DEC-1 | Gate de cobertura do módulo | BLOQUEADO | `src/components/catalog/**` no coverage.include com 80% | Fora do include (vitest.config.ts:20-26) | Decisão | Regressões sem piso | P3 | decisão |
| Y22-6 | Downloads do catálogo (CSV e fotos) ignoram `can_download` | BLOQUEADO (decisão) | Mapear saídas de informação (Y29) | catalogExport.ts:219-233 e SendProductDialog → `downloadImageAsBlob` não consultam `profiles.can_download` | Decidir se aplica | Conflita com a regra "nenhuma informação sai do sistema" | P2 | decisão de produto |
| Y22-8 | Ajuda do catálogo com prints reais | PARCIAL | 5 passos com prints | Só texto (CatalogHelpSheet.tsx) | Prints | Onboarding mais fraco | P3 | — |
| §12 | Recomendação de produtos na aba IA usa tabela local `products` | NAO_INICIADO (fora de escopo declarado) | Migrar para o PromoGifts | `src/hooks/chat/useRecommendedProducts.ts:75` lê `products` local | Migração | Recomendações podem vir vazias ou velhas | P3 | — |
| §10 | Sheet de detalhes fecha sozinho | não verificável | Investigar | Achado medido em 02/10 (PLANO_FINALIZACAO §"Achados fora do escopo") | Causa | Atrapalha o vendedor | P2 | — |

### 3.4 Filas, SLA, War Room e Distribuição

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| DIST-1..5 | Cascata history → skillset → least_load → round_robin → fila manual (DOC-DIST-001) | NAO_INICIADO | `distribute_conversation()`, coluna `distribution_algorithm`, `user_skills`/`queue_skills`, `last_assignment_at`, modos por fila (`distribution_mode`, `enable_history`, `fallback_mode`) | Nenhum desses objetos no catálogo nem nas migrations (grep = 0). Só existe o trigger `auto_assign_to_queue_agent`, que escolhe o membro com menos **contatos atribuídos no total**, sem checar online nem limite (supabase/migrations/20261003272707_…sql:228) | Motor de distribuição real | Cliente que volta não cai com o mesmo atendente; a distribuição ignora quem está online e a carga real | P1 | decisão de regra |
| DIST-6/7 | Painel de monitoramento da distribuição e alertas de fallback | NAO_INICIADO | Dashboard + alertas (% fila manual, % round-robin) | nada | Tudo | Sem visibilidade da distribuição | P2 | DIST-1 |
| DIST-cfg | Preferência "método de distribuição" do usuário | DIVERGENTE | round-robin/aleatório/menor carga (COMPLETE_SYSTEM_FEATURES.md:435 diz ✅) | Coluna `user_settings.auto_assignment_method` com default 'roundrobin' (src/hooks/system/useUserSettings.ts:60), **sem UI e sem consumidor no banco** | Ligar ou remover | Configuração que não faz nada | P2 | — |
| PAR-077 | Roteador sticky + round-robin + skills | PARCIAL | `ticket-router`, `sticky_assignments`, `queue_routing_rules` | Só `skill_based_assign` manual (src/components/settings/SkillBasedRoutingSettings.tsx:129) | Roteador automático | Igual a DIST-1 | P2 | — |
| PAR-078 | Rebalanceamento de filas e escalonamento de SLA | NAO_INICIADO | Edge `queue-rebalance`, cron de 5 min, `sla_history` | Só RPCs manuais `reassign_absent_agents`/`reassign_overloaded_agents` (src/hooks/crm/useAgentReassignment.ts:13,31) | Automação | Ticket com SLA estourado não é redistribuído | P1 | — |
| SLA-ESC | Escalonamento automático de SLA (DOC-CRON-001) | NAO_INICIADO | Tabela `sla_violations`, `check_sla_violations()`, cron `*/5`, matriz 150/200/300%, webhook n8n | grep = 0 em migrations, edges e src; só `metadata.escalation_notes` como texto livre (src/hooks/sla/useSLARules.ts:8) | Tudo | Supervisor/gerente não é acionado quando o cliente espera demais | P1 | — |
| SLA-MON | Monitor de violação de SLA no servidor | PARCIAL | Alerta sem depender de tela aberta | O monitor roda no navegador a cada 60s com JWT de admin/supervisor (src/hooks/business/useWarRoomAlerts.ts; MODULO_CATALOGO…:259) | Job no servidor (pg_cron/edge) | Sem admin com o painel aberto, **ninguém recebe alerta de SLA** | P1 | — |
| SLA-RES | SLA de resolução | PARCIAL | Medir `resolution_breached` | `resolution_minutes` é configurável (useSLAConfigurations.ts:10; SLARuleFormDialog.tsx:132), mas nenhum código escreve `resolution_breached` e o dashboard só mede 1ª resposta (useSLAMetrics.ts:114-121) | Medição + painel | A meta de tempo de resolução é configurável mas não é medida | P2 | — |
| FILA-AL | Alertas de fila "tempo de espera" e "mensagens pendentes" | PARCIAL | 4 tipos de `QueueAlert` | Metas configuráveis (QueueGoalsDialog.tsx:134,202), mas só `waiting_contacts` e `assignment_rate` são calculados (src/components/queues/QueuesView.tsx:33-50) | Calcular os outros 2 | Meta de espera configurada não gera alerta | P2 | — |
| FILA-PER | Alertas de fila persistidos | PARCIAL | Alerta com histórico | Dispensar é estado local (QueuesView.tsx:31) | Tabela/estado persistente | O alerta volta ao recarregar; sem histórico | P3 | — |
| Y17-01 | Botões só de ícone sem nome (142 nós) | NAO_INICIADO | `aria-label` | Ainda sem nome em src/components/queues/QueueCard.tsx:85, src/components/dashboard/WarRoomDashboard.tsx:76-78, src/components/dashboard/war-room/WarRoomAlertRow.tsx:32 | aria-label | Leitor de tela inutilizável no War Room/Filas | P1 | — |
| Y17-02 | Barras de progresso sem nome (38 nós) | NAO_INICIADO | aria-label | `<Progress>` sem nome (WarRoomAgentCard.tsx:45; WarRoomQueueRow.tsx:39; SLAAgentTable.tsx:82; SLADashboard.tsx:180) | aria-label | idem | P1 | — |
| Y17-03 | Rolagem horizontal no celular em `/queues/comparison` | NAO_INICIADO | Reflow | Relatório Y17:151 | Cards/overflow contido | Comparação de filas quebra no celular | P1 | — |
| Y17-04 | Contraste de selos (60 nós) | NAO_INICIADO | ≥ 4,5:1 | Relatório Y17:168 | Tokens | Baixa visão | P1 | — |
| Y17-05..14 | h1/landmarks, skip links, "Metas e Alertas" sem rótulo (QueueGoalsDialog.tsx:100-202, `<Label>` sem htmlFor), cabeçalho vazio, alvos < 44px, texto cortado, `<li>` aninhado, "Close" em inglês | NAO_INICIADO | Correções | Relatório Y17:194-309 | Correções | A11y/celular | P2/P3 | — |

### 3.5 Mapa / Search Box — Finalização (100)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| E65 | 4º print (teclado virtual aberto) | BLOQUEADO (3/4) | 4 prints | 3 prints em docs/mapa/prints/ | Print em aparelho real | Documental | P3 | aparelho / Joaquim |
| E90 | Restringir o token público da Mapbox aos domínios da Vercel | BLOQUEADO | Restrição + prova com 403 | Decisão registrada; nada no repo | Configurar no painel Mapbox | Token pode ser usado fora do app (custo) | P2 | Joaquim (painel Mapbox) |
| E91 | Alerta de custo por e-mail | PARCIAL | E-mail + app | Cron `searchbox-budget-alert` + edge `supabase/functions/searchbox-budget-alert`; o e-mail falha fechado com 403 | Segredo `searchbox_alert_cron_secret` (Vault) + `CRON_SECRET` | Só o aviso no app funciona | P3 | Joaquim (segredos) |
| E94 | Envio real de localização confirmado no WhatsApp | BLOQUEADO | `location_sent ≥ 1` + print | `location_sent`=0 em set/out (registrado) | Envio real | Envio de localização não provado ponta a ponta | P2 | Joaquim (número de teste) |
| E53 | Card "Sessões Search Box / 500" no dashboard admin | NAO_INICIADO (deliberado, com motivo) | Card | Registrado como não feito (#1507) | — | Custo visível só por SQL/view | P3 | — |
| Fase 7 | Piso de cobertura por arquivo (`perFile`) | BLOQUEADO (decisão) | Ligar `perFile` | `ContactForm.tsx` com 58% de branches (vitest.config.ts:36-43; SL-123) | Decisão | Regressão no cadastro passa no agregado | P3 | Joaquim |
| E98-b | Contraste no inbox (7 achados SERIOUS) | não verificável | Medir com axe | `e2e/a11y-contraste.spec.ts` mede só Contatos | Medir o inbox | Baixa visão | P2 | — |

### 3.6 Remoção de Etiquetas (100)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| E15/E18 | Teste dedicado do helper de etiquetas | NAO_INICIADO / PARCIAL | Teste nominal de `isWhatsAppTag`/`parseWhatsAppTag`/`filterCustomTags` | `src/lib/tags.ts:1-22` sem nenhum teste que o importe | Teste | Regressão em `wa:*` passaria sem aviso | P3 | — |
| E17 | Compatibilidade de URLs antigas de filtro por UUID → nome | BLOQUEADO (decisão) | Regra de transição | nada | Decisão + fallback | Link antigo de filtro abre vazio | P3 | decisão de produto |
| E27 | Cor da etiqueta derivada (hash) | PARCIAL | Cor por etiqueta | Cor literal única `#6366f1` (src/services/inbox.service.ts:11) | Cor derivada/token | Todas as etiquetas da mesma cor | P3 | — |
| E38/E39 | Renomear/apagar label do WhatsApp por conexão | concluído no código; aplicação em produção não verificada | Escopo por instância | Migration `20261009150000_scope_wa_label_rpc_by_connection.sql` (RPC recebe `p_connection_id`) | Confirmar que o apply do lote ocorreu | Antes atingia etiquetas homônimas de outra conexão | P2 | lote `db-migrate.yml` |
| E31, E49, E66, E91, E92, E94 | Aceites humanos (CRM360, evento real de label, menu/redirect em produção, filtro e edição em massa no inbox) | BLOQUEADO | Smoke real | Código presente | Teste do dono | Só aceite | P3 | Joaquim |
| E95 + 31 NEEDS_REVALIDATION | Evidência histórica pré-DROP (contagens, dump, ledger da época, janela de 24h de logs) | não verificável | Snapshot | Tabelas já removidas (20260927410000) | — | — | P3 | — |

### 3.7 Multi-conexão Evolution GO (50)

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| E16 | Proxy `evolution-api` resolve o token pela instância | NAO_INICIADO | `get_instance_token` por instanceName | Toda rota de instância usa o `EVOLUTION_INSTANCE_TOKEN` global (supabase/functions/_shared/evolution-api-proxy.ts:135-139) | Resolver no Vault + cache | Envio, grupos, perfil e etiquetas de uma 2ª conexão **saem pela PRINCIPAL** (a GO escolhe a instância pelo token) | P0 (se ligar a 2ª conexão) | — |
| E23 | QR, connect, status, logout e restart com o token certo | NAO_INICIADO | Token por instância | `resolveSessionApiKey(route, Deno.env.get('EVOLUTION_INSTANCE_TOKEN'), …)` (supabase/functions/evolution-api/index.ts:495, 717, 781; :520, :938 também) | Token do Vault | QR e status da 2ª conexão refletem a PRINCIPAL | P0 (idem) | E16 |
| E18 | `message-delivery` envia pela instância do claim | PARCIAL | Token do claim | `evoFetch(evolutionUrl, evolutionKey, outbound.path, outbound.body)` sem token (supabase/functions/message-delivery/index.ts:302); `evoFetch` falha fechado com 400 "instance token ausente" para conexão não padrão (supabase/functions/_shared/evolution-send.ts:58-80) | Passar `get_instance_token` da conexão | Mensagem do inbox por um 2º número **não sai** (falha segura, mas não funciona) | P0 (idem) | — |
| E35 | Conexão padrão única e atômica | BLOQUEADO / DIVERGENTE | RPC atômica | O front chama `rpc('set_default_whatsapp_connection')` (src/hooks/inbox/useConnectionsManager.ts:306), mas a **migration `20261006234158_…` não está no repo** (nem em outro branch); a exceção é temporária em scripts/db-audit/known-violations.json:2,7; a RPC está ausente de types.ts e de schema-catalog | Versionar e aplicar a migration | O botão "Definir como padrão" dá erro se a RPC não existir no banco | P1 | migration (lote) |
| E02 | Banner "WhatsApp indisponível" e bloqueio honesto no compositor | PARCIAL | Banner + trava de envio com motivo | `EvolutionDisconnectBanner` existe (src/components/alerts/EvolutionDisconnectBanner.tsx; src/pages/Index.tsx:132); o compositor não bloqueia nem cita `whatsapp_maintenance_until` (só a edge lê: evolution-api/index.ts:183-196) | Trava no composer com motivo | O agente escreve e a mensagem não sai sem explicação | P1 | — |
| E12 | Exclusão real da instância + limpeza do Vault | PARCIAL | GO + Vault | O delete na GO funciona e o front não engole mais o erro (useConnectionsManager.ts:320-360; evolution-api/index.ts:792-806); **o segredo do Vault não é apagado** | Limpar o secret | Credencial órfã no Vault | P2 | — |
| E13 | Sinalizar conexão sem credencial | NAO_INICIADO | Badge `no_credentials` | nada (grep `hasToken`/`no_credentials` = 0) | Badge | O admin não sabe qual conexão está sem token | P2 | — |
| E14 | Rotação do token de instância | NAO_INICIADO | Ação `rotate-instance-token` | Só existe `bootstrap-instance-token` (evolution-api/index.ts:255) | Rotação | Token vazado não pode ser trocado pela UI | P2 | — |
| E20 | Remover `'PRINCIPAL'` fixo dos fluxos | PARCIAL | — | Fallbacks pelo nome padrão ainda existem (evolution-send.ts:66-68) | Limpeza após E16/E18/E23 | — | P2 | E16 |
| E21 | Aposentar `EVOLUTION_INSTANCE_TOKEN`/`NAME` | BLOQUEADO | Remover secrets globais | Ainda usados em proxy, sessão, webhook e health | Migrar os consumidores | — | P2 | E16, E18, E23 |
| E27/E28 | UI de criação por chamada única e monitoring por instância | PARCIAL | QR, polling, badge | `create-connection` existe; falta badge/estado sem credencial e prova com 2 instâncias | — | — | P2 | E13 |
| E32 | Instância desconhecida no webhook → 202 | NAO_INICIADO | Retorno antecipado | Sem tratamento `unknown_instance` (supabase/functions/evolution-webhook/index.ts) | Retorno 202 | Eventos de instância órfã geram trabalho/erro | P3 | — |
| E33 | Rate limit do webhook por instância | NAO_INICIADO | Chave por instância | `checkRateLimit(\`evowh:${ip}\`, 200, 60_000)` (evolution-webhook/index.ts:107) | Chave por instância | Com 2+ números no mesmo IP da GO, uma rajada de um derruba o outro | P2 | — |
| E37 | Departamento → conexão | PARCIAL | Novo contrato | Salvar WhatsApp do departamento grava em `department_whatsapp_configs`, **tabela inexistente** (src/hooks/team-chat/useDepartmentManagement.ts:245; known-violations.json:6); a RPC `set_department_whatsapp_config` existe mas não é usada | Usar a RPC ou criar a tabela | O botão "Salvar" do WhatsApp do departamento falha sempre | P1 | — |
| E38/E39 | Filas por conexão e mesmo contato em 2 números | BLOQUEADO (decisão) | Política | `useConnectionQueues` sem consumidor na edge | Decisão | — | P3 | Joaquim |
| E41 | Nova conversa sempre com conexão | PARCIAL | Padrão/departamento; proibir null | Escolhe o 1º `connected` retornado (src/hooks/chat/useNewConversation.ts:36-41) e grava `selectedConnection \|\| null` (:98, :112) | Usar a padrão; proibir null | Conversa pode nascer sem conexão ou na conexão errada | P2 | — |
| E43 | Remover ações que a GO não tem | PARCIAL | Limpar ~45 ações | Ainda roteadas e oferecidas na UI (ver 3.8) | Remover ou esconder | Botões que falham | P1 | — |
| E46 | Matriz de rotas GO (substitui o gaps de 04/2026) | NAO_INICIADO | `evolution-go-route-matrix.mjs` + doc | nada; `docs/EVOLUTION_API_GAPS_ANALYSIS.md` ainda é de 12/04 (v2 1.0.1) | Matriz | Decisões tomadas sobre doc obsoleto | P3 | — |
| E48 | Observabilidade por instância | PARCIAL | Painel de volume/erros | Logs por `instance_id` existem | Painel | — | P3 | — |
| E04 | Número reserva (swap) | BLOQUEADO | Decisão de negócio | — | Decisão | Sem plano B no bloqueio da Meta | P2 | Joaquim |
| E49/E50 | Documentação final + aceite com 2 instâncias reais | BLOQUEADO | Dossiê de 8 passos | Só o dossiê antigo `DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md` | E16/E18/E23 + teste real | Multi-conexão não pode ser liberada | P1 | E16, E18, E23 |
| E03, E05, E06, E29, E34, E36, E44 | Diagnóstico e retomada do bloqueio, índices, grants, falha visível em < 90s | não verificável | Evidência viva | — | — | — | P3 | produção |

Concluídos e conferidos no código (19): E01 (guarda de manutenção), E07 (`docs/runbooks/bloqueio-meta.md`), E08–E11 (Vault, get/set token, bootstrap, `create-connection`), E15, E17, E19 (talkx-send resolve o token, talkx-send/index.ts:1019-1026), E22, **E24** (health resolve o token por conexão, connection-health-check/index.ts:72-108), **E25** (`LoggedIn && !Connected → 'connecting'`, evolution-send.ts:150-173), **E26** (dedupe de alerta, evolution-webhook-handlers.ts:85-108), **E30** (webhook resolve o token por instância, evolution-webhook/index.ts:75-90, 155-175), E31 (enforce padrão = `token`, :53), E40, E42 (trava "Nova conexão"; flag `multi_connection_enabled` não semeada → desligada), E45 (`EvolutionApiRequestSchema`, evolution-api/index.ts:8, 89), E47.

### 3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram

Fonte: `supabase/functions/_shared/evolution-go-routes.ts:319-324` (rotas não mapeadas passam intactas e a GO responde 404); roteador da edge em `supabase/functions/evolution-api/index.ts`.

| ID | recurso | v2 → GO | o front oferece? | estado | impacto | prio |
|---|---|---|---|---|---|---|
| GO-01 | Integrações por instância (Typebot, OpenAI, Dify, Flowise, Chatwoot, EvolutionBot) | /typebot/*, /openai/*, /dify/*, /flowise/*, /chatwoot/*, /evolutionBot/* → sem rota na GO (evolution-api/index.ts:979-1004) | **Sim.** Menu "Integrações" (src/components/connections/ConnectionCard.tsx:150) → `IntegrationsPanel` com 6 abas (src/components/connections/IntegrationsPanel.tsx:220-228) | PARCIAL (UI quebra) | O admin configura e recebe erro; nenhuma integração funciona | P1 |
| GO-02 | Configurações da instância (rejeitar chamadas, sempre online, ler mensagens, ignorar grupos, sincronizar histórico completo) | /settings/set\|find → sem rota (evolution-api/index.ts:812-813) | **Sim.** `InstanceSettingsDialog` (src/components/connections/InstanceSettingsDialog.tsx:40, 53) | PARCIAL (UI quebra) | A aba de configurações não carrega nem salva | P1 |
| GO-03 | Marcar mensagem como não lida | /chat/markMessageAsUnread → sem rota (evolution-api/index.ts:866) | **Sim.** Dois menus: src/components/inbox/MessageContextActions.tsx:100-112, 170 e src/components/inbox/chat/MessageHoverToolbar.tsx:92-99, 170 | PARCIAL (UI quebra) | O atendente clica e recebe erro | P2 |
| GO-04 | Sincronizar histórico da conexão | `sync-all-messages` → `notSupported` com HTTP 200 (supabase/functions/_shared/evolution-sync-actions.ts:158, 339-340) | **Sim.** "Sincronizar Histórico" (ConnectionCard.tsx:151-153) | DIVERGENTE (falso sucesso) | O toast mostra "Sincronização concluída! 0 mensagens…" (src/components/connections/ConnectionsView.tsx:75) quando nada foi feito | P2 |
| GO-05 | Votos e resultado de enquete | GO tem /polls/{id}/results (não usado); `pollUpdateMessage` não é processado no webhook (só `pollCreationMessage`, evolution-media.ts:264) | Envio de enquete sim (AdvancedMessageMenu.tsx:92-117); resultado não | NAO_INICIADO | O agente manda a enquete e nunca vê a resposta | P2 |
| GO-06 | Ver status/stories dos contatos | `find-status-messages` → `notSupported` (`EVENT_IGNORE_STATUS=true`, GO_GAPS D5) | Não | NAO_INICIADO (por config) | Recurso inexistente | P3 |
| GO-07 | Chamada de voz/vídeo do WhatsApp (iniciar) | /call/offerCall → sem rota (evolution-api/index.ts:1022) | Só no hook (sem UI) | NAO_INICIADO | Ligar pelo WhatsApp não existe (plano MeowCaller é de outra área) | P3 |
| GO-08 | Templates oficiais da Meta (enviar, criar, listar, apagar) | /message/sendTemplate, /template/* → sem rota | Só no hook (sem UI) | NAO_INICIADO | Sem envio de template oficial pela GO | P3 |
| GO-09 | Grupos: info do convite e mensagens temporárias | /group/inviteInfo, /group/toggleEphemeral → sem rota | Só no hook (useEvolutionGroups) | NAO_INICIADO | — | P3 |
| GO-10 | Fixar, silenciar, favoritar, limpar chat e mensagens temporárias | O hook manda `pin-chat`, `unpin-chat`, `mute-chat`, `star-message`, `clear-chat`, `set-disappearing` (src/hooks/evolution/useEvolutionMessaging.ts:90-143), que **não existem no roteador**; travado por `it.fails` em src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts:390. A GO tem /chat/pin e /chat/mute | Não (sem consumidor) | NAO_INICIADO (código morto) | Oportunidade: a GO suporta fixar/silenciar | P3 |
| GO-11 | Fila RabbitMQ/SQS/Kafka/NATS/Pusher, EvoAI, n8n, proxy, catálogo business, presença da instância, leitura de webhook, find-chats | Sem rota na GO | Só no hook (useEvolutionIntegrations/useEvolutionInstance) | NAO_INICIADO (código morto) | Limpar (E43) | P3 |
| GO-12 | Exclusivos da GO não aproveitados: código de pareamento (login sem QR), criar/editar etiqueta, lista de bloqueados, carrossel/link, comunidades/canais, "reproduzido", logs/forcereconnect | Existem na GO | Não | NAO_INICIADO | Ex.: conectar por código sem câmera; gerir etiquetas pelo app | P3 |
| — | Mapeados e funcionando na tradução (sem pendência de rota) | Texto, mídia, áudio, PTV, sticker, localização, contato, enquete (envio), lista, botões, status (envio), reação, edição, exclusão, lida, presença, bloquear, arquivar, perfil, privacidade, etiquetas (listar/aplicar), grupos (criar/listar/info/participantes/nome/descrição/config/convite/revogar/entrar/sair/foto), webhook por instância | — | concluído | — | — |

### 3.9 Migração fresh install (docs/migration) e handoffs antigos

| ID | funcionalidade | estado | planejado | existe hoje | falta | impacto | prio | dependência |
|---|---|---|---|---|---|---|---|---|
| MIG-71/99 | CSP aplicada | PARCIAL | CSP com allowlist | Só `Content-Security-Policy-Report-Only` (vercel.json:28) | Passar para enforce | Proteção contra XSS só observa | P2 | — |
| MIG-97 | Rotação das credenciais expostas na migração | BLOQUEADO | Rotacionar service_role, senha do DB, GLOBAL_API_KEY etc. | não verificável no repo | Rotação | Risco de credencial antiga válida | P1 | Joaquim (só ele rotaciona segredos) |
| MIG-16/88 | Hardening de SSH e firewall da VPS Hostinger (fechar 32771/48592) | não verificável | Gate | — | Conferência na VPS | Superfície de ataque da GO | P2 | Joaquim |
| MIG-Fase 7 | Deploy do app na VPS (Docker Manager) | substituído | VPS | O front está na Vercel | — | — | — | — |
| HAND-GO | "Gaps GO sem UX ativa, com 501 explícito" | DIVERGENTE | 501 explícito | O roteador repassa para a GO (404), sem 501; e há UX ativa (GO-01..04) | Ver §4 | — | P3 | — |
| ADR-001/002 | Tabelas por instância / rotação de `evolution_messages_wpp2` | obsoleto | — | Nenhuma tabela `evolution_*` no schema-catalog | Marcar como Superseded | Documental | P3 | — |

---

## 4. Divergências doc × código

1. **Fusão E15 (gutter):** docs/design/TAREFAS_QUADRO_STATUS.md:846 diz que Lista e Agenda recebem o gutter por dentro. No código, `tasks` é `layout:'full'` (src/services/navigation.service.ts:63), `ViewContainer` não aplica wrapper (src/components/layout/ViewContainer.tsx:33) e a raiz não tem padding (src/components/tasks/TasksModule.tsx:235).
2. **Fusão E12:** o STATUS (:4 e :842) diz que E01–E29 foram concluídas. O preset `pipeline` continua em src/components/ui/EmptyState.tsx:70 e o placeholder "ex: pipeline" em src/components/CommandPalette.tsx:97.
3. **MODULO_TAREFAS_QUADRO_DASHBOARD.md:103 e :291** dizem que a fusão não está integrada (item "Quadro", rota `pipeline`, `viewRouteProps.ts`). No código foi integrada: `viewRouteProps.ts` apagado, sem `forceMode` e redirect `pipeline→tasks` em src/hooks/system/useNavigationHistory.ts:98-101.
4. **Catálogo CT-49:** HANDOFF_v1.md:63 diz que o rail "Envios hoje/7 dias" existe e só aparece com ≥ 1 envio. Não há consumidor da view `catalog_send_stats` em src (só types.ts:9974).
5. **Catálogo CT-52:** o checkbox está aberto, mas o botão "Enviar produto" está implementado em src/components/contacts/ContactDetailPanel.tsx:304-329.
6. **Mapa:** ENCERRAMENTO_FASE8_E100.md:67 diz que a sessão fantasma não foi corrigida. Já foi: src/lib/mapboxSession.ts:31, 46-53 grava `searchbox_session` só no primeiro request faturado, com teste src/lib/__tests__/mapboxSession.sessaoFantasma.test.ts.
7. **Mapa E86, E87 e E88:** os checkboxes estão `[ ]`, mas as entregas existem (src/components/docs/featuresSectionsData.ts:230-231; docs/POP-ATENDIMENTO-BASICO.md:171; docs/runbooks/mapa-searchbox.md). O E100 tem `[ ]` com o relatório pronto.
8. **Reconciliação MULTI_CONEXAO_50.md (03/10)** marca como não feitos itens que hoje estão feitos:
   - E07 (:27): o runbook existe em docs/runbooks/bloqueio-meta.md.
   - E12 (:32): o `.catch(() => {})` saiu, ver src/hooks/inbox/useConnectionsManager.ts:327-330.
   - E24 (:44): o health resolve o token, ver connection-health-check/index.ts:72-108.
   - E25 (:45, VALIDATED_FAIL): corrigido em evolution-send.ts:150-173.
   - E30 (:50): o webhook resolve o token por instância, ver evolution-webhook/index.ts:75-90.
   - E35: diz "dois UPDATEs", mas hoje é RPC; só que a RPC não está versionada.
9. **Reconciliação ETIQUETAS_100.md (03/10)** marca como não feitos/parciais itens que hoje estão feitos:
   - E60 e E63 (:83): o redirect `tags→contacts` está em useNavigationHistory.ts:98-99.
   - E62: `TagsEmptyState` não existe mais.
   - E69 e E73: o comentário `useTags` saiu.
   - E74 e E98 (:121): featuresSectionsData.ts:309, 339 já descrevem `contacts.tags`/`contact_tags_ext`.
   - E100 (:123): o cabeçalho do plano diz "remoção executada".
   - E26: usa `fetchAllRows` (inbox.service.ts:25).
   - E38 e E39 (:61): escopo por conexão em 20261009150000.
10. **docs/COMPLETE_SYSTEM_FEATURES.md:434-435** marca ✅ para atribuição automática com métodos round-robin/aleatório/menor carga. Só existe a coluna em `user_settings` (src/hooks/system/useUserSettings.ts:59-60), sem UI e sem consumidor no banco. O único trigger escolhe o membro com menos contatos atribuídos (20261003272707:228).
11. **docs/DISTRIBUTION-FALLBACKS.md:9** ("O sistema distribui… cascata de algoritmos") e **docs/SLA-ESCALATION-CRON.md:9** ("utiliza pg_cron para… escalar") descrevem como existentes objetos que não aparecem em nenhuma migration nem no schema-catalog: `distribute_conversation`, `sla_violations`, `check_sla_violations` e o cron `check-sla-violations`.
12. **docs/migration/HANDOFF.md:254-262** diz que os gaps da GO "não têm call site no front" e retornam "501 explícito". Na verdade:
    - o front tem UX ativa para Integrações, Configurações da instância e "Marcar como não lida" (§3.8);
    - o roteador repassa para a GO (404), sem 501.
13. **docs/EVOLUTION_API_GAPS_ANALYSIS.md** (v2 1.0.1, "cobertura 190%") descreve outra API (v2) e outro repositório. A instalação é a Evolution GO, e o próprio plano E46 manda substituir esse documento.
14. **docs/tasks/README.md:75** lista `work-items-badge` sem consumidor. Hoje a Sidebar consome `useMyWorkItemsBadgeInfo` (src/components/layout/Sidebar.tsx:21, 54); só o alias `useMyWorkItemsBadge` ficou sem uso.
15. **scripts/db-audit/known-violations.json:2** afirma que a RPC `set_default_whatsapp_connection` "existe e está APROVADA (migration 20261006234158…)". O arquivo não existe em `supabase/migrations/` nem em nenhum branch local.
16. **docs/adr/README.md** lista ADR-001 (Accepted) e ADR-002 (Proposed) para `evolution_messages_wpp2`/tabelas por instância. Nenhuma tabela `evolution_*` existe no schema atual.

---

## 5. Achados fora dos planos

1. **"Definir conexão padrão" depende de uma RPC não versionada.** O front chama `set_default_whatsapp_connection` (src/hooks/inbox/useConnectionsManager.ts:306) e não há migration no repo. Se a RPC não estiver no banco, o botão sempre falha.
2. **WhatsApp do departamento:** `useSaveDepartmentWhatsApp` grava em `department_whatsapp_configs`, tabela inexistente (src/hooks/team-chat/useDepartmentManagement.ts:245, com `@ts-expect-error`). O "Salvar" de DepartmentWhatsAppView falha sempre. A RPC `set_department_whatsapp_config` (20260928540000) existe e não é usada.
3. **Posição na fila morta.** `QueuePositionNotifier` (src/components/inbox/QueuePositionNotifier.tsx, montado em src/components/inbox/chat/ChatHeader.tsx:134) consulta `queue_positions` a cada 15s por conversa aberta. Nenhuma migration, edge ou código escreve nessa tabela. É carga de rede sem resultado e uma funcionalidade que nunca aparece.
4. **Falso sucesso ao sincronizar histórico na GO:** "Sincronização concluída! 0 mensagens…" (ConnectionsView.tsx:75), porque a edge devolve `notSupported` com HTTP 200 (evolution-sync-actions.ts:158, 340).
5. **Hook com 6 ações inexistentes no roteador** (pin/unpin/mute/star/clear/set-disappearing; useEvolutionMessaging.ts:90-143). É código morto, travado por `it.fails` (useEvolutionMessaging.test.ts:390).
6. **Legado morto:** `src/hooks/integrations/useExternalEvolution.ts`, que lê `evolution_messages` da infra antiga wpp2 e fica desligado por `USE_EXTERNAL_DB=false`.
7. **Configuração sem efeito:** `user_settings.auto_assignment_enabled/method` (default `roundrobin`), sem UI e sem leitura no banco.
8. **SLA de resolução configurável e nunca medido:** `resolution_minutes` pode ser editado, mas ninguém escreve `resolution_breached`.
9. **Sentry:** existe um formulário de DSN (src/components/integrations/SentryIntegrationView.tsx:81), mas não há SDK no app. Bloqueia CT-93 e qualquer breadcrumb.
10. **A view `catalog_send_stats`** (security_invoker, 30 dias) foi criada e aplicada sem nenhuma tela que a leia.
11. **Recomendação de produtos da aba IA** lê a tabela local `products` (useRecommendedProducts.ts:75), e não o PromoGifts.
12. **Votos de enquete** não são processados no webhook. A enquete enviada nunca mostra resultado.
13. **Placeholder e preset "pipeline"** sobram na paleta e no EmptyState (ver E12).
14. **Import morto** `Filter` em TasksModule.tsx:3.

---

## 6. Top 10 da área

1. **Multi-conexão não opera um 2º número.** O proxy, o QR, o status e o logout usam o token global (E16/E23), e a entrega do inbox falha fechado para a 2ª conexão (E18). Hoje está travado pela flag. Prioridade P0 quando o negócio quiser ligar o 2º número.
2. **O envio de produto pelo catálogo nunca foi provado em produção** (CT-10/11/18/50/82). Depende do Joaquim com uma conexão ativa.
3. **Botões que quebram com a Evolution GO:**
   - Integrações (6 abas);
   - Configurações da instância;
   - "Marcar como não lida";
   - "Sincronizar histórico" (falso sucesso).
4. **SLA sem escalonamento automático e com monitor só no navegador.** Sem admin com o painel aberto, ninguém é alertado; o SLA de resolução também não é medido.
5. **A distribuição automática é só "menor carga" ingênua.** Ignora quem está online, o limite de conversas e o histórico com o cliente. A preferência "round-robin" é ignorada e a documentação diz ✅.
6. **"Definir conexão padrão" chama uma RPC cuja migration não está no repo.** Salvar o WhatsApp do departamento grava em tabela inexistente.
7. **Desempenho do catálogo:** Lighthouse 44 e CLS 0,245 (metas: 90 e 0,05), payload de 81,5 KB por página (meta: 30 KB).
8. **A11y P1 em Filas/SLA/War Room/Catálogo** (142 botões sem nome, barras sem nome, rolagem horizontal no celular) **e em Tarefas** (botões de modo sem nome no celular).
9. **Segurança:** o INSERT de `conversation_tasks` aceita `contact_id` de qualquer contato. A rotação das credenciais expostas na migração (MIG-97) segue pendente com o Joaquim.
10. **Tela de Tarefas sem margem lateral** depois da fusão (E15) e com sobras do "pipeline" (E12). A rede de alertas de fila também não cobre tempo de espera nem mensagens pendentes.
