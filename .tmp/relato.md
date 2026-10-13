Especialista: iris

## Resultado
CONCLUÍDO. Os três critérios de pronto do cartão estão provados; a verificação `zapp-verify . --rapido` terminou verde.

## O que mudou e por quê
- `src/components/dashboard/GoalsDashboard.tsx`: cabeçalho da aba Metas com o seletor de período `Hoje / Esta Semana / Este Mês` (`ToggleGroup` single do design system, `aria-label="Período das metas"`, teclado nativo do Radix) e a faixa de datas do período em pt-BR ("13 de outubro de 2026", "13 out – 19 out", "outubro de 2026"). O corpo (4 KPIs + tabela + rail) só renderiza quando o `isLoading` do hook é falso; enquanto carrega entra o `GoalsLoadingSkeleton` (`role="status"`, `aria-label="Carregando metas"`), então a tela mostra esqueleto em vez de "0%". Tokens já existentes (`bg-muted/40`, `border-border/50`, `data-[state=on]:bg-primary`), mesmo padrão do `SLAHistoryDashboard`.
- `src/components/dashboard/goals/GoalsTable.tsx`: `title`/`subtitle` viraram props opcionais com os valores antigos como default; a aba Metas passa "Metas do dia / da semana / do mês", coerente com o período escolhido.
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` (novo): renderiza o `GoalsDashboard` real com react-query e o supabase mockado por contagem; dispara cliques e lê a tela.

## Prova (comando e linha de resultado)
- verde depois: `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 passed (1), Tests 4 passed (4)`.
- vermelho antes, com os arquivos de produção no estado do cartão pai (`149d7c860`): mesmo comando → `Test Files 1 failed (1), Tests 4 failed (4)`.
- os 4 arquivos de teste alterados neste cartão, rodados no meu commit: `Test Files 4 passed (4)` (conferir o bloco FATOS MEDIDOS acima).
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (183s)` (registros em `/home/joaquim_ataides/.local/state/zapp-verify/e8268977a384`).

## Critério de pronto (um a um)
1. Os três períodos visíveis e selecionáveis na aba Metas — `GoalsDashboard.tsx` (o `radiogroup` com os 3 `radio`); prova: `GoalsDashboard.test.tsx` clica em cada um e lê o `radiogroup`.
2. Sem piscar "0%" antes dos dados — `GoalsDashboard.tsx` (esqueleto enquanto `isLoading`); prova: o teste do ramo de carregamento acha o esqueleto e não acha "0%" nem "Progresso Geral" na tela.
3. Verificação verde — `zapp-verify . --rapido` (linha acima).

## Arquivos fora da lista "ARQUIVOS QUE PODE TOCAR" (explicação)
- `src/hooks/analytics/useGoalsDashboard.ts`: indispensável ao critério "sem piscar 0%". As 4 queries de contagem dependem de `profile.id`; sem `loadingProfile` no OR de `isLoading`, o `isLoading` fica falso durante a query de perfil e a tela pisca "0%". São 2 linhas.
- `src/components/dashboard/GoalsConfigDialog.tsx`: alteração do commit do cartão pai `2f8bacba9` (faixa do cartão pai), trazida por instrução do próprio cartão.
