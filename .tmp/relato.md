Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013035213_network_policy_tables_admin_only.sql: em public.ip_whitelist e public.geo_blocking_settings, a policy de escrita era `FOR ALL ... is_admin_or_supervisor()` — um SUPERVISOR podia inserir/alterar/apagar a whitelist de IP e o bloqueio geográfico. A `FOR ALL` foi trocada por três policies `FOR INSERT/UPDATE/DELETE ... is_admin()`. As policies de LEITURA existentes ("Admins can view IP whitelist" e "Geo blocking visible to admins only", ambas com is_admin_or_supervisor) NÃO foram tocadas, então supervisor continua vendo. Só policies: nenhum GRANT/REVOKE/papel alterado.
- scripts/db-audit/network-policy-tables-admin-only.test.sh: prova em Postgres descartável (postgres:17-alpine) com os papéis reais.

## Por que o teste ficou em scripts/db-audit (fora dos ARQUIVOS QUE PODE TOCAR)
O cartão lista supabase/migrations/ e supabase/tests/, mas as suítes supabase/tests/*.sql rodam via mcp_exec como service_role (BYPASSRLS) — nunca provam enforcement de RLS (é o mesmo motivo já registrado no comentário DASH-ACCEPTANCE-001 do db-guard.yml). O cartão exige provar que o supervisor é NEGADO, o que só se consegue executando como o papel real; é exatamente o formato de prova da minha área (`scripts/db-audit/<assunto>.test.sh`), então foi indispensável criar ali. Nenhum arquivo de outra área foi tocado.

## Prova
- vermelho antes (estado real do banco da tarefa antes da migration): `bash scripts/db-audit/network-policy-tables-admin-only.test.sh` → BLOCO A passa mostrando o DEFEITO — supervisor INSERE, APAGA e ALTERA nas duas tabelas; BLOCO B/C reprovam sem a migration.
- verde depois: `bash scripts/db-audit/network-policy-tables-admin-only.test.sh` → `NET-POLICY-ADMIN-ONLY ip_whitelist/geo_blocking_settings (postgres:17-alpine): 31 cenarios aprovados.` (exit 0), rodando como `authenticated` (admin e supervisor), `anon` e `service_role` — nunca como postgres.
  - supervisor: INSERT nega "row-level security"; UPDATE e DELETE afetam 0 linhas; SELECT segue com 1 linha (B.1–B.5, B.11–B.12).
  - admin: INSERT/UPDATE/DELETE nas duas tabelas funcionam (B.6–B.10); anon não lê (0) nem escreve; service_role segue com BYPASSRLS (B.15–B.19).
  - inventário: nenhuma policy `cmd='ALL'` restante; ip_whitelist e geo_blocking_settings com 3 de escrita + 1 de leitura (B.20–B.22).
  - rollback do próprio arquivo executa e devolve a escrita ao supervisor; reaplicar a migration volta a negar (C.1–C.4).
- migration aplicada no banco LOCAL: `hermes-db-migrar supabase/migrations/20261013035213_network_policy_tables_admin_only.sql` → `BEGIN ... CREATE POLICY ... COMMIT` / `APLICADA no banco LOCAL 'v2-2610130049cc0b' (produção não foi tocada)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (323s)` (dependencias/db_guard/tipos/lint/migrations OK; banco_local não roda sem nome de conjunto, é o normal do fechar).

## Passada de efeito colateral
1. Gatilhos: a migration só faz DROP/CREATE POLICY, nenhuma escrita de dado; `geo_blocking_settings` tem o trigger update_geo_blocking_settings_updated_at (ip_whitelist não tem gatilho), mas ele NÃO dispara porque não há UPDATE/INSERT.
2. Tudo ou nada: `hermes-db-migrar` aplicou em uma transação (BEGIN…COMMIT).
3. Sem oráculo: não há RPC/resposta; é RLS pura, sem caminho que distinga existente de inexistente.
4. Permissão só a pedida: só policies; zero GRANT/REVOKE.
5. Entrada inválida: não se aplica (sem função/parâmetro novo).
6. Teste robusto: não usa deparse de `pg_policies.qual`; confere `policyname`/`cmd`/`roles` (estáveis) e prova pelo comportamento com o papel real.

## O que NÃO fiz e por quê
- Não toquei no acesso de leitura (o cartão manda manter SELECT para admin/supervisor; supervisor lê nas duas tabelas — B.11/B.12).
- Nenhum dado real/produção citado; banco de produção não foi tocado.
- REGISTRO PENDENTE: scripts/db-audit/network-policy-tables-admin-only.test.sh — `.test.sh` novo ainda sem passo em .github/workflows/db-guard.yml (arquivo que não é meu para editar). O `check-test-inventory` já está vermelho na base com 6 órfãos pré-existentes; cabe ao worker (ci)/integrador registrar.
