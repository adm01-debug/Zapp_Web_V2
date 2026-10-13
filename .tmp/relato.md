Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261012235745_dashboard_daily_series.sql` (NOVO): cria a RPC
  `public.dashboard_daily_series(p_days int default 7)` — série diária de atividade no fuso
  `America/Sao_Paulo`, uma linha por dia do período, com: `messages_received`, `messages_sent`,
  `new_contacts`, `conversations_opened`, `conversations_resolved`, `active_contacts` e
  `median_response_time_seconds` (NULL sem amostra). Só ADITIVA: não cria tabela, coluna nem policy;
  `SECURITY DEFINER` com `SET search_path = public, pg_temp`; `REVOKE ALL ... FROM PUBLIC, anon` e
  `GRANT EXECUTE ... TO authenticated, service_role`. Trava de papel: `is_admin_or_supervisor(auth.uid())`
  ou `auth.role() = 'service_role'`; qualquer outro leva `42501 dashboard_daily_series_requires_staff`.
  `p_days` é limitado a 90 (piso 1) com `greatest(least(coalesce(p_days,7),90),1)`. Rollback no topo com
  SQL executável: `drop function if exists public.dashboard_daily_series(integer);`.
- `scripts/db-audit/dashboard-daily-series.test.sh` (NOVO): harness descartável (postgres:17-alpine próprio),
  aplica a migration REAL e prova, com papéis reais `anon`/`authenticated`/`service_role` (nunca como postgres):
  números batem com a contagem manual, admin e supervisor leem, agente comum é barrado (42501), `anon`/`PUBLIC`
  sem EXECUTE, `service_role` lê, `p_days` limitado a 90 (com piso 1), dia sem movimento com contadores 0 e
  mediana NULL, reaplicação idempotente e o Rollback remove a função (volta ao RED).
- `.github/workflows/db-guard.yml`: registra o harness como passo (obrigatório — `check-test-inventory.mjs`
  reprova `.test.sh` órfão; por isso este arquivo entrou no diff além da lista do cartão, ver abaixo).
- `src/integrations/supabase/types.ts`: NÃO foi tocado. É artefato gerado do banco vivo (o `types-sync`
  regenera/abre PR depois que a migration chega ao banco); editar à mão aqui criaria drift contra o banco e
  um arquivo de `src/` sem teste próprio. O tipo da RPC entra junto com a entrega que a consome (filho de front).

## Prova
- banco local (papel real, banco descartável próprio): `bash scripts/db-audit/dashboard-daily-series.test.sh` →
  `[OK] DASHBOARD-03: dashboard_daily_series devolve a serie diaria correta (fuso de Sao Paulo), exige admin/supervisor ou service_role, mantem anon/PUBLIC sem EXECUTE, limita p_days a 90 e o Rollback remove a funcao.`
  (todas as linhas `[PASS]`, nenhuma falha).
- banco local da tarefa: `hermes-db-migrar supabase/migrations/20261012235745_dashboard_daily_series.sql` →
  `BEGIN / CREATE FUNCTION / COMMENT / REVOKE / REVOKE / GRANT / GRANT / COMMIT` e
  `APLICADA no banco LOCAL 'v2-26101220422aee' (produção não foi tocada).`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## Definições das métricas (documentadas no cabeçalho da migration)
- recebidas/enviadas: `messages` por `sender` ('contact'/'agent'), `is_deleted IS NOT TRUE`, no dia de SP.
- contatos novos: `contacts.created_at` no dia, `deleted_at IS NULL`.
- contatos ativos: contatos distintos com alguma mensagem (não deletada) no dia.
- conversas abertas: contatos cuja PRIMEIRA mensagem (mais antiga, não deletada) caiu no dia — "conversa iniciada
  no dia"; usa anti-join para o histórico anterior ao período (bounded ao período).
- conversas resolvidas: `count(DISTINCT contact_id)` em `conversation_closures` no dia (mesma convenção do
  `dashboard_kpi`, que conta contatos distintos por causa da reabertura no mesmo dia).
- mediana de resposta: `percentile_cont(0.5)` de `first_response_at - first_message_at` em `conversation_sla`,
  como o `dashboard_kpi` já faz; NULL quando o dia não tem amostra respondida.

## O que NÃO fiz e por quê
- Não recriei a view `evolution_daily_metrics` (o cartão veda): a série é calculada na RPC.
- Não mexi em fila/hook/tela: a trilha de banco vai separada; o consumo fica no filho de front (t_8f12e328).
- Toquei `scripts/db-audit/**` e `.github/workflows/db-guard.yml`, fora da lista de arquivos do cartão, porque a
  PROVA exigida ("banco local com o papel real, mostrando o que passa e o que é negado") só existe nesse harness
  — as suítes `supabase/tests/*.sql` rodam como service_role e não provam negação — e todo `.test.sh` novo precisa
  do passo no `db-guard.yml`. Nenhum outro arquivo foi tocado.
