Especialista: workertestes

## O que mudou e por quê
- src/hooks/gamification/__tests__/levelUtils.test.ts (novo): prova o nível do cliente —
  tabela canônica xp→nível (bordas 50/200/450), o cliente lendo a fórmula REAL do SQL
  (supabase/migrations/20260927500000_gamification_bigint_and_daily_ratelimit.sql) e
  exigindo o mesmo nível em toda a faixa 0..2000, além dos limites de levelProgress
  (0..100) e do xpForNextLevel.
- supabase/tests/gamification_nivel_paridade_rls.sql (novo): paridade do banco
  (public.calculate_level contra a MESMA linha PARIDADE-NIVEL que o teste do cliente
  lê — mexer num lado sem o outro fica vermelho) + RLS com o papel REAL
  (SET LOCAL ROLE authenticated + request.jwt.claims): agente comum não altera
  agent_stats nem insere em agent_achievements; o admin altera/insere na mesma linha
  (a negação é policy, não tabela vazia/quebrada) + gatilhos de mensagem e de
  encerramento incrementando, e a gamificação nunca derrubando o envio.
  Roda em BEGIN…ROLLBACK: nenhuma fixture persiste.

## Prova
- vitest (verde, rodado agora): `Test Files  1 passed (1)` ; `Tests  9 passed (9)`.
- vermelho antes (mutação no cliente, divisor 50 → 100 em levelUtils.ts, restaurado
  depois): `npx vitest run src/hooks/gamification/__tests__/levelUtils.test.ts` →
  `AssertionError: xp=50: expected 1 to be 2` ; `Tests  3 failed | 6 passed (9)`
- vermelho no banco (mutação do divisor 50 → 100 dentro da transação, no próprio
  calculate_level): `zapp-db-local psql "$PWD" gamifpar1 -v ON_ERROR_STOP=1 < .tmp/mut_nivel_run.sql`
  → `ERROR:  T1 FALHOU: tabela PARIDADE-NIVEL divergiu: 50->1(esperado 2), 51->1(esperado 2), 200->2(esperado 3), ...` (exit 3)
- vermelho no banco (mutação da policy de UPDATE do agent_stats para USING (true)):
  `zapp-db-local psql "$PWD" gamifpar1 -v ON_ERROR_STOP=1 < .tmp/mut_rls2_run.sql`
  → `ERROR:  T2 FALHOU: agente comum alterou agent_stats direto (1 linha(s))` (exit 3)
- verde no banco: `zapp-db-local psql "$PWD" gamifpar1 -v ON_ERROR_STOP=1 < supabase/tests/gamification_nivel_paridade_rls.sql`
  → `NOTICE:  T1 OK` … `T2 OK` `T2b OK` `T2c OK` `T3 OK` `T3b OK` `T3c OK` `T4 OK`
  `T5 OK` `T6 OK` `T6b OK` `T7 OK` e `ROLLBACK` (exit 0). O T2/T3 são o papel real:
  `T2 OK: agente barrado em agent_stats (0 linhas afetadas)` e
  `T3 OK: agente barrado em agent_achievements (42501 new row violates row-level security policy)`.

## Pendência registrada (dono: worker sql / trilha de banco)
- O marco 10 do encerramento ficou como PENDÊNCIA do dono da função, já em
  kanban_comment neste cartão e com WARNING explícito no teste:
  `handle_conversation_closure_gamification` chama
  `grant_agent_achievement(uuid,text,text,text,integer)` com `LEAST(100, v_resolved)`
  sendo v_resolved bigint → 42883; o EXCEPTION WHEN OTHERS engole e REVERTE o corpo, então
  no marco `conversations_resolved` volta a 9 e nenhuma conquista entra (medido:
  `WARNING: T6b PENDENCIA: marco 10 terminou com conversations_resolved=9 (esperado 10) e
  conquista resolution_milestone=0`). É defeito real e PRÉ-EXISTENTE, fora do escopo de um
  cartão de teste (não toco migration); o caminho não-marco do encerramento conta certo
  (`T6 OK: 1 → 2`) e o "não derruba o encerramento" fica provado no T6b.
- A prova por mutação tocou produção só dentro de transação e foi revertida (mutação do
  cliente restaurada no mesmo arquivo; mutações de banco com rollback).
- Não rodei a suíte inteira: só o arquivo de teste do cartão e o teste SQL no banco local
  da tarefa, conforme o passo 5 do fluxo.
