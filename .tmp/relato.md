<<<<<<< HEAD
Especialista: worker

(relato em construcao)
=======
Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261012233536_gamification_revoke_client_rpcs.sql (novo): REVOKE EXECUTE de
  PUBLIC, anon e authenticated em public.add_agent_xp(uuid,integer),
  public.grant_agent_achievement(uuid,text,text,text,integer),
  public.increment_agent_messages(uuid,text) e public.update_agent_streak(uuid,boolean); GRANT
  EXECUTE só para service_role. Fecha a fronteira invocável pelo cliente nas 4 RPCs de gamificação
  — antes (20260930113613) authenticated tinha EXECUTE e um agente logado inflava o próprio XP/nível
  por chamada direta a /rest/v1/rpc/*. Não muda corpo de função, tabela, policy nem gatilho.
- supabase/tests/gamification_revoke_client_rpcs.sql (novo): prova em banco descartável, rodando como
  postgres com SET LOCAL ROLE authenticated, transação revertida (sem side effect).

## Prova
- vermelho antes: `zapp-db-local psql . <copia> < .tmp/red-vacuidade.sql` (restaura os 4 GRANTs a
  authenticated em uma transação revertida) →
  `NOTICE: RED T1: authenticated tem EXECUTE em add_agent_xp = t`
  `NOTICE: RED T2: chamada direta como authenticated -> P0001 / p_xp exceeds single-call maximum of 500, got 9999`
  Ou seja: sem a migration a barreira era só a guarda de entrada (P0001), não a ACL — a asserção T2
  do teste (exige 42501 + 'permission denied for function') FALHA. A prova não é vacuosa.
- verde depois: `zapp-db-local psql . <copia> < supabase/tests/gamification_revoke_client_rpcs.sql`
  →
  `NOTICE: T1 OK: public.add_agent_xp(uuid,integer) -> anon=false authenticated=false PUBLIC=false service_role=true`
  `NOTICE: T1 OK: public.grant_agent_achievement(uuid,text,text,text,integer) -> anon=false authenticated=false PUBLIC=false service_role=true`
  `NOTICE: T1 OK: public.increment_agent_messages(uuid,text) -> anon=false authenticated=false PUBLIC=false service_role=true`
  `NOTICE: T1 OK: public.update_agent_streak(uuid,boolean) -> anon=false authenticated=false PUBLIC=false service_role=true`
  `NOTICE: T3 OK: sent=10 streak=1 best=1 conquista=1 xp=1 achievements=1`
  `NOTICE: T2 OK add_agent_xp: 42501 - permission denied for function add_agent_xp`
  `NOTICE: T2 OK grant_agent_achievement: 42501 - permission denied for function grant_agent_achievement`
  `NOTICE: T2 OK increment_agent_messages: 42501 - permission denied for function increment_agent_messages`
  `NOTICE: T2 OK update_agent_streak: 42501 - permission denied for function update_agent_streak`
  `GAMIFICATION REVOKE CLIENT RPCS: OK`  (exit=0)
- ACL conferida direto no banco local após aplicar a migration (has_function_privilege):
  anon=f authenticated=f service_role=t nas 4 funções.
- T3 prova que a pontuação de verdade não quebrou: INSERT de uma mensagem do agente no marco de 10
  (gatilho trg_gamification_on_message_sent) incrementa messages_sent 9→10, current_streak/best_streak
  0→1 e concede a conquista '10 Mensagens' com XP pela rotina interna SECURITY DEFINER — nada disso
  passa pelo RPC público revogado.

## O que NÃO fiz e por quê
- Não toquei src/ (fora da minha área). O único consumidor cliente das 4 RPCs é
  src/hooks/gamification/mutations.ts, usado só pela GamificationProvider, que não está montada no
  app; nenhuma tela chama essas RPCs (git grep em src/). Depois do REVOKE, qualquer chamada daquela
  camada recebe 42501 — comportamento pretendido pelo cartão.
- Não toquei o corpo das 4 funções nem o gatilho: a pontuação de servidor já é SECURITY DEFINER e não
  depende do EXECUTE de authenticated.
- Não criei scripts/db-audit/*.test.sh nem passo em .github/workflows/db-guard.yml (fora dos arquivos
  do cartão); a prova ficou em supabase/tests/, como o cartão indica.
- Não citei identificador, URL nem o papel do banco real.

## Passada de efeitos colaterais
- Só ACL: nenhum UPDATE/INSERT de dados, nenhum gatilho disparado pela migration (nenhum DML).
- Rollback real e executável no cabeçalho (GRANTs de volta a authenticated + service_role, estado de
  20260930113613); nada tocado além do EXECUTE de authenticated.
- Atômica: um único arquivo, sem DDL de tabela.
>>>>>>> 0eba2d9cd (chore(db): relato da revogacao de EXECUTE das RPCs de gamificacao)
