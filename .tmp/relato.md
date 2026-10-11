Especialista: iris

## Escopo do refazer
Este refazer mantém a entrega de código anterior e corrige o motivo da recusa: o relato agora explica os arquivos que vieram dos cartões pais, a origem de cada cherry-pick e a cobertura dos testes de `StatusChips`/`countByChip`. Os arquivos `src/hooks/inbox/chipCounts.ts`, `src/hooks/inbox/__tests__/chipCounts.test.ts` e `src/hooks/inbox/useInboxFilters.ts` aparecem no diff porque são o H1/infraestrutural do próprio fluxo `countByChip`: sem eles o contador dos chips continuaria sendo calculado dentro de `StatusChips` e não usaria a mesma função/filtros estruturais da lista.

## Pontos da recusa

Ponto 1 — `StatusChips.tsx` com `archived`, `COUNTER_TONE` e ícone `Archive`:
- O que há no diff: `src/components/inbox/conversation-list/StatusChips.tsx` passa a receber `snoozedIds`, `showAll` e `selectedQueueId`, usa `countByChip(...)` e mantém o chip `Arquivadas` com `Archive`/`aria-hidden="true"`.
- Origem: o chip visual `Arquivadas` veio do B1 `t_2bcde689` (`feat(inbox): chip Arquivadas com contador por conversation_status`, sha original 452075a32). Ele é necessário neste cartão porque `countByChip` calcula o número que esse chip exibe.
- Prova verde: `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx src/hooks/inbox/__tests__/chipCounts.test.ts src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx` retornou `Test Files  4 passed (4)` e `Tests  31 passed (31)`.

Ponto 2 — origem dos 3 commits pais:
- 452075a32: B1 `t_2bcde689`, `StatusChips` cria/renderiza o chip Arquivadas e seus testes.
- 16f60f5de: B2 `t_e476c02e`, `useInboxFilters` faz a lista do chip Arquivadas usar só `conversation_status === 'archived'`.
- df5d7885e: H1 `t_9637c51a`, cria `src/hooks/inbox/chipCounts.ts` e `src/hooks/inbox/__tests__/chipCounts.test.ts` para centralizar a regra dos contadores.
- No workspace atual, B1/B2 já estavam equivalentes na base do dia e o cherry-pick deles ficou vazio; H1 entrou como `449a3caf5` e a correção final como `dd0a3e992`.

Ponto 3 — testes de `StatusChips` omitidos no relato anterior:
- `src/components/inbox/__tests__/StatusChips.test.tsx` cobre `renders the 6 chips (no Spam — não existe no modelo)` para provar que o sexto chip é `archived`/Arquivadas.
- O mesmo arquivo cobre `mostra o ícone Archive apenas no chip Arquivadas` para provar que só Arquivadas renderiza o `Archive` com `aria-hidden="true"`.
- Prova verde do comando rodado agora: `Test Files  4 passed (4)` e `Tests  31 passed (31)`.

Ponto 4 — busca/tipo/data nos contadores:
- Nesta entrega, `countByChip` aplica os critérios estruturais que definem a mesma população base da lista por chip: `conversation_status`, mensagens, não lidas, responsável/perfil, adiadas, `showAll` e fila selecionada.
- Busca textual, tipo de contato e data não entram neste diff porque são filtros posteriores do painel, não parte do escopo deste cartão. A entrega atual fica completa sem alterar esses filtros.

## Arquivos no diff (`git diff --name-only dia/2026-10-11...HEAD`)
- `.tmp/relato.md`
- `src/components/inbox/ConversationListSidebar.tsx`
- `src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx`
- `src/components/inbox/__tests__/StatusChips.test.tsx`
- `src/components/inbox/conversation-list/StatusChips.tsx`
- `src/hooks/inbox/__tests__/chipCounts.test.ts`
- `src/hooks/inbox/chipCounts.ts`
- `src/hooks/inbox/useInboxFilters.ts`

## Verificações executadas
- `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx src/components/inbox/__tests__/StatusChips.identidade-profile.test.tsx src/hooks/inbox/__tests__/chipCounts.test.ts src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx` → `Test Files  4 passed (4)`, `Tests  31 passed (31)`.
- Script local de conferência no código atual → `ChipTab archived: True`, `COUNTER_TONE archived: True`, `Archive import/icon: True`, `aria-hidden icon: True`, `test renders the 6 chips: True`, `test Archive icon: True`, `countByChip used: True`.
- `git diff --stat dia/2026-10-11...HEAD` → 8 arquivos, 429 inserções e 106 remoções; `git diff dia/2026-10-11...HEAD | wc -c` → 40400 bytes, abaixo do limite de 90000.
