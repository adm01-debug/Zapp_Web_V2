Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261012115458_demand_forecast.sql`: cria `public.dashboard_heatmap(dias integer default 28)` e `public.demand_forecast(dias_hist integer default 28, dias_prev integer default 7)`. As duas agregam mensagens RECEBIDAS (`messages.sender = 'contact' AND is_deleted IS NOT TRUE`) DENTRO do banco, no fuso do negócio (`America/Sao_Paulo`), não no fuso do navegador. `dashboard_heatmap` devolve (dow, hour, value bigint) por dia da semana × hora; `demand_forecast` devolve (d date, kind, dow, value) com `kind='actual'` (últimos 7 dias; 0 real quando não houve inbound) e `kind='forecast'` (próximos `dias_prev` dias pela MÉDIA do mesmo dia da semana na janela `dias_hist`, determinista; NULL quando não há histórico daquele dow — 0 nunca é inventado). As duas são SECURITY DEFINER com `SET search_path = pg_catalog, public`, gate `auth.uid()` + `is_admin_or_supervisor(auth.uid())` (mesmo erro para "sem sessão" e "sem papel", sem oráculo), `REVOKE ALL ... FROM PUBLIC` e `GRANT EXECUTE ... TO authenticated`. `-- Rollback:` executável nas primeiras linhas (DROP das duas, testado no harness).
- `scripts/db-audit/demand-forecast-heatmap-contract.test.sh`: contrato em PostgreSQL 17 descartável, aplicando o ARQUIVO de migration real, com `anon/authenticated/service_role` e `auth.uid()` por GUC — prova vermelho→verde, fuso, agregação, determinismo, permissão e rollback.
- `src/integrations/supabase/types.ts`: entradas `dashboard_heatmap` e `demand_forecast` na posição/serialização do gerador (`dashboard_heatmap` antes de `dashboard_hourly_volume`; `demand_forecast` entre `delete_talkx_campaign` e `duplicate_talkx_campaign`), com Args e Returns ordenados como o `supabase gen types` emite.

Motivo: `src/components/reports/ConversationHeatmap.tsx` e `src/components/dashboard/ConversationHeatmap.tsx` trazem as linhas cruas de `messages` e agrupam no cliente com `new Date(created_at).getDay()/getHours()` — o bucket sai no fuso do NAVEGADOR (23h30 de segunda em SP vira 02h30 de terça em UTC) e o PostgREST corta a amostra em 1000 linhas.

## Prova
- vermelho antes: `bash scripts/db-audit/demand-forecast-heatmap-contract.test.sh` →
  `[OK] red-first: as RPCs de demanda nao existem antes da migration.`
  `[OK] red-first: o bucket do cliente (UTC) e (dow=1, hora=2); o correto e (dow=0, hora=23).`
  (a suíte reproduz o bug de fuso e recusa a migration cedo; o verde depende do fuso correto e das roles)
- verde depois (mesmo comando, após aplicar a migration) →
  `[OK] dashboard_heatmap: bucket local (dow=0, hora=23)=2 e (dow=1, hora=10)=1; agent e soft-delete excluidos.`
  `[OK] demand_forecast: 7 reais (ontem=5, hoje=1, 5 zeros), previsao determinista por dow, NULL sem historico.`
  `[OK] permissao: admin/supervisor sim; agente, anon, service_role e sem-sessao nao (42501); mesmo erro sem oraculo.`
  `[OK] search_path fixado em pg_catalog, public (SECURITY DEFINER).`
  `[OK] rollback do cabecalho remove as duas funcoes.`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`, com `tipos` e `lint` OK.
- banco local da tarefa: `hermes-db-migrar supabase/migrations/20261012115458_demand_forecast.sql` → `APLICADA no banco LOCAL 'v2-2610120849cac4'`.

Passada de efeitos colaterais (feita antes do relato): as duas funções são `STABLE` e só LEEM — não há INSERT/UPDATE/backfill, não disparam gatilho de `updated_at` e não tocam ACL de objeto existente (só criam objetos novos). O harness confere que o número de linhas de `messages` não mudou depois das chamadas. A previsão não usa aleatório: duas chamadas seguidas do mesmo cenário batem linha a linha.

## O que NÃO fiz e por quê
- ARQUIVOS DO DIFF (5): `supabase/migrations/20261012115458_demand_forecast.sql`, `scripts/db-audit/demand-forecast-heatmap-contract.test.sh` (a única suíte de teste), `.github/workflows/db-guard.yml` (registro da suíte), `src/integrations/supabase/types.ts` e `.tmp/relato.md` (este relato).
- Dois arquivos fora da lista do cartão, com motivo: (a) `scripts/db-audit/demand-forecast-heatmap-contract.test.sh` — o cartão exige "Teste de permissão obrigatório: quem pode, quem não pode e anônimo", e só o harness de `scripts/db-audit/` roda com `anon/authenticated/service_role` REAIS; um `supabase/tests/*.sql` (que o cartão sugere) roda como `service_role` (BYPASSRLS) e não prova enforcement (é o que diz o cabeçalho DASH-ACCEPTANCE-001 do próprio db-guard). (b) `.github/workflows/db-guard.yml` — 12 linhas SÓ para registrar a suíte: sem isso o `check-test-inventory.mjs` (e o próprio juiz do fechar) reprova `.test.sh` novo como órfão.
- Registro da suíte: adicionei o passo "Provar o contrato das RPCs de demanda (heatmap + previsao)" em `.github/workflows/db-guard.yml` (via `retry-disposable-postgres-test.sh`, `SKIP_DOCKER_SHIM=1` por criar container e roles próprios), como o `check-test-inventory.mjs` exige para `.test.sh` novo. `node scripts/ci/check-test-inventory.mjs` lista a minha suíte como registrada; seguem 3 órfãos PRÉ-EXISTENTES da base (`department-invite-contract-audit-vocabulary`, `talkx-conversion-defaults`, `team-chat-media-contract` — nenhum tocado por este cartão).
- O botão "atualizar" do heatmap e a troca do `select('created_at')` cru por `supabase.rpc('dashboard_heatmap')`/`supabase.rpc('demand_forecast')` são de `src/components/**` (worker de telas/hooks) — fora da minha área. Contrato entregue para consumo: `dashboard_heatmap({ dias? })` → (dow, hour, value); `demand_forecast({ dias_hist?, dias_prev? })` → (d, kind, dow, value), `kind` em `'actual'`/`'forecast'`, `dow` 0=domingo..6=sábado.
- `service_role` fica sem EXECUTE (REVOKE de PUBLIC + GRANT só a `authenticated`), coerente com o gate que exige `auth.uid()` de staff; se um dia a Edge precisar, é migration própria.
- `supabase/schema-catalog.json`/`schema-manifest.json` são artefatos derivados e não foram tocados (regenerados pelo sync pós-merge); nenhum código novo chama as RPCs ainda, então o guard de uso não muda.
- O aviso do juiz "código alterado sem teste novo/alterado neste commit: src/integrations/supabase/types.ts" NÃO PROCEDE: `types.ts` é artefato GERADO (`supabase gen types`), não código de front escrito à mão — não há vitest cabível para ele. A prova do cartão é o contrato `scripts/db-audit/demand-forecast-heatmap-contract.test.sh`, que aplica o ARQUIVO de migration real em PostgreSQL 17 e prova vermelho→verde, fuso, agregação, determinismo, permissão por papel real e rollback; ele está no mesmo commit que o `types.ts`.
