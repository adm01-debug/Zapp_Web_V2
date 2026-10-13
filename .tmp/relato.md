Especialista: hugo

## O que mudou e por quê
- `src/hooks/dashboard/useDailyMetricsKpis.ts` (novo): hook `useDailyMetricsKpis(days = 7)` sobre a RPC `dashboard_daily_series` — React Query com chave estável `['dashboard', 'daily-metrics-kpis', days]` (trocar o período refaz a consulta) e `staleTime` de 120s. Tipos (`DailyMetricRow`, `DAILY_KPIS_PERIODS` 7/30/90, `DAILY_KPIS_DEFAULT_DAYS`). A consulta só é habilitada para staff: `enabled: isStaff === true` a partir de `useCRMAdminAccess` (is_admin_or_supervisor, o mesmo predicado que a RPC usa no servidor). `isStaff` volta no retorno porque `false` (sem permissão) e `null` (papel ainda sendo conferido) pedem estados diferentes na tela. Erro da RPC sobe como erro da query (não vira série vazia silenciosa) e `normalizeDailyMetricRows` converte a mediana `numeric` (que o PostgREST devolve como string) em número, mantém `null` sem amostra, reafirma a ordem crescente por dia e trata resposta nula/fora do formato como lista vazia.
- `src/hooks/dashboard/__tests__/useDailyMetricsKpis.test.tsx` (novo): 9 testes — 4 da normalização (string→número, null, ordem, formato inválido) e 5 do hook real com `renderHook` + QueryClientProvider, mockando `supabase.rpc` e `useCRMAdminAccess` (staff consulta com p_days do período; não-staff e papel ainda nulo NÃO consultam; troca de período refaz a consulta; erro → `isError`).

## Dependência (cartão pai t_d4a0a146)
A RPC não estava no meu workspace: trouxe a faixa inteira com `git cherry-pick` (commits `5fca12fa`, `6df803f3`, `8df2863d`, `05382c64`), que entram no diff junto com o meu commit: a migration aditiva `20261012235745_dashboard_daily_series.sql`, o harness `scripts/db-audit/dashboard-daily-series.test.sh` e a entrada no `.github/workflows/db-guard.yml`. Esses 3 arquivos são do cartão pai (lá aplicados no banco LOCAL e provados com papéis reais); não são do meu escopo e não os alterei. O `git cherry-pick --empty=drop` do enunciado foi recusado pelo git 2.43 (opção não existe nesta versão) — usei `git cherry-pick <sha>...`, sem conflito.

## Prova
- vermelho antes: `npx vitest run src/hooks/dashboard/__tests__/useDailyMetricsKpis.test.tsx` → `Failed to resolve import "../useDailyMetricsKpis"` (módulo ainda não criado)
- verde depois: `npx vitest run src/hooks/dashboard/__tests__/useDailyMetricsKpis.test.tsx` → `Test Files 1 passed (1); Tests 9 passed (9)`
- sem regressão na área: `npx vitest run src/hooks/dashboard` → `Test Files 7 passed (7); Tests 47 passed (47)`
- `zapp-verify . --rapido` → VERDE (db_guard OK, tipos OK, lint OK, migrations OK)

## O que NÃO fiz e por quê
- Não toquei `types.ts` nem `src/hooks/dashboard/index.ts`: o cartão lista só o hook novo e os testes, e o tipo da RPC entra pelo types-sync (o pai decidiu o mesmo).
- Não recriei a view `evolution_daily_metrics` da V3: a V2 calcula a mesma série direto das tabelas operacionais na RPC.
- Não rodei a prova de banco do cartão pai (harness de SQL): é prova dele; aqui o cartão só pede o hook e a verificação.
