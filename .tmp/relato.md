Especialista: senior (vera)

# [refazer 1] retomar-e2e-a11y-tarefas-dashboard — régua axe button-name/aria-progressbar-name

## Ponto 1 — cherry-pick trouxe diff alheio (6 arquivos src + 11 arqs / 17,7k)
Refiz o escopo do zero: descartei o cherry-pick do 82a6fa78. O diff agora tem
EXATAMENTE 2 arquivos (5812 caracteres): `e2e/a11y-tarefas-dashboard.spec.ts`
(novo, 113 linhas) + 1 linha no `playwright.config.ts` (hunk do projeto
chromium-a11y). Zero `src/**`, zero migration, zero outro cartão.
Prova: `git diff HEAD --stat` abaixo.

## Ponto 2 — spec entregue vermelha (tasks mobile + dashboard 390/1280)
Vermelho SEM correção (base pura + spec, porta 4181):
`CI=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4181 npx playwright test --project=chromium-a11y`
→ `3 failed / 12 passed (4.0m)`; as 3 falhas são exatamente esta spec
(tasks mobile-390: 3x button-name no ModeSwitcher; dashboard 390+1280: 1x
aria-progressbar-name + 2x button-name no OnboardingChecklist). Tasks
desktop-1280 já passava sem fix (1 passed), como na tentativa anterior.
Verde COM a correção (mesmo comando, porta 4182, patch src temporário
NÃO commitado — ver Ponto 4): `15 passed (4.1m)`, EXIT=0. O teste morde:
só zera com os aria-labels; sem eles, falha nos mesmos 3 casos.

## Ponto 3 — risco de push na tentativa anterior
Nenhum `git push`, `gh`, deploy ou `supabase db push` nesta tentativa.
Contrato local-only cumprido; branch `v2/...` só existe no workspace local.

## Ponto 4 — spec exige src que o cartão proíbe (decisão do coordenador cumprida)
Conforme o comentário do coordenador neste cartão: SEM src no meu diff; o fix
de tela vai via t_b3901a0e (iris). A prova verde acima usou patch src
temporário e NÃO commitado (os mesmos 4 hunks do 82a6fa78: `aria-label={label}`
no ModeSwitcher; 2 aria-labels + `aria-label="Progresso do onboarding"` no
OnboardingChecklist), aplicado só para a rodada verde e REVERTIDO em seguida
(`git checkout --` nos 2 arquivos; `grep -c aria-label` = 0 nos dois após).
Nota: o HEAD do workspace (453e6b69f9) É a ponta de dia/2026-10-13, então a
prova vale como "worktree da base". NÃO FEITO aqui (vai no t_b3901a0e):
`src/components/tasks/shared/ModeSwitcher.tsx`,
`src/components/onboarding/OnboardingChecklist.tsx`.

## Arquivos (`git show HEAD --name-only`, colado: 3 arquivos no commit = 2 de código + este relatório)
.tmp/relato.md
e2e/a11y-tarefas-dashboard.spec.ts
playwright.config.ts

A spec tem 1 arquivo de teste com 2 casos de teste novos (2 chamadas test() em
loop sobre os viewports, 4 execuções: tasks 390/1280, dashboard 390/1280) —
confirmado por `playwright test --list --project=chromium-a11y` (4 linhas deste
spec) e pelas rodadas (3 failed + 1 passed no vermelho; 4 passed no verde).

## Juiz barato (repetição sem mudar a entrega)
Os 2 pontos do "ANTES DE ENTREGAR" não procedem: (1) este cartão não tem
merge/rebase de dia/2026-10-10 nem conflito — meu Ponto 1 é provado pelo
código do commit (2 arquivos, 5812 caracteres; 3 arquivos com este relatório); (2) a evidência de execução está neste relato
(comandos exatos + `3 failed/12 passed` e `15 passed`, EXIT=0 + tsc e2e/node
EXIT=0). O "Ponto 3" do juiz (pedir cherry-pick de 82a6fa78) é o oposto do
Ponto 1 da recusa deste cartão, que PROÍBE trazer aquele diff — confirmado pelo
coordenador em 13/10. Entrega de código inalterada; só esta nota foi adicionada.

## Verificações (resultado real)
- Diff de código (`git show HEAD --stat -- e2e playwright.config.ts`): 2 files, 114 insertions(+), 1 deletion(-); 5812 caracteres. O commit leva ainda `.tmp/relato.md` (este relatório, norma da fábrica).
- E2E vermelho sem patch: `3 failed / 12 passed (4.0m)` (log /tmp/hermes_bg_proc_2a75c65c2cb0.log).
- E2E verde com patch temporário: `15 passed (4.1m)`, EXIT=0 (log /tmp/prova-verde-0366.log).
- `zapp-verify . --rapido`: VERDE em tudo exceto `tipos`, que falha por OOM da
  máquina (tsc do projeto app morto com exit 137; 47/47 GB, load 59, vários tsc
  de outros agentes concorrendo) — NÃO é erro de tipo: `jev-juiz falha`
  diagnosticou "environment (0.75), rode de novo". Prova de que meu diff não
  tem erro de tipo: `tsc -p tsconfig.e2e.json --noEmit` (cobre a spec nova)
  EXIT=0 e `tsc -p tsconfig.node.json --noEmit` (cobre playwright.config.ts)
  EXIT=0, rodados nesta sessão. 1ª falta de deps (`bun install` resolveu);
  2ª de OOM (fora do meu alcance; fechar roda a verificação de novo e a carga oscila).
