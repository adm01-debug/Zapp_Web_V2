Especialista: semisenior (area-sql-banco)

## O que mudou e por quê
- `scripts/db-audit/dashboard-daily-series.test.sh`: a migration sob teste passa a ser referenciada pelo nome do arquivo pinado (`20261012235745_dashboard_daily_series.sql`) em vez da busca por marcador (`grep -rlF ... | tail -1`). Motivo: ponto 4 da recusa — a busca por marcador devolveria uma migration futura `_v2` e o passo 7 (Rollback) reaplicaria a migration errada.
- Migration `20261012235745_dashboard_daily_series.sql` e passo em `.github/workflows/db-guard.yml`: herdados do trabalho anterior, sem alteração (pontos 1–3 da recusa confirmam que estão corretos).

## Prova
- vermelho antes (lógica antiga, com `_v2` simulada em diretório temporário): `grep -rlF 'dashboard_daily_series_requires_staff' ... | sort | tail -1` → `.../20261013120000_dashboard_daily_series_v2.sql` (a migration errada).
- verde depois (lógica nova): caminho pinado → `.../20261012235745_dashboard_daily_series.sql` (a migration certa).
- verde depois (harness real): `bash scripts/db-audit/dashboard-daily-series.test.sh` → `[OK] DASHBOARD-03: dashboard_daily_series devolve a serie diaria correta (fuso de Sao Paulo), exige admin/supervisor ou service_role, mantem anon/PUBLIC sem EXECUTE, limita p_days a 90 e o Rollback remove a funcao.` (todas as linhas `[PASS]`, nenhuma falha; inclui `7. apos o Rollback a funcao nao existe (volta ao RED)`).
- sintaxe: `bash -n scripts/db-audit/dashboard-daily-series.test.sh` → `SYNTAX_OK`.

## Pontos do revisor
- Ponto 1: resolvido — mantidos migration, harness e passo no `db-guard.yml`; o passo no workflow é obrigatório (`check-test-inventory.mjs` reprova `.test.sh` órfão). Sem mudança.
- Ponto 2: não procede como defeito funcional (a própria recusa diz que não precisa mudar nada) — o código nega `anon`/`PUBLIC` por padrão e concede só a `authenticated`/`service_role`; o comentário da migration já descreve isso. Sem mudança.
- Ponto 3: não procede como defeito (a própria recusa diz que não precisa mudar nada) — `CREATE OR REPLACE` + `REVOKE`/`GRANT` reaplicados tornam a reexecução idempotente, e o passo 6 do harness prova (`migration reaplicada sem erro`, serie identica apos reaplicar). Sem mudança.
- Ponto 4: resolvido — `scripts/db-audit/dashboard-daily-series.test.sh`: removida a função `find_migration` e a busca por marcador; variável `migration` agora é o caminho pinado do arquivo. Prova: demo vermelho/verde da seleção acima + harness verde.

## O que NÃO fiz e por quê
- Não alterei a migration (migrations aplicadas não se editam) nem o passo do `db-guard.yml` (ponto 1 confirma que está correto).
- Não recriei a view `evolution_daily_metrics` (vedado no pedido original); a série é calculada na RPC.
- Não mexi em fila/hook/tela: o consumo fica no filho de front.

## Arquivos (`git diff --name-only dia/2026-10-12...HEAD`, colado do comando)
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/dashboard-daily-series.test.sh
supabase/migrations/20261012235745_dashboard_daily_series.sql

## Comandos de verificação
- `bash -n scripts/db-audit/dashboard-daily-series.test.sh` → SYNTAX_OK.
- `bash scripts/db-audit/dashboard-daily-series.test.sh` → `[OK] DASHBOARD-03: ...` (todos `[PASS]`, zero falhas).
- `git diff --stat dia/2026-10-12...HEAD` → 4 arquivos (migration + harness + passo db-guard + relato); minha mudança nesta rodada: só o harness (7 inserções, 11 remoções).
