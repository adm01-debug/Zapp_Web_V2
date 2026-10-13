Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013044500_gamification_streak_dias_seguidos.sql (novo): "Dias seguidos" (agent_stats.current_streak) passa a contar DIAS consecutivos com atividade do agente, não mensagens. Gatilho único `public.register_agent_active_day(uuid, date)`: primeiro evento do dia soma 1 (se o dia anterior foi ativo) ou reinicia em 1 (se pulou) e grava `last_active_date`; repetir no MESMO dia é no-op; evento retrocedido não mexe. Coluna aditiva `agent_stats.last_active_date date`. `handle_message_gamification` deixa de somar streak por mensagem e chama o gatilho (segue somando messages_sent); `handle_conversation_closure_gamification` também registra o dia (conversa encerrada conta como atividade); `update_agent_streak` (caminho do navegador) delega ao mesmo gatilho. Backfill do histórico real (messages enviadas + closures, por dia America/Sao_Paulo).
- supabase/tests/gamification_streak_dias_seguidos.sql (novo): suíte em BEGIN…ROLLBACK cobrindo núcleo de dias, gatilho de mensagem, gatilho de encerramento, RPC do navegador, backfill e ACL.
- .tmp/relato.md: este relato.
- Só toquei em supabase/migrations/** e supabase/tests/** (arquivos do cartão); nada em src/**, Edge ou outro.

## Prova (banco local descartável, migrations reais aplicadas)
- vermelho antes (sem a migration): `zapp-db-local psql … < supabase/tests/gamification_streak_dias_seguidos.sql` → `ERROR: column "last_active_date" does not exist` (red_rc=3)
- vermelho antes (comportamental, corpo ANTIGO do gatilho de mensagem): 2 mensagens no MESMO dia → `current_streak = 7` partindo de 5 (somava +1 por mensagem).
- verde depois (corpo novo, mesmo cenário): 2 mensagens no mesmo dia → +1. Saída completa da suíte: `BEGIN … ROLLBACK`, `green_rc=0` (nenhum RAISE).
- rollback executável (as linhas `--   ` do cabeçalho): os 5 statements rodam e `ROLLBACK`, `rollback_rc=0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`; banco_local fica NÃO VERIFICADO sem nome de conjunto (é como o fechar chama) — a prova de banco é a de cima.

## Efeitos colaterais verificados
- Gatilho de `updated_at`: `update_agent_stats_updated_at` (BEFORE UPDATE) regrava `updated_at` em toda linha tocada. Durante o backfill ele é DESLIGADO (`ALTER TABLE … DISABLE TRIGGER`) e REABILITADO no fim; a migration roda em transação única (o replay e o hermes-db-migrar aplicam migrations novas dentro de uma TX), então o rollback restaura. Prova antes/depois: T10d/T10e capturam `updated_at` antes do bloco e exigem que seja IDÊNTICO depois — sem o DISABLE, o backfill mudaria a data.
- O backfill ainda só faz UPDATE em linhas cujo valor realmente muda (`IS DISTINCT FROM`), então linhas já corretas não são tocadas.
- A gravação de streak é idempotente no dia; o registro do dia em `handle_message_gamification` está sob o `EXCEPTION WHEN OTHERS` que já existia, então nunca derruba o enqueue.
- `register_agent_active_day` é owner-only (`REVOKE … FROM PUBLIC, anon, authenticated`), conferido no T11; `update_agent_streak` mantém EXECUTE para authenticated (T11). Nenhum outro GRANT/papel mudou.

## Antes/depois (sequência)
- Cenário controlado (3 dias seguidos): antes `999` (inflado = mensagens) → depois `3`; com buraco no meio conta só o sufixo (→ `1`); último dia anterior a ontem → `0`; agente sem atividade → `0`.
- No banco local `agent_stats` tem 4 perfis (Agente/Admin/Supervisor/E2E Local) e o replay não traz histórico de `messages`/`conversation_closures` para eles: antes e depois `0/0`, `last_active_date` NULL. Os "9 agentes" com a streak inflada são de produção, que este cartão não acessa (regra R1) — o contraste antigo×novo está provado acima.

## O que NÃO fiz e por quê
- Não editei migration existente (correção = migration nova).
- Achado fora do escopo (registrado em comentário no cartão, não corrigido): em `handle_conversation_closure_gamification` o marco de resoluções chama `grant_agent_achievement(…, LEAST(100, v_resolved))` com `v_resolved bigint` e a assinatura pede `integer` (42883); isso cai no `EXCEPTION WHEN OTHERS` externo e desfazia TODAS as escritas daquele fechamento, inclusive o streak. Na migration o PERFORM da conquista ficou num bloco aninhado para o dia ativo não se perder; o conserto da assinatura é de outro cartão.
- Não liguei a suíte ao CI: `supabase/tests/*.sql` não é auto-executada; o passo em db-guard.yml (se o cartão pedir) é do worker (ci).
