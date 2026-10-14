Especialista: semisenior (area-front-componentes)

## O que mudou e por quê
- Só este relato (`.tmp/relato.md`). Nenhum arquivo de código mudou porque o
  pedido original já está implementado na base `dia/2026-10-12` pelo commit
  32c68d56a (chip "Arquivadas" em StatusChips + suíte de 12 testes). O BLOQUEIO
  do pedido original continua valendo (decisão do Joaquim pendente, Ponto 1),
  então codar de novo seria violar o cartão.

## Pontos da recusa (rodada 1)
- Ponto 1 (estado da decisão 20261010-165059-1785-sem-tarefa): NÃO CHEGOU.
  `hermes-decisoes 20261010-165059-1785-sem-tarefa` em 14/10/2026 retorna
  "(ainda sem resposta)". Falta: escolher (a) ligar o flag `inbox.status-fsm`
  junto, (b) entregar só com o flag ligado ou (c) não fazer. Quem decide:
  Joaquim. Pendente desde 10/10/2026 16:50:59-03:00. O default do flag NÃO foi
  alterado (nenhum código tocado).
- Ponto 2 (chip já está na base):
  `git log --oneline -1 32c68d56a -- src/components/inbox/conversation-list/StatusChips.tsx` →
  `32c68d56a3 feat(inbox): filtro Arquivadas lista so conversation_status archived (B2`
  `git show --stat 32c68d56a` → commit 32c68d56a37876f05e2bf2d96e5d2535436a024a
  (Hermes Senior, 11/10/2026, Cartão V2: 2610111139cb2b), 5 files changed,
  183 insertions(+), 66 deletions(-):
  `src/components/inbox/conversation-list/StatusChips.tsx | 17 +++-`,
  `src/components/inbox/__tests__/StatusChips.test.tsx | 31 ++++-`,
  `src/hooks/inbox/useInboxFilters.ts | 13 ++-`,
  `src/hooks/inbox/__tests__/useInboxFilters.arquivadas.test.tsx | 110 ++++` (novo),
  `.tmp/relato.md | 78 ++++-----------`.
- Ponto 3 (vitest verde + vermelho, saídas brutas):
  VERDE — `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx`
  (base atual, com o chip) →
  `Test Files  1 passed (1)` / `Tests  12 passed (12)` (1.34s).
  VERMELHO — mesmo teste contra `StatusChips.tsx` do commit pai de 32c68d56a
  (`git show 32c68d56a^:...StatusChips.tsx`, sem 'archived'):
  `Test Files  1 failed (1)` / `Tests  6 failed | 6 passed (12)`; falha-tipo:
  `screen.getByTestId('status-chip-archived')` → Unable to find
  (`StatusChips.test.tsx:142`). Arquivo restaurado em seguida
  (`git status --short` limpo) e verde reconfirmado 12/12.
- Ponto 4 (relato só deste cartão): este `.tmp/relato.md` é o do cartão
  t_6e0d460c (branch `v2/chip-arquivadas-statuschips-26101223569ffd`);
  descreve só o chip "Arquivadas". Nenhum relato de outro cartão foi tocado.

## Prova
- Verde: `Test Files  1 passed (1)` / `Tests  12 passed (12)`
- Vermelho: `Test Files  1 failed (1)` / `Tests  6 failed | 6 passed (12)`
- `zapp-verify . --rapido`: VERDE SEM BANCO (9s); `banco_local` NÃO VERIFICADO
  (sem nome de conjunto — sem migration no diff, nada a verificar no banco)

## Arquivos (`git diff --name-only dia/2026-10-12...HEAD`)
- .tmp/relato.md (único; `git status --short` limpo fora ele)

## O que NÃO fiz e por quê
- Não alterei `StatusChips.tsx` nem seu teste: o pedido original já está na
  base via 32c68d56a e a decisão-bloqueio manda NÃO codar sem a resposta.
- Não alterei o default do flag `inbox.status-fsm` (regra do cartão).
- Não citei cláusula "já resolvido" do cartão: ela não existe no texto; o que
  existe é o BLOQUEIO, cumprido aqui (reporte em vez de código).

Refazer 1 (só o relato, 4 pontos) concluído; o pedido original segue bloqueado
na decisão do Joaquim desde 10/10 (Ponto 1).

CONCLUÍ o refazer.
