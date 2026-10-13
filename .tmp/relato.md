Especialista: iris

## Arquivos fora de "ARQUIVOS QUE PODE TOCAR" (justificativa; ponto 1 do juiz)
Além de `GoalsDashboard.tsx`, `GoalsTable.tsx` e o teste novo (que são a lista), o diff toca 3 arquivos que vêm do CARTÃO PAI `t_84c9c76e` (a seção DEPENDÊNCIA do cartão manda trazer a faixa do pai por cherry-pick):
- `src/hooks/analytics/useGoalsDashboard.ts` — o pai reescreve as consultas para contagem (`head: true`), soma o filtro `sender='agent'` e cria a consulta de resolvidas; AQUI entra também `loadingProfile` no `isLoading`, indispensável ao critério "sem piscar 0%" (sem isso o `isLoading` fica falso durante a query de perfil).
- `src/components/dashboard/GoalsConfigDialog.tsx` — alterado só pelo pai (2 linhas), vem junto da faixa.
- `src/hooks/analytics/__tests__/useGoalsDashboard.contagem.test.tsx` e `.../useGoalsDashboard.test.tsx` e `.../GoalsConfigDialog.test.tsx` — testes do pai que acompanham a faixa.
Reverter esses arquivos quebraria a faixa do pai e o critério 2. Não há achado fora de escopo: é a dependência declarada no próprio cartão.

## O que mudou e por quê
- `src/components/dashboard/GoalsDashboard.tsx` (este cartão): cabeçalho da aba Metas com o seletor de período `Hoje / Esta Semana / Este Mês` (`ToggleGroup` single do design system, `aria-label="Período das metas"`, teclado nativo do Radix), faixa de datas do período em pt-BR e título dinâmico ("Metas do dia / da semana / do mês"). O corpo (4 KPIs + tabela + rail) só renderiza quando o `isLoading` do hook é falso; enquanto carrega entra o `GoalsLoadingSkeleton` (`role="status"`, `aria-label="Carregando metas"`), então a tela mostra esqueleto em vez de piscar "0%". Tokens já existentes (`bg-muted/40`, `border-border/50`, `data-[state=on]:bg-primary`).
- `src/components/dashboard/goals/GoalsTable.tsx` (este cartão): `title`/`subtitle` viraram props opcionais com os valores antigos como default; a aba Metas passa os títulos coerentes com o período.
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` (NOVO, este cartão): renderiza o `GoalsDashboard` real com react-query e o supabase mockado, clica em cada período e lê a tela.

## `useGoalsDashboard.ts` (honestamente, ponto 1 da recusa)
O diff é MAIOR que "2 linhas": a frase anterior estava errada e foi removida. O que o diff faz nesse arquivo:
- PARCELA DO CARTÃO PAI `t_84c9c76e` (`perf(metas): conta no banco em vez de baixar linhas do periodo`, sha `4a1b9fdb92` / commit `63ff34c75e`, base `dia/2026-10-12`): as 4 consultas passam a CONTAR no banco (`{ count: 'exact', head: true }`) em vez de baixar as linhas do período; entra o filtro `sender='agent'`; entra a consulta NOVA de resolvidas (`.maybeSingle()` sobre `conversation_outcomes`); e o teste novo `useGoalsDashboard.contagem.test.tsx`.
- PARCELA DESTE CARTÃO: `loadingProfile` no OR do `isLoading` (a linha `const isLoading = loadingProfile || loadingMessages || ...`). Sem ela o `isLoading` fica falso durante a query de perfil e a tela pisca "0%" — é o que fecha o critério 2 deste cartão.

## Testes tocados (ponto 2 da recusa, com origem)
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` — NOVO, deste cartão.
- `src/components/dashboard/__tests__/GoalsConfigDialog.test.tsx` — do cartão pai `t_84c9c76e` (acompanha a mudança de `GoalsConfigDialog.tsx`).
- `src/hooks/analytics/__tests__/useGoalsDashboard.contagem.test.tsx` — NOVO, do cartão pai `t_84c9c76e`.
- `src/hooks/analytics/__tests__/useGoalsDashboard.test.tsx` — do cartão pai `t_84c9c76e`.

## Prova
- vermelho antes (produção no estado do pai, `6014ab961f`): `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 failed (1)` / `Tests 4 failed (4)` (o seletor não existe: `getByRole('radio', { name: 'Esta Semana' })` falha em `GoalsDashboard.test.tsx:155`).
- verde depois: mesmo comando → `Test Files 1 passed (1)` / `Tests 4 passed (4)`.
- os 4 arquivos de teste do cartão: `npx vitest run <os 4>` → `Test Files 4 passed (4)` / `Tests 47 passed | 1 expected fail | 1 todo (49)` (ponto 4 da recusa: é citado o `1 expected fail` e o `1 todo`, não omitidos).

## Captura nos 3 períodos, claro/escuro, 360 e 1280 px (item 3 do cartão, ponto 3 da recusa)
NÃO FOI FEITA. Motivo: não existe projeto Playwright com sessão simulada para a tela de Metas; os projetos permitidos (`chromium-contacts-visual`, `chromium-talkx-visual`, `chromium-email-navy`, `chromium-theme`) cobrem outras telas, e a regra R1 proíbe usar `chromium-authenticated`/`e2e/.auth`. A cobertura dos 3 períodos é dada pelo teste de unidade clicando em cada `radio`, nos 3 casos.

## Verificação do cartão (`zapp-verify . --rapido`) — NÃO CONCLUÍ pelo ambiente
- `zapp-verify . --rapido` → `VERIFY: VERMELHO em tipos`; o passo `tipos` falha em EXECUÇÃO: `tsc ... exit 137` (`Killed` = SIGKILL/OOM) e `tipos.sh: typecheck rápido falhou na EXECUÇÃO; refazendo com o ratchet completo` → `tsc -b falhou com exit null`. É falha de execução, não reprovação de tipo.
- 5 tentativas entre 06:58 e 07:26 (logs em `/home/joaquim_ataides/.local/state/zapp-verify/7c156c3084e3/tipos.log` e `.tmp/verify.log`), todas com a máquina sob pressão extrema: load average 35–137, swap 100% em uso (`Free swap = 0kB`), 4–5 `tsc` de outros agentes ao mesmo tempo. `tsc -p tsconfig.node.json` passa (`RC=0`), confirmando que o TS falha só quando o projeto grande é morto por falta de memória.
- Sem banco: `OK db_guard`.

## Estado da branch (motivo da recusa "a branch andou depois do fechar")
Rebuild limpo sobre `dia/2026-10-13` (`96dd72dc5f`): commits trazidos por `git cherry-pick` — `6014ab961f` (pai `t_84c9c76e`, perf), `b71e3fb644` (este cartão, feat) e `8533b1a2a5` (relato). `git diff 87267bd919 HEAD -- src` é VAZIO: o conteúdo de `src/` iguala a entrega anterior; o que saiu foram os commits `chore(metas): relato ...` empilhados DEPOIS do fechar (eles só tocavam `.tmp/relato.md`), que eram a causa da branch ter andado.
