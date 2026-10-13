Especialista: worker (geral)

## O que mudou e por quê
- `src/components/leaderboard/Leaderboard.tsx`: o `Button size="icon"` de atualizar (icon-only, so o icone `RefreshCw`) ganhou `aria-label="Atualizar ranking"` e `aria-pressed={isRefreshing}` — o estado de carregamento passa a vir tambem do hook `useLeaderboard` na ARIA (item 1 do cartao).
- `src/components/leaderboard/Leaderboard.tsx`: removido o bloco do botao "Ver ranking completo" (sem `onClick`, sem destino, nunca navegou) e o import `ChevronRight`, que so esse bloco usava (item 2 do cartao).

## Prova
- vermelho antes (mesmo contrato de a11y do repo, aplicado a uma copia do arquivo em `.tmp/a11y-escopo`):
  `node scripts/ci/a11y-button-name-ratchet.mjs --root .tmp/a11y-escopo` → `a11y button-name violations: 1 (baseline: 236)` — a unica violacao era o `Button size="icon"` sem nome acessivel.
- verde depois (mesmo comando, com o arquivo corrigido):
  `node scripts/ci/a11y-button-name-ratchet.mjs --root .tmp/a11y-escopo` → `a11y button-name violations: 0 (baseline: 236)`.
- ratchet do repo inteiro, antes → depois: `a11y button-name violations: 93` → `a11y button-name violations: 92` (exit 0 nas duas).
- suite do escopo, antes e depois da mudanca:
  `npx vitest run src/components/leaderboard src/hooks/gamification` → `Test Files 3 passed (3)` / `Tests 42 passed | 1 todo (43)`.
- typecheck: `npx tsc --noEmit` → `TSC_EXIT=0`.
- `git grep -n "Ver ranking completo" -- src e2e` → sem resultado (so o proprio arquivo citava antes; nenhum teste/rota dependia).

## Pontos do revisor ([refazer], cartao t_d93f2bca)
- Ponto 1 (aria no botao Atualizar): `Leaderboard.tsx` — `aria-label="Atualizar ranking"` e `aria-pressed={isRefreshing}` na mesma linha do `disabled={isRefreshing}`. Prova: ratchet do escopo 1 → 0.
- Ponto 2 (botao morto): `Leaderboard.tsx` — bloco `motion.div`/`Button` de "Ver ranking completo" e import `ChevronRight` removidos. Prova: `git grep` sem resultado e `git diff --stat` com 2 insercoes / 10 remocoes no unico arquivo.

## O que NAO fiz e por que
- Nao criei teste novo nem toquei em `useLeaderboard.ts`: "ARQUIVOS QUE PODE TOCAR" e `Leaderboard.tsx` (somente). A prova vermelho→verde usa o contrato de a11y que ja existe no repo (`scripts/ci/a11y-button-name-ratchet.mjs`), aplicado a uma copia do arquivo em `.tmp/` (nenhum arquivo de `src/` foi criado ou apagado).
- Nao rebaseei sobre `v2/ranking-erro-tentar-de-novo-261013052264ce` (t_a879eb31): o cartao manda aplicar sobre a branch do dia "ja com t_a879eb31 integrado", mas `dia/2026-10-13` ainda NAO contem esse trabalho, e a branch dele esta bem atras da do dia (o diff `dia/2026-10-13..a879` lista 181 arquivos, quase tudo reversao). Rebasear sobre ela reverteria o dia; fiz a mudanca direto na branch do dia. Risco de conflito no merge com a879 (mesmo arquivo) sinalizado em comentario no cartao.
