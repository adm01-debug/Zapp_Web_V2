Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê

O diff deste cartão tem 3 arquivos: 2 de produto (1 migration + 1 suíte de teste em `supabase/tests/`) e o próprio `.tmp/relato.md` deste relato.

- `supabase/migrations/20261014101033_incoming_call_destinatarios_sem_responsavel.sql`: substitui (`create or replace`) `public.record_incoming_call_event` mantendo assinatura, validações, o INSERT/ON CONFLICT em `calls` (inclusive o `agent_id` histórico) e o texto/metadata da notificação; muda só QUEM é notificado na chamada recebida. Ordem de escolha: (1) responsável explícito (`contacts.assigned_to`) quando ONLINE em `agent_presence` (comportamento de hoje preservado); (2) senão, membros ATIVOS e ONLINE da fila do contato (`contacts.queue_id` via `queue_members`); (3) senão, administradores/supervisores ONLINE (`user_roles` + `agent_presence`). Uma notificação por destinatário, com teto de 25 por chamada (lista ordenada por `user_id`, corte estável — nada de fan-out sem limite numa transação só). Id determinístico por (conexão, evento, usuário) — antes o md5 não incluía o usuário e dois destinatários colidiriam no `ON CONFLICT (id) DO NOTHING`, que continua valendo: reentrega do mesmo evento não duplica. Quando ninguém está ONLINE não há erro e nenhuma notificação (mesmo resultado de hoje nesse caso). ACL reafirmado no fim: `EXECUTE` só para `service_role`.
- `supabase/tests/incoming_call_destinatarios_evento_sem_responsavel.sql`: prova de contrato T1–T9, roda dentro de `BEGIN…ROLLBACK` (fixtures não persistem).

## Prova

- vermelho antes, com a função anterior (o próprio `-- Rollback` desta migration aplicado no banco local):
  `zapp-db-local psql . v2-26101407060c75 < supabase/tests/incoming_call_destinatarios_evento_sem_responsavel.sql`
  → `ERROR:  T2 FALHOU: esperava 2 notificacoes (membros ONLINE), veio 0` (é o defeito do cartão: contato sem responsável não gerava alerta)
- verde depois, mesmo comando:
  → `NOTICE:  TODOS OS BLOCOS PASSARAM`, nenhum `ERROR` até o `ROLLBACK`. Cobrem: T1 responsável ONLINE (1 notificação, para ele); T2 sem responsável + fila com 2 ONLINE e 1 OFFLINE (2 notificações, nenhuma para o OFFLINE); T3 responsável OFFLINE cai para a fila; T4 fila sem ninguém ONLINE / contato sem fila cai na supervisão ONLINE (admin OFFLINE não recebe); T5 ninguém ONLINE = zero notificação, sem erro, chamada gravada; T6 reentrega do mesmo evento não duplica (created=false, duplicate=true); T7 ids distintos por destinatário e iguais a `md5('zapp:incoming-call:v1:<conexao>:<evento>:<usuario>')`; T8 `anon`/`authenticated` negados e `service_role` liberado (por `has_function_privilege` e por execução real com `set local role`); T9 fila com 30 membros ONLINE gera exatamente 25 notificações (teto) e o 26º não recebe.
- migration aplicada no banco local: `hermes-db-migrar supabase/migrations/20261014101033_incoming_call_destinatarios_sem_responsavel.sql` → `APLICADA no banco LOCAL 'v2-26101407060c75' (produção não foi tocada)`; reaplicada por psql depois dos testes vermelhos → `CREATE FUNCTION / REVOKE / GRANT`.

## Pontos do juiz automático

- Ponto 1 ("números/arquivos do relato não batem com o diff: 3 arquivos, 1 de teste"): corrigido — o relato agora declara os 3 arquivos (migration, suíte de teste e este relato) e 1 arquivo de teste.
- Ponto 2 ("LOOP que apaga/altera sem LIMIT nem teto"): procede; corrigido no código, não no relato. O `FOREACH` sobre os destinatários agora roda sobre uma lista cortada em `v_max_destinatarios constant integer := 25` (`v_target_user_ids := v_target_user_ids[1:25]`), com o corte estável porque a lista é montada com `ORDER BY user_id`. O T9 prova o teto (30 membros ONLINE → 25 notificações).

## Passada de efeitos colaterais

- Gatilhos: não crio nem desligo gatilho; a função escreve nas MESMAS tabelas de hoje (`calls`, `notifications`), sem UPDATE em massa e sem backfill (nenhum dado existente é reescrito).
- Atomicidade: a função é uma transação; os N inserts de notificação entram juntos ou nada entra, e N tem teto de 25.
- Sem oráculo novo: as únicas exceções novas são as mesmas de hoje (`status` inválido, evento >200, conexão que não bate) — nada diferencia caso existente de inexistente.
- ACL: nenhum GRANT novo nem afrouxado — o `REVOKE`/`GRANT` reafirma o estado vigente desde `20261004172554` (EXECUTE só `service_role`), e o T8 prova o negado e o permitido.

## O que NÃO fiz e por quê

- Não toquei `supabase/functions/**` nem `src/**`: o payload (`title`, `message`, `metadata`) é idêntico, então o hook `useIncomingCallListener` continua funcionando sem ajuste.
- Não reescrevi a migration `20261002531230` (regra: correção = migration nova); a definição dela é o meu `-- Rollback`, já executado acima para provar o vermelho.
- Ressalva honesta de transição: o id da notificação passa a incluir o usuário; um evento antigo reentregue depois desta migration gera id novo (pode virar um alerta duplicado pontual). Não há backfill para corrigir ids já gravados.
