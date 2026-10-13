Especialista: Íris (area-front-componentes)

## Resultado
CONCLUÍDO. A aba Metas voltou a ter o seletor de período `Hoje / Esta Semana / Este Mês`, com a faixa de datas do período ao lado, título da tabela coerente com o período escolhido e esqueleto de carregamento no lugar dos valores — a tela não mostra mais "0%" antes dos dados.

## O que mudou e por quê
- `src/components/dashboard/GoalsDashboard.tsx`: seletor de período (`ToggleGroup` single do design system, `aria-label="Período das metas"`, teclado nativo do Radix) no cabeçalho e a faixa de datas em pt-BR ("13 de outubro de 2026", "13 out – 19 out", "outubro de 2026"). O corpo (4 KPIs + tabela + rail) só renderiza quando o `isLoading` do hook é falso; enquanto carrega entra `GoalsLoadingSkeleton` (`role="status"`, `aria-label="Carregando metas"`). Tokens já existentes (`bg-muted/40`, `border-border/50`, `data-[state=on]:bg-primary`), mesmo padrão do `SLAHistoryDashboard`.
- `src/components/dashboard/goals/GoalsTable.tsx`: `title`/`subtitle` viraram props opcionais com os valores antigos como default; a aba Metas passa "Metas do dia / da semana / do mês". Nenhum outro chamador muda.
- `src/hooks/analytics/useGoalsDashboard.ts`: 2 linhas — `loadingProfile` entra no OR de `isLoading`. As 4 contagens só habilitam com `profile.id`; sem isso o `isLoading` é falso enquanto a query de perfil carrega e a tela pisca "0%".
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` (novo): renderiza o `GoalsDashboard` REAL (react-query + supabase mockado por contagem), sem mock do componente.

## Prova (comando e linha de resultado)
- vermelho antes: com GoalsDashboard.tsx, GoalsTable.tsx e useGoalsDashboard.ts revertidos para o estado do cartão pai (`149d7c860`), `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 failed (1); Tests 4 failed (4)`.
- verde depois: `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 passed (1); Tests 4 passed (4)`.
- regressão das vizinhas: `npx vitest run .../GoalsDashboard.test.tsx .../DailyGoalsCard.test.tsx .../GoalsConfigDialog.test.tsx .../useGoalsDashboard.test.tsx .../useGoalsDashboard.contagem.test.tsx` → `Test Files 5 passed (5); Tests 50 passed | 1 expected fail | 1 todo (52)`, árvore restaurada (`git status --short` vazio).
- ramos cobertos pelos 4 testes: carregando (skeleton presente, sem "0%" nem "Progresso Geral"), dados carregados (18% calculado), troca para "Este Mês" (título "Metas do mês", faixa de datas do mês, alvo mensal `2 / 1.000` no lugar do diário `2 / 50`, filtro `created_at` = `startOfMonth`), troca para "Esta Semana" (título da semana e alvo `2 / 250`), e o `radiogroup` acessível com os 3 `radio`.

## Arquivos do diff
- Meu commit deste cartão é `aebbd92b6` e toca 4 arquivos: GoalsDashboard.tsx, GoalsTable.tsx, useGoalsDashboard.ts e o teste novo.
- `src/components/dashboard/GoalsConfigDialog.tsx` aparece no diff total porque o cartão manda trazer a faixa inteira do cartão pai ("Traga o trabalho dele inteiro"): é a alteração do commit `2f8bacba9`, não uma edição minha.
- `src/hooks/analytics/useGoalsDashboard.ts` é arquivo do worker (hooks); as 2 linhas minhas (`loadingProfile` no OR de `isLoading`) são indispensáveis ao critério "sem piscar 0%", porque sem elas o skeleton não cobre a fase de carregamento do perfil.
