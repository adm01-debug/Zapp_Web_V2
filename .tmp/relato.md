Especialista: senior (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011191021_departments_admin.sql: mantive a correção original e ajustei `departments_overview()` para exigir `public.is_admin(auth.uid())`; supervisor não passa mais no overview.
- scripts/db-audit/departments-admin-management.test.sh: indispensável para a recusa porque os 3 pontos pediam prova SQL real. O contrato executa a migration em Postgres descartável, valida o REVOKE por comportamento (`has_table_privilege = f`, DELETE direto do admin com SQLSTATE 42501 e mutação sem REVOKE falhando), extrai SQLSTATE do `psql -v VERBOSITY=verbose`, exige SQLSTATE exato em todos os erros, cobre supervisor bloqueado no overview e prova mutações A/B/C/D.
- .github/workflows/db-guard.yml: indispensável para o teste novo entrar no espelho do CI/db-guard, sem afrouxar guarda.
- tests/contracts/departments-admin-management.contract.test.ts: fica só como smoke estático de contrato/registro; a prova de comportamento está no script SQL real acima.

## Pontos do revisor
- Ponto 1: `departments_overview()` estava liberado para supervisor. Mudei a função em `supabase/migrations/20261011191021_departments_admin.sql` para `public.is_admin(auth.uid())`. Prova vermelha: `bash scripts/db-audit/departments-admin-management.test.sh` com MUTACAO C (overview liberado para supervisor) falha em `[FAIL] MUTACAO C: overview do supervisor e barrado (42501, so admin): a chamada passou`. Prova verde: o mesmo comando na migration real mostra `[OK] DEPOIS: overview do supervisor e barrado (42501, so admin) (SQLSTATE 42501)` e termina com `[OK] contrato departments-admin-gestao verificado: 18 etapas (postgres:17-alpine)`.
- Ponto 2: a prova do REVOKE não podia depender só de grep. Mantive smoke estático apenas para impedir `GRANT DELETE`, mas a validação real agora é comportamental no Postgres descartável: `has_table_privilege('authenticated','public.departments','DELETE') = f`, DELETE direto do admin bloqueado com 42501, e MUTACAO A remove o REVOKE numa cópia temporária e falha com `[FAIL] MUTACAO A: has_table_privilege(authenticated, departments, DELETE) deveria ser f, obtido t`. Prova verde: `bash scripts/db-audit/departments-admin-management.test.sh` termina verde.
- Ponto 3: `check_error` aceitava substring do erro; agora extrai o SQLSTATE exato do output verbose do psql e cada chamada informa SQLSTATE esperado. O caso de duas conversas-tipo conflitantes exige `22023`. Prova vermelha: MUTACAO D mantém a mesma mensagem `move_target_already_has_department_conversation`, mas troca o SQLSTATE para `P0001`, e o contrato falha com `[FAIL] MUTACAO D: mover 2 conversas-tipo colidiria (recusa): SQLSTATE divergente (esperava 22023, obteve P0001)`. Prova verde: na migration real o mesmo comando mostra `[OK] DEPOIS: mover 2 conversas-tipo colidiria (recusa) (SQLSTATE 22023)`.

## Prova executada
- `bash scripts/db-audit/departments-admin-management.test.sh` → `[OK] contrato departments-admin-gestao verificado: 18 etapas (postgres:17-alpine)`.
- `bun test tests/contracts/departments-admin-management.contract.test.ts` → `6 pass`, `0 fail`, `27 expect() calls`.

## Avisos do juiz automático que não procedem
- "Teste não chama o código": procede para o smoke TS, mas a prova principal é `scripts/db-audit/departments-admin-management.test.sh`, que executa o SQL real da migration em Postgres descartável e roda mutações que falham sem a correção.
- "Arquivo fora da lista": `.github/workflows/db-guard.yml` e `scripts/db-audit/departments-admin-management.test.sh` são necessários porque a recusa exige teste SQL real e registro no db-guard; não alteram produto nem relaxam guarda.

## Arquivos no diff
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/departments-admin-management.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011191021_departments_admin.sql
tests/contracts/departments-admin-management.contract.test.ts

## O que NÃO fiz e por quê
- Não mexi em produção, não rodei deploy/push/PR e não usei credenciais reais.
- Não alterei tela nem regra fora de `departments-admin-gestao`; as mudanças adicionais no teste são só para cobrir os três pontos da recusa e o rollback do cabeçalho da própria migration.
