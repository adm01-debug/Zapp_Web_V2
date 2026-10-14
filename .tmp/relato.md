Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `tests/talkx/save_talkx_template.test.ts` (novo): teste de INTEGRAÇÃO REAL da RPC `public.save_talkx_template`, sem mock de auth nem de RPC. Cada caso abre transação própria (`begin ... rollback`), monta a fixture do template, entra como cliente autenticado com `set local role authenticated` + `request.jwt.claims` (o mesmo caminho de `auth.uid()` da sessão real) e fala com o banco local pelo psql do conjunto (`zapp-db-local psql . <conjunto>`).
- O conteúdo do arquivo é o mesmo que eu já havia entregue na branch `v2/teste-save-talkx-template-261013113163c8` (@ b2b5944008), recuperado via `git show`; a branch atual tem SÓ o meu commit (sem commit alheio, sem cherry-pick).

## Prova (vermelho antes, verde depois)
- Conjunto local subido: `zapp-db-local up . v2-26101322126fcc` → exit 0 (`TRAVAS: conferidas (DNS da produção preso, agendador desligado, pg_net sem envio)`). Nenhuma produção tocada; DB_REF de produção só aparece no `.hermes-tarefa` como referência.
- VERMELHO, sem a migration `20261011000012_talkx_template_save_rpc.sql` aplicada (`ZAPP_DB_LOCAL=v2-26101322126fcc node --test tests/talkx/save_talkx_template.test.ts`, RC=1):
  - `AssertionError [ERR_ASSERTION]: a RPC save_talkx_template nao existe no banco`
  - `ERROR:  function public.save_talkx_template(uuid, timestamp with time zone, unknown, unknown, unknown, unknown, unknown, unknown, text[], text[], unknown) does not exist` (sqlstate 42883)
  - `ℹ tests 5 / ℹ pass 0 / ℹ fail 5`
- Migration aplicada SÓ no banco local: `hermes-db-migrar supabase/migrations/20261011000012_talkx_template_save_rpc.sql` → `APLICADA no banco LOCAL 'v2-26101322126fcc' (produção não foi tocada)`. O arquivo da migration NÃO entrou no commit (foi retirado da árvore antes de commitar; a branch tem apenas o teste).
- VERDE, com a migration aplicada (mesmo comando, RC=0), 2 rodadas seguidas para provar isolamento (cada caso termina em ROLLBACK, sem dado residual):
  - rodada 1: `ℹ tests 5 / ℹ pass 5 / ℹ fail 0`
  - rodada 2: `ℹ tests 5 / ℹ pass 5 / ℹ fail 0` (5 linhas `✔`)
- `zapp-verify . --rapido` → `OK db_guard / OK tipos / OK lint / OK migrations` e `VERIFY: VERDE SEM BANCO (169s)`.

## Requisitos do cartão, e onde cada um está no arquivo
- Assinatura LITERAL asserida: `ASSINATURA_RPC = 'public.save_talkx_template(uuid,timestamptz,text,text,text,text,text,text,text[],text[],text)'` conferida por `to_regprocedure(...) is not null` (casos 1 e 5).
- Transação com ROLLBACK: `transacao()` emite `begin; ... rollback;`; as evidências voltam na linha marcada `@@EV@@`.
- Optimistic locking por EXCEPTION, não por retorno vazio: caso 3 exige `sqlstate 40001` e `mensagem = 'optimistic_lock_failed'` com `expected_updated_at` 1s atrás, e prova que nada mudou (`total_versoes = 0`, `updated_at_mudou = false`). Caso 4 exige `P0002 / talkx_template_not_found`.
- `note` exata e incremento de `version_number` contra valor explícito: caso 2 afirma `version_number = 1` e `= 2`, `note = 'nota do usuario'` e `= 'nota final'`, `saved_by` = perfil da sessão, `total_versoes = 2`.
- Negação distinguível de ausência: caso 1 prova que a RPC existe E que a fixture existe antes de exigir `42501 / permission denied|authentication_required` (anon) e `42501 / authenticated_profile_not_found` (sem perfil).

## O que NÃO fiz e por quê
- Não editei nem commitei a migration `20261011000012_talkx_template_save_rpc.sql` (o cartão diz SOMENTE leitura / sem commitá-la); apliquei-a apenas no banco local para a prova verde.
- Não alterei nenhum teste existente, não usei `skip` nem aumentei timeout de teste alheio.
- A migration aplicada deixa o banco local do conjunto diferente do retrato de produção — é esperado (a migration muda o schema) e `zapp-verify` só avisou que o banco não foi verificado por falta do nome do conjunto.
