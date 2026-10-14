Especialista: Íris (area-front-componentes)

# Menu "Filtros salvos" na lista de conversas (Inbox)

## FAIXA DO PAI
FAIXA DO PAI (t_c836534e, que por sua vez carrega a faixa de t_66f0765c): cherry-pick
de 87c9e53c49, 23e5eca7f3 (`supabase/migrations/20261013235907_saved_filters_inbox_limites.sql` e
`supabase/tests/saved_filters_inbox_limites.sql`) + 9358fb2716 (hook `useInboxFilterPresets.ts` e seu
teste) + os commits de relato. Nada disso é trabalho DESTE cartão: são os arquivos que o cartão manda
preservar (a migration do pai tem de entrar junto com t_66f0765c e o hook é a fonte dos presets).
O diff DESTE cartão é só o commit cf59223673 (2 fontes + 1 teste, todos em `src/components/inbox/**`).

## O que mudou e por quê
- `src/components/inbox/InboxSavedFiltersMenu.tsx` (novo): o menu "Filtros salvos" da lista de
  conversas. Salvar o filtro atual, aplicar (nome + teclado), renomear e excluir com **Desfazer**.
  - Salvar/renomear validam ANTES de chamar o servidor com `validateInboxPresetName` (a MESMA função
    do hook — nome vazio, 1–40, caractere de controle e duplicidade case-insensitive), e o erro sai em
    `role="alert"` ao lado do campo, com o diálogo aberto. Renomear revalida ignorando o próprio id.
  - Aplicar entrega `preset.filters` (aba + sub-aba + tipo de contato + fila) ao `onApply` e fecha o
    menu. O texto da busca NUNCA entra no preset (pode ter dado pessoal) — quem monta o conteúdo é o
    dono da tela; este componente não adivinha aba padrão nenhuma.
  - Excluir guarda o preset removido e oferece "Desfazer" (`role="status"`), que regrava nome+filtros.
  - Erro de servidor em excluir/desfazer também vira `role="alert"`.
  - Só tokens do sistema (`text-muted-foreground`, `text-destructive`, `bg-muted`, `border-border`);
    nenhuma animação nova. Alvos de toque de 40 px (botões `size="icon"`/`min-h-10`) e todos os
    controles são `<button>` nativos — navegação por Tab/Enter/Espaço.
- `src/components/inbox/InboxFilters.tsx`: ganhou a prop OPCIONAL `savedFilters` (`{ current, onApply }`)
  com a interface exportada `InboxSavedFiltersIntegration`, e renderiza o menu ao lado de "Atualizar"
  quando ela é passada. Sem a prop o componente é idêntico ao de antes (nada de menu com filtro atual
  inventado) — nenhum consumidor existente muda de comportamento.

## Prova
Vermelho (base `dia/2026-10-13` sem a ligação deste cartão): restaurei o `InboxFilters.tsx` original
(`git checkout HEAD --` mantendo cópia em `.tmp/InboxFilters.after.tsx`) e rodei
`npx vitest run src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx`
→ `Tests 1 failed | 12 passed (13)` — falha exatamente em
"InboxFilters: o menu só aparece quando a tela entrega o filtro atual" (o menu não é renderizado no
componente real sem a ligação). Depois restaurei o arquivo.

Verde nesta árvore:
- `npx vitest run src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx`
  → `Test Files 1 passed (1); Tests 13 passed (13)`
- hook do pai + teste de acessibilidade que já existia:
  `npx vitest run src/components/inbox/__tests__/InboxFilters.nomes-seletores.test.tsx src/hooks/inbox/__tests__/useInboxFilterPresets.test.tsx`
  → `Test Files 3 passed (3); Tests 25 passed (25)` (rodados junto com o novo, na mesma chamada)
- regressão da lista: `npx vitest run src/components/inbox/__tests__/ConversationListSidebar.topo.test.tsx src/components/inbox/__tests__/ConversationListSidebar.test.tsx`
  → `Test Files 2 passed (2); Tests 13 passed (13)`
- `npx eslint` nos 3 arquivos → sem saída (exit 0)

Cobre o critério: salvar grava o filtro atual com o nome digitado (sem `id` = criação), aplicar devolve
o conteúdo ao `onApply` e fecha, renomear grava pelo `id` mantendo o conteúdo, excluir remove no
servidor e o Desfazer regrava, nome duplicado/vazio é recusado sem ir ao servidor, falha de exclusão é
anunciada e o preset continua na lista, Enter no campo salva, controles são botões nativos e o axe não
acusa botão sem nome.

## O que NÃO fiz e por quê
- **Não liguei o menu na `ConversationListSidebar`** (o cartão limita os arquivos a `InboxFilters.tsx`
  e seus testes, e o critério 4 pede que nenhum arquivo fora do meu diff seja tocado). Hoje só o
  `onContactTypeChange`/`onQueueChange` já estão ligados na lista; TAB vem do `useInboxFilters`
  (`mainTab`/`subTab`/`setMainTab`/`setSubTab`), e há uma decisão de hooks pendente: `subTab = null`
  ("todas as abertas") não tem chip equivalente, e aplicar `setMainTab`/`setSubTab` sem mexer no
  `chipTab` deixaria o chip aceso apontando para outro recorte. Isso é `area-front-hooks`, não telas.
  Registrei em `kanban_comment` do cartão com o mapeamento sugerido (`open+attending` → chip
  `attending`, `open+waiting` → `waiting`, `open+null` → `all`, `resolved` → `resolved`).
- Não toquei em `useInboxFilterPresets.ts` (do pai): o contrato dele já entregou o que o menu precisava.
