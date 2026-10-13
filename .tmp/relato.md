Especialista: Íris (area-front-componentes)

## Resultado
CONCLUÍDO.

## O que mudou e por quê
- `src/components/dashboard/GoalsDashboard.tsx`: cabeçalho da aba Metas com o seletor de período `Hoje / Esta Semana / Este Mês` (`ToggleGroup` single do design system, `aria-label="Período das metas"`, teclado nativo do Radix) e a faixa de datas do período em pt-BR ("13 de outubro de 2026", "13 out – 19 out", "outubro de 2026"). O corpo (4 KPIs + tabela + rail) renderiza quando o `isLoading` do hook é falso; enquanto carrega entra `GoalsLoadingSkeleton` (`role="status"`, `aria-label="Carregando metas"`), então a tela mostra esqueleto em vez de "0%". Tokens já existentes (`bg-muted/40`, `border-border/50`, `data-[state=on]:bg-primary`), mesmo padrão do `SLAHistoryDashboard`.
- `src/components/dashboard/goals/GoalsTable.tsx`: `title`/`subtitle` viraram props opcionais com os valores antigos como default; a aba Metas passa "Metas do dia / da semana / do mês", coerente com o período escolhido. Os demais chamadores seguem no default.
- `src/components/dashboard/__tests__/GoalsDashboard.test.tsx` (novo): renderiza o `GoalsDashboard` real com react-query e o supabase mockado por contagem; dispara cliques e lê a tela.
- `src/hooks/analytics/useGoalsDashboard.ts`: 2 linhas — `loadingProfile` entra no OR de `isLoading`. As 4 queries de contagem dependem de `profile.id`, logo o `isLoading` do hook precisa acompanhar a query de perfil para o esqueleto cobrir a primeira fase de carregamento e o "0%" sair da tela.

## Prova (comando e linha de resultado)
- Verde: `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 passed (1), Tests 4 passed (4)`, 0 falhas, 0 pulados.
- Vermelho antes: com os 3 arquivos de produção no estado do cartão pai (`149d7c860`), `npx vitest run src/components/dashboard/__tests__/GoalsDashboard.test.tsx` → `Test Files 1 failed (1), Tests 4 failed (4)`.
- Regressão das vizinhas: `npx vitest run GoalsDashboard.test.tsx DailyGoalsCard.test.tsx GoalsConfigDialog.test.tsx useGoalsDashboard.test.tsx useGoalsDashboard.contagem.test.tsx` → `Test Files 5 passed (5), Tests 50 passed (52)`, 0 falhas, 0 pulados (1 expected fail, 1 todo já existentes).
- Ramos cobertos pelos 4 testes: carregando (esqueleto presente, "0%" e "Progresso Geral" fora da árvore), dados carregados (18% calculado), troca para "Este Mês" (título "Metas do mês", faixa de datas do mês, alvo mensal `2 / 1.000` no lugar do diário `2 / 50`, filtro `created_at` igual a `startOfMonth`), troca para "Esta Semana" (título da semana e alvo `2 / 250`) e o `radiogroup` acessível com os 3 `radio`.

## Escopo dos arquivos (fatos)
- Commit deste cartão `aebbd92b6`: GoalsDashboard.tsx, GoalsTable.tsx, useGoalsDashboard.ts e o teste novo — 4 arquivos.
- `src/components/dashboard/GoalsConfigDialog.tsx`: alteração do commit do cartão pai `2f8bacba9`, trazida junto com a faixa inteira do cartão pai, conforme a instrução de dependência do próprio cartão.
- `src/hooks/analytics/useGoalsDashboard.ts`: as 2 linhas citadas acima, necessárias ao critério "sem piscar 0%".
