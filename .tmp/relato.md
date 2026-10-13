Especialista: worker (geral)

CONCLUÍ: os dois pontos do [refazer] estão implementados e provados com execução real (teste vermelho→verde e o contrato de a11y do CI).

## O que mudou e por quê
- `src/components/leaderboard/Leaderboard.tsx`: o `Button size="icon"` de atualizar (so o icone `RefreshCw`, sem nome acessivel) recebeu `aria-label="Atualizar ranking"` e `aria-pressed={isRefreshing}` — o estado de carregamento do hook `useLeaderboard` passa a aparecer tambem na ARIA (item 1 do cartao).
- `src/components/leaderboard/Leaderboard.tsx`: removido o bloco do botao "Ver ranking completo" (sem `onClick`, sem destino, nunca navegou) e o import `ChevronRight`, usado so por esse bloco (item 2 do cartao).
- `src/components/leaderboard/__tests__/Leaderboard.test.tsx` (novo): prova o defeito e a correcao — nome acessivel no botao de atualizar; `aria-pressed` acompanhando `isRefreshing` (false/habilitado parado, true/desabilitado carregando); ausencia do botao morto mesmo com o ranking cheio. Renderiza o componente REAL, so o hook e fixado.

## Prova (comandos rodados agora, com a linha de resultado)
- vermelho antes — teste novo rodando contra o componente SEM a correcao (restaurado de `453e6b69f9`):
  `npx vitest run src/components/leaderboard/__tests__/Leaderboard.test.tsx` → `Tests 4 failed (4)`, com `Unable to find an accessible element with the role "button" and name "Atualizar ranking"` e `AssertionError: expected <button …> to be null` para o "Ver ranking completo".
- verde depois — mesmo comando, componente corrigido: → `Test Files 1 passed (1)`, `Tests 4 passed (4)`.
- suite do escopo inteira: `npx vitest run src/components/leaderboard src/hooks/gamification` → `Test Files 3 passed (3)`, `Tests 42 passed | 1 todo (43)`.
- contrato de a11y do CI sobre copia do arquivo em `.tmp/a11y-escopo`: antes `a11y button-name violations: 1 (baseline: 236)`; depois `a11y button-name violations: 0 (baseline: 236)`. No repo inteiro: `violations: 93` → `violations: 92` (exit 0 nas duas).
- typecheck: `npx tsc --noEmit` → `TSC_EXIT=0`.
- `git grep -n "Ver ranking completo" -- src e2e` → sem resultado (nada mais usava o botao).

## Pontos do revisor ([refazer], cartao t_d93f2bca)
Ponto 1: `aria-label="Atualizar ranking"` e `aria-pressed={isRefreshing}` no botao de atualizar — `src/components/leaderboard/Leaderboard.tsx`; prova: `src/components/leaderboard/__tests__/Leaderboard.test.tsx` (vermelho `Tests 4 failed (4)` → verde `Tests 4 passed (4)`) e `a11y button-name violations: 1 → 0` no escopo.
Ponto 2: removido o bloco do botao morto "Ver ranking completo" (sem `onClick`) e o import `ChevronRight` — `src/components/leaderboard/Leaderboard.tsx`; prova: teste `nao existe o botao morto` (vermelho `AssertionError: expected <button …> to be null` → verde) e `git grep -n "Ver ranking completo" -- src e2e` sem resultado.

## Escopo do diff (o que o `git diff --stat dia/2026-10-13...HEAD` mostra)
- `src/components/leaderboard/Leaderboard.tsx` — producao: 2 insercoes, 10 remocoes.
- `src/components/leaderboard/__tests__/Leaderboard.test.tsx` — teste novo do defeito (exigido pelo juiz do fechar: "teste que prova o defeito, no commit").
- `.tmp/relato.md` — este relato.
Nenhum outro arquivo. O cartao pede "alteracao SO em Leaderboard.tsx": o unico arquivo de PRODUCAO tocado e esse; o teste novo esta no mesmo modulo e prova o defeito. `useLeaderboard.ts` nao foi tocado (o hook ja expoe `isRefreshing`).

## Contexto de integracao (fato medido, para o integrador)
- `dia/2026-10-13` ainda NAO contem t_a879eb31, e a branch daquele cartao esta muito atras da do dia: `git diff --stat dia/2026-10-13..v2/ranking-erro-tentar-de-novo-261013052264ce` lista 181 arquivos (quase tudo reversao). Por isso a correcao foi feita direto na branch do dia, sem rebase sobre a branch antiga.
- a879 e este cartao mexem no mesmo arquivo (`Leaderboard.tsx`), nos trechos do import `lucide-react` e do bloco `isLoading ? … : agents.length > 0 ? …`. O merge dos dois vai precisar de resolucao manual mantendo as DUAS mudancas (o estado de erro de a879 + o `aria-label`/`aria-pressed` e a remocao do "Ver ranking completo" daqui). Registrado tambem em comentario no cartao t_d93f2bca.
