Especialista: senior (area-sql-banco)

## Pontos do refazer

Ponto 1: rebase do trabalho aprovado na ponta atual da branch do dia.
- O que mudei: reapliquei o commit aprovado `b9b68f96515a` sobre `dia/2026-10-13` por cherry-pick sem commit e mantive os arquivos do cartão: `supabase/migrations/20261011142742_inbox_scope_permissions.sql`, `supabase/tests/inbox_scope_permissions.sql` e `src/integrations/supabase/types.ts`.
- Conflito resolvido: só `.tmp/relato.md` conflitou. O bloco conflitante estava em `.tmp/relato.md:3-62`; descartei o relato antigo de outro cartão que já estava na branch do dia e também descartei o relato obsoleto do commit anterior, substituindo pelo relato atual deste rebase. Não houve conflito de SQL nem de `types.ts`.
- Prova: `git diff --cached --name-only` listou apenas `.tmp/relato.md`, `src/integrations/supabase/types.ts`, `supabase/migrations/20261011142742_inbox_scope_permissions.sql` e `supabase/tests/inbox_scope_permissions.sql`; `git diff --cached --stat` ficou restrito a esses quatro arquivos.

Ponto 2: não acrescentar comportamento além da entrega aprovada.
- O que mantive: a migration aprovada continua aditiva e idempotente; semeia `inbox.view_department` e `inbox.view_all`, atribui a `admin`/`supervisor`, cria `public.log_unauthorized_inbox_scope(text)`, revoga `PUBLIC`/`anon`/`service_role` e libera `authenticated`. O teste SQL real e a assinatura gerada em `types.ts` foram preservados.
- O que não fiz: não alterei workflow, CI, manifesto, tela, hook, Edge Function nem dados fora das tabelas de catálogo de permissões previstas no cartão.

Ponto 3: rodar teste do cartão e `zapp-verify full .`.
- Teste do cartão, verde: `zapp-db-local psql . v2-2610130322434c -v ON_ERROR_STOP=1 < supabase/migrations/20261011142742_inbox_scope_permissions.sql` seguido de `zapp-db-local psql . v2-2610130322434c -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql` -> `NOTICE: inbox_scope_permissions: suite OK (T1 catalogo, T2 papeis, T3 ACL, T4 gravacao, T5 dedupe, T6 escopo, T7 invalido, T8 anon, T9 sem identidade, T10 escrita direta, T12 seed idempotente, T13 dedupe por hora, T11 rollback)`.
- `zapp-verify full .`, primeira execução: gates `db_guard`, `tipos`, `lint` e `migrations` passaram, mas a suíte completa falhou em teste TalkX fora do diff (`RuleValueInput.test.tsx` procurando o botão `Novo segmento`). `jev-juiz falha /home/joaquim_ataides/.local/state/zapp-verify/48b7e929f129/testes.log` classificou como `pre_existing`.
- Confirmação fora do meu diff: com `git stash`, rodei na base o teste TalkX isolado e ele passou (`Test Files 1 passed (1); Tests 1 passed | 4 skipped (5)`). Reapliquei o stash depois.
- `zapp-verify full . v2-2610130322434c`: gates até `travas` passaram, mas `banco_local` falhou por diferenças amplas entre o stack local e o retrato de produção (`ESTRUTURA: 185 diferença(s)`), incluindo vários objetos alheios ao cartão; não corrigi porque seria fora do escopo.
- `zapp-verify full .`, segunda execução exata: gates `db_guard`, `tipos`, `lint` e `migrations` passaram de novo, mas a suíte completa voltou vermelha em testes fora do diff (`FilesTab.period.integration.test.tsx`, `RuleValueInput.test.tsx` e erro assíncrono em `RealtimeInboxView.selectedMessagesError.test.tsx`). `jev-juiz falha` classificou como `pre_existing`.
- Confirmação na base: com `git stash`, rodei isolados os três testes citados pela segunda execução. TalkX passou, FilesTab passou, e `RealtimeInboxView.selectedMessagesError.test.tsx` reproduziu na base o erro `ERR_INVALID_ARG_TYPE`/WebSocket. Reapliquei o stash depois. Não mexi nesses testes porque são fora dos arquivos permitidos.

## Arquivos alterados

`git diff --cached --name-only`:

.tmp/relato.md
src/integrations/supabase/types.ts
supabase/migrations/20261011142742_inbox_scope_permissions.sql
supabase/tests/inbox_scope_permissions.sql

## Verificações executadas

- `zapp-db-local psql . v2-2610130322434c -v ON_ERROR_STOP=1 < supabase/migrations/20261011142742_inbox_scope_permissions.sql` -> aplicou a migration no banco local.
- `zapp-db-local psql . v2-2610130322434c -v ON_ERROR_STOP=1 < supabase/tests/inbox_scope_permissions.sql` -> `suite OK` incluindo rollback.
- `bunx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx -t '"em breve": Lead score e Risco de churn ficam desabilitados no catálogo'` -> `Test Files 1 passed (1); Tests 1 passed | 4 skipped (5)` depois de reaplicar o diff.
- `zapp-verify full .` -> vermelho duas vezes em testes fora do diff; registrado acima com juiz e confirmação na base.
- `zapp-verify full . v2-2610130322434c` -> vermelho em `banco_local` por diferença estrutural ampla do stack local contra retrato de produção; registrado acima.

## O que NÃO fiz

- Não acessei banco remoto nem produção.
- Não consertei testes de TalkX/FilesTab/RealtimeInbox nem diferenças gerais do stack local, porque estão fora dos arquivos permitidos e fora do comportamento aprovado deste cartão.
