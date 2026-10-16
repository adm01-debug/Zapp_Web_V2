Especialista: iris

## O que mudou e por quê
- src/components/dashboard/overview/DailyMetricsKpis.tsx (novo): a faixa pedida pelo cartão — cartões com valor, variação e mini-série. Valor = TOTAL do período devolvido pela RPC; variação = último dia contra o anterior (rótulo "vs. dia anterior"); mini-série = um ponto por dia do período. Estados separados: skeleton (`daily-kpis-skeleton`), erro (`daily-kpis-error`) e vazio explícito (`daily-kpis-empty`, "Sem métricas diárias nos últimos 7 dias") — nenhum deles se confunde com zero real. Só staff: `if (isStaff !== true) return null`. Rodapé `daily-kpis-caption` diz que o número do topo é total do período (o número não é lido como "hoje"; os KPIs de hoje são a faixa de cima).
- src/components/dashboard/overview/dailyMetricsKpisMath.ts (novo): `lastDayVariationPct` (pura) — % do último dia sobre o anterior; sem dia anterior ou base 0 devolve null (não inventa percentual). Ficou fora do .tsx porque exportar não-componente ali reprovava o ratchet de lint (react-refresh/only-export-components).
- src/components/dashboard/overview/__tests__/DailyMetricsKpis.test.tsx (novo): prova renderizando o componente REAL sobre o hook REAL; mocka só a RPC (`supabase.rpc`) e `useCRMAdminAccess`.
- src/components/dashboard/DashboardView.tsx: import + nova zona "Últimos 7 dias" logo depois de "Números de hoje", com `{isStaff && …}` e dentro do `SectionErrorBoundary`, para não sobrar zona vazia para quem não é staff nem derrubar a tela se a faixa falhar.
- src/components/dashboard/overview/DailyMetricsKpis.tsx: o `reduce` da soma ficou `reduce<number>` — sem o genérico o acumulador vinha `number | null` e o `tsc -b` reprovava (TS18047/TS2322). Corrigido no commit 8875b9ec2.

## Fora da lista "ARQUIVOS QUE PODE TOCAR" — por quê (cada um)
- supabase/migrations/20261012235745_dashboard_daily_series.sql, scripts/db-audit/dashboard-daily-series.test.sh, .github/workflows/db-guard.yml, src/hooks/dashboard/useDailyMetricsKpis.ts: NÃO foram tocados por mim — são o cartão pai t_8f12e328 (a dependência que o meu cartão exige), trazidos por cherry-pick da faixa dia/2026-10-12..732aa9d42 porque a base dia/2026-10-13 não os tinha. Sem eles a faixa não compila (o hook não existe). Se o pipeline quer isso só na base, é decisão do integrador.
- src/components/dashboard/overview/dailyMetricsKpisMath.ts: arquivo NOVO do escopo do título (faixa de KPIs na pasta overview), criado para o helper puro `lastDayVariationPct` — dentro do .tsx ele reprovava o ratchet de lint (`react-refresh/only-export-components`) e sem exportá-lo não haveria teste unitário da variação % que o cartão pede. Não altera dado, RPC nem contrato.

## Prova
- vermelho antes: com a faixa forçada a `return null` (mutação temporária em DailyMetricsKpis.tsx, revertida por cópia em .tmp) → `npx vitest run src/components/dashboard/overview/__tests__/DailyMetricsKpis.test.tsx` → `Tests 5 failed | 3 passed (8)` (as 5 que exigem a faixa aparecem; as 3 que passam são as unitárias de `lastDayVariationPct` e a de não-staff, que esperam ausência).
- verde depois (commit 8875b9ec2): `npx vitest run src/components/dashboard/overview/__tests__/DailyMetricsKpis.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`; e `npx vitest run …/DailyMetricsKpis.test.tsx src/components/dashboard/__tests__/DashboardView.test.tsx src/components/dashboard/__tests__/DashboardView.section-error.test.tsx` → `Test Files 3 passed (3); Tests 14 passed (14)`, zero pulados.
- tipos: `node scripts/ci/typecheck-ratchet.mjs` → `Typecheck ratchet: baseline=0, atual=0, removidas=0, novas=0 / OK: nenhum novo erro de tipo foi introduzido.`
- lint: pre-commit → `Lint ratchet (staged, 4 arquivo(s)): baseline=0, atual=0, mantidas=0, removidas=0, novas=0 / OK: nenhuma nova divida de lint foi introduzida.`
- casos cobertos: skeleton; não-staff (nem chama a RPC); série vazia → vazio explícito; erro da RPC → erro (não vazio); total 10+15=25 com +50% e 2 barras; dia sem mediana não entra como barra 0 na mini-série.

## O que NÃO fiz e por quê
- Nenhum hook, RPC ou tipo alterado: a RPC `dashboard_daily_series` e `useDailyMetricsKpis` são do cartão pai t_8f12e328, trazidos por cherry-pick (faixa dia/2026-10-12..732aa9d42) — sem push, modo V2.
- Sem exportar/baixar/compartilhar nada; sem DDL nem dependência nova.
