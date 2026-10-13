Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013044500_gamification_streak_dias_seguidos.sql (novo): "Dias seguidos" (agent_stats.current_streak) passa a contar DIAS consecutivos com atividade do agente, não mensagens. Novo gatilho único `public.register_agent_active_day(uuid, date)`: primeiro evento do dia soma 1 (se o dia anterior foi ativo) ou reinicia em 1 (se pulou) e grava `last_active_date`; repetir no MESMO dia é no-op; evento retrocedido não mexe. Coluna aditiva `agent_stats.last_active_date date`. `handle_message_gamification` deixa de somar streak por mensagem e chama o gatilho (guardando mensagens_sent); `handle_conversation_closure_gamification` também registra o dia (conversa encerrada conta como atividade); `update_agent_streak` (caminho do navegador) passa a delegar ao mesmo gatilho. Backfill a partir do histórico real (messages enviadas + closures) por dia America/Sao_Paulo, sem inflar.
- supabase/tests/gamification_streak_dias_seguidos.sql (novo): 11 provas (núcleo de dias T1–T5, gatilhos T6–T8, RPC T9, backfill T10, ACL T11), em BEGIN…ROLLBACK.
- Arquivos do cartão (supabase/migrations/**, supabase/tests/**) — não toquei em src/**, Edge nem outro.

## Prova (banco local descartável, migrations reais aplicadas)
- vermelho antes (sem a migration): `zapp-db-local psql … < supabase/tests/gamification_streak_dias_seguidos.sql` → `ERROR: column "last_active_date" does not exist` (red_rc=3)
- vermelho antes (comportamental, corpo ANTIGO do gatilho): 2 mensagens no MESMO dia → `current_streak = 7` partindo de 5 (somava por mensagem).
- verde depois (corpo novo, mesmo cenário T6): 2 mensagens no mesmo dia → +1. Saída completa do teste: `BEGIN … ROLLBACK`, `green_rc=0` (todas as DO bloquearam em silêncio).
- rollback executável: as 6 linhas `--   ` do topo rodam limpas no banco → `BEGIN … ROLLBACK`, `rollback_rc=0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (370s)`; banco_local fica NÃO VERIFICADO sem nome de conjunto (é como o fechar chama) — a prova de banco está acima.

## Antes/depois (sequência)
- Cenário controlado do teste (3 dias seguidos): antes `999` (inflado = mensagens) → depois `3`; com buraco no meio conta só o sufixo (→ `1`); último dia anterior a ontem → `0`; agente sem atividade → `0`.
- No banco local, `agent_stats` tem 4 perfis (Agente/Admin/Supervisor/E2E Local) e o replay não traz histórico de `messages`/`conversation_closures` para eles: antes e depois `0/0`, `last_active_date` NULL. Os "9 agentes" com a streak inflada são de produção, que este cartão não acessa (regra R1) — o comportamento antigo×novo está provado acima nos cenários controlados.

## Efeitos colaterais verificados
- O backfill só faz UPDATE em linhas cujo valor realmente muda (`IS DISTINCT FROM`), então `updated_at` das demais não é reescrito (a tabela tem trigger de `updated_at`; sem a guarda, todas seriam reescritas).
- A gravação de streak é idempotente no dia; o registro de dia em `handle_message_gamification` é envolvido pelo `EXCEPTION WHEN OTHERS` já existente, então nunca derruba o enqueue.
- `register_agent_active_day` é owner-only (`REVOKE … FROM PUBLIC, anon, authenticated`), conferido no T11; `update_agent_streak` mantém EXECUTE para authenticated (T11). Nenhum outro GRANT/papel mudou.

## O que NÃO fiz e por quê
- Não editei migration existente (correção = migration nova).
- Achado fora do escopo (não corrigido, só registrado em comentário no cartão): em `handle_conversation_closure_gamification` o marco de resoluções chama `grant_agent_achievement(..., LEAST(100, v_resolved))` com `v_resolved bigint` e a assinatura pede `integer` → 42883; hoje isso cai no `EXCEPTION WHEN OTHERS` (bloco externo) e desfazia TODAS as escritas daquele fechamento (inclusive o streak). Na migration, o PERFORM da conquista ficou num bloco aninhado para o registro de dia não se perder; a correção da assinatura/binário é de outro cartão.
- Não liguei a suíte ao CI: `supabase/tests/*.sql` não é auto-executada; o passo em db-guard.yml (se o cartão pedir) é do worker (ci).
