Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013035213_network_policy_tables_admin_only.sql: em public.ip_whitelist e public.geo_blocking_settings, a policy de escrita era `FOR ALL ... is_admin_or_supervisor()` — um SUPERVISOR podia inserir/alterar/apagar a whitelist de IP e o bloqueio geográfico. A `FOR ALL` foi trocada por três policies `FOR INSERT/UPDATE/DELETE ... public.is_admin()`. As policies de LEITURA existentes ("Admins can view IP whitelist" e "Geo blocking visible to admins only", ambas com is_admin_or_supervisor) NÃO foram tocadas, então admin E supervisor continuam lendo. Só policies: nenhum GRANT/REVOKE/papel alterado.
- supabase/tests/network_policy_tables_admin_only.sql: prova nova no formato da área (Postgres 17 descartável + `SET LOCAL ROLE authenticated` com JWT sintético), no mesmo padrão do supabase/tests/user_roles_troca_de_papel_autorizacao_e_auditoria.sql. A correção é aplicada VERBATIM do arquivo de migration via `\i`; o estado anterior (policies FOR ALL) é reconstruído copiando os comandos das migrations que o criam (20260315114854, 20260317222728, 20260317222352 e 20260410103359).

## Prova
- Vermelho antes (modo `-v sem_guarda=1`, correção NÃO aplicada): BLOCO A passa exigindo o DEFEITO — supervisor INSERE/ALTERA/APAGA nas duas tabelas (`PASS [A1] -> OK 1`, A2, A3, A4). Isso mostra que o teste é sensível à correção.
- Verde depois (padrão, correção aplicada via `\i`):
  `NET-POLICY-ADMIN-ONLY ip_whitelist/geo_blocking_settings: OK` (exit 0), rodando como `authenticated` (admin e supervisor), `anon` e `service_role` — nunca como postgres.
  - supervisor: INSERT nega com SQLSTATE 42501 "row-level security"; UPDATE e DELETE afetam 0 linhas; SELECT segue com 1 linha (B1–B7, D1–D2).
  - admin: INSERT/UPDATE/DELETE nas duas tabelas funcionam (C1–C6).
  - anon e agente comum não leem (0 linhas) nem escrevem; service_role segue com BYPASSRLS (E1–E5).
  - T0: `authenticated` TEM o GRANT INSERT/UPDATE/DELETE/SELECT nas duas tabelas e a RLS está ligada — a barreira é a RLS, não a ACL.
  - inventário (sem deparse de `pg_policies.qual`): nenhuma policy `cmd='ALL'` restou; cada tabela com 3 de escrita (is_admin) + 1 de leitura (F1–F3).
  - tudo numa transação que termina em ROLLBACK (idempotente, sem efeito).
- Migration aplicada no banco LOCAL: `hermes-db-migrar supabase/migrations/20261013035213_network_policy_tables_admin_only.sql` → `BEGIN ... CREATE POLICY ... COMMIT` / `APLICADA no banco LOCAL 'v2-2610130049cc0b' (produção não foi tocada)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK; `banco_local` não roda sem nome de conjunto — é o normal do fechar).

## Passada de efeito colateral
1. Gatilhos: a migration só faz DROP/CREATE POLICY, nenhuma escrita de dado; `geo_blocking_settings` tem o trigger update_geo_blocking_settings_updated_at (ip_whitelist não tem gatilho), mas ele NÃO dispara porque não há UPDATE/INSERT de dado.
2. Tudo ou nada: `hermes-db-migrar` aplicou em uma transação (BEGIN…COMMIT); falha = nada aplicado.
3. Sem oráculo: não há RPC/resposta; é RLS pura, sem caminho que distinga existente de inexistente.
4. Permissão só a pedida: só policies; zero GRANT/REVOKE/papel alterado.
5. Entrada inválida: não se aplica (sem função/parâmetro novo).
6. Teste robusto: não usa deparse de `pg_policies.qual`; confere `policyname`/`cmd`/`roles` (estáveis) e prova pelo comportamento com o papel real.

## O que NÃO fiz e por quê
- Não toquei no acesso de leitura (o cartão manda manter SELECT para admin/supervisor; supervisor lê nas duas tabelas — D1/D2).
- Escrita de supervisor era justamente o defeito; ela é negada. Quem precisa escrever (admin e service_role) segue provado funcionando.
- Nenhum dado real/produção citado; banco de produção não foi tocado.
- Não confeccionei `.test.sh` em scripts/db-audit/ nem toquei em .github/workflows: a prova em papel real vive em supabase/tests/ (área do cartão) e o workflow não é meu para editar.
