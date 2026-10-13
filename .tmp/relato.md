Especialista: senior (area-sql-banco)

## O que mudou e por quê
- Reapliquei sobre `dia/2026-10-13` o trabalho SQL aprovado do cartão original, sem trazer relato/commits alheios: a migration `supabase/migrations/20261011192905_global_settings_secrets.sql` e o teste real `supabase/tests/global_settings_secrets_rls.sql`.
- O escopo ficou limitado à proteção de `public.global_settings`: supervisor continua lendo configurações não secretas, mas não lê nem altera chaves terminadas em `_api_key`, `_secret` ou `_token`; admin mantém leitura/escrita; papel comum e anônimo seguem sem acesso.

## Pontos da recusa / retomada
- Ponto 1: conflito após trabalho aprovado — resolvido reaplicando só os 2 arquivos do commit aprovado de código (`90390f6987`) na ponta atual. Prova de escopo: `git diff --stat` mostra apenas `supabase/migrations/20261011192905_global_settings_secrets.sql` e `supabase/tests/global_settings_secrets_rls.sql`.
- Ponto 2: preservar o comportamento aprovado, não reimplementar outro caminho — mantive a migration e o teste SQL do trabalho aprovado, com teste executando a policy real no PostgreSQL descartável, inclusive rollback verbatim.

## Prova
- Vermelho sem o conserto: `.tmp/run_global_settings_sql_test.sh red` -> `red_exit=3`; linha relevante: `ERROR:  GS-SECRETS FALHOU [B1b supervisor ve 0 das 4 chaves secretas]: esperado 0, obtido 4`.
- Verde com o conserto: `.tmp/run_global_settings_sql_test.sh green` -> `green_exit=0`; linha relevante: `GS-SECRETS OK: supervisor sem acesso nem escrita de chave secreta; admin le/altera; agente comum e anonimo nao veem nada; nenhuma policy de escrita aceita supervisor; rollback verbatim restaura o estado anterior e reexpoe o segredo.`
- `zapp-verify full .` executou a verificação ampla: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; depois falhou em `testes` com `Test Files 2 failed | 1331 passed (1333)` e erro em spec de front (`src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx`). Rodei `jev-juiz falha /home/joaquim_ataides/.local/state/zapp-verify/6d47b2450553/testes.log` e ele classificou como `pre_existing` (certeza 0.86). Confirmei na base com minhas mudanças em stash: `bunx vitest run src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` -> `test_exit=1`, com `Tests 3 passed (3)` e `Errors 1 error` (`ERR_INVALID_ARG_TYPE`) mesmo sem este diff SQL.

## Arquivos
- `supabase/migrations/20261011192905_global_settings_secrets.sql`
- `supabase/tests/global_settings_secrets_rls.sql`

## O que não fiz
- Não alterei testes/front fora do escopo para mascarar a falha pré-existente do `zapp-verify full`.
- Não mexi em manifesto, guarda, CI, tipos gerados nem banco de produção.
