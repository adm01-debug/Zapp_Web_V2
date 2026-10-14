Especialista: iris

## O que mudou e por quê
- `src/components/inbox/InboxSavedFiltersMenu.tsx`: o gatilho "Filtros salvos" ganhou `min-h-10` — `size="sm"` é `h-9` (36 px) e o cartão exige alvo ≥ 40 px; com `min-h-10` ele passa a 40 px (Ponto 2).
- `src/components/inbox/InboxSavedFiltersMenu.tsx`: o diálogo abre por estado (não há `DialogTrigger`), então o Radix não tinha para onde devolver o foco e o mandava para o `<body>`; e, como o diálogo é um portal IRMÃO do popover, o foco nele era lido como "foco fora do popover" e o menu de filtros fechava por baixo. Agora o popover ignora `onFocusOutside`/`onInteractOutside` enquanto o diálogo está aberto, e o `DialogContent` devolve o foco ao botão do popover que abriu o diálogo (`onCloseAutoFocus` + `openerRef`) (Ponto 3).
- `src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx`: o teste que só conferia `tagName === 'BUTTON'` saiu; entrou o teste de teclado com abrir, aplicar, renomear e excluir, o loop de Tab (Radix) e o foco ao abrir e ao fechar o diálogo de dentro do popover (Ponto 3).

FAIXA DO PAI: commits `87c9e53c49` (migration `supabase/migrations/20261013235907_saved_filters_inbox_limites.sql` + `supabase/tests/saved_filters_inbox_limites.sql`) e `9358fb2716` (`src/hooks/inbox/useInboxFilterPresets.ts` + teste, e `src/hooks/chat/useSavedFilters.ts` + teste: `.limit(50)`, desempate por id, assinatura de SIGNED_OUT e o `.or` removido só para `inbox_filters`) do cartão `t_c836534e` (branch `v2/filters-saved-inbox-presets-26101322061e66`, sha `a3a7b0fb195aa436709fd00f8c2e75fb9e2b51e0`) — não são deste cartão. Vieram por `git cherry-pick` (card diz: traga a FAIXA do pai) porque o componente importa `useInboxFilterPresets`; sem a faixa o cartão nem compila nem testa.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx` com o componente ANTERIOR → `Test Files  1 failed (1); Tests  2 failed | 15 passed (17)` — as duas falhas eram o foco/permanência do diálogo (`renomear.isConnected false`, foco no `body`; o menu já tinha fechado e o `Salvar filtro atual` não existia mais).
- verde depois: mesmo comando com a correção → `Test Files  1 passed (1); Tests  17 passed (17)`. Junto com os dois testes da faixa do pai: `Test Files  3 passed (3); Tests  38 passed (38)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (207s)` com `tipos`, `lint`, `migrations` e `db_guard` OK.

## Pontos do revisor
- Ponto 1: `src/hooks/chat/useSavedFilters.ts` e `src/hooks/__tests__/useSavedFilters.test.tsx` vêm do cartão pai `t_c836534e`, sha `a3a7b0fb195aa436709fd00f8c2e75fb9e2b51e0`, commits `87c9e53c49` e `9358fb2716` (declarado na FAIXA DO PAI com o sha). Não são deste cartão e não foram editados por ele; a descrição do diff acima agora lista todos os arquivos da faixa, não só os 3 de `src/components/inbox/**`.
- Ponto 2: `min-h-10` no gatilho `Filtros salvos` (`h-9` = 36 px → 40 px), na linha 133 do componente.
- Ponto 3: teste de teclado em `src/components/inbox/__tests__/InboxSavedFiltersMenu.test.tsx` (5 casos): abre o menu pelo gatilho focado e prova que o foco ENTRA no painel (`role="dialog"`); `Tab` no último focável volta ao primeiro e `Shift+Tab` faz o inverso (loop do Radix, asserido); aplica com Enter e o foco volta ao gatilho; renomeia com Enter no campo e o foco volta ao botão que abriu o diálogo; exclui com Enter; `Escape` fecha o diálogo de dentro do popover e devolve o foco ao popover (que continua aberto).
- Ponto 4: relato com uma única linha `Especialista` (a primeira) e a descrição do diff batendo com os arquivos alterados.

## O que NÃO fiz e por quê
- NÃO usei `@testing-library/user-event`: ele não é dependência deste projeto (`grep -n "user-event" package.json bun.lock` não acha nada; `node_modules/@testing-library/` só tem `dom`, `jest-dom`, `react`) e o cartão proíbe dependência nova. Não alterei `package.json` nem `bun.lock`. O teste cobre o teclado com `fireEvent`/`KeyboardEvent` nativos e dois dublês explícitos e documentados do comportamento PADRÃO que o jsdom não implementa (`Tab` move o foco; Enter/Espaço num `<button>` gera o `click`), asserindo o foco resultante em cada passo — desfazer a correção do componente reprova 2 desses casos (prova vermelho→verde acima).
- NÃO conferi em navegador real (Playwright): os arquivos do cartão são o componente e os testes dele.
- NÃO mexi em `src/components/inbox/InboxFilters.tsx`: a integração (`savedFilters`) já estava pronta e coberta por teste.
