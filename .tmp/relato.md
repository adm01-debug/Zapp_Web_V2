Especialista: worker (geral)

## O que mudou e por quê
- `src/components/leaderboard/Leaderboard.tsx`: o `Button size="icon"` de atualizar (so icone `RefreshCw`, sem nome acessivel) ganhou `aria-label="Atualizar ranking"` e `aria-pressed={isRefreshing}` — o estado de carregamento do hook `useLeaderboard` passa a aparecer tambem na ARIA (item 1 do cartao).
- `src/components/leaderboard/Leaderboard.tsx`: removido o bloco do botao "Ver ranking completo" (sem `onClick`, sem destino, nunca navegou) e o import `ChevronRight`, que so esse bloco usava (item 2 do cartao).
- `src/components/leaderboard/__tests__/Leaderboard.test.tsx` (novo): prova o defeito e a correcao — nome acessivel no botao de atualizar, `aria-pressed` acompanhando `isRefreshing` (false/habilitado parado, true/desabilitado carregando) e ausencia do botao morto mesmo com ranking cheio. Renderiza o componente REAL, so o hook e fixado.

## Prova
- vermelho antes (teste novo rodando contra o componente SEM a correcao, restaurado de `453e6b69f9`):
  `npx vitest run src/components/leaderboard/__tests__/Leaderboard.test.tsx` → `Tests 4 failed (4)` (`Unable to find an accessible element with the role "button" and name "Atualizar ranking"`; e `AssertionError: expected <button ...> to be null` para o "Ver ranking completo").
- verde depois (mesmo comando, componente corrigido):
  `npx vitest run src/components/leaderboard/__tests__/Leaderboard.test.tsx` → `Test Files 1 passed (1)` / `Tests 4 passed (4)`.
- suite do escopo inteira, antes e depois da correcao:
  `npx vitest run src/components/leaderboard src/hooks/gamification` → `Test Files 3 passed (3)` / `Tests 42 passed | 1 todo (43)`.
- contrato de a11y do repo (mesmo ratchet do CI), aplicado a uma copia do arquivo em `.tmp/a11y-escopo`:
  antes `node scripts/ci/a11y-button-name-ratchet.mjs --root .tmp/a11y-escopo` → `a11y button-name violations: 1 (baseline: 236)`;
  depois → `a11y button-name violations: 0 (baseline: 236)`.
  No repo inteiro: `violations: 93` → `violations: 92` (exit 0 nas duas).
- typecheck: `npx tsc --noEmit` → `TSC_EXIT=0`.
- `git grep -n "Ver ranking completo" -- src e2e` → sem resultado (nada mais dependia do botao).

## Pontos do revisor ([refazer], cartao t_d93f2bca)
- Ponto 1 (aria no botao Atualizar): `Leaderboard.tsx` — `aria-label="Atualizar ranking"` e `aria-pressed={isRefreshing}` na mesma linha do `disabled={isRefreshing}`. Prova: teste vermelho→verde + ratchet do escopo 1 → 0.
- Ponto 2 (botao morto): `Leaderboard.tsx` — bloco `motion.div`/`Button` de "Ver ranking completo" e import `ChevronRight` removidos. Prova: `git grep` sem resultado e o teste do botao morto.

## O que NÃO fiz e por que
- Nao toquei em `useLeaderboard.ts`: o cartao diz que o problema e de apresentacao e manda nao mexer no hook (o hook ja expoe `isRefreshing`).
- O cartao listava `Leaderboard.tsx` como unico arquivo e pedia "suite/contratos do escopo passando"; o juiz do fechar exigiu teste NO COMMIT provando o defeito, entao adicionei `__tests__/Leaderboard.test.tsx`. E a unica adicao fora daquele arquivo, e ela nao altera nenhum arquivo de producao: `git diff --stat` de `Leaderboard.tsx` continua com 2 insercoes / 10 remocoes.
- Nao rebaseei sobre `v2/ranking-erro-tentar-de-novo-261013052264ce` (t_a879eb31): o cartao manda aplicar sobre a branch do dia "ja com t_a879eb31 integrado", mas `dia/2026-10-13` ainda NAO contem esse trabalho, e essa branch esta bem atras da do dia (o diff `dia/2026-10-13..a879` lista 181 arquivos, quase tudo reversao). Rebasear sobre ela reverteria o dia; fiz a mudanca direto na branch do dia. Risco de conflito no merge com a879 (mesmo arquivo) sinalizado em comentario no cartao.
