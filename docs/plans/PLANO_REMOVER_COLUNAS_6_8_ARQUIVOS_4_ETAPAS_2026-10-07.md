# PLANO — REMOVER AS OPÇÕES DE 6 E 8 COLUNAS DO GRID DE ARQUIVOS — 4 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration, sem dependência nova.**
> **Pedido do dono (com prints):** em Arquivos → Layout → Colunas, excluir as 2 últimas opções de grid (as que "não cabem"), para o usuário não ficar tentando aplicá-las.

## 1. Estado verificado (dia/2026-10-07)
- `FILES_COLUMNS = [3, 4, 5, 6, 8]` em `src/hooks/chat/useFilesViewState.ts`; o tipo `FilesColumns` deriva dessa lista; o padrão é 4.
- `FilesColumnSelector.tsx` desenha uma opção por coluna (com `ICON_SHAPE: Record<FilesColumns, …>`) e desabilita a que não cabe, com a dica "Não cabe na largura atual (máximo N)". `FilesTab.tsx` (linha ~140) monta as opções a partir de `FILES_COLUMNS`.
- A preferência salva (`localStorage`) é lida por `parseFilesViewPrefs`: valor fora de `FILES_COLUMNS` volta ao padrão 4. Quem tinha 6 ou 8 salvo **volta sozinho ao padrão**, sem migração.

## 2. Decisões (o dono pode reverter)
- **D01.** `FILES_COLUMNS` passa a `[3, 4, 5]`. As opções 6 e 8 saem da tela e do código (sem botão desabilitado).
- **D02.** Sem migração de dados: o `parseFilesViewPrefs` já trata o valor antigo.
- **D03.** Visualizações Grid, Lista e Tabela não mudam.

## 3. Etapas
- **C01–C03** [iris] **Cartão único:** (C01) `FILES_COLUMNS = [3,4,5]`; (C02) remover 6 e 8 do `ICON_SHAPE` e de qualquer lista/descrição; (C03) ajustar os testes (`FilesColumnSelector.test.tsx`, testes do `useFilesViewState`) e provar que preferência salva 6 ou 8 vira 4.
- **C04** [Claude] verificação na pré-visualização `localhost:5500`: o popover mostra só 3 opções de coluna, todas habilitáveis na largura comum; preferência antiga de 6/8 abre em 4.

## 4. Fora de escopo
Mudar o padrão de colunas; ajustar o cálculo de "cabe" das opções 3–5.

## 5. Estado de execução
_A preencher._
