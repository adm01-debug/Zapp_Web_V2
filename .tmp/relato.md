Especialista: senior (area-sql-banco)

# fix(sql): permite waiting -> archived em set_conversation_status

## Pontos da recusa

Ponto 1: a entrega anterior dizia que o no-op não reescrevia timestamps, mas T3 só conferia que archived -> archived não dava erro.
- O que mudei: em `supabase/tests/set_conversation_status_waiting_para_archived.sql`, T3 agora lê `conversation_status_changed_at` e `updated_at` antes e depois do no-op e falha se qualquer um mudar. Também mantive T2/T6b provando que falha de autorização não altera status/timestamp nem cria `conversation_closures`.
- Vermelho que prova a correção do teste: mutação local temporária da RPC para fazer `UPDATE` antes do `RETURN` no no-op, sem alterar arquivos versionados, e execução de `zapp-db-local psql . v2-26101118380f7c -v ON_ERROR_STOP=1 < supabase/tests/set_conversation_status_waiting_para_archived.sql` -> `ERROR:  T3 FALHOU: no-op reescreveu conversation_status_changed_at (antes=2026-10-01 00:00:00+00, depois=2026-10-11 21:54:54.195793+00)`.
- Verde depois: restaurei a função pela migration versionada e rodei o mesmo teste -> `NOTICE:  set_conversation_status_waiting_para_archived: suite OK (T0 gatilho, T1 waiting->archived, T2 permissao sem efeito, T3 no-op, T4 archived->open, T5 recusas, T6 fechamento, T6b negacao sem fechamento, T7 ACL) — 9 grupo(s)` seguido de `ROLLBACK`.

## Arquivos alterados
`git diff --name-only HEAD`:
- `.tmp/relato.md`
- `supabase/migrations/20261011162528_set_conversation_status_waiting_para_archived.sql`
- `supabase/tests/set_conversation_status_waiting_para_archived.sql`

## O que mudou e por quê
- `supabase/migrations/20261011162528_set_conversation_status_waiting_para_archived.sql`: mantém a correção da entrega anterior, com migration nova que recria `public.set_conversation_status(uuid,text,text)` e adiciona somente `archived` ao ramo `waiting`. O corpo preserva autorização antes de qualquer efeito e antes do no-op, `FOR UPDATE`, no-op idempotente, `conversation_closures` só para `resolved`, assinatura, `SECURITY DEFINER`, `search_path` e grants já existentes.
- `supabase/tests/set_conversation_status_waiting_para_archived.sql`: mantém a suíte SQL real e reforça o ponto recusado. T3 agora prova no banco que o no-op archived -> archived não mexe em `conversation_status_changed_at` nem em `updated_at`; T2/T6b provam falha antes de escrita; T0 valida o gatilho FSM; T1 valida waiting -> archived via RPC; T4/T5/T6/T7 protegem transições vizinhas, fechamento e grants.
- Ainda no teste: acrescentei bootstrap transacional só para o banco LOCAL da tarefa criar `public.calculate_level(integer)` se a base local estiver sem essa função. Isso evita que os gatilhos auxiliares de onboarding de `auth.users`/`profiles` quebrem a fixture sintética antes de chegar ao contrato deste cartão. O bootstrap roda dentro do `BEGIN` do teste e desaparece no `ROLLBACK`; não muda a migration nem o contrato de produção.

## Prova executada agora
- Aplicação da migration no banco local: `zapp-db-local psql . v2-26101118380f7c -v ON_ERROR_STOP=1 < supabase/migrations/20261011162528_set_conversation_status_waiting_para_archived.sql` -> `CREATE FUNCTION`, `REVOKE`, `GRANT`, `GRANT`, `GRANT`.
- Teste verde: `zapp-db-local psql . v2-26101118380f7c -v ON_ERROR_STOP=1 < supabase/tests/set_conversation_status_waiting_para_archived.sql` -> `NOTICE:  set_conversation_status_waiting_para_archived: suite OK (T0 gatilho, T1 waiting->archived, T2 permissao sem efeito, T3 no-op, T4 archived->open, T5 recusas, T6 fechamento, T6b negacao sem fechamento, T7 ACL) — 9 grupo(s)` e `ROLLBACK`.
- Rollback real: extraí as linhas `--   <stmt>;` do bloco `-- Rollback` e rodei no banco local -> `CREATE FUNCTION`, `REVOKE`, `GRANT`, `GRANT`, `GRANT`; em seguida o teste falhou em T1 com `invalid transition waiting -> archived`, provando que o corpo anterior foi restaurado. Depois reapliquei a migration e o teste voltou ao verde.

## Autorrevisão
- Escopo: só migration SQL, teste SQL e relato; não toquei tela, hook, Edge, CI, manifesto nem arquivo de outro cartão.
- Segurança/isolamento: autorização continua antes do no-op; `anon` segue sem EXECUTE; nenhum papel novo foi criado; grants são os mesmos reemitidos.
- Efeito colateral: T2/T6b verificam falha sem escrita; T3 verifica no-op sem reescrever timestamps; T5 garante que transições de `archived` para `waiting/resolved` continuam proibidas.
- Rollback: primeira linha tem `-- Rollback:` e o bloco executável restaura o corpo anterior completo da função e grants.

## O que NÃO fiz e por quê
- Não editei a migration antiga `20260930090000_*`: correção de banco é migration nova.
- Não desabilitei gatilho nem RLS no teste. O teste chama a RPC real com papel `authenticated` e claims sintéticos; o bootstrap de `calculate_level` só evita falha de fixture fora do contrato do cartão e é revertido no `ROLLBACK`.
- Não criei script novo fora de `supabase/tests/`; a prova versionada fica junto dos testes SQL do banco.