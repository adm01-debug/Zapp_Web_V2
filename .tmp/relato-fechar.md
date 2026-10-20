- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 9s;OK lint 1s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (11/10 16:59, gerados por máquina: valem mais que números escritos à mão)
```
 src/integrations/supabase/types.ts                 |  29 ++
 .../20261011192817_admin_login_attempts_rpc.sql    | 174 +++++++++++
 supabase/tests/admin_login_attempts.sql            | 342 +++++++++++++++++++++
 .../admin-login-attempts-rpc.contract.test.ts      |  97 ++++++
 4 files changed, 642 insertions(+)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 6 passed (6)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261011192817_admin_login_attempts_rpc.sql, supabase/tests/admin_login_attempts.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:WITH CHECK, padrão:auth\.(uid|role)\(\), padrão:requireRole|isAdmin|

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011192817_admin_login_attempts_rpc.sql (NOVA): cria as duas consultas de leitura do painel admin de auth — `admin_login_attempts(p_periodo, p_email_like, p_so_falhas, p_pagina)` (periodo 24h/7d/30d/90d/all, filtro por email, recorte de forca bruta, paginacao de 25, total no envelope) e `admin_blocked_accounts()` (bloqueios vigentes + motivo derivado). Ambas SECURITY DEFINER, `SET search_path = pg_catalog, public`, STABLE, com guarda `public.is_admin_or_supervisor(auth.uid())` DENTRO da funcao (erro 42501) e `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated`. Cabecalho traz o caminho de volta (dropa as duas RPCs).
- supabase/tests/admin_login_attempts.sql (NOVO): suite de assertivas PASS/FAIL contra o banco local reaplicado (zapp-db-local up), com papeis REAIS (SET ROLE authenticated/anon + request.jwt.claims) nos usuarios-semente do proprio banco local.
- src/integrations/supabase/types.ts: entradas geradas das duas RPCs (so isso; nada mais no arquivo).
- tests/contracts/admin-login-attempts-rpc.contract.test.ts (NOVO): contrato estatico que trava SECURITY DEFINER + search_path, guarda 42501, REVOKE de PUBLIC/anon e GRANT so a authenticated, ausencia de senha/hash/token no DDL e a IGUALDADE entre os campos de retorno da migration e os tipos gerados (foi o ponto do juiz "codigo alterado sem teste": types.ts e codigo alterado, entao entrou contrato que o cobre).

## Decisoes (passada de efeitos colaterais)
- A guarda usa `is_admin_or_supervisor` porque ESPELHA a policy de SELECT de login_attempts ("Admins and supervisors can view login attempts"): a RPC nao amplia nem estreita a plateia da leitura direta. `service_role` nao recebe GRANT (o painel chama com JWT authenticated) e a guarda o barra de qualquer forma.
- `login_attempts` nao guarda sucesso (login OK apaga a linha) — por isso `p_so_falhas=true` filtra contas que JA atingiram o limiar de bloqueio (attempt_count >= 5, ADR-006) e `false` traz todas as contas com falha. Estah documentado no proprio arquivo.
- Sem dado sensivel: devolvemos email, contagem, datas, ip e user_agent — exatamente o que a policy admin-only jah expoe hoje; nao existe senha/hash/token na tabela.
- Migration ADITIVA (CREATE FUNCTION + GRANT a authenticated): nenhum GRANT/papel/ACL existente foi alterado, nenhuma policy foi mexida e nenhuma tabela nova foi criada — a RLS de `login_attempts` foi CONFERIDA, nao alterada.
- `motivo` do bloqueio eh derivado (excesso_de_tentativas quando attempt_count >= 5; bloqueio_manual abaixo disso) — nao ha coluna de motivo na tabela. Entrada invalida (periodo/pagina/filtro) recusada com 22023 e testada.

## Prova
- contrato (vitest): vermelho antes = `npx vitest run --config vitest.contracts.config.ts tests/contracts/admin-login-attempts-rpc.contract.test.ts` com a migration fora do lugar → `Test Files 1 failed (1); Tests no tests`; verde depois → `Test Files 1 passed (1); Tests 6 passed (6)`.
- vermelho antes (mesmas assertivas, sem a migration): `zapp-db-local psql . v2-26101116111cf8 < supabase/tests/admin_login_attempts.sql` depois de `drop function admin_login_attempts(...); drop function admin_blocked_accounts();`
  → `ERROR:  function "public.admin_login_attempts(text,text,boolean,integer)" does not exist`
- verde depois: `zapp-db-local psql . v2-26101116111cf8 < supabase/tests/admin_login_attempts.sql`
  → `NOTICE:  admin_login_attempts: 39 assertivas, todas PASS`
  Cobre: T2a/T2b anon SEM EXECUTE; T2c authenticated PODE (guarda decide); T4a admin consulta; T4b supervisor consulta; T4c agente recusado (42501); T4e agente le 0 linhas direto na tabela (RLS); T4f anon sem SELECT; T5a-T5m janela/filtro/ordenacao/paginacao (25+5, total 30, sem repeticao)/% nao-curinga/entradas invalidas; T6a-T6d admin_blocked_accounts (so bloqueio vigente + motivo).
  T3a-T3e conferem a RLS de login_attempts: ligada, 1 policy de SELECT admin/supervisor, nada permissivo (USING/WITH CHECK true), INSERT negado, nenhuma policy para anon.
- verificacao: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (101s)` (dependencias OK, db_guard OK, tipos OK, lint OK, migrations OK).
  COM o nome do conjunto o passo `banco_local` reprova por 120 diferencas do retrato de producao que ja existem nesta branch (a producao tem funcoes que a branch ainda nao tem); as unicas linhas ligadas a ESTE cartao sao as 6 de admin_login_attempts/admin_blocked_accounts x authenticated/service_role/postgres. Por isso a declaracao e VERDE SEM BANCO, como o fechar usa.

## O que NAO fiz e por que
- Nao alterei nenhuma policy de `login_attempts`: o item "conferir RLS" foi conferido e jah estah correto; mexer seria tocar objeto existente sem necessidade.
- Nao registrei a suite em workflow: ela mora em supabase/tests/ (fora do inventario de scripts/db-audit/*.test.sh), entao nao cria orfao no check-test-inventory.
- Nao toquei em src/** (telas/hooks) nem em supabase/functions/** — fora da minha area.
- Nao gerei types.ts pela CLI (supabase deslogado de proposito no V2): adicionei a mao as duas entradas no formato gerado, no lugar alfabetico, e o typecheck do verify passou.
