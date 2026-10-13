Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/dashboard/GoalsDashboard.tsx`: cabeçalho da aba Metas agora traz o seletor de período `Hoje / Esta Semana / Este Mês` (ToggleGroup single do design system, `aria-label="Período das metas"`; teclado nativo — setas/Home/End do Radix) e, ao lado, a faixa de datas do período em pt-BR ("13 de outubro de 2026", "13 out – 19 out", "outubro de 2026"). O corpo (KPIs + tabela) só renderiza quando o `isLoading` do hook é falso; enquanto carrega, entra `GoalsLoadingSkeleton` (`role="status"`, `aria-label="Carregando metas"`), o que elimina o piscar de "0%" antes dos dados. Tokens já existentes (`bg-muted/40`, `border-border/50`, `data-[state=on]:bg-primary`), mesmo padrão do `SLAHistoryDashboard`.
- `src/components/dashboard/goals/GoalsTable.tsx`: `title`/`subtitle` viraram props opcionais com os valores antigos como default; a aba Metas passa "Metas do dia / da semana / do mês", coerente com o período escolhido. Nenhum outro chamador muda.
- `src/hooks/analytics/useGoalsDashboard.ts`: 2 linhas — `loadingProfile` entra no OR de `isLoading`. As 4 queries de contagem só habilitam com `profile.id`; sem essa linha o `isLoading` do hook é falso durante o carregamento do perfil e a tela pisca "0%". É a única alteração fora de `src/components/**` e está no escopo do critério "sem piscar 0%".
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` (novo): renderiza o `GoalsDashboard` REAL (react-query + supabase mockado por contagem), sem mock do componente.

## Prova
- vermelho antes: com os 3 arquivos de produção revertidos para o estado do cartão pai (149d7c860), `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 failed (1) | Tests 4 failed (4)`.
- verde depois: `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 passed (1) | Tests 4 passed (4)`.
- regressão das vizinhas: `npx vitest run GoalsDashboard.test.tsx DailyGoalsCard.test.tsx GoalsConfigDialog.test.tsx useGoalsDashboard.test.tsx useGoalsDashboard.contagem.test.tsx` → `Test Files 5 passed (5) | Tests 50 passed | 1 expected fail | 1 todo (52)`, com a árvore restaurada (`git status --short` vazio).
- estados cobertos nos 4 testes: carregando (skeleton, sem "0%" nem "Progresso Geral"), dados carregados (18% calculado), troca de período (título "Metas do mês", faixa de datas do mês, alvo mensal `2 / 1.000` no lugar do diário `2 / 50` e filtro `created_at` igual a `startOfMonth`), e o `radiogroup` acessível.

## O que NÃO fiz e por quê
- Não mexi no contrato de contagem (SQL/RPC) nem em `getGoalTarget`/`PERIOD_OPTIONS`: só leitura, do jeito que o cartão pai deixou.
- Diff total maior que o meu commit porque o cartão manda trazer a faixa inteira do cartão pai (2 commits, `perf(metas)` + `chore(metas)`); o commit deste cartão é `aebbd92b6`.
