Especialista: workersql (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011174630_contacts_waiting_por_atribuicao.sql (NOVO, aditiva):
  * gatilho `trg_contacts_assignment_status_sync` (BEFORE UPDATE OF assigned_to, WHEN `OLD.assigned_to IS DISTINCT FROM NEW.assigned_to`) chama `public.sync_conversation_status_with_assignment()` (SECURITY DEFINER, `search_path = public, pg_temp`), atrás da flag `inbox.status-fsm`: tirar o responsável de um contato `open` -> `waiting`; atribuir responsável a um `waiting` -> `open`; os dois carimbam `conversation_status_changed_at`. Estados terminais (`resolved`/`archived`) não são tocados. A mudança é PROPOSTA no mesmo UPDATE e o gatilho FSM existente valida (ambas as transições são válidas).
  * INSERT da chave `inbox.status-fsm` (`enabled=true`, `ON CONFLICT (key) DO NOTHING`). Sem a linha o gatilho ficaria permanentemente inerte; mesmo padrão da migration do `inbox.talk-me` (20260930290000). Preserva o valor vigente se a chave já existir (no banco local a seed traz `enabled=true`, então o INSERT foi 0 linha).
  * backfill idempotente: contatos `open` + sem responsável + com >=1 mensagem -> `waiting`; desliga `update_contacts_updated_at` só durante o UPDATE para NÃO reescrever `updated_at` de linhas existentes (o FSM segue ligado).
  * `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` na função do gatilho.
- supabase/tests/contacts_waiting_por_atribuicao.sql (NOVO): suíte no banco LOCAL, 5 casos, com o papel real.

## Prova
- vermelho antes (arquivo final, sem o gatilho): `zapp-db-local psql . v2-26101114412bb4 -v ON_ERROR_STOP=1 < supabase/tests/contacts_waiting_por_atribuicao.sql` -> `ERROR:  C2 FALHOU: esperava waiting e veio open`
- verde depois: mesmo comando -> `NOTICE:  contacts_waiting_por_atribuicao: suite OK (C1 flag off, C2 tira responsavel, C3 atribui, C4 terminal, C5 backfill idempotente) -- 5 grupo(s) verificado(s)` seguido de `DO` / `ROLLBACK`
- papel real: os UPDATE rodam como `authenticated` (admin sintético com JWT em `request.jwt.claims`), nunca como postgres.
- confirmação do "hoje nada sincroniza / backfill não aplicado" no banco local: `pg_trigger` de contacts tinha 12 gatilhos e NENHUM de sincronização de atribuição; contagem antes `waiting=0, open=13, alvo_backfill=2`.
- backfill antes/depois: apliquei com `hermes-db-migrar` -> `UPDATE 2`; depois `waiting=2, alvo_backfill=0, updated_at_preservado=2` (as 2 linhas mantiveram `updated_at`).
- rollback de verdade: executei o bloco `-- Rollback (SQL executável, na ordem)` -> `DROP TRIGGER / DROP FUNCTION / UPDATE 2 / DELETE 1`; conferido `gatilho=0, funcao=0, flag=0, voltaram_open=2`; reapliquei a migration e a suíte voltou ao verde.
- verificação rápida: `zapp-verify . --rapido` -> `OK dependencias; OK db_guard; OK tipos 110s; OK lint; OK migrations; VERIFY: VERDE SEM BANCO` (o fechar não passa o nome do conjunto e o banco_local é pulado; a suíte de banco foi rodada à parte, como acima).

## Efeito esperado em produção (não medido aqui)
Estático: no dia em que a migration for promovida, contatos com `conversation_status='open'`, `assigned_to IS NULL` e ao menos uma mensagem passam a `waiting`. O ~315 do cartão é a expectativa sobre o banco real; não executo nada em produção.

## O que NÃO fiz e por quê
- Não toquei o front: a lista e os chips já leem `conversation_status` (fora do meu escopo, o cartão diz isso).
- Não forcei a flag ligada: se a chave existir desligada em produção, o valor vigente é preservado e o gatilho fica inerte até o operador ligar (ADR-005 rollout, passo 3 "ligar a flag por padrão").
- Não adicionei passo de CI: nenhum workflow referencia `supabase/tests/*.sql`; as 9 suítes existentes rodam por `zapp-db-local`, como esta.
