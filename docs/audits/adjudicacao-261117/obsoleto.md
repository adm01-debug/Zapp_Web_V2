# Caminhos obsoletos (131)

A `main` seguiu outro caminho, por decisao posterior. Fechar a branch de origem nao perde nada.

Parte do laudo de adjudicacao de 17/11/2026 — indice e metodo em `docs/audits/ADJUDICACAO-233-CAMINHOS-2026-11-17.md`.

Cada item cita a evidencia lida no codigo (`arquivo:linha` ou saida de comando). Os vereditos vieram de sete adjudicadores (um por lote) e passaram por quatro refutadores, instruidos a DERRUBAR todo veredito que autorizasse apagar. Onde houve refutacao ou correcao, os dois textos ficam no item.

## front: campanhas e dashboard (14)

### `src/components/campaigns/CampaignABTesting.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: O diretorio `src/components/campaigns/` tem zero arquivos na `main` e a decisao esta registrada em `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59` ('campanhas passaram a viver no modulo Talk X'). O A/B esta na `main` em versao melhor, sobre `talkx_template_variants`: `src/hooks/integrations/useTalkXTemplates.ts:207` (busca variantes A/B), `:217-223` (salvar), `:230` (apagar), `:235-239` (contar envios da variante); UI em `src/components/talkx/TalkXTemplateEditor.tsx:302` (carrega), `:321` (sub-aba `ttab=ab`), `:331-338` (remover com confirmacao quando ja houve envio), `:355-381` (adicionar variante A/B/C redistribuindo peso). A tabela legada `campaign_ab_variants` so sobrevive no tipo gerado (`src/integrations/supabase/types.ts:1383`) — nenhum `src/` da `main` a consulta. Residuo nao coberto: a `main` nao tem botao 'declarar vencedor' (usa peso de trafego por variante em vez de flag `is_winner`).

### `src/components/campaigns/CampaignCreateDialog.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Modulo removido de proposito — decisao em `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59`. Substituido pelo wizard Talk X: `src/components/talkx/TalkXCampaignWizard.tsx:449-451` (fontes de audiencia: Contatos ZAPP com filtros, Segmento salvo, CRM 360), `:439-441` (erro de validacao da audiencia). A mesma guarda de midia existe na `main`: `src/components/talkx/useCampaignEditor.ts:936` ('exige media_url e media_type juntos, entao um tipo sem URL nao pode avancar') e `:940` (condicao de avanco). O publico por etiqueta foi retirado por decisao explicita: `src/components/talkx/TalkXAudienceFilters.tsx:20-21` ('O controle de Tags saiu daqui (12/10/2026): a funcao de tags de contato nao existe mais no sistema').

### `src/components/campaigns/CampaignsView.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Modulo removido de proposito — `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59`. Substituido por `src/components/talkx/TalkXOverview.tsx` + `src/components/talkx/TalkXView.tsx`: filtro de status em `TalkXOverview.tsx:166` e `:188`, busca em `:162`/`:226`, acoes em massa por status em `:251-253` e `:268` (pausar), coluna de status em `:340-344`; ciclo de vida em `TalkXView.tsx:66` (`'paused'`/`'report'`), `:310` e `:386`. A lista da `main` filtra e pagina no servidor: `src/hooks/integrations/useTalkXCampaignList.ts:252` (status) e `:263` (busca `ilike`), sobre `talkx_campaigns` (`:249`).

### `src/components/campaigns/__tests__/CampaignCreateDialog.r2-mod-005.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Testa componente que a `main` nao tem — `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59`. O requisito equivalente esta coberto na `main` por `src/components/talkx/useCampaignEditor.ts:936-940` (midia sem URL nao avanca) e pelos testes `src/components/talkx/__tests__/TalkXCampaignWizard.resumo-servidor.test.tsx`, `TalkXCampaignScheduled.start-guard.test.tsx`.

### `src/components/campaigns/__tests__/CampaignsView.audiencia.r2-mod-005.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Testa `CampaignsView`, ausente da `main` — `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59`. A guarda equivalente na `main` e a validacao de audiencia do wizard: `src/components/talkx/useCampaignEditor.ts:940` (`audienceQueryReady` + totais de segmento/contato na condicao de avanco) e `src/components/talkx/TalkXCampaignWizard.tsx:439-446`; teste de aceite em `src/components/talkx/__tests__/TalkXCampaignScheduled.start-guard.test.tsx`.

### `src/components/campaigns/__tests__/CampaignsView.retomada.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Testa `CampaignsView`, ausente da `main` — `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59`. Na `main` o comportamento existe: `src/components/talkx/TalkXCampaignPaused.tsx:239` (botao 'Retomar campanha') e `:122` (um clique, sem confirmacao, por decisao do dono), `src/components/talkx/TalkXOverview.tsx:499` ('Retomar' na linha) e status 'Pausada' no filtro via `src/components/talkx/kit/constants.ts:15` consumido em `TalkXOverview.tsx:166`. Testes de aceite: `src/components/talkx/__tests__/TalkXCampaignPaused.test.tsx`, `TalkXOverview.lifecycle.test.tsx`.

### `src/components/campaigns/__tests__/CampaignsView.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Citado nominalmente como obsoleto na `main`: `analise-prs/VEREDITOS-A2-CODIGO-261117.md:59` — 'O diretorio src/components/campaigns/ tem zero arquivos na main: campanhas passaram a viver no modulo Talk X. O teste e de um componente substituido.' Cobertura equivalente hoje em `src/components/talkx/__tests__/TalkXOverview.states.test.tsx`.

### `src/components/connections/ConnectWhatsAppDialog.tsx`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: Registrado na `main` como regressao da propria branch: `analise-prs/resgate-261115/dossies/claude_pink__nice-hypatia-iikl82.md:41` — 'Conexoes WhatsApp destruidas... src/components/connections/ConnectWhatsAppDialog.tsx (dialog vazio com um botao Fechar)'. O fluxo real de conexao esta na `main` em `src/components/connections/ConnectionsView.tsx` (285 linhas) com `ConnectionCard.tsx`, `ConnectionDisconnectDialog.tsx`, `InstanceSettingsDialog.tsx`, `BusinessHoursDialog.tsx`, `ConnectionQueuesDialog.tsx` e a trava multiconexao (`src/components/connections/__tests__/ConnectionsView.trava-multiconexao.test.tsx`).

### `src/components/connections/IntegrationsPanel.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido de proposito (E43/SL-075): `docs/audits/AUDITORIA_PARIDADE_V3_DOC_16_2026-10-13_PARTE2_CONEXOES_CONFIG.md:16` — 'IntegrationsPanel (Typebot, OpenAI, Dify, Flowise, Chatwoot, EvolutionBot) | DECISAO | ... removido de proposito ... (E43: GO nao tem essas rotas)'; e `:75` ('A V2 nao tem a tela: bom', por causa das API keys em campo `type=text`). Guarda viva na `main`: `src/components/connections/__tests__/ConnectionCard.sem-integracoes.test.tsx:5` ('o item Integracoes (IA/Bots) nao pode mais existir') e `:40-44`. Na `main` os metodos `getTypebot/getOpenAI/...` so aparecem em testes de contrato do hook (`src/hooks/integrations/__tests__/useEvolutionApi.payloads.test.ts:198-201`) — nenhuma tela os usa.

### `src/components/connections/__tests__/IntegrationsPanel.desativar.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Testa a tela que a `main` apagou por decisao: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_16_2026-10-13_PARTE2_CONEXOES_CONFIG.md:16` (E43/SL-075, 'GO nao tem essas rotas') e a guarda `src/components/connections/__tests__/ConnectionCard.sem-integracoes.test.tsx:40-44`, que exige a ausencia do item 'Integracoes (IA/Bots)'. Sem a tela nao existe o defeito.

### `src/components/dashboard/MetricComparison.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Copia sem importador, removida de proposito no cartao SL-175. Guarda viva na `main`: `src/components/__tests__/componentesDuplicados.test.ts:13` (tabela par/canonico), `:45` (lista `COPIAS_REMOVIDAS` com este caminho exato), `:52` (referencia proibida `dashboard/MetricComparison`) e o teste 'nenhuma das 4 copias sem importador voltou ao repositorio'. Canonico vivo: `src/components/dashboard/metrics/MetricComparison.tsx`, exportado por `src/components/dashboard/metrics/index.ts` e `src/components/dashboard/MetricComponents.tsx:5-12`. `ComparisonCard` e `TeamComparison` nao existem em `src/` da `main` — estavam sem nenhum consumidor, motivo declarado da remocao.

### `src/components/dashboard/MiniSparkline.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido de proposito no mesmo cartao SL-175, com o motivo escrito: `src/components/__tests__/componentesDuplicados.test.ts:21` — 'O MiniSparkline de src/components/dashboard era um wrapper @deprecated sobre o canonico com um unico consumidor (GamificationEffects), migrado neste cartao'; lista em `:46` e referencia proibida em `:53`. Canonico na `main`: `src/components/dashboard/metrics/MiniSparkline.tsx:12` (`export function MiniSparkline`), consumido por `src/components/dashboard/GamificationEffects.tsx` e `src/components/dashboard/metrics/AnimatedMetricCard.tsx`.

### `src/components/dashboard/RealtimeMetricsPanel.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Residuo removido de proposito no cartao SL-170, substituido pelo redesign Navy: `src/components/dashboard/__tests__/ResiduoVisaoGeral.test.ts:4-8` — 'O redesign Navy o substituiu pelo DashboardKpiRow (docs/design/REDESIGN_DASHBOARD_STATUS.md, CP9) e ele ficou sem nenhum importador'; guarda em `:20` ('o painel... nao voltou ao repositorio'). Substituto vivo: `src/components/dashboard/overview/DashboardKpiRow.tsx`, montado em `src/components/dashboard/DashboardView.tsx:33` e `:229` (recebe `realtime` do mesmo `useRealtimeDashboard`); o comentario em `DashboardView.tsx:193-195` registra que ele deixou de renderizar ali.

### `src/components/dashboard/TrendIndicator.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Copia sem importador, removida de proposito no cartao SL-175. Guarda viva na `main`: `src/components/__tests__/componentesDuplicados.test.ts:12` (par/canonico), `:44` (`COPIAS_REMOVIDAS` com este caminho), `:51` (referencia proibida `dashboard/TrendIndicator`). Canonico vivo: `src/components/dashboard/metrics/TrendIndicator.tsx`, reexportado em `src/components/dashboard/MetricComponents.tsx:5-12` e usado por `src/components/dashboard/AIStatsWidget.tsx`, `src/components/dashboard/SentimentHelpers.tsx`, `src/components/sla/SLAHistoryDashboard.tsx`. A utilidade `calculateTrend` existe na `main` em `src/hooks/analytics/useAIStats.ts` (com teste em `src/hooks/analytics/__tests__/useAIStats.test.tsx`) e em `src/components/reports/useReportsData.ts`; `CompactTrendBadge` e `TrendSparkline` nao existem em `src/` da `main` — estavam sem consumidor.

## front: inbox, copilot e chamadas (22)

### `src/components/calls/VoIPPanel.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A `main` importa `TelefoniaView` direto, sem alias: `src/pages/lazyViews.ts:31` e `src/pages/ViewRouter.tsx:73` ('voip': Views.TelefoniaView); o componente real esta em `src/components/calls/TelefoniaView.tsx:60`. A remocao do alias foi deliberada e esta registrada na `main` em `docs/_arquivo/docs/consolidacao/_levantamento/C-commits.tsv:741` — commit `758e3821` "fix(telefonia): Remover alias VoIPPanel (SL-241)", que apaga exatamente este caminho.

### `src/components/contacts/ContactPurchaseHistory.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Modulo removido por decisao do dono em 2026-11-03: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` registra a decisao e `:63` faz `DROP TABLE IF EXISTS public.contact_purchases CASCADE`. `git grep contact_purchases origin/main -- src/` devolve zero linhas. Veredito ja escrito na `main`: `analise-prs/VEREDITOS-A2-CODIGO-261117.md:87` nomeia este arquivo entre os deletados pela PR #2690.

### `src/components/copilot/RadarPhase6Panel.tsx`

- Branch de origem: `claude/feat-radar-fase6-261108-1933`
- Evidencia do adjudicador: A `main` tem o mesmo painel, com o MESMO cabecalho de requisitos: `src/components/inbox/copilot/RadarPanel.tsx:1-4` ("CV-051–060 — Painel RADAR flutuante"), alimentado por `src/hooks/copilot/useRadarPanel.ts` e `RadarCards.tsx`. Adjudicado na `main`: `analise-prs/VEREDITOS-A2-CODIGO-261117.md:33` e `analise-prs/BRANCHES-APAGADAS-261117-LOTE2.md:236`, que conclui que o arquivo da branch e "OBSOLETO e regressivo" (a API dele perde cardOrder/collapsedCards/position que RadarPanel.tsx e RadarCards.tsx consomem); so a timeline de insights (CV-055) falta, e ela e do hook, nao deste arquivo. Doc tambem em `analise-prs/INVENTARIO-RESGATE-261116.md:72`.

### `src/components/inbox/ContactPurchasesPanel.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesma remocao deliberada: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` (decisao do dono) e `:63` (DROP TABLE contact_purchases CASCADE). `analise-prs/VEREDITOS-A2-CODIGO-261117.md:86` nomeia `ContactPurchasesPanel.tsx` entre os arquivos deletados pela PR #2690. Zero ocorrencia de `contact_purchases` em `origin/main -- src/`.

### `src/components/inbox/MessageContextMenu.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A `main` removeu de proposito exatamente as entradas que este menu oferece sem concluir nada: `src/components/inbox/chat/MessageHoverToolbar.tsx:197` ("R2-INB-021 (item 317): Favoritar/Fixar/Responder depois/Reportar") e a guarda de regressao `src/components/inbox/chat/__tests__/menus-r2-inb-021.test.tsx:8-12` ("o menu do balao ... exibia itens que anunciavam uma acao e nao concluiam nada ... nenhuma dessas entradas e oferecida"). O que sobrou esta em `MessageHoverToolbar.tsx:150-156` (Responder/Encaminhar/Copiar) e `src/components/inbox/MessageContextActions.tsx:170-174` (Marcar como lida/nao lida). Na propria branch o componente nao tinha nenhum consumidor fora de si mesmo.

### `src/components/inbox/QueuePositionNotifier.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A `main` tem uma GUARDA DE REMOCAO explicita: `src/components/inbox/__tests__/queue-position-removido.test.ts:31` ("o componente nao existe mais") e `:36-40` ("nenhum arquivo de src/ referencia QueuePositionNotifier"), com o motivo em `:5-10`: era codigo morto — a posicao na fila e tratada pelos cartoes de fila e `queue_positions` nunca recebe INSERT. `git grep queue_positions origin/main -- src/` devolve apenas esse teste e `integrations/supabase/types.ts`.

### `src/components/inbox/SwipeableListItem.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Codigo morto ja na propria branch: `git grep -ln SwipeableListItem origin/hermes/robustez-primitivos-ui-... -- src/` so devolve o proprio arquivo (nenhum consumidor). O gesto que a `main` realmente usa e `src/components/mobile/SwipeableMessage.tsx:16` (responder/encaminhar, `SWIPE_THRESHOLD` em `:14`), consumido em `src/components/inbox/chat/MessageBubble.tsx:166`, com teste `src/components/mobile/__tests__/SwipeableMessage.test.tsx`.

### `src/components/inbox/__tests__/ContactPurchasesPanel.erro-gravacao.test.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Testa um modulo removido por decisao do dono: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` (decisao 2026-11-03) e `:63` (DROP TABLE contact_purchases). `analise-prs/VEREDITOS-A2-CODIGO-261117.md:72` nomeia este arquivo e `:88` conclui que "os tres testes da branch sao descartados por remocao deliberada".

### `src/components/inbox/__tests__/ContactPurchasesPanel.total-erro-data.test.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesmo modulo removido: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` e `:63`. Citado por nome em `analise-prs/VEREDITOS-A2-CODIGO-261117.md:72`, com o veredito em `:88` ("descartados por remocao deliberada").

### `src/components/inbox/chat/ChatHeader.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Ja na propria branch estava superado: o arquivo `src/components/inbox/chat/ChatPanelHeader.tsx` tambem existe la, e o UNICO consumidor de `ChatHeader` na branch e o barrel `src/components/inbox/chat/index.ts:1` — barrel que a `main` marcou para delecao em `docs/reconciliation/RESIDUE_REGISTRY.md:16` (UNUSED_BARREL_CANDIDATE / DELETE-B). Na `main` o cabecalho em uso e `src/components/inbox/chat/ChatPanelHeader.tsx:34`, importado por `src/components/inbox/ChatPanel.tsx:20` e renderizado em `:468`; o barrel da `main` (`chat/index.ts`) exporta `ChatPanelHeader`, nao `ChatHeader`. Testes: `chat/__tests__/ChatPanelHeader.test.tsx` e `ChatPanelHeader.reabrir.test.tsx`.

### `src/components/inbox/contact-details/ContactAccordionSections.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Arquitetura substituida na `main` pelo sidebar de 3 secoes: `src/components/inbox/contact-details/sidebar/sidebarSections.ts:26` define `SIDEBAR_SECTIONS = ['professional','personal','singu','intelligence','delivery','memoria','atendimento']` com nova chave de storage em `:31` (`contact-sidebar-accordion-state@v2`, migrando da antiga `contact-details-accordion-state` em `:32`), montado por `sidebar/ContactSidebarSections.tsx:30`. O plano da troca esta citado em `sidebarSections.ts:2-3` (PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02) e a prova no painel em `__tests__/ContactDetails.restaurados.test.tsx:31` (que mocka `ContactSidebarSections`, nao o acordeao antigo).

### `src/components/inbox/contact-details/__tests__/Contact360Helpers.fuso.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: O requisito esta coberto na `main` por outro helper, com o mesmo raciocinio escrito no comentario: `src/lib/formatters.ts:175-192` (`formatBirthday`) — "'YYYY-MM-DD' precisa ser lido como data local (new Date(iso) interpreta como UTC e o dd/MM viraria o dia anterior em GMT-3)" — consumido por `src/components/inbox/contact-details/sidebar/SinguProfileSection.tsx:17`. O alvo deste teste (`Contact360Helpers.tsx`, com `CompanyCard`/`ContactDetailCard`) nao existe na `main` em caminho nenhum (`git grep -ln Contact360Helpers origin/main -- src/` = zero), logo o arquivo nao compila la.

### `src/components/inbox/contact-details/__tests__/contactDetailSections.test.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Testa o catalogo antigo, substituido na `main`: `src/components/inbox/contact-details/sidebar/sidebarSections.ts:26-31` (novo catalogo e nova chave `contact-sidebar-accordion-state@v2`), com a suite equivalente em `src/components/inbox/contact-details/sidebar/__tests__/sidebarSections.test.ts`. O modulo importado por este teste (`../contactDetailSections`) nao existe na `main` em caminho nenhum.

### `src/components/inbox/contact-details/contactDetailSections.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Substituido na `main` por `src/components/inbox/contact-details/sidebar/sidebarSections.ts`: `:26` (`SIDEBAR_SECTIONS` com 7 valores), `:28` (`DEFAULT_OPEN_SECTIONS`), `:31` (nova chave `contact-sidebar-accordion-state@v2`) e `:32` (`LEGACY_STORAGE_KEY = 'contact-details-accordion-state'` — a chave deste arquivo, tratada explicitamente como legado e migrada em `:56-66`).

### `src/components/inbox/copilot/index.ts`

- Branch de origem: `claude/feat-copilot-radar-20261108-1800`
- Evidencia do adjudicador: Veredito ja escrito na `main`: `analise-prs/VEREDITOS-A2-CODIGO-261117.md:58` — "Barrel. A pasta existe na `main` com 13 componentes, importados direto". Confirmado no codigo: a `main` importa direto (`src/components/inbox/chat/ChatInputArea.tsx:33` e `:37`, `@/components/inbox/copilot/RadarBoundary` e `RadarLive`) e o hook mudou de pasta — `src/hooks/copilot/useCopilotSession.ts` existe, `src/hooks/chat/useCopilotSession.ts` (o caminho que este barrel reexporta) NAO existe, logo o arquivo nem resolveria na `main`. Tambem em `analise-prs/INVENTARIO-RESGATE-FINAL-261116.md:71`.

### `src/components/inbox/swipeActions.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Codigo morto ja na branch: o unico consumidor e `src/components/inbox/SwipeableListItem.tsx` (tambem sem consumidor nenhum — `git grep -ln SwipeableListItem origin/hermes/robustez-primitivos-ui-... -- src/` devolve so os dois arquivos). Na `main` o unico swipe em producao e responder/encaminhar no balao: `src/components/mobile/SwipeableMessage.tsx:16`, usado em `src/components/inbox/chat/MessageBubble.tsx:166`; nenhum dos nomes deste arquivo (`SWIPE_ACTIONS`, `DEFAULT_LEFT_ACTION`) existe na `main`.

### `src/components/mobile/BottomSheet.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Sem consumidor na propria branch (`git grep -ln BottomSheet origin/hermes/robustez-primitivos-ui-... -- src/` so devolve arquivos de `components/mobile/`). Na `main` a folha inferior e `src/components/ui/drawer.tsx` (vaul, usado por `catalog/ProductDetailDialog.tsx` e `catalog/SendProductDialog.tsx`) e `src/components/ui/sheet.tsx` (18 arquivos consumidores), alem do menu movel proprio `src/components/mobile/MobileDrawerMenu.tsx` (montado em `src/components/mobile/MobileShell.tsx:87`). `git grep -ln BottomSheet origin/main -- src/` devolve apenas uma mencao em comentario de teste de CSS (`src/styles/__tests__/mobileAreaSeguraRolagem.test.ts`).

### `src/components/mobile/FloatingActionButtons.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Sem consumidor na branch (`FloatingActionButton`, `SpeedDialFAB`, `KeyboardAwareContainer`: zero fora de `components/mobile/`). Na `main` o FAB em producao e `src/components/mobile/MobileFAB.tsx`, montado em `src/components/mobile/MobileShell.tsx:100`, e os nomes deste arquivo nao existem na `main` (`git grep -ln SpeedDialFAB\|KeyboardAwareContainer origin/main -- src/` = zero).

### `src/components/mobile/SwipeGestures.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: `SwipeableRow` nao tem consumidor na branch nem existe na `main`. O puxar-para-atualizar da `main` e `src/components/mobile/MobilePullToRefresh.tsx`, consumido por `src/components/inbox/ConversationListSidebar.tsx` e `RealtimeInboxView.tsx` — e e esse que a propria branch usa em `src/components/inbox/ConversationListSidebar.tsx:4` (`MobilePullToRefreshIndicator`), nao o daqui. A duplicacao estava registrada na `main`: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_PARTE4_V2_PROPRIA.md:12` ("U4-03 | MORTO ... `PullToRefresh` duplica o de `components/mobile/SwipeGestures.tsx:94`").

### `src/components/mobile/TouchRipple.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Sem consumidor na branch e inexistente na `main` (`git grep -ln TouchRipple origin/main -- src/` = zero). O efeito de onda da `main` e `src/components/ui/micro-interactions/buttons.tsx:43` (`export function RippleButton`, props em `:13`), com a animacao em `src/styles/animations.css` e cobertura em `src/components/ui/__tests__/timers-unmount.test.tsx`.

### `src/components/mobile/index.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A `main` marcou este caminho para delecao: `docs/reconciliation/RESIDUE_REGISTRY.md:16` — "`UNUSED_BARREL_CANDIDATE` | 28 | `DELETE-B` | `src/components/inbox/chat/index.ts`, `src/components/mobile/index.ts`". Nenhum dos nomes que ele reexporta existe na `main` (`SwipeableRow`, `TouchRipple`, `haptics`, `defaultSwipeActions`, `BottomSheet`, `FloatingActionButton`, `SpeedDialFAB`, `KeyboardAwareContainer`, `MobileTabBar`, `SlideOverPanel`, `PinchZoom`, `LongPressMenu`: `git grep -ln` = zero para todos), e a pasta `src/components/mobile/` da `main` nao tem `index.ts` — os componentes sao importados por caminho direto (ex.: `src/components/mobile/MobileShell.tsx:3-6`).

### `src/components/mobile/swipeUtils.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Sem consumidor fora de `components/mobile/` na branch; `haptics` e `defaultSwipeActions` nao existem na `main` (`git grep -ln haptics origin/main -- src/` = zero). A `main` chama `navigator.vibrate` direto em cada ponto: `src/components/mobile/SwipeableMessage.tsx:40`, `src/components/mobile/MobileFAB.tsx`, `MobileShell.tsx`, `MobileDrawerMenu.tsx`, `src/components/ui/mobile-components.tsx`, `src/components/inbox/chat/useChatInputLogic.ts` e `src/components/team-chat/TeamChatInputArea.tsx` — centralizar num modulo e estilo, nao funcionalidade.

## front: hooks e lib (45)

### `src/components/BulkActionsBar.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Depende de `@/hooks/inbox/useBulkActions`, removido de propósito (guarda em `src/hooks/__tests__/useBulkActions.removido.test.ts:1-16`). A barra viva da main é `src/components/contacts/BulkActionsBar.tsx:59`, usada em `src/components/contacts/ContactsView.tsx:9,268`.

### `src/components/security/__tests__/AuditLogDashboard.hoje-local.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: `src/components/security/__tests__/AuditLogDashboard.hoje-janela24h.test.tsx:4` diz literalmente: "Substitui o teste `AuditLogDashboard.hoje-local.test.tsx` (R3-02, #1392)" — a contagem passou a ser janela de 24 h no servidor, sem fronteira de dia.

### `src/components/settings/__tests__/AIAutoTagsConfig.recentesErro.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Importa `../AIAutoTagsConfig` (linha 30), componente que não existe na main porque a função de tags de IA foi removida por decisão do dono — `src/components/inbox/contact-details/ContactFirstResponseSLA.tsx:6-7`.

### `src/components/talkx/__tests__/TalkXSegments.crmUnavailable.test.tsx`

- Branch de origem: `claude/feat-talkx-x048-estados-servico-261101-2100`
- Evidencia do adjudicador: A main deixou o campo `crm` FORA do hook de propósito: `src/hooks/integrations/useTalkXServiceStatus.ts:19-22` ("Fora desta entrega... `crm` depende do sinal de disponibilidade de CAP-092, ainda parcial"), e `src/components/talkx/TalkXSegments.tsx` não importa o hook. O estado em si existe e é testado à parte: `src/components/talkx/kit/__tests__/states.test.tsx:102-106` e `src/components/talkx/kit/ServiceStatusSheet.tsx:4`.

### `src/components/talkx/report/__tests__/TalkXCampaignReportExport.test.tsx`

- Branch de origem: `claude_juca/practical-rubin-8xnw0u`
- Evidencia do adjudicador: A main faz o portão na AÇÃO, não na renderização: `src/components/talkx/report/TalkXCampaignReport.tsx:221,229` chamam `downloadFileWithPermission(..., { canDownload })` (`src/lib/downloadFile.ts:54`) e os botões (rotulados "CSV"/"PDF", linhas 274-290) renderizam sempre — os próprios testes da main rodam com `canDownload: false` (`src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx:23-24`). A asserção `queryByRole('button', {name:/Exportar relat/i})` falharia contra a main.

### `src/components/ui/hover-card.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido de propósito como órfão: `docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490` registra o commit `8c6a0696` "chore(ui): remove orfaos de components/ui (hover-card, menubar, pagination, resizable, sidebar)" com situação INCORPORADA. Conferido: `git grep -n "HoverCardContent\|ui/hover-card" origin/main` → nada.

### `src/components/ui/menubar.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção de órfãos registrado em `docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`. Conferido: `git grep -n "MenubarMenu\|ui/menubar" origin/main` → nada.

### `src/components/ui/pagination.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção de órfãos (`docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`). Conferido: `git grep -n "PaginationLink\|PaginationEllipsis\|ui/pagination" origin/main` → nada. A paginação viva da main é própria de cada tela, ex. `src/components/calls/CallsPagination.tsx`.

### `src/components/ui/resizable.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção de órfãos (`docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`). Conferido: `git grep -n "ResizablePanelGroup\|ResizableHandle\|ui/resizable" origin/main` → nada.

### `src/components/ui/sidebar.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção de órfãos (`docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`). Conferido: `git grep -n "SidebarProvider\|SidebarMenuButton\|ui/sidebar" origin/main` → nada. A barra lateral do app na main é própria: `src/components/layout/Sidebar.tsx`.

### `src/components/ui/sidebar/index.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Diretório inteiro removido no commit de órfãos registrado em `docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`; `git ls-tree -r origin/main --name-only | grep '^src/components/ui/sidebar'` → vazio.

### `src/components/ui/sidebar/sidebar-context.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção (`docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`). `git grep -n "SidebarProvider" origin/main` → nada; o estado de colapso na main vive em `src/hooks/ui/useSidebarCollapse.ts`.

### `src/components/ui/sidebar/sidebar-menu.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção (`docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`). `git grep -n "SidebarMenuButton\|SidebarMenuSkeleton" origin/main` → nada.

### `src/components/ui/sidebar/sidebar-primitives.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Mesmo commit de remoção (`docs/_arquivo/docs/consolidacao/_levantamento/A-branches.tsv:2490`). `git grep -n "SidebarGroupAction\|SidebarInset" origin/main` → nada.

### `src/hooks/__tests__/useBulkActions.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: O hook foi removido de propósito por risco de segurança (apagava em massa de qualquer tabela via `tableName`): guarda em `src/hooks/__tests__/useBulkActions.removido.test.ts:1-16`, que exige que o arquivo NÃO volte. Substituto: `src/hooks/inbox/useInboxBulkActions.ts`.

### `src/hooks/__tests__/useCallHistory.test.tsx`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: O hook foi substituído pelas RPCs do servidor: `src/hooks/calls/useMyCalls.ts:54` (`search_my_calls`) e `src/hooks/calls/useCallsKpi.ts:98` (`my_calls_kpi`), cada um com teste próprio (`src/hooks/calls/__tests__/useMyCalls.test.tsx`, `useCallsKpi.test.tsx`).

### `src/hooks/__tests__/useCampaigns.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: O módulo de campanhas da main é o Talk X, sobre `talkx_campaigns` (`src/hooks/integrations/useTalkX.ts:233,249`); nenhum arquivo de `src/` da main lê `from('campaigns')`, e a tela antiga foi apagada — registrado em `analise-prs/resgate-261115/dossies/hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c.md` ("`CampaignsView.test.tsx` — arquivo apagado na main, `025d0258d` 2026-10-16").

### `src/hooks/__tests__/useMotionSeguro.test.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Dossiê da própria main, tabela arquivo×achado: `analise-prs/resgate-261115/dossies/hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c.md` — "`src/hooks/useMotionSeguro.ts` (+ `__tests__/useMotionSeguro.test.ts`) | OBSOLETA — abordagem substituída pela convenção `useReducedMotion` por componente + `MotionConfig` global". Na main: `src/App.tsx:85-88` e `src/components/calls/__tests__/telefoniaMotion.test.tsx`.

### `src/hooks/__tests__/useVersions.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: O hook foi removido por risco de segurança: `src/hooks/system/__tests__/useVersionsAusente.test.ts:5-11` — "fazia UPDATE cego de snapshot em qualquer tabela via fromTable(entityType), fora da trava das RPCs de papel. Este teste falha se o hook ou o seu export no barrel voltarem".

### `src/hooks/communication/useCallHistory.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: O próprio arquivo já se declara `@deprecated (T41)` e manda migrar para `search_my_calls`; a main fez a migração: `src/hooks/calls/useMyCalls.ts:54` (`supabase.rpc('search_my_calls', …)`) e `src/hooks/calls/useCallsKpi.ts:98` (`my_calls_kpi`), com testes em `src/hooks/calls/__tests__/`.

### `src/hooks/communication/useCampaigns.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main não tem nenhum arquivo em `src/` lendo `from('campaigns')`; o módulo de campanhas é o Talk X sobre `talkx_campaigns` (`src/hooks/integrations/useTalkX.ts:233`), com hooks dedicados (`useTalkXCampaignList.ts`, `useTalkXCampaignSummary.ts`, `useTalkXMonitor.ts`). A tela antiga foi apagada — `analise-prs/resgate-261115/dossies/hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c.md` (linha "`CampaignsView.test.tsx` — arquivo apagado na main").

### `src/hooks/connections/useConnections.ts`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: A main tem o gerenciador completo: `src/hooks/inbox/useConnectionsManager.ts` — tipo em :8, leitura de `whatsapp_connections` em :160/:369 e canal realtime em :123 — com 8 arquivos de teste em `src/hooks/inbox/__tests__/useConnectionsManager.*`. `git grep -n "useConnections\b" origin/main -- src/` → nada: o atalho foi descartado.

### `src/hooks/copilot/usePromptInjectionGuard.ts`

- Branch de origem: `claude/fix-logger-vitest-mock-261017-1000`
- Evidencia do adjudicador: A main rejeita essa abordagem explicitamente: `supabase/functions/_shared/copilot-tick.ts:316-320` — "A defesa é no formato, não em lista de frases suspeitas... Lista de frases (\"ignore suas instruções\", \"aja como\"…) erra nos dois sentidos — deixa passar o que não previu e barra conversa legítima". A defesa vigente é `neutralizarMarcadoresDeTurno` em `:323`, testada em `supabase/functions/_shared/__tests__/copilot-tick.injecao.test.ts`.

### `src/hooks/crm/__tests__/useContactPurchases.criar.test.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Testa `useCreateContactPurchase`, que não existe na main em nenhuma forma: `git grep -rn "contact_purchases" origin/main -- src/` só acha a declaração gerada em `src/integrations/supabase/types.ts`; `src/hooks/crm/` não tem hook de compras. Depende de `@/hooks/crm/useContactPurchases` (que também precisa ser resgatado), de `@/hooks/crm/useContactCrm360` (existe na main) e da tabela `contact_purchases`, que existe com RLS (`supabase/migrations/20260409020732_7e37c849-85fd-4308-88c9-7faa9dc18693.sql:3,18`).
- **Corrigido na conferencia final:** Veredito RESGATAR DERRUBADO na conferencia final. A tabela `contact_purchases` foi removida por decisao do dono: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` ("Decisao do dono em 2026-11-03") e `:63` (`DROP TABLE IF EXISTS public.contact_purchases CASCADE`). Conferido ao vivo na producao oficial (tnnnlkbymytvtqngbbqh) em 17/11: `to_regclass('public.contact_purchases')` devolve NULL e a migration de remocao consta aplicada em `supabase_migrations.schema_migrations`. O adjudicador do lote de componentes ja havia achado a mesma remocao para `ContactPurchasesPanel.tsx`; o do lote de hooks citou a migration ANTIGA de criacao. Resgatar criaria hook e testes contra tabela inexistente.

### `src/hooks/crm/__tests__/useContactPurchases.test.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Testa `useContactPurchases`, ausente na main: nenhum arquivo de `src/` lê `contact_purchases` (`git grep -rn "contact_purchases" origin/main -- src/` → só `src/integrations/supabase/types.ts`). Depende de `@/hooks/crm/useContactPurchases` e da tabela `contact_purchases` (`supabase/migrations/20260409020732_…sql:3`).
- **Corrigido na conferencia final:** Veredito RESGATAR DERRUBADO na conferencia final. A tabela `contact_purchases` foi removida por decisao do dono: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` ("Decisao do dono em 2026-11-03") e `:63` (`DROP TABLE IF EXISTS public.contact_purchases CASCADE`). Conferido ao vivo na producao oficial (tnnnlkbymytvtqngbbqh) em 17/11: `to_regclass('public.contact_purchases')` devolve NULL e a migration de remocao consta aplicada em `supabase_migrations.schema_migrations`. O adjudicador do lote de componentes ja havia achado a mesma remocao para `ContactPurchasesPanel.tsx`; o do lote de hooks citou a migration ANTIGA de criacao. Resgatar criaria hook e testes contra tabela inexistente.

### `src/hooks/crm/useContactPurchases.ts`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Ausente na main: `git grep -rn "contact_purchases" origin/main -- src/` devolve apenas `src/integrations/supabase/types.ts` (tipo gerado); `git ls-tree -r origin/main --name-only | grep '^src/hooks/crm/'` não tem hook de compras. Dependências para integrar: tabela `contact_purchases` já criada com RLS por agente atribuído (`supabase/migrations/20260409020732_7e37c849-85fd-4308-88c9-7faa9dc18693.sql:3,18` e `supabase/migrations/20260409222809_7b8a951e-3892-4b0f-84b1-68820d2d2f27.sql:2-28`), `@/hooks/crm/useContactCrm360` (existe na main) e `@/lib/logger`.
- **Corrigido na conferencia final:** Veredito RESGATAR DERRUBADO na conferencia final. A tabela `contact_purchases` foi removida por decisao do dono: `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` ("Decisao do dono em 2026-11-03") e `:63` (`DROP TABLE IF EXISTS public.contact_purchases CASCADE`). Conferido ao vivo na producao oficial (tnnnlkbymytvtqngbbqh) em 17/11: `to_regclass('public.contact_purchases')` devolve NULL e a migration de remocao consta aplicada em `supabase_migrations.schema_migrations`. O adjudicador do lote de componentes ja havia achado a mesma remocao para `ContactPurchasesPanel.tsx`; o do lote de hooks citou a migration ANTIGA de criacao. Resgatar criaria hook e testes contra tabela inexistente.

### `src/hooks/evolution/__tests__/useEvolutionIntegrations.test.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: `src/hooks/integrations/useEvolutionApi.ts:18-21` registra a decisão: "O antigo hook de integrações — que expunha integrações sem equivalente na GO (Chatwoot, Typebot, OpenAI, Dify, Flowise, RabbitMQ, templates…) — foi deletado, e o que restava dele virou este bloco". Nenhuma dessas ações existe no roteador `supabase/functions/evolution-api/index.ts` nem em `src/` da main.

### `src/hooks/evolution/useEvolutionIntegrations.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Deletado de propósito e a parte suportada pela Evolution GO foi absorvida: `src/hooks/integrations/useEvolutionApi.ts:18-21` (texto da decisão) e linhas 29-45 (perfil, etiquetas, contatos, privacidade, já no hook unificado). O barril `src/hooks/evolution/index.ts` da main exporta só Core/Groups/Instance/Messaging; o contrato front↔edge é travado por `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts`.

### `src/hooks/gamification/__tests__/mutations.test.tsx`

- Branch de origem: `claude/confident-bardeen-ndq0ch`
- Evidencia do adjudicador: A main proibiu escrita de gamificação no cliente: `src/hooks/gamification/__tests__/gamificacaoSemEscritaNoCliente.test.ts:5-16` — "Gamificação é SÓ LEITURA no cliente... permitia que um agente logado inflasse o próprio XP"; o guarda falha se qualquer arquivo de produção citar `add_agent_xp`, `grant_agent_achievement`, `update_agent_streak`, `increment_agent_messages` ou `increment_agent_resolutions` (migration 20261012233536 revogou o EXECUTE).

### `src/hooks/gamification/mutations.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido por segurança: `src/hooks/gamification/__tests__/gamificacaoSemEscritaNoCliente.test.ts:5-26` lista as 5 RPCs de escrita e exige que nenhum arquivo de produção de `src/` as cite; o XP agora vem de gatilhos SECURITY DEFINER (`supabase/migrations/20260925185436_gamification_triggers_eventos_reais.sql`). Leitura segue viva em `src/hooks/gamification/useAgentGamification.ts` e `useLeaderboard.ts`.

### `src/hooks/inbox/useBulkActions.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido de propósito por risco de segurança, com guarda que impede a volta: `src/hooks/__tests__/useBulkActions.removido.test.ts:1-16` — "montava `.delete().in('id', ids)` a partir de um `tableName?: string`... qualquer tela podia apagar em massa de qualquer tabela do banco, sem lista de tabelas permitidas". Substituto de escopo fechado: `src/hooks/inbox/useInboxBulkActions.ts`.

### `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts`

- Branch de origem: `claude/ecstatic-bardeen-twiveb`
- Evidencia do adjudicador: A main tem a guarda real da remoção, com asserções: `src/hooks/integrations/__tests__/useTalkXSuppression.hook-morto.test.ts:1-20` (prova que o hook morto não volta E que a API viva `fetchTalkXSuppressionActivity` continua existindo), além de `src/hooks/integrations/__tests__/useTalkXSuppression.test.tsx`. O módulo `src/hooks/integrations/useTalkXSuppression.ts` segue na main.

### `src/hooks/system/useDebounce.test.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Removido de propósito como duplicata, com guarda: `src/hooks/__tests__/useDebounce.test.ts:126-137` — "existia um segundo arquivo de teste deste hook ao lado do código (`src/hooks/system/useDebounce.test.ts`)... rodava as mesmas verificações duas vezes por build. Esta guarda trava a volta da duplicata" (cartão SL-222); a linha 136 exige `existsSync(duplicado) === false` e as linhas 138-150 mantêm a cobertura do arquivo removido.

### `src/hooks/system/useVersions.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido por segurança, com guarda que impede a volta: `src/hooks/system/__tests__/useVersionsAusente.test.ts:5-11` — "fazia UPDATE cego de snapshot em qualquer tabela via fromTable(entityType), fora da trava das RPCs de papel. Este teste falha se o hook ou o seu export no barrel voltarem".

### `src/hooks/team-chat/__tests__/departmentInviteCode.random.test.tsx`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: A main tirou o sorteio do front: `src/hooks/team-chat/useDepartmentManagement.ts:136` chama `rpc('create_department_invite', …)` e o comentário em `:56` diz "`create_department_invite` sorteia o codigo (gen_random_bytes) e grava". A guarda da main é `src/hooks/team-chat/__tests__/useCreateDepartmentInvite.rpc.test.tsx:5-9` — "O front nao sorteia codigo, nao grava tabela de convite nem auditoria direto" — então a asserção do teste da branch (insert em `department_invites` com código gerado no cliente) falharia.

### `src/hooks/team-chat/useTeamUnreadCount.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A main rejeita essa abordagem por escrito: `src/hooks/team-chat/useTeamUnreadTotal.ts:17-18` — "O cache continua sendo a única fonte: sem canal, consulta nova ou `localStorage`". O não lido por conversa vem do servidor em `src/hooks/team-chat/useTeamConversations.ts:99` (`unread_count` de `get_team_unread_counts`), somado em `useTeamUnreadTotal.ts:32-38`, com teste em `src/hooks/team-chat/__tests__/useTeamUnreadTotal.test.tsx`.

### `src/hooks/useMotionSeguro.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: Dossiê da própria main: `analise-prs/resgate-261115/dossies/hermes__telefonia-fase8-motion-a11y-responsivo-2610031530007c.md`, tabela arquivo×achado — "`src/hooks/useMotionSeguro.ts` (+ teste) | OBSOLETA — abordagem substituída pela convenção `useReducedMotion` por componente + `MotionConfig` global". Na main: `src/App.tsx:85-88` (`MotionConfig reducedMotion="user"`), `src/components/calls/CallKpiCard.tsx:27,37,39`, `src/styles/accessibility.css:77-83`, com aceite medido em `src/components/calls/__tests__/telefoniaMotion.test.tsx`. (O mesmo dossiê aponta uma lacuna real remanescente em `src/components/calls/IncomingCallAlert.tsx:235-239`, que NÃO é este arquivo.)

### `src/hooks/wallet/useWallet.ts`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: É placeholder (nenhum acesso a banco: `useState(null)` / `useState([])`), e a main tem a carteira real: `src/hooks/business/useClientWallet.ts:22` (regras de carteira com erro exposto à interface, linhas 19-30) e `src/components/wallet/ClientWalletView.tsx`, com testes e migration `supabase/migrations/20261015213324_client_wallet_apply.sql`.

### `src/lib/__tests__/groupsAutoSync.test.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: `supabase/functions/_shared/__tests__/evolution-helpers-phone-status.test.ts:4-6` registra a decisão nominalmente: "Substitui os 4 espelhos de `src/lib/__tests__/` (phoneNormalization, webhookStatusPriority, rateLimiter, groupsAutoSync) que copiavam a lógica em vez de importá-la: um espelho nunca falha quando a regra real muda, então ele não prova nada". O roteamento de grupo é testado contra o código real em `supabase/functions/_shared/__tests__/evolution-go-group-routing.test.ts`.

### `src/lib/__tests__/phoneNormalization.test.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Substituído nominalmente por `supabase/functions/_shared/__tests__/evolution-helpers-phone-status.test.ts:4-6`, que importa o CÓDIGO REAL de `supabase/functions/_shared/evolution-helpers.ts:21` (`normalizeEventName`) e `:50` (`normalizePhone`) — os mesmos usados por `supabase/functions/evolution-webhook/index.ts`.

### `src/lib/__tests__/rateLimiter.test.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Substituído nominalmente por `supabase/functions/_shared/__tests__/evolution-helpers-phone-status.test.ts:4-6`, que testa o `checkRateLimit` real de `supabase/functions/_shared/validation.ts`; o webhook da main limita por IP: `supabase/functions/evolution-webhook/index.ts:105-109` (`enforceRateLimit('evowh:'+ip, 200, 60_000)`).

### `src/lib/__tests__/webhookStatusPriority.test.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Substituído nominalmente por `supabase/functions/_shared/__tests__/evolution-helpers-phone-status.test.ts:4-6`, que importa o real de `supabase/functions/_shared/evolution-helpers.ts:207` (`STATUS_PRIORITY`) e `:212` (`shouldUpdateStatus`).

### `src/pages/viewRouteProps.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A porta de entrada "Quadro" foi removida por decisão registrada: `src/components/layout/__tests__/idsMortosNaNavegacao.test.tsx:2-4` — "E17 — Fusão Quadro→Tarefas (docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md). Ao remover a porta de entrada \"Quadro\" (id `pipeline`)...". `git grep -n "TASKS_ROUTE_PROPS\|forceMode\|defaultMode" origin/main -- src/` → nada; o modo agora é o último salvo em `src/components/tasks/TasksModule.tsx:55-56`.

### `src/shadcn/ui/button.tsx`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: É atalho de caminho sem destino: o componente real está na main em `src/components/ui/button.tsx` (com teste `src/components/ui/__tests__/button.test.tsx`) e `git grep -n "@/shadcn" origin/main -- src/` → nada. A árvore `src/shadcn/` não existe na main.

### `src/types/connections.ts`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: É atalho de caminho sem destino: o tipo é exportado na main em `src/hooks/inbox/useConnectionsManager.ts:8` e `git grep -n "@/types/connections" origin/main -- src/` → nada.

## banco: migrations e edge functions (8)

### `supabase/functions/_shared/__tests__/send-message-manual-resolution-compat.test.ts`

- Branch de origem: `claude/fix-pd79-compat-pre-migration-261111`
- Evidencia do adjudicador: A coluna ja existe na main: supabase/migrations/20261111160000_outbound_post_started.sql:348 (ADD COLUMN IF NOT EXISTS manually_resolved_at) e o doc analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:66 confirma a coluna no banco oficial. Consequentemente a main consulta a coluna sem fallback em supabase/functions/_shared/evolution-webhook-msg-handlers.ts:40 e :80 (grep por 42703 nas linhas 11-104, o corpo do handleSendMessage, nao retorna nada). As assercoes pos-DDL equivalentes estao na main em supabase/functions/_shared/__tests__/send-message-manual-resolution.test.ts:58.

### `supabase/migrations/20260927570000_talkx_e27_realtime_campaign_events.sql`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Decisao registrada na main, com o mesmo arquivo arquivado: supabase/migrations/_superseded/20260927570000_talkx_e27_realtime_campaign_events.sql:2-16 — "duplicata da migration 20260927500001", registro removido do ledger em 2026-10-16, "NAO reaplicar. NAO mover de volta". A versao canonica esta na main em supabase/migrations/20260927500001_talkx_e27_realtime_campaign_events.sql.

### `supabase/migrations/20261016193400_copilot_presence.sql`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: Decisao registrada na main em docs/_arquivo/copilot-presence-261108/README.md:1 ("copilot_presence — arquivado sem aplicar, 16/11/2026"), que mediu no Supabase oficial "tabela 0 | rpc 0 | policies 0 | indices 0 | ledger 0" e nenhum consumidor em src/, supabase/functions/, api/ ou server/ — nem na main nem na branch de origem. O papel de presenca em producao e cumprido por public.agent_presence (main: supabase/migrations/20260924195600_agent_presence_server_side.sql e supabase/migrations/20260925100542_agent_presence_server_ttl.sql), conforme analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:96.

### `supabase/migrations/20261016250000_e2e_fixture_message_rpc.sql`

- Branch de origem: `claude_pink/cool-dijkstra-xk9ek2`
- Evidencia do adjudicador: A main guarda a mesma RPC, em versao posterior, arquivada com a decisao escrita: supabase/migrations/_superseded/20261020120000_e2e_fixture_message_rpc.sql:1 e supabase/migrations/_superseded/README.md:101-116 — "Nunca aplicada", a suite E2E usa o fallback legado em e2e/fixtures/e2e-contact.ts, "Nao mover de volta para supabase/migrations/". analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:97 acrescenta que a funcao nao existe em producao e nenhum codigo da main a chama.

### `supabase/migrations/20261026100300_dept_invites_ownership_fix.sql`

- Branch de origem: `claude/loving-lovelace-esc3l2`
- Evidencia do adjudicador: A main superou com regra MAIS restrita, por decisao do dono: supabase/migrations/20261102012200_department_invites_restringe_escrita.sql:6 ("Decisao do dono (01/11/2026): somente admin cria e apaga convites"), que dropa as mesmas policies dept_invites_insert_authenticated/dept_invites_delete_authenticated (:25-26) e cria dept_invites_insert_admin (:28) e dept_invites_delete_admin (:38) — sem o ramo "criador" que a branch permitia. O mesmo arquivo fecha department_invitations (:52-58). analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:69 confirma as policies de department_invitations em producao.

### `supabase/migrations/20261026110300_login_attempts_ttl_lgpd.sql`

- Branch de origem: `claude/loving-lovelace-esc3l2`
- Evidencia do adjudicador: A main cumpre o objetivo com outro job: supabase/migrations/20261102012400_login_attempts_retencao_90d.sql:18-25 agenda login-attempts-retention-90d ('41 4 * * *') com DELETE por coalesce(last_attempt_at, updated_at, created_at) e protecao de lockout ativo; o job esta no baseline em scripts/db-audit/pg-cron-jobs-baseline.json:110. O indice da branch nao serve ao criterio adotado (filtro por expressao, nao por updated_at puro) — registrado em analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:93 e :101-105.

### `supabase/tests/contact_purchases_rls_author.sql`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: A main removeu de proposito o modulo: supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2-4 registra a "Decisao do dono em 2026-11-03" de tirar pagamentos/compras, e o arquivo executa `DROP TABLE IF EXISTS public.contact_purchases CASCADE` em :63 e `DROP FUNCTION IF EXISTS public.guard_contact_purchase_identity()` em :67. O BLOCO 0 do teste aborta justamente quando guard_contact_purchase_identity() nao existe, e a migration que ele exercita (supabase/migrations/20261015190000_contact_purchases_rls_author.sql) so e citada no rollback dessa remocao (:46). O arquivo nao existe em supabase/tests/ na main.

### `supabase/tests/special_agent_visibility.sql`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: O papel special_agent foi removido de proposito: supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2-4 (decisao do dono, 2026-11-03) tira o ramo special_agent de effective_role/sync_profile_role_from_user_roles/get_visible_agent_ids e adiciona a constraint user_roles_no_special_agent em :176, que recusaria os fixtures `insert into public.user_roles (user_id, role) values (..., 'special_agent')` do teste; o rotulo sai do enum em supabase/migrations/20261113172000_remove_enum_special_agent.sql. A prova equivalente na main e supabase/tests/db-audit/remove-enum-special-agent.test.sh. O arquivo nao existe em supabase/tests/ na main.

## scripts e automacoes (7)

### `scripts/ci/check-claude-md.unit.mjs`

- Branch de origem: `claude/charming-mccarthy-jbxy56`
- Evidencia do adjudicador: A main tem a mesma trava, mais evoluída, em `scripts/ci/check-claude-md-integrity.mjs:32` (`REQUIRED_SECTIONS` = `## Postura` … `## Grafo de código`) e `:43` (`FILE_SHRINK_THRESHOLD = 0.50`), com `scripts/ci/check-claude-md-integrity.unit.mjs` próprio. As seções que este arquivo exige (`## 1. Banco de dados OFICIAL`, `## Perímetro do GitHub`, `## Auditoria de workflows`) não existem mais — `CLAUDE.md` da main é só `@AGENTS.md` —, então o teste REPROVARIA na main. Decisão registrada em `analise-prs/resgate-261115/dossies/claude__charming-mccarthy-jbxy56.md:32` ("OBSOLETA (GA02) — superada").

### `scripts/ci/e2e-logado-workflow.unit.mjs`

- Branch de origem: `claude/fix-ga-fase0-banco-e2e-261020-2200`
- Evidencia do adjudicador: A main cobre o mesmo contrato com rigor maior em `scripts/ci/e2e-isolated-legacy-workflow.unit.mjs` — `:15` lê `.github/workflows/e2e-logado.yml`, `:44-48` avalia as condições de admissão (conclusion/event/head_branch/mesmo repo) e `:119` assere `workflows: ["CI/CD Pipeline"]`. As asserções deste arquivo reprovariam na main: ele procura `workflows: [CI/CD Pipeline]` sem aspas e `/group: e2e-logado\n/` fixo, e a main interpola o grupo; `global_timeout_ms` não existe mais no YAML. Registrado em `analise-prs/resgate-261115/dossies/claude__fix-ga-fase0-banco-e2e-261020-2200.md:24` ("OBSOLETA (superada)").

### `scripts/ci/fila-merge.mjs`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Removido da main de propósito e a decisão está escrita na main: `docs/agentes/github-ci.md:60-62` — "O substituto era o `auto-update-pr-branch.yml` (fila serial via `fila-merge.mjs`): desativado à mão pelo dono em 11/11/2026 depois de 8.312 runs e removido em 14/11/2026. PR `BEHIND` é atualizada pelo próprio agente". `git ls-tree origin/main .github/workflows/ | grep auto-update` → AUSENTE; `git cat-file -e origin/main:scripts/ci/fila-merge.mjs` → AUSENTE. Também em `analise-prs/resgate-261115/dossies/claude__fix-ga-fase0-banco-e2e-261020-2200.md:25,114` (apagado pelo commit `41853318c`, #3113).

### `scripts/ci/fila-merge.unit.mjs`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Mesmo motivo do módulo que ele testa: alvo removido de propósito — `docs/agentes/github-ci.md:60-62` (fila serial desativada em 11/11/2026 e removida em 14/11/2026) e `analise-prs/resgate-261115/dossies/claude__fix-ga-fase0-banco-e2e-261020-2200.md:114` ("alvo apagado por `41853318c`… Teste sem módulo não roda"). Nem `fila-merge.mjs` nem `fila-merge.unit.mjs` existem na main.

### `scripts/vercel/verify-production.mjs`

- Branch de origem: `claude/busy-cannon-40szm9`
- Evidencia do adjudicador: Substituído na main por `scripts/vercel/verify-release-targets.mjs`, que faz o mesmo e mais: `:150-156` version.json com `cache-control: no-store`, `x-frame-options`, `x-robots-tag`, `:85-87` buildId exigido como SHA de 40 e comparado ao esperado, `:169-173` raiz, `:186` assets `immutable` — e separa os alvos (`:11-24` TARGETS: V2 em `zapp-web-v2.vercel.app` com frame DENY; V3 em `zappweb.app.br` com SAMEORIGIN). Está ligado em `.github/workflows/front-release-targets.yml:46,70`. O arquivo da branch aponta por padrão para `https://zappweb.app.br`, que por `AGENTS.md` serve a V3 e não este repo — por isso a main o superou.

### `scripts/vercel/verify-production.unit.mjs`

- Branch de origem: `claude/feat-copilot-radar-20261108-1800`
- Evidencia do adjudicador: O módulo que ele testa (`scripts/vercel/verify-production.mjs`) não existe na main; o sucessor `scripts/vercel/verify-release-targets.mjs` tem cobertura própria na main em `scripts/ci/verify-release-targets-sucessor.unit.mjs`, `scripts/ci/verify-release-targets-summary.unit.mjs` e `scripts/ci/verify-release-targets-timeout.unit.mjs`. Sem o módulo, o teste não roda.

### `tests/contracts/axe-campaigns.contract.test.ts`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main removeu Campanhas Clássicas de propósito e tem o contrato dessa remoção em `tests/contracts/no-campaigns-classicas.contract.test.ts:11-13` ("Contrato da remoção de 'Campanhas Clássicas' (o Talk X é o sistema de Campanhas ativo)… é a prova de que o módulo não voltou por acidente"). Os arquivos que este teste lê não existem mais: `git ls-tree -r origin/main --name-only | grep -c '^src/components/campaigns/'` → 0, logo o teste quebraria no `readFileSync`. A acessibilidade da tela viva está coberta por `tests/contracts/axe-campanhas.contract.test.ts` (alvo `src/components/multiplix/MultiplixView.tsx`).

## CI, E2E e docs (28)

### `.github/.ci-noop`

- Branch de origem: `claude/feat-ci-local-espelho-261111`
- Evidencia do adjudicador: origin/main:analise-prs/VEREDITOS-A3-E-DELECOES-261117.md:10-12 classifica esta classe: 'Os 3 a mais sao arquivos-gatilho vazios, criados para forcar o CI a rodar: `.github/.ci-trigger`, `.github/.keep-ci` e `.github/ci-refresh` ... Nao sao trabalho: sao residuo de tentativa de reexecucao'; :36 fecha '**Obsoletos.**'. A main mantem um unico marcador vivo, `.claude/.ci-retrigger`. Ressalva: o nome `.ci-noop` nao e citado literalmente nessa lista (ela cita `.ci-trigger`); e o mesmo tipo de arquivo, com o mesmo conteudo de uma linha.

### `.github/.keep-ci`

- Branch de origem: `claude/fix-unit-tests-pre-existentes-261024-1700`
- Evidencia do adjudicador: Citado nominalmente em origin/main:analise-prs/VEREDITOS-A3-E-DELECOES-261117.md:11 ('`.github/.keep-ci`') como arquivo-gatilho vazio e, em :36, declarado **Obsoleto**. Ausente da main (`git ls-tree -r origin/main --name-only | grep -x '.github/.keep-ci'` = vazio); o marcador vivo da main e `.claude/.ci-retrigger`.

### `.github/ci-refresh`

- Branch de origem: `claude/chore-secdef-guard-ci-test-261107-1600`
- Evidencia do adjudicador: Citado nominalmente em origin/main:analise-prs/VEREDITOS-A3-E-DELECOES-261117.md:11 ('`.github/ci-refresh` (este em 4 branches)') e declarado **Obsoleto** em :36. Ausente da main; o marcador vivo da main e `.claude/.ci-retrigger`.

### `.github/workflows/scorecard.yml`

- Branch de origem: `claude/fix-gr023-ossf-scorecard`
- Evidencia do adjudicador: Removido de proposito e registrado como tal na main: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:98-99 lista em 'Removido de proposito, nao resgatar: ... `scorecard.yml`'; origin/main:analise-prs/resgate-261115/RELATORIO-ANEXO-BRANCHES.md:276 detalha 'foram removidos de proposito em 5721e4f50 (16/10), a branch nasceu depois e os readicionou'. origin/main:analise-prs/VEREDITOS-A3-E-DELECOES-261117.md:49-54 reconfirma que o workflow nao esta na main, que so sobrou a permissao (`scripts/ci/allowed-actions.json:18`) e o caso historico nos guardas de pin, e que 'e analise de seguranca do OSSF, nao funcao do produto. Workflow -> decisao do dono, prioridade baixa'. O inventario canonico da main (origin/main:docs/agentes/github-ci.md:75-79, 21 workflows) nao o inclui. Nenhuma funcionalidade do produto se perde.

### `.github/workflows/supabase-sync.yml`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Removido da main por decisao registrada: origin/main:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-14.md:696 — '| `supabase-sync.yml` e `cleanup-artifacts.yml` sem uso (0 runs em 30 dias) | API de Actions | removidos (19 -> 17 workflows) |', e :515 'o `supabase-sync` foi removido, entao `legacy-import-destrutivo` nao precisa mais do secret'. O inventario canonico atual (origin/main:docs/agentes/github-ci.md:75-79, 21 workflows) nao o lista e `git grep -ln LEGACY_IMPORT_UNLOCK origin/main` so devolve docs historicos. Os arquivos que ele importava seguem na main (origin/main:supabase-export/README.md) sem workflow que os aplique — o que e o desenho desejado, ja que o snapshot e anterior a migracao para o banco oficial.

### `docs/audits/LAUDO-BRANCHES-2026-11-17.md`

- Branch de origem: `claude/chore-laudo-branches-261117-1608`
- Evidencia do adjudicador: A main tem a mesma varredura, do mesmo dia, mais ampla e com o mesmo metodo e a mesma conclusao central: origin/main:analise-prs/FECHAMENTO-DE-CONTAS-261117.md:1-27 fecha 4.997 arquivos de **231** branches remotas (contra 115 do laudo) por classe, com soma fechada por branch; e a camada 3 do laudo ('o ledger de versoes mente': objetos vivos em producao criados por outro arquivo com outro timestamp) e exatamente o que origin/main:analise-prs/VEREDITOS-A1-MIGRATIONS-261117.md:9 e :16-33 ja registra — '33 de 33 obsoletas. Nenhuma DDL a aplicar. Nenhum objeto faltando em producao' pelas duas vias objeto-no-catalogo + arquivo-na-main, com a renumeracao nomeada par a par em :35-48. A classe deste arquivo tambem tem veredito proprio na main: origin/main:analise-prs/RECUPERACAO-TOTAL-261116.md:230-233 ('Bloco B — documento de analise/auditoria ... nenhum deles e funcionalidade do sistema'). Ressalva: esta branch especifica nao aparece nos registros da main (`git grep -n chore-laudo-branches origin/main` = vazio), logo nao ha decisao que a cite nominalmente.

### `docs/audits/PLANO_WORKFLOWS_FAILURE_200_ETAPAS_2026-10-16.md`

- Branch de origem: `claude/tender-heisenberg-a4jk3s`
- Evidencia do adjudicador: Decisao registrada na main: origin/main:analise-prs/resgate-261115/dossies/claude__tender-heisenberg-a4jk3s.md:33 — '**OBSOLETA** — plano de 635 linhas medido em 16/10 sobre "os 14 arquivos de .github/workflows/"; a main tem **21** workflows hoje, inclusive settings-guard.yml, que o plano declara deletado em 16/10 (linha 102 do doc). Premissa e numeros nao correspondem mais', reconfirmado em :155-157. Verificado: origin/main:.github/workflows/settings-guard.yml existe e origin/main:docs/agentes/github-ci.md:75 declara 21 workflows.

### `docs/copiloto/CV-016-coalescencia-delegada.md`

- Branch de origem: `claude/feat-copiloto-cv011-020-migrations-261016-1930`
- Evidencia do adjudicador: A garantia descrita ja esta implementada na main, e o proprio dossie da main manda nao portar o doc: origin/main:analise-prs/resgate-261115/dossies/claude__feat-copiloto-cv011-020-migrations-261016-1930.md:223-227 — '`docs/copiloto/CV-016-coalescencia-delegada.md` e obsoleto, nao lacuna: a garantia que o doc descreve (descartar resultado de versao antiga) ja esta implementada na main com trava otimista', e :42 'contrato descrito nao e o que a main faz hoje'. Verificado no codigo da main: origin/main:supabase/functions/_shared/copilot-tick.ts:591 devolve `skipped: "stale_state"` por trava otimista em state_version, com idempotencia por versao em :492 e a regra documentada em :15 e em origin/main:supabase/migrations/20261115030000_commit_copilot_tick.sql:15. Portar o doc criaria documentacao divergente do codigo.

### `docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.md`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: Decisao registrada na main: origin/main:analise-prs/resgate-261115/dossies/claude_pink__nice-hypatia-iikl82.md:18 — 'docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.md (650 linhas), ausente da main, substituido por esta propria triagem'; e :89 — 'plano medido contra origin/main = ee2947491 (2026-10-18), "153 branches, 82 PRs". Totalmente defasado (539 commits depois) e historico — valor nenhum para codigo'. A main cobre a mesma necessidade com os vereditos de 16-17/11 (analise-prs/FECHAMENTO-DE-CONTAS-261117.md:1-27, 231 branches).

### `docs/talkx/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A main guarda o mesmo arquivo com a decisao escrita ao lado, em origin/main:docs/talkx/_arquivo/PLANO_TALKX_V3_100_ETAPAS_2026-09-29.md:1 — '> **SUBSTITUIDO pelo V4 em 2026-10-01 — nao executar.**'. O diff contra a versao da branch e exatamente esse banner (2 linhas acrescentadas na main); o restante das 625 linhas e identico.

### `docs/tasks/README.md`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A main tem o mesmo README em origin/main:docs/_arquivo/docs/tasks/README.md, numa versao que descreve a UI que o codigo da main realmente tem, e a da branch nao: a main (:11-13) diz 'Quadro | 2 | 5 colunas (Caixa de entrada, A fazer, Fazendo, Aguardando, Concluido)' enquanto a branch diz '6 colunas, uma por status'. O codigo da main confirma as 5: origin/main:src/components/tasks/__tests__/contratosVisiveis.test.tsx:33 fixa ROTULOS_DAS_COLUNAS = ['Caixa de entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluido']. Igual na Lista (main agrupa por prazo; branch por secao) e no atalho de navegacao (main :4 'Alt+K', confirmado em origin/main:src/hooks/ui/useNavShortcuts.ts:14-15 e src/hooks/ui/__tests__/useNavShortcuts.test.tsx:44). Portar a versao da branch devolveria documentacao errada.

### `e2e/fixtures/talkx-demo/tela-01.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104 — 'Lixo: as 17 fixtures e2e/fixtures/talkx-demo/tela-NN.json sao {} de 3 bytes; as fixtures reais, com o nome final, ja estao na main'. Medido: `git show origin/<branch>:<caminho> | wc -c` = 3. A fixture real correspondente esta na main em origin/main:e2e/fixtures/talkx-demo/01-campanhas-visao-geral.json, consumida por origin/main:e2e/talkx-demo.spec.ts.

### `e2e/fixtures/talkx-demo/tela-02.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104 ('Lixo: as 17 fixtures ... sao {} de 3 bytes; as fixtures reais, com o nome final, ja estao na main'); `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/02-segmentos-biblioteca-detalhes.json.

### `e2e/fixtures/talkx-demo/tela-03.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/03-segmentos-criar-editar.json.

### `e2e/fixtures/talkx-demo/tela-04.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/04-templates-biblioteca.json.

### `e2e/fixtures/talkx-demo/tela-05.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/05-templates-criar-editar.json.

### `e2e/fixtures/talkx-demo/tela-06.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/06-lista-de-supressao.json.

### `e2e/fixtures/talkx-demo/tela-07.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/07-analytics.json.

### `e2e/fixtures/talkx-demo/tela-08.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/08-nova-campanha.json.

### `e2e/fixtures/talkx-demo/tela-09.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/09-revisao-final-confirmacao.json.

### `e2e/fixtures/talkx-demo/tela-10.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/10-campanha-agendada.json.

### `e2e/fixtures/talkx-demo/tela-11.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/11-monitor-ao-vivo.json.

### `e2e/fixtures/talkx-demo/tela-12.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/12-campanha-em-andamento.json.

### `e2e/fixtures/talkx-demo/tela-13.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/13-campanha-pausada-retomada.json.

### `e2e/fixtures/talkx-demo/tela-14.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/14-relatorio-campanha-concluida.json.

### `e2e/fixtures/talkx-demo/tela-15.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/15-importacao-vinculacao-crm360.json.

### `e2e/fixtures/talkx-demo/tela-16.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/16-ajuda-talkx.json.

### `e2e/fixtures/talkx-demo/tela-17.json`

- Branch de origem: `claude/feat-talkx-x003-demo-fixtures-261101-2143`
- Evidencia do adjudicador: origin/main:analise-prs/INVENTARIO-RESGATE-261116.md:103-104; `wc -c` = 3. Real na main: origin/main:e2e/fixtures/talkx-demo/17-estados-sistema-modais.json (as 17 telas 01..17 estao todas na main com o nome final).

## arquivos de raiz (7)

### `src/components/gamification/GamificationProvider.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main removeu de proposito e tranca a volta por contrato: src/hooks/gamification/__tests__/gamificacaoSemEscritaNoCliente.test.ts:55 exige existsSync('src/components/gamification/GamificationProvider.tsx') === false, e o mesmo teste (linhas 5-16) registra a decisao: a migration supabase/migrations/20261012233536_gamification_revoke_client_rpcs.sql revogou EXECUTE das 4 RPCs de escrita para anon/authenticated (ficam service_role + gatilhos SECURITY DEFINER), porque o provider nunca era montado e o unico efeito das chamadas era permitir que o agente inflasse o proprio XP. O primeiro teste do mesmo arquivo (linhas 40-52) proibe qualquer arquivo de producao em src/ de citar add_agent_xp / grant_agent_achievement / update_agent_streak / increment_agent_messages / increment_agent_resolutions, que e exatamente o que este arquivo usa. Confirmado por git grep: na main 'GamificationProvider' so aparece nesse teste; o hook que sobrou (src/hooks/gamification/useAgentGamification.ts:8-29) exporta apenas leitura (AgentStats, ACHIEVEMENT_TYPES, calculateLevel), sem grantAchievement/addXp.

### `src/components/multiplix/MultiplixComposerDialog.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main absorveu o dialogo na propria tela (F78/TL-010) e registrou a remocao: e2e/multiplix.spec.ts:24 — 'TELA DE 3 REGIOES INLINE (F78/TL-010): o antigo MultiplixComposerDialog foi removido — a composicao vive na propria tela'. Cada peca esta hoje em src/components/multiplix/MultiplixView.tsx: suggestedName em :424, tituloEfetivo em :433, envio com name=tituloEfetivo em :441, tratamento de MultiplixOverLimitError em :467, o paragrafo data-testid="multiplix-contagem-mensagens" em :792 e 'Titulo sugerido' em :804; o hook de criacao useCreateMultiplixDispatch em :105. Alem disso src/__tests__/multiplix-changelog-registry.test.ts:107-108 exige que a entrada de 'composicao inline' do changelog aponte para MultiplixView.tsx e NAO contenha 'MultiplixComposerDialog.tsx'.

### `src/components/multiplix/__tests__/MultiplixComposerDialog.contagem.test.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: Os 4 casos foram portados 1:1 para a tela inline em src/components/multiplix/__tests__/MultiplixView.contagem.test.tsx, cujo cabecalho (linhas 1-6) diz 'Porta os casos do TL-010 (que viviam no dialogo removido) para a tela, contra o MultiplixView real'. Correspondencia dos nomes dos testes na versao da main: 'mostra a conta sempre visivel e acompanha selecao + composicao' (:95), 'envia SEM nomear: o disparo sai com o titulo sugerido (publico + assunto)' (:109), 'usa o titulo digitado quando existe (a sugestao e editavel)' (:125) e 'mantem o envio bloqueado sem mensagem (o bloco de texto continua exigido)' (:138), com as mesmas assercoes (name 'Multiplix · N contato · Convite feira 2026', contagem via getByTestId('multiplix-contagem-mensagens')).

### `src/components/reports/AutoExportManager.tsx`

- Branch de origem: `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423`
- Evidencia do adjudicador: A main apagou a view inteira de proposito e tranca com contrato: src/pages/__tests__/ViewRouter.autoExportRemovido.test.tsx:33 exige expect('AutoExportManager' in Views).toBe(false); o mesmo arquivo registra a decisao nas linhas 1-3 ('Remocao da tela Export Auto (?view=auto-export): regra do Joaquim (07/10) — nenhuma informacao sai do sistema; o Zapp nao exporta') e prova que o item saiu do menu avancado (:38) e que o deep link antigo cai em 'Acesso restrito' (:41-53). git grep na main: 'AutoExportManager' nao aparece em nenhum arquivo de src/ fora desse teste, e nao existe nenhum arquivo AutoExport* na arvore de codigo.

### `src/components/team-chat/__tests__/team-chat-security-gaps.test.ts`

- Branch de origem: `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
- Evidencia do adjudicador: A main decidiu substitui-lo e o registrou: docs/audits/PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md:175 (etapa E93) manda 'Substituir os 219 expect(true).toBe(true) de team-chat-comprehensive.test.ts e os 52 de team-chat-security-gaps.test.ts', com aceite 'grep -c "expect(true).toBe(true)" src/**/team-chat* = 0'; a contagem de 52 bate com o arquivo da branch e esta tambem em docs/audits/AUDITORIA_TEAM_CHAT_ESTADO_REAL_2026-09-29.md:186. O arquivo nao existe na main (git cat-file), enquanto src/components/team-chat/__tests__/ guarda 19 testes reais no lugar (TeamChatPanel.wiring, TeamChatPanel.nao-membro, TeamMessageItem.status, team-chat-n182-a11y, useTeamChatPanel.audio-send, etc.). Lacunas que ele listava ja estao fechadas em codigo na main: anexos em src/components/team-chat/TeamFileUploader.tsx e reacoes em src/components/team-chat/TeamMessageReactionsWrapper.tsx.

### `src/components/wallet/TransactionList.tsx`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: Nao entrega funcionalidade: na propria branch a unica fonte de dados e src/hooks/wallet/useWallet.ts, que e um stub sem banco algum ('const [transactions] = useState<Transaction[]>([])', linha 18 do arquivo da branch), logo o componente so pode renderizar 'Nenhuma transacao encontrada'. A main nao tem carteira financeira em forma alguma (git grep sem resultado para 'TransactionList', 'useWallet', 'WalletData', 'wallet_transactions' e 'Saldo disponivel' em src/ e supabase/), e a sua src/components/wallet/ e outra coisa, ja implementada de ponta a ponta: 'Carteira de Clientes' = regras de atribuicao de cliente a vendedor (src/components/wallet/ClientWalletView.tsx:29 titulo, :95 'Regras de Atribuicao', apoiada em src/hooks/business/useClientWallet.ts:40 e :90 sobre a tabela client_wallet_rules). A versao da branch de ClientWalletView (:28-29) troca essa tela real por este par de componentes vazios — e regressao, nao ganho.

### `src/components/wallet/WalletCard.tsx`

- Branch de origem: `claude_pink/nice-hypatia-iikl82`
- Evidencia do adjudicador: Nao entrega funcionalidade: depende de src/hooks/wallet/useWallet.ts da propria branch, que e stub ('const [wallet] = useState<WalletData | null>(null)', linha 17 do arquivo da branch), e o componente faz 'if (!wallet) return null' — ou seja, nunca renderiza nada. A main nao tem carteira financeira em nenhuma forma (git grep sem resultado para 'WalletCard', 'useWallet', 'wallet_transactions', 'Saldo disponivel' em src/ e supabase/); o modulo wallet da main e a 'Carteira de Clientes' (regras de atribuicao), implementada em src/components/wallet/ClientWalletView.tsx:21 e :29 com src/hooks/business/useClientWallet.ts:22 sobre client_wallet_rules, e a branch sobrescreve essa tela com estes dois componentes vazios.
