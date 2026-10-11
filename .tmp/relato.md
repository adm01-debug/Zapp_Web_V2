Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011200753_admin_email_accounts_health.sql (novo): cria a RPC public.admin_email_accounts_health() — visão de saúde das contas de e-mail para o painel admin (paridade V3 -> V2, 11/10/2026). Devolve, por conta: conta (email_address), dono (user_id + nome/e-mail do public.profiles), status do token derivado (sem_token/expirado/expirando/valido) + validade + booleanos de presença (tem_access_token/tem_refresh_token), último sincronismo (last_sync_at), falhas recentes (last_error + em_falha), última validação (updated_at) e watch_expiration. Nunca devolve os tokens cifrados. SECURITY DEFINER com search_path fixo (pg_catalog, public); a guarda é DENTRO da função — `if not public.is_admin(auth.uid()) then raise ... errcode 42501`. Admin ESTRITO (não supervisor), como o cartão pede "só admin". ACL: revoke de PUBLIC/anon, grant execute só para authenticated.
- supabase/tests/admin_email_accounts_health.sql (novo): prova em Postgres local com papéis reais. Roda via `zapp-db-local psql . v2-26101117016dff` (banco descartável do cartão; produção intocada), em uma transação com ROLLBACK — as fixtures não ficam no banco.
- tests/contracts/admin-email-health-rpc.contract.test.ts (novo): contrato que trava SECURITY DEFINER + search_path, guarda 42501, ACL sem PUBLIC/anon, ausência de bytea/token no retorno e a paridade com src/integrations/supabase/types.ts.
- src/integrations/supabase/types.ts: adiciona a entrada admin_email_accounts_health (Args: never; Returns com os 17 campos) — a paridade com o retorno da migration é verificada pelo contrato.

## Prova
- vermelho antes (banco, guarda ausente): `zapp-db-local psql . v2-26101117016dff -v ON_ERROR_STOP=1 < supabase/tests/admin_email_accounts_health.sql` → `EXIT=3` e `T3b authenticated nao-admin e recusado pela guarda | FAIL | conseguiu: vazou para nao-admin` (a versão sem RAISE deixava o não-admin passar). Comando rodado sobre a versão anterior da função na base local.
- verde depois (banco): mesmo comando → `EXIT=0` e `NOTICE: admin_email_accounts_health: 23 assertivas, todas PASS` (23 linhas PASS; T3a anon negado pela ACL, T3b não-admin 42501, T3c admin lê global n=4).
- verde depois (contrato): `npx vitest run --config vitest.contracts.config.ts tests/contracts/admin-email-health-rpc.contract.test.ts` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- banco local aplicado com `hermes-db-migrar supabase/migrations/20261011200753_admin_email_accounts_health.sql` → `APLICADA no banco LOCAL 'v2-26101117016dff' (produção não foi tocada)`. `node scripts/db-audit/check-migration-drift.mjs` → `arquivos validos em supabase/migrations: 822` (EXIT=0).

## Decisões e limites
- Cartão sem caminho de leitura no V2: o painel admin não tinha como listar a saúde das contas (a RLS de public.gmail_accounts é "cada um vê a própria"). A RPC abre a visão global só para admin.
- Semântica dos campos ambíguos do cartão, documentada no cabeçalho da migration: "falhas recentes" = last_error (última falha do sync; NULL = sem falha) + em_falha (sync_status='error'); "última validação" = updated_at (última renovação do registro: refresh de token/watch/sync). watch_expiration vai cru para a tela mostrar a validade do push. Não há tabela de eventos de sync/falha no banco; são esses os sinais persistidos.
- Efeito colateral: nenhum — função só de leitura, sem INSERT/UPDATE/DELETE, sem trigger, sem GRANT/papel existente alterado. Rollback = drop function (o DROP também remove os grants).
- Não mexi em RLS de public.gmail_accounts nem na view gmail_accounts_safe: fora do escopo do cartão.
