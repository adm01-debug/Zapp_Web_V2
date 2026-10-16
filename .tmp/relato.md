Especialista: senior (area-sql-banco)

## Pontos da recusa

Ponto 1: a função aceitava qualquer `p_scope` curto e gravava esse texto arbitrário em `details`/`dedupe_key`.
- O que mudei: `supabase/migrations/20261011142742_inbox_scope_permissions.sql` agora normaliza o escopo e só aceita `mine`, `department` ou `all`; qualquer valor nulo, vazio, fora da lista ou longo vira `unknown`. O comentário da função também documenta essa lista fechada.
- Teste que prova: `supabase/tests/inbox_scope_permissions.sql` ampliou o T7 para chamar a função real com `NULL`, vazio, `todos`, `foo`, texto curto fora da lista e texto longo, e verifica que fica só uma linha `unknown` sem gravar escopo arbitrário.
- Vermelho antes: `zapp-db-local psql . v2-2610111530259e -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql` -> `ERROR:  T7 FALHOU: escopo arbitrario foi gravado (esperava so all, department e unknown; achei 6 linhas)`.
- Verde depois: `zapp-db-local psql . v2-2610111530259e -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql` -> `NOTICE:  inbox_scope_permissions: suite OK (T1 catalogo, T2 papeis, T3 ACL, T4 gravacao, T5 dedupe, T6 escopo, T7 invalido, T8 anon, T9 sem identidade, T10 escrita direta, T12 seed idempotente, T13 dedupe por hora, T11 rollback)`.

## O que mantive do trabalho anterior

- Mantive a migration aditiva que cria as permissões `inbox.view_department` e `inbox.view_all`, atribui a `admin` e `supervisor`, cria a função `public.log_unauthorized_inbox_scope(text)` com `SECURITY DEFINER`, revoga `PUBLIC`/`anon`/`service_role` e libera só `authenticated`.
- Mantive `src/integrations/supabase/types.ts` com a assinatura da RPC nova.
- Mantive e ampliei o teste SQL real em vez de mockar texto da migration; ele executa função, ACL, RLS de escrita direta, idempotência, dedupe por usuário+escopo+hora e o rollback do cabeçalho.

## Rollback

O `-- Rollback:` da migration continua executável e o T11 do teste executa as três linhas do cabeçalho: `drop function`, delete de `role_permissions` e delete de `permissions`. O teste confirma que a função some e que as permissões semeadas são removidas, tudo dentro de transação com `ROLLBACK` final.

## Arquivos alterados

`git diff --name-only dia/2026-10-11...HEAD`:

.tmp/relato.md
src/integrations/supabase/types.ts
supabase/migrations/20261011142742_inbox_scope_permissions.sql
supabase/tests/inbox_scope_permissions.sql

## Verificações executadas

- `hermes-db-migrar supabase/migrations/20261011142742_inbox_scope_permissions.sql` -> aplicou no banco LOCAL da tarefa antes da correção (`BEGIN`, `INSERT`, `CREATE FUNCTION`, `REVOKE`, `GRANT`, `COMMENT`, `COMMIT`).
- `zapp-db-local psql . v2-2610111530259e -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql` -> vermelho antes da correção com `T7 FALHOU: escopo arbitrario foi gravado ... achei 6 linhas`.
- `zapp-db-local psql . v2-2610111530259e -v ON_ERROR_STOP=1 < supabase/migrations/20261011142742_inbox_scope_permissions.sql` -> reaplicou a SQL final localmente (`CREATE FUNCTION`, `REVOKE`, `GRANT`, `COMMENT`).
- `zapp-db-local psql . v2-2610111530259e -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql` -> verde depois, com `suite OK` incluindo T7 e T11 rollback.
- `git log --oneline dia/2026-10-11..HEAD` -> há um único commit com o título `fix(banco): valida escopo da auditoria da inbox`.
- `git diff --stat dia/2026-10-11...HEAD` -> `.tmp/relato.md`, `src/integrations/supabase/types.ts`, `supabase/migrations/20261011142742_inbox_scope_permissions.sql` e `supabase/tests/inbox_scope_permissions.sql`.
- `git diff dia/2026-10-11...HEAD | wc -c` -> resultado medido abaixo do limite de 90 mil caracteres.

## O que NÃO fiz

- Não mexi em workflow, manifesto, CI, tela, hook ou dados fora das tabelas de catálogo de permissões previstas pelo cartão.
- Não acessei banco remoto nem produção; todas as execuções foram no banco local da tarefa.
