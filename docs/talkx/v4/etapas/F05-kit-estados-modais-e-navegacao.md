# Fase 5 — Kit, estados, modais e navegação (X042–X056)

> Parte do [plano V4 de 200 etapas](../../PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md). Telas: 17. 15 etapas.
>
> **Entrega da fase:** Um conjunto único de tabela, KPI, filtros, estados e modais usado por todas as telas; endereço próprio para cada aba; busca do módulo.

Cada etapa é uma PR. **Exige antes** lista as etapas que precisam estar na `main` (e, quando há banco ou edge, aplicadas e implantadas). Os IDs `T<tela>-<seq>` em **Fecha** são elementos do [inventário](../inventario/README.md); `CAP-nnn` são capacidades do motor ([inventário do motor](../inventario/H_motor_backend.md)); `dados:<atributo>` são colunas da projeção de dados comerciais; `N<nn>` são [decisões de negócio](../DECISOES.md).

## Abreviações e convenções usadas nesta fase

**Trilha de kit, estados e Visão geral** (etapas X042, X043, X044, X045, X046, X047, X048, X049, X050, X051, X052, X053, X054, X055)

Base: `main` @ `3d09433` (2026-10-01). 20 etapas, na ordem de execução. Todas são front (sem DDL, sem deploy de edge).
Abreviações: `Shared` = `src/components/talkx/talkxShared.tsx` · `Overview` = `src/components/talkx/TalkXOverview.tsx` ·
`View` = `src/components/talkx/TalkXView.tsx` · `useTalkX` = `src/hooks/integrations/useTalkX.ts` ·
`kit/` = `src/components/talkx/kit/` (criado em X042).

Ordem: X042…X055 são o kit e a navegação do módulo (pré-requisito das demais trilhas); X077…X082 são a tela 01.
Etapas de kit que só entregam componente trazem **Fecha: —** e dizem em qual etapa o ID fecha.

**Trilha de dados, links, relatório, importação e ajuda** (etapas X056)

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

### X042 · Dividir `talkxShared.tsx` em `kit/*` com barrel, sem mudar comportamento

- **Fase:** 5 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** nenhuma etapa
- **Fecha:** — (pré-requisito A17; destrava X043…X055 e os demais trilhas–G)
- **Hoje:** `Shared` tem 988 linhas e mistura constantes, formatadores, personalização, 30 componentes e o modal (`Shared:22-988`), com `eslint-disable react-refresh/only-export-components` na linha 1. É importado por 24 arquivos (15 do Talk X, 6 do Catálogo, 2 do Multiplix, 1 teste). Dois testes de contrato leem o texto do arquivo: `scripts/db-audit/talkx-analytics-contract.test.mjs:25-28,72-73` e `scripts/db-audit/talkx-e90-links-contract.test.mjs:12,125,133-136`.
- **Fazer:** Criar `kit/constants.ts` (`Shared:22-79`), `kit/format.ts` (`:85-95,150-170`), `kit/personalize.ts` (`:97-147`), `kit/primitives.tsx` (IconTile, ModuleHeader, MetaRow, Th, Td, StatusPill, TalkXPrimaryButton, SegmentedToggle, AlertCard), `kit/preview.tsx` (WhatsAppBubble, PhoneFrame), `kit/filters.tsx`, `kit/table.tsx` (TalkXTable, RowActionsMenu, TalkXPagination), `kit/states.tsx`, `kit/kpi.tsx`, `kit/rail.tsx` (RailCard, RailAction, HeroCard, RecentList, TipCard), `kit/dialogs.tsx`, `kit/insight.tsx`. Mover o código sem alterar uma linha de lógica. `Shared` vira barrel (`export * from './kit/...'`) para os 24 importadores não mudarem. Remover o `eslint-disable` da linha 1. Apontar os dois testes de contrato para os arquivos novos (`kit/dialogs.tsx`, `kit/primitives.tsx`, `kit/personalize.ts`). Regra para as etapas seguintes: arquivo novo importa de `./kit/<arquivo>`, não do barrel.
- **Aceite:** teste novo `kit/__tests__/barrel.test.ts` compara a lista de nomes exportados por `talkxShared` com a lista fixa de hoje (falha se um símbolo sumir); `tsc --noEmit` limpo; a suíte Vitest do módulo (10 arquivos) passa sem alterar nenhum assert; os dois testes de contrato passam; `wc -l src/components/talkx/talkxShared.tsx` ≤ 30 e nenhum arquivo de `kit/` passa de 250 linhas; `grep -c "eslint-disable react-refresh" src/components/talkx/talkxShared.tsx` = 0.
- **V3:** V48 (parte de constantes; o `TalkXKit` vai para X055)
- **Negócio:** Nada muda na tela; acaba o arquivo único que fazia duas sessões de trabalho se atropelarem.

### X043 · Completar `TalkXTable`: ordenação, seleção em massa, ações de linha e células padrão

- **Fase:** 5 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X042
- **Fecha:** — (componente; T01-050 fecha em X079, T01-038/T01-039 em X081, T01-048 em X080)
- **Hoje:** `TalkXTable` existe sem nenhum uso (`Shared:629-696`; grep `<TalkXTable` em `src` = 0), sem ordenação, sem ações de linha e com `aria-label` do checkbox usando o id (`Shared:681`). `RowActionsMenu` também não é usado e usa ícone horizontal (`Shared:561-583`, `:569`). A Visão geral monta a tabela à mão (`Overview:212-280`) e o "selecionar todas" compara só o tamanho do conjunto (`Overview:112`).
- **Fazer:** Em `kit/table.tsx`: coluna ganha `sortKey`; props controladas `sort`/`onSortChange` (servem para ordenação no servidor ou no cliente); cabeçalho ordenável é botão com `aria-sort`. Seleção controlada, restrita à página, com estado indeterminado e `selectionResetKey` (limpa ao mudar). `TalkXBulkBar` ("N selecionadas" + ações + "Limpar seleção"). `rowActions(row)` renderizado por `RowActionsMenu` com ícone vertical (⋮), `aria-label` com o nome da linha e `busy` por linha. Prop `loading` desenha linhas-esqueleto com as mesmas colunas e `aria-busy`. Novo `kit/cells.tsx`: `EntityCell` (miniatura com fallback em tile), `ProgressCell`, `ResultsCell`, `ChannelCell` (logo WhatsApp em SVG inline), `DateByCell`. Em `kit/format.ts`: `fmtRelativeDay` ("Hoje, 10:00" / "Ontem, 16:20" / "15 set. 2026, 09:00").
- **Aceite:** `kit/__tests__/TalkXTable.test.tsx`: (1) clique no cabeçalho alterna asc → desc → sem ordem e ajusta `aria-sort`; (2) "selecionar todas" marca só a página e fica indeterminado com seleção parcial; (3) trocar `selectionResetKey` zera a seleção; (4) item de ação desabilitado não dispara; (5) `fmtRelativeDay` nos 3 casos com relógio fixo.
- **V3:** V42 (parte do componente)
- **Negócio:** Todas as listas do módulo passam a ordenar, selecionar várias linhas e abrir o menu ⋮ do mesmo jeito.

### X044 · `KpiCard` com comparativo de período calculado, anel e estado "sem dados ainda"

- **Fase:** 5 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X042
- **Fecha:** — (componente; T01-026…T01-029 fecham em X077)
- **Hoje:** `KpiCard` aceita um `delta` livre e imprime com ponto decimal (`Shared:493,533-537`); não sabe quando falta base de comparação; não tem variante de anel; `animationDelay` é setado sem animação associada (`Shared:525`). A Visão geral imprime a taxa com ponto (`Overview:125`). O contrato proíbe delta fabricado (`scripts/db-audit/talkx-analytics-contract.test.mjs:42-45`).
- **Fazer:** Em `kit/kpi.tsx`, trocar `delta` por `comparison { previous, kind: 'relative' | 'points', minBase, baseValue, goodWhen }`: o próprio card calcula a variação e só a mostra quando `previous` existe, é maior que zero e a base atinge `minBase`; formato pt-BR com vírgula e seta ↗/↘; `title` com "vs. período anterior". `value` nulo renderiza `TalkXNoData` ("Sem dados ainda"), exportado para todos os blocos (A9). Prop `visual: 'bars' | 'ring' | 'none'` (anel para taxa). Entrada escalonada de 40 ms com `useReducedMotion`. Remover a prop `delta` antiga e ajustar os chamadores (Visão geral, Segmentos; o modo `compact` do Catálogo não usa delta). Ajustar a regex do contrato de analytics.
- **Aceite:** `kit/__tests__/KpiCard.test.tsx`: `previous` nulo → sem variação; `previous` 0 → sem variação; base abaixo de `minBase` → sem variação; 18 contra 14,75 → "+22%"; 96,4 contra 94,3 em pontos → "+2,1%" com `title` "pontos percentuais"; `value` nulo → "Sem dados ainda"; `prefers-reduced-motion` zera a animação.
- **V3:** V41 (parte do componente), V49 (KpiCard)
- **Negócio:** O "+22%" ao lado de um número só aparece quando existe período anterior real para comparar.

### X045 · Unificar a barra de filtros: rótulo "Todos os …", período, atualizar e limpar

- **Fase:** 5 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X042
- **Fecha:** T01-031, T01-033, T01-034, T17-005, T17-006
- **Hoje:** Há duas barras: `FilterBar` (`Shared:356-383`, usada em `TalkXTemplates.tsx:110` e `TalkXSuppression.tsx:139`) e `FilterBarV2` (`Shared:864-921`, usada na Visão geral e em Segmentos). Na V2 o item "todos" é fixo "Todos" (`Shared:900`), então o gatilho não mostra "Todos os status"; "Limpar filtros" some sem filtro ativo (`Shared:906`); a busca tem largura fixa (`Shared:889`); não há período nem botão de atualizar. Os filtros da Visão geral vão para `sessionStorage` por código local, sem a busca (`Overview:19-22,58-60`).
- **Fazer:** Um só `TalkXFilterBar` em `kit/filters.tsx`: cada filtro tem `allLabel` (aparece no gatilho e como primeiro item); prop `period` (chip com calendário e popover: Hoje, 7 dias, 30 dias, Este mês, Personalizado, Todo o período); `onRefresh` + `refreshing` (botão ⟳ com `aria-label="Atualizar"`); "Limpar filtros" sempre visível, desabilitado sem filtro ativo; chips de filtro ativo abaixo de 1024 px e painel lateral "Filtros" abaixo de 768 px; alternância lista/grade; `rightSlot`. Hook `kit/useFilterState.ts` (`useTalkXFilterState(chave, padrões)`) persiste filtros, busca e período em `sessionStorage`. Migrar Templates e Supressão para a barra única e apagar `FilterBar`; o barrel mantém o nome `FilterBarV2` como alias.
- **Aceite:** `kit/__tests__/TalkXFilterBar.test.tsx`: gatilho mostra "Todos os status" com valor `all`; escolher "7 dias" devolve `from`/`to`; "Limpar filtros" passa de desabilitado a habilitado; clique em ⟳ chama `onRefresh`. `grep -c "<FilterBar " src/components/talkx/*.tsx` = 0. Os placeholders usados pelo E2E (`e2e/talkx.spec.ts:94,98`) continuam iguais.
- **V3:** V47 (parte da barra)
- **Negócio:** Os filtros passam a dizer o que filtram ("Todos os status", "Todos os segmentos") e ganham período e botão de atualizar.

### X046 · Reescrever os 6 estados do sistema com os textos e botões do mock 17

- **Fase:** 5 · **Tela:** 17, 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X042
- **Fecha:** T17-013, T17-014, T17-015, T17-020
- **Hoje:** `StateShell` não tem `role=status` (`Shared:429-439`); `TalkXErrorState` tem título fixo e não mostra detalhe (`Shared:449-455`); o estado de CRM é genérico "Dados indisponíveis" (`Shared:457-459`); o de WhatsApp usa ícone de balão (`Shared:463`); "sem permissão" não tem botão (`Shared:469-471`); o esqueleto tem pílula no lugar do ⋮ (`Shared:480`). A Visão geral usa texto próprio no vazio ("Crie sua primeira campanha Talk X", `Overview:202`) e o texto do mock aparece só no vazio filtrado (`Overview:205`).
- **Fazer:** Em `kit/states.tsx`: `TalkXEmptyState` com preset `emptyCampaigns` (ícone de prancheta, "Nenhuma campanha encontrada", "Crie sua primeira campanha no Talk X e comece a se conectar com seus clientes.", botão "+ Nova Campanha"); `TalkXFilteredEmptyState` (com "Limpar filtros"); `TalkXSkeletonRows` (quadrado + 2 barras + ⋮, `aria-busy`, variantes `rows | cards | kpi | rail`); `TalkXErrorState` com `entity` ("Não foi possível carregar as campanhas"), "Tentar novamente" e "Ver detalhes" (abre bloco com mensagem, código e hora do erro, com "Copiar"); `TalkXCrmUnavailableState` (ícone de banco com alerta, "CRM 360 indisponível", botão "Ver status dos serviços"); `TalkXWhatsAppDisconnectedState` (logo WhatsApp vermelho, "Conectar WhatsApp"); `TalkXNoPermissionState` (cadeado, "Falar com o administrador"). `StateShell` ganha `role="status"`/`aria-live` (erro: `role="alert"`) e variante `compact`. `TalkXDataUnavailableState` genérico continua para o Catálogo (`src/components/catalog/ExternalProductCatalog.tsx:313`). Aplicar `emptyCampaigns` e o vazio filtrado em `Overview:200-205`.
- **Aceite:** `kit/__tests__/states.test.tsx`: um teste por estado conferindo os textos literais do mock, o `role` e o callback de cada botão; "Ver detalhes" exibe `error.message`. Teste da Visão geral: 0 campanhas → título "Nenhuma campanha encontrada" e botão "Nova Campanha".
- **V3:** V50 (componentes)
- **Negócio:** Tela vazia, carregando, com erro, sem WhatsApp, sem CRM ou sem permissão passa a ter um desenho só, igual ao da referência.

### X047 · Expor erro nos hooks e aplicar carregando/erro/vazio em todas as telas do módulo

- **Fase:** 5 · **Tela:** 17, 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X046
- **Fecha:** T17-016, T17-017, T17-018, T17-019
- **Hoje:** `useTalkX` não devolve `isError`/`error` (`useTalkX:388-407`): se a consulta falha, `campaigns` vira `[]` e a tela mostra o estado vazio (`Overview:200-203`). `TalkXSegments.tsx:27` recebe `isError, error, refetch` e não usa. `useTalkXTemplates.ts:222-224`, `useTalkXSuppression.ts:103` e `useTalkXMonitor.ts:59-61` expõem erro que nenhuma tela lê; `useTalkXEvents.ts:53` não expõe. `TalkXErrorState` tem 0 usos fora do `Shared`. Analytics não tem esqueleto nem erro (`TalkXAnalytics.tsx:90,129,198`); a tela "Em andamento" e as Configurações tratam erro à mão (`TalkXCampaignRunning.tsx:277-282`, `TalkXSettings.tsx:24`); o carregamento do wizard é um texto solto (`View:196-198`).
- **Fazer:** `useTalkX` passa a devolver `isError`, `error` e `isFetching`; `useTalkXEvents` e a consulta de `TalkXSuppression.tsx:53` também. Criar `TalkXQueryBoundary` em `kit/states.tsx`: recebe o estado da consulta, a entidade, o esqueleto e o vazio, e decide na ordem carregando → erro → vazio → conteúdo (nunca mostra vazio com `isError`). Usar em: Visão geral (KPIs, tabela, rail), Segmentos, Templates (grade e lista), Supressão, Analytics, Configurações, Monitor, Em andamento (cabeçalho e lista), Agendada e carregamento do wizard. "Tentar novamente" chama o `refetch` da consulta; os filtros são preservados.
- **Aceite:** `src/components/talkx/__tests__/talkxStates.matrix.test.tsx` (uma linha por tela): com o Supabase simulado devolvendo erro, a tela mostra "Não foi possível carregar …" e **não** o texto de vazio; clique em "Tentar novamente" refaz a consulta; durante `isLoading` há `aria-busy`. `grep -rn "TalkXErrorState\|TalkXQueryBoundary" src/components/talkx/*.tsx | wc -l` ≥ 9. `grep -n "Carregando campanha…" src/components/talkx` = 0.
- **V3:** V50
- **Negócio:** Quando o sistema falhar ao buscar os dados, a tela diz que falhou e oferece "Tentar novamente", em vez de fingir que não há campanhas.

### X048 · Aplicar WhatsApp desconectado, CRM indisponível e sem permissão, com botões ligados

- **Fase:** 5 · **Tela:** 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X014, X046, X047 · **Integra com (não bloqueia):** X038
- **Fecha:** T17-021, T17-022, T17-023, T17-024, T17-025, T17-026, T17-027, T17-028, T17-029
- **Dependências, em detalhe:** X046, X047 ; CAP-092 (sinal de disponibilidade do CRM — só a parte de CRM) ; CAP-096 (RPC devolve 42501 por papel)
- **Hoje:** Os estados de WhatsApp e de permissão têm 0 usos no Talk X. Sem conexão, o wizard mostra um texto âmbar (`TalkXCampaignWizard.tsx:248`); a opção "CRM 360°" é um cartão desabilitado com selo fixo (`TalkXCampaignWizard.tsx:255`). Quem não é admin/supervisor vê a tela genérica do shell "Acesso restrito / Voltar ao Chat" (`src/pages/ViewRouter.tsx:137-138,237-256`). `useTalkXConnectionStatus.ts:17-38` consulta uma conexão por id; não há visão "tem alguma conexão ativa". Não existe "status dos serviços" (grep `status dos servi` em `src` = 0).
- **Fazer:** Hook `src/hooks/integrations/useTalkXServiceStatus.ts`: `whatsapp` (existe conexão `connected` em `whatsapp_connections`), `crm` (`ok | unavailable | not_configured`, vindo do sinal de CAP-092; sem vínculo configurado é `not_configured`, não "indisponível") e `realtime`. Visão geral: sem conexão ativa, faixa compacta do estado WhatsApp acima da tabela, com "Conectar WhatsApp" → view `connections`; wizard passo 1 troca o texto âmbar pelo mesmo estado. Segmentos e cartão "Origem do público" mostram `TalkXCrmUnavailableState` quando `crm = unavailable`. "Ver status dos serviços" abre `kit/ServiceStatusSheet.tsx` com 3 linhas (WhatsApp por conexão, CRM 360 com hora da última sincronização, tempo real). `ViewRouter.tsx`: para a view `talkx`, renderizar `TalkXNoPermissionState` no lugar da tela genérica, com "Falar com o administrador" → view `team-chat` (`src/services/navigation.service.ts:41`). `TalkXQueryBoundary` mapeia erro 42501 para o estado sem permissão.
- **Aceite:** `useTalkXServiceStatus.test.ts` (3 combinações); teste do `ViewRouter`: papel `agent` em `?view=talkx` vê "Você não tem permissão para acessar Campanhas" e o botão navega para `team-chat`; teste do wizard sem conexão: estado com "Conectar WhatsApp" e clique navega para `connections`; teste de Segmentos com `crm = unavailable`: "CRM 360 indisponível" e o botão abre o painel de status. Print dos 3 estados ao lado do mock 17.
- **V3:** V50
- **Negócio:** Sem WhatsApp conectado, sem CRM ou sem permissão, a tela explica o motivo e o botão leva ao lugar que resolve.

### X049 · Modal único do kit com barra de título, tom aplicado, espera da ação e presets do mock

- **Fase:** 5 · **Tela:** 17, 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X042
- **Fecha:** T17-030, T17-032, T17-042, T17-043, T17-044
- **Hoje:** `TalkXConfirmDialog` é um `AlertDialog` centralizado sem barra de título nem "✕" (`Shared:810-821`); a frase sai como `"<nome>" — <descrição>` (`Shared:817`); `toneStyle` é calculado e nunca aplicado, então violeta e verde não existem (`Shared:797,847`); aceita `loading` mas os chamadores fecham antes de a ação terminar (`Overview:320,330,340`); não há presets. Usos: `Overview:317-345` (3) e `TalkXSegments.tsx:181-190`. O contrato fixa o texto `disabled={!allChecked || loading}` (`scripts/db-audit/talkx-analytics-contract.test.mjs:72-73`).
- **Fazer:** Em `kit/dialogs.tsx`: `TalkXDialogShell` (barra de título + "✕", corpo, rodapé; entrada `talkxScaleIn` com movimento reduzido) como base de confirmação e de formulário. `TalkXConfirmDialog` sobre ela: tile, título, pergunta com o nome em negrito entre aspas, linha de consequência, `details`, `checks` e `reasonField` opcional. `onConfirm` pode devolver Promise: botão em espera, modal só fecha ao resolver, erro aparece dentro do modal. Tom aplicado ao tile e ao botão (vermelho, azul, violeta, verde). Foco inicial em "Cancelar" nos destrutivos; `Enter` confirma só sem pendência; foco volta ao gatilho. `kit/dialogPresets.ts` com os 5 do mock, texto literal: `excluirCampanha`, `duplicarCampanha`, `removerSupressao`, `cancelarCampanha` ("Voltar"/"Cancelar"), `confirmarDisparo` (linhas Segmento, Destinatários, Mensagens, Envio; "Confirmar envio" verde); e os que o produto já tem sem mock: `pausarCampanha`, `retomarCampanha`, `cancelarAgendamento`, `excluirSegmento`, `excluirTemplate`, `excluirVariante`, `descartarAlteracoes`, `restaurarVersao`. Hook `useTalkXConfirm()` (devolve Promise) para substituir `window.confirm`. Trocar já os 4 usos existentes pelos presets.
- **Aceite:** `kit/__tests__/dialogPresets.test.tsx`: para cada um dos 5 presets do mock, título, frase e rótulos dos botões iguais ao mock; `onConfirm` pendente mantém o modal aberto com indicador e, ao rejeitar, mostra a mensagem; tom violeta aplica a classe no botão; `Enter` com check pendente não confirma. Contrato de analytics (`:72-73`) ajustado para o arquivo novo.
- **V3:** V43 (presets), V92
- **Negócio:** Excluir, duplicar, cancelar e disparar passam a ter sempre a mesma janela de confirmação, com o texto aprovado.

### X050 · Trocar diálogos soltos e `window.confirm` de Supressão, Templates e limites pelo kit

- **Fase:** 5 · **Tela:** 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X049
- **Fecha:** T17-038, T17-039, T17-041
- **Hoje:** Remover da supressão é um `AlertDialog` cru sem ícone, com título "Remover da lista de supressão?" e sem espera (`TalkXSuppression.tsx:246-251`), além de um `<AlertDialog>` vazio envolvendo o botão (`:173`). Excluir template é outro cru (`TalkXTemplates.tsx:167-172`). O editor de template usa 5 `confirm` do navegador (`TalkXTemplateEditor.tsx:111,168,253,459,509`). Formulários em diálogo solto: adicionar à supressão (`TalkXSuppression.tsx:208`), testar template (`TalkXTemplateEditor.tsx:558`) e editar limites dentro de um `AlertDialog` (`TalkXCampaignRunning.tsx:727-781`).
- **Fazer:** Supressão: preset `removerSupressao` (tile e botão violeta; "Deseja remover este contato da lista de supressão?" + "O contato poderá receber mensagens nas próximas campanhas."; nome do contato em `details`), aguardando a mutation; remover o invólucro da linha 173. Templates: `excluirTemplate`. Editor: os 5 `confirm` viram `useTalkXConfirm` com `descartarAlteracoes`, `restaurarVersao` e `excluirVariante(n envios)`. Os 3 formulários passam para `TalkXDialogShell`, com o conteúdo atual. `TalkXHelp.tsx:45` fica de fora: a ajuda deixa de ser diálogo na trilha de dados, relatório e importação (A16).
- **Aceite:** `TalkXSuppression.authoring.test.tsx` ampliado: "Remover" abre o modal com os dois textos do mock e só fecha depois de a mutation resolver. `grep -c "window.confirm\|[^.a-zA-Z]confirm(" src/components/talkx/TalkXTemplateEditor.tsx` = 0. `grep -c "<AlertDialog\|<Dialog " src/components/talkx/TalkXSuppression.tsx src/components/talkx/TalkXTemplates.tsx src/components/talkx/TalkXTemplateEditor.tsx` = 0. Teste do editor: excluir variante com envios mostra o modal do kit com a contagem.
- **V3:** V92
- **Negócio:** Somem as caixinhas cinzas do navegador ("OK/Cancelar"); toda confirmação tem a cara do sistema.

### X051 · Unificar pausar, retomar, cancelar e disparar em um fluxo só nas 5 telas

- **Fase:** 5 · **Tela:** 17, 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X013, X024, X025, X049, X050
- **Fecha:** T17-045, T17-046, T17-047, T17-048, T17-050, T17-052
- **Dependências, em detalhe:** X049, X050 ; CAP-007 (lançamento responde na hora) ; CAP-053 (cancelar marca pendentes) ; CAP-054 (pausa com motivo e ator) ; CAP-055 (servidor grava os eventos)
- **Hoje:** Cancelar tem 3 textos (`Overview:327-336`, `TalkXLiveMonitor.tsx:228-231`, `TalkXCampaignRunning.tsx:799-812`); pausar tem 2 (`TalkXLiveMonitor.tsx:224-227`, `TalkXCampaignRunning.tsx:783-796`) e nenhum pela lista (`Overview:267`); retomar só no Monitor (`TalkXLiveMonitor.tsx:232-235`); iniciar tem 3 (`Overview:337-345`, `TalkXCampaignScheduled.tsx:365-381`, `TalkXWizardDelivery.tsx:257-281`, este um `<Dialog>` próprio azul, com "Público" no lugar de "Segmento" e sem a linha de variações). O evento é gravado pelo navegador só no Monitor (`TalkXLiveMonitor.tsx:226,230,234`) e no wizard (`useCampaignEditor.ts:583`); pela lista e pela tela "Em andamento" não há evento (`View:290-291`, `TalkXCampaignRunning.tsx:580-600`). Os modais fecham antes de a ação terminar (`TalkXCampaignRunning.tsx:582,593`).
- **Fazer:** `src/components/talkx/useTalkXLifecycle.tsx`: única porta para iniciar, pausar, retomar, cancelar e cancelar agendamento. Abre o preset, chama `talkx-send` (pausa envia `reason`), espera só o aceite, mostra o resultado e invalida as consultas. O navegador para de gravar `started/paused/resumed/cancelled` (remover as chamadas de `logEvent` citadas). Usar o hook na Visão geral, Monitor, Em andamento, Agendada e passo de revisão do wizard. `confirmarDisparo` recebe Segmento (nomes), Destinatários, Mensagens ("N variações" = variantes de `talkx_template_variants` do template escolhido, mínimo 1) e Envio (Imediato ou data); botão verde "Confirmar envio". "Cancelar agendamento" mantém texto próprio (`cancelarAgendamento`). Criar `scripts/db-audit/talkx-kit-usage.test.mjs`: falha se houver `<AlertDialog`, `<Dialog ` ou `window.confirm` em `src/components/talkx/*.tsx` fora de `kit/` (exceção nomeada: `TalkXHelp.tsx`); rodar no mesmo job dos demais `talkx-*.test.mjs`.
- **Aceite:** `useTalkXLifecycle.test.tsx`: cancelar a partir das 3 telas produz o mesmo título, texto e botões ("Voltar"/"Cancelar"); pausar envia `reason`; nenhuma escrita em `talkx_campaign_events` parte do navegador (espião em `fromTable`); o modal de disparo fecha no aceite. `talkx-kit-usage.test.mjs` com saída 0. Ajustar `scripts/db-audit/talkx-navigation-contract.test.mjs` se a regex do wizard/agendada mudar. Em homologação, com campanha para número interno: após cancelar, `select event_type, actor_id from talkx_campaign_events where campaign_id = …` traz `cancelled` com ator e `select status, count(*) from talkx_recipients where campaign_id = … group by 1` não tem `pending`.
- **V3:** V92, V43 (pausar/retomar com modal)
- **Negócio:** Pausar, retomar, cancelar ou disparar funciona igual em qualquer tela e fica sempre registrado quem fez e por quê.

### X052 · Colocar aba e campanha aberta na URL e criar abas com menu (Templates, Analytics)

- **Fase:** 5 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X042
- **Fecha:** T01-020, T01-021, T01-022, T01-023, T01-024, T17-009
- **Hoje:** A aba ativa é estado local (`View:36`): recarregar volta para "Visão geral". Monitor, agendada e em andamento também são estado local (`View:38-40`). Só o wizard tem rota (`src/components/talkx/talkxWizardRoute.ts:28-77`). As abas não têm seta nem menu (`View:266-281`). `TalkXSettings` não é montada em lugar nenhum (grep fora do próprio arquivo = 0). `onGoTab` só conhece templates e segmentos (`View:293`). O mock 17 desenha 6 abas (com "Campanhas" separada) e o mock 01 desenha 5.
- **Fazer:** `src/components/talkx/talkxRoute.ts`, com o mesmo rigor do parser do wizard (parâmetro duplicado é rejeitado): `tab`, `sub`, `campaign`, `segment`, `template`, além de `wizard`/`step`. `tab=campaigns` é alias de `overview` — a listagem de campanhas mora em "Visão geral" (mock 01, que é a tela real; o mock 17 é prancha de referência). `View` passa a derivar a tela da rota: `campaign=<id>` abre agendada, em andamento ou monitor conforme o status (regra de `View:156-160`), com `pushState` e tratamento de voltar/avançar. `kit/ModuleTabs.tsx`: mantém `role=tab` e os nomes atuais (usados em `e2e/talkx.spec.ts:37,92-97`); a seta é um botão separado com menu — Templates: "Biblioteca", "Criar template"; Analytics: "Painel", "Configurações" (monta `TalkXSettings` em `tab=analytics&sub=settings`). A lista de abas e subitens sai de `MODULE_TABS` em `kit/constants.ts`, para os demais trilhas registrarem os seus.
- **Aceite:** `talkxRoute.test.ts` (ler/escrever, duplicados, alias); `TalkXView.route.test.tsx` com casos novos: `?view=talkx&tab=suppression` abre a aba após recarregar; "voltar" do navegador retorna à aba anterior; `?view=talkx&campaign=<id>` de campanha agendada abre a tela de agendada; `sub=settings` mostra as Configurações. Ajustar `scripts/db-audit/talkx-navigation-contract.test.mjs:11-19` (regex sobre `setTopView`). E2E: recarregar em "Segmentos" mantém a aba.
- **V3:** V45
- **Negócio:** Dá para recarregar a página ou mandar o link de uma aba ou campanha para alguém e cair no mesmo lugar; as Configurações do Talk X ganham entrada.

### X053 · Cabeçalho do módulo: trilha, botão "Ajuda" com rótulo e indicador de campanha em andamento

- **Fase:** 5 · **Tela:** 01, 17 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X052
- **Fecha:** T01-018, T17-001, T17-008
- **Hoje:** Não há trilha nas abas; só duas feitas à mão (`TalkXCampaignWizard.tsx:102`, `TalkXCampaignScheduled.tsx:165`). O botão de ajuda é só ícone (`View:251-256`). "Ao vivo" mostra o estado do canal de tempo real, não de campanha (`View:245-250`). O Monitor tem um botão "Voltar à campanhas" solto, com classes inválidas `h9` e `hover:bv-muted/50` (`View:227-231`). Não existe "Iniciada às" (grep em `src/components/talkx` = 0).
- **Fazer:** `ModuleHeader` (em `kit/primitives.tsx`) ganha `breadcrumb` (`nav` com `aria-label`), preenchido pela rota: "Talk X › Campanhas › <aba | Nova campanha | nome da campanha>". Substituir as duas trilhas à mão e o botão solto do Monitor. Botão "Ajuda" com ícone e rótulo. `kit/ActiveCampaignIndicator.tsx`: cartão "● Em andamento ▾ / <nome> / Iniciada às HH:mm", alimentado por consulta a `talkx_campaigns` com `status in (sending, paused)`, `started_at desc`, limite 5; o menu lista as demais e o clique abre `campaign=<id>`; pausada aparece em âmbar; sem campanha ativa o cartão não é desenhado. O "Ao vivo" vira ponto/tooltip desse cartão e do botão ⟳.
- **Aceite:** `ModuleHeader.test.tsx`: trilha correta para aba, wizard e campanha; `ActiveCampaignIndicator.test.tsx`: 0 campanhas → não renderiza; 2 → nome da mais recente e menu com 2; clique navega. `grep -rn "h9 \|bv-muted\|Voltar à campanhas" src/components/talkx` = 0. Print do cabeçalho ao lado do mock 01.
- **V3:** V45 (trilha)
- **Negócio:** Em qualquer tela do módulo dá para ver onde se está e, havendo campanha rodando, ir para ela em um clique.

### X054 · Busca ⌘K do módulo: uma paleta só, itens sem abrir o módulo e que abrem o item certo

- **Fase:** 5 · **Tela:** 01 · **Camada:** front + testes · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X052
- **Fecha:** T01-010
- **Hoje:** Duas paletas escutam o mesmo atalho: a de módulos (`src/components/CommandPalette.tsx:65-76`, montada em `src/pages/Index.tsx:126`) e a de comandos (`src/components/keyboard/GlobalKeyboardProvider.tsx:82-86,121-128`). Os itens do Talk X saem só do cache (`src/hooks/integrations/useTalkXCommandItems.ts:25-27`): antes de abrir o módulo a lista é vazia. Toda ação faz apenas `onNavigate('talkx')` (`:37,47,57`). O mapa de rótulos tem `running`, que não existe; `sending` aparece cru (`:12`). A paleta corta o Talk X em 8 itens no total (`src/components/ui/command-palette.tsx:57`). Não há campo de busca no módulo.
- **Fazer:** Um dono do atalho: `GlobalKeyboardProvider`. `CommandPalette.tsx` perde o ouvinte de teclado; o evento `open-global-search` (`src/components/layout/Sidebar.tsx:139,153`) passa a abrir a paleta única, que recebe a lista de módulos de `NavigationService` (filtrada por papel) como comandos de navegação; remover a montagem de `Index.tsx:126`. `useTalkXCommandItems` faz consultas próprias (`id, name, status` de campanhas; `id, name` de segmentos e templates; limite 50; só com a paleta aberta e papel admin/supervisor), usa os rótulos de `CAMPAIGN_STATUS` e, na ação, navega para `talkx` e grava a rota de X052 (`campaign`, `segment` ou `template`). A paleta mostra 3 grupos (Campanhas, Segmentos, Templates) com até 8 cada. No cabeçalho do módulo, campo "Buscar campanhas, segmentos, templates… (⌘K)" que abre a paleta já no escopo Talk X.
- **Aceite:** `GlobalKeyboardProvider.test.tsx`: ⌘K abre exatamente um `role=dialog`; os itens existem sem o módulo ter sido visitado. `useTalkXCommandItems.test.ts`: status `sending` → "Em andamento"; a ação grava `campaign=<id>`. E2E em `e2e/talkx.spec.ts`: ⌘K → digitar o nome do segmento de teste → Enter → aba Segmentos com o segmento aberto.
- **V3:** V47 (⌘K)
- **Negócio:** ⌘K encontra qualquer campanha, segmento ou template e abre direto nele.

### X055 · Prancha de referência (`TalkXKit`), estado forçado por URL e matriz tela × estado

- **Fase:** 5 · **Tela:** 17 · **Camada:** front + testes + docs · **DDL:** não · **Deploy de edge:** não
- **Exige antes:** X043, X044, X045, X046, X049, X053
- **Fecha:** T17-003, T17-011, T17-012
- **Hoje:** A página de referência não existe: não há `src/components/talkx/__dev__`, e `grep -rn "talkx-kit\|talkxState" src` = 0. Não há `docs/talkx/ESTADOS.md`. Não dá para forçar um estado para conferência visual.
- **Fazer:** `src/components/talkx/__dev__/TalkXKit.tsx`, aberta por `?view=talkx-kit` só em desenvolvimento ou com `VITE_TALKX_KIT=1` (carregamento sob demanda; fora do pacote de produção). Layout do mock 17: trilha, cabeçalho "Campanhas - Talk X" com "Estados do sistema e modais • Referência para implementação e QA", seção "Estados do Sistema" (6 cartões), seção "Modais Críticos" (5 presets desenhados no lugar, modo `inline` de `TalkXDialogShell`), rodapé com o texto do mock e a versão do `package.json`; abaixo, galeria de tabela, KPI e barra de filtros. `?talkxState=<empty|loading|error|crm|wa|perm>` respeitado por `TalkXQueryBoundary` e `useTalkXServiceStatus` sob a mesma trava. `docs/talkx/ESTADOS.md` com a matriz tela × estado e `arquivo:linha`, gerada por `scripts/talkx/gen-estados.mjs`.
- **Aceite:** `e2e/talkx-kit.spec.ts`: abre `?view=talkx-kit` em 1672×941 e anexa o print ao lado de `docs/talkx/references/17_Estados_do_Sistema_e_Modais.png`; os 6 valores de `?talkxState=` produzem o título correspondente na Visão geral. No build de produção sem a variável, o pacote não contém `TalkXKit` (`grep -l TalkXKit dist/assets/*.js` vazio). `node scripts/talkx/gen-estados.mjs --check` com saída 0.
- **V3:** V48 (TalkXKit), V92 (ESTADOS.md, `?talkxState=`, prancha)
- **Negócio:** Existe uma página única para conferir todos os estados e modais contra a referência antes de liberar qualquer tela.

### X056 · Preencher cidade, UF e origem em `contacts` e expor a cobertura por atributo

- **Fase:** 5 · **Tela:** dados, 02, 03, 08 · **Camada:** banco + front · **DDL:** sim · **Deploy de edge:** não
- **Exige antes:** X037, X038, X040, X046
- **Fecha:** CAP-093, `dados:cidade` e `dados:uf` (em `contacts`), `dados:origem_lead`, `dados:cobertura`
- **Dependências, em detalhe:** X037, X038, X040 ; estado "sem dados ainda" do kit (trilha do kit, A17)
- **Hoje:** `contacts.city`, `state` e `lead_origin` estão preenchidos em 0 contatos (conferido em 01/10). Nenhuma tela informa quantos contatos têm cada dado; a contagem do segmento devolve 0 sem motivo (`src/hooks/integrations/useTalkXSegments.ts:161-168`).
- **Fazer:** (1) RPC `talkx_backfill_contact_fields(p_dry_run, p_limit)` (admin; e linha diária em `talkx_data_jobs`): copia para `contacts.city/state` o que a projeção tem com origem `crm360` (nunca `ddd`) e para `contacts.lead_origin` o `source` do CRM, só onde o campo local está vazio, em lotes de 200, preservando `updated_at` (o construtor usa essa coluna como "última interação") e gravando o total em `talkx_data_sync_runs`; `p_dry_run=true` só devolve a contagem. (2) RPC `talkx_attribute_coverage()` (INVOKER): por atributo, contatos visíveis, quantos têm valor, percentual, origem predominante, última atualização e último erro do job. (3) `src/hooks/integrations/useTalkXAttributeCoverage.ts` e `src/components/talkx/data/TalkXAttributeCoverage.tsx`: atributo com 0 preenchidos → filtro/coluna desabilitado com o estado "sem dados ainda" e o motivo; abaixo de 5% → habilitado com aviso "N contatos têm este dado".
- **Aceite:** Teste SQL: dry-run não altera linha; execução preenche só nulos e mantém `updated_at`; segunda execução → 0; `talkx_attribute_coverage()` em fixture devolve as contagens esperadas. Teste de componente: atributo com 0 → item desabilitado com o texto do kit. Em produção: `SELECT count(*) FILTER (WHERE city IS NOT NULL) FROM contacts` = número do dry-run.
- **V3:** —
- **Negócio:** Cada filtro mostra quantos contatos têm aquele dado; em vez de um segmento que dá zero sem explicação, aparece "sem dados ainda".
