# PLANO — FILTRO POR DATA NA ABA "ARQUIVOS" DO CHAT PANEL — 8 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration, sem dependência nova.**
> **Pedido do dono (com prints):** na aba **Arquivos** (Todos/Imagens/Vídeos/Áudios/Docs) adicionar um filtro por data, no mesmo formato do seletor de período da aba **IA** (atalhos + calendário De/Até), para pesquisar arquivos em datas específicas.
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. Estado verificado (dia/2026-10-07)
- O seletor da IA é `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` (300 linhas): tipo `AnalysisPeriod` (`all|last_interaction|today|3d|7d|14d|30d|90d|custom`), calendário De/Até, usado por ConversationSummary, ObjectionDetector, AIConversationAssistant e UniversityHelp.
- A aba Arquivos é `FilesTab.tsx` + `FilesToolbar.tsx` (busca, ordenação "Maiores", Selecionar, Layout). A lista vem de `useContactMedia` (paginação keyset por `created_at desc`, 60 por página); o filtro de tipo e a busca são `filterMediaItems(items, typeFilter, search)` em `filesSort.ts`; o estado de visão (ordem, tipo, busca) fica em memória por conversa em `useFilesViewState.ts`. Os contadores dos chips vêm da RPC `get_conversation_tab_counts`/`useContactMediaCounts` (totais).
- Os cartões de miniatura (M01–M05) **não** tocam nesses arquivos: sem conflito.

## 2. Decisões (o dono pode reverter)
- **D01.** Reutilizar o `PeriodFilterSelector` (mesma aparência e atalhos da IA). Sem a opção "Última interação" (não faz sentido para arquivos); o padrão é **Qualquer data**.
- **D02.** O filtro usa a **data de envio do arquivo** (`created_at`), no fuso do navegador; período personalizado inclui o dia inicial e o final inteiros.
- **D03.** Combina com tipo (Imagens/Vídeos…), busca e ordem. O botão aparece na barra ao lado de "Maiores"; com período ativo mostra o rótulo e um **X** para limpar, como na IA.
- **D04.** Com período ativo, a tela **carrega páginas antigas até passar do início do período** (a lista é por data decrescente) para não esconder arquivos fora das primeiras 60; o cabeçalho "N arquivos" e os contadores dos chips refletem o filtro.
- **D05.** O período fica na memória da sessão por conversa (como ordem e tipo); trocar de conversa volta ao padrão.

## 3. Etapas
- **F01–F06** [iris] **Cartão único (arquivos acoplados):** (F01) `src/lib/filesPeriod.ts` novo: período → intervalo [de, até] e filtro por `created_at`; (F02) `filesSort.ts` aceita o intervalo; (F03) `useFilesViewState` guarda o período; (F04) `FilesToolbar` mostra o seletor; (F05) `FilesTab` aplica o filtro, carrega páginas até passar do início e ajusta contadores/cabeçalho; (F06) testes de F01–F05.
- **F07** [workertestes + vera] depois da integração: testes adversariais (fuso, virada de dia/mês, intervalo invertido, conversa sem arquivo no período) e documentação.
- **F08** [Claude] verificação na pré-visualização `localhost:5500`: período "Hoje", "Últimos 7 dias" e personalizado; combinação com Imagens e busca; X limpa; conversa com mais de 60 arquivos; celular (390 px); bundle ≤ 343 KB.

## 4. Fora de escopo
Filtro por data em outras abas; salvar o período entre sessões; filtro no servidor (nova RPC).

## 5. Estado de execução
_A preencher._
