Especialista: workersql

## O que foi feito nesta rodada de refazer
- O código do trabalho anterior foi reaproveitado por cherry-pick do commit 09e9642de, conforme o cartão pediu.
- Não alterei código nesta rodada 2: a recusa diz que a implementação já está correta e que o defeito era só o relato. Corrigi o relato para responder ponto a ponto, na numeração certa, começando por `Especialista: workersql`.

## Pontos da recusa anterior
- Ponto 1: `supabase/migrations/20261011200753_admin_email_accounts_health.sql` e `supabase/tests/admin_email_accounts_health.sql` resolvem a classificação de token sem refresh. O `case` da RPC começa por `g.refresh_token_encrypted is null then 'sem_token'`, e o SQL de regressão inclui a fixture `zz-teste-health-access-semrefresh@example.invalid` com access presente e refresh nulo; o T4b prova que ela retorna `sem_token`.
- Ponto 2: `supabase/tests/admin_email_accounts_health.sql` resolve a prova de ordenação sem forçar a ordem no próprio teste. O T4l lê a saída nativa da RPC com `WITH ORDINALITY` e compara a posição da conta inativa com a última ativa, sem `order by` no teste.
- Ponto 3: `supabase/tests/admin_email_accounts_health.sql` resolve a prova fraca de `ultima_validacao`. Em vez de checar só `is not null`, o T4j compara `ultima_validacao` com `gmail_accounts.updated_at` da mesma conta (`zz-teste-health-expirado@example.invalid`).
- Ponto 4: `supabase/tests/admin_email_accounts_health.sql` resolve o SKIP por falta de admin semeado. O teste cria o usuário admin em `auth.users` e `public.user_roles`; se a fixture não existir, T3/T4 levantam exceção e a suíte falha, em vez de pular silenciosamente.
- Ponto 5: `supabase/tests/admin_email_accounts_health.sql` e `tests/contracts/admin-email-health-rpc.contract.test.ts` resolvem a documentação/prova do contrato. O cabeçalho do SQL cita `tem_access_token` e `tem_refresh_token`, e o `COMO RODAR` usa o placeholder correto `<conjunto-do-cartao>` para o banco local do cartão.

## O que mudou e por quê
- `.tmp/relato.md`: corrige o defeito desta rodada 2, que era só o relato, com primeira linha `Especialista: workersql` e pontos numerados de acordo com a recusa.
- `supabase/migrations/20261011200753_admin_email_accounts_health.sql`: cria a RPC `public.admin_email_accounts_health()` como `SECURITY DEFINER`, `STABLE`, com `search_path = pg_catalog, public`, guarda interna `public.is_admin(auth.uid())` que falha com 42501, retorno sem bytes de token e ACL fechada para `PUBLIC`/`anon`, aberta só para `authenticated`.
- `supabase/tests/admin_email_accounts_health.sql`: executa a RPC real no banco local, com matriz de permissão (`anon`, `authenticated` não-admin e admin), estados de token, dados de dono, falha recente, última validação e ordenação nativa. A transação termina em `ROLLBACK`.
- `tests/contracts/admin-email-health-rpc.contract.test.ts`: guarda estática de contrato para assinatura, `SECURITY DEFINER`, `search_path`, ACL, ausência de token cifrado no retorno e paridade entre retorno declarado e `src/integrations/supabase/types.ts`.
- `src/integrations/supabase/types.ts`: tipos gerados para a RPC nova, no mesmo cartão da migration.

## Resposta ao juiz barato
- O alerta sobre teste que não chama o código real procede só para o contrato TypeScript, que é intencionalmente uma guarda estática de assinatura/tipos. A prova de comportamento da RPC não é esse arquivo: é `supabase/tests/admin_email_accounts_health.sql`, executado no banco local depois de aplicar a migration, chamando `public.admin_email_accounts_health()` com papéis reais (`anon`, `authenticated` não-admin e admin) e fixtures reais.

## Provas executadas agora
- Aplicação local da migration: `zapp-db-local psql . v2-261012011805c9 -v ON_ERROR_STOP=1 < supabase/migrations/20261011200753_admin_email_accounts_health.sql` -> `CREATE FUNCTION`, `REVOKE`, `GRANT`.
- Teste SQL real da RPC: `zapp-db-local psql . v2-261012011805c9 -v ON_ERROR_STOP=1 < supabase/tests/admin_email_accounts_health.sql` -> `NOTICE: admin_email_accounts_health: 24 assertivas, todas PASS`.
- Contrato estático: `bun run test:contracts -- tests/contracts/admin-email-health-rpc.contract.test.ts` -> `Test Files 1 passed (1); Tests 7 passed (7)`.
- Rollback executado no banco local: `drop function if exists public.admin_email_accounts_health(); select to_regprocedure('public.admin_email_accounts_health()') is null as rollback_removeu_funcao;` -> `rollback_removeu_funcao = t`; depois reapliquei a migration e confirmei `rpc_reaplicada = admin_email_accounts_health()`.
- Verificação rápida: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (120s)` com `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; o banco local foi verificado separadamente nos comandos SQL acima.

## Lista exata de arquivos do diff
```text
.tmp/relato.md
src/integrations/supabase/types.ts
supabase/migrations/20261011200753_admin_email_accounts_health.sql
supabase/tests/admin_email_accounts_health.sql
tests/contracts/admin-email-health-rpc.contract.test.ts
```

## O que não fiz
- Não mudei código nesta rodada 2 além de reaproveitar o commit anterior por cherry-pick; a recusa atual mandava corrigir só o relato.
- Não usei produção, não exportei dados e não incluí tokens/segredos no retorno nem no relato.
