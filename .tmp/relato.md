Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013230013_supervisor_copilot_snapshot.sql` (NOVO): cria a RPC única `public.supervisor_copilot_snapshot()` que alimenta o Copiloto do Supervisor com um snapshot gerencial verdadeiro do V2. É `plpgsql stable security definer set search_path = public, pg_temp`, restrita a admin/supervisor (`public.is_admin_or_supervisor(auth.uid())`) e a `service_role` (chamadas internas), como as telas gerenciais já fazem. Devolve jsonb com: `queues[]` (por fila: `openConversations`, `unansweredOver1h`, `slaAtRisk`, `slaBreachedToday`), `agents[]` (por atendente de papel `agent`: `openAssigned`, `responsesToday`, `avgFirstResponseSecondsToday`), `closureReasons7d[]` (motivos de encerramento dos últimos 7 dias) e `unavailable{}` (CSAT, NPS, capacidade e fila de espera de integração devolvidos como `indisponivel`, sem número inventado). Recorte do dia e dos últimos 7 dias no fuso `America/Sao_Paulo`; contagens em 0, nunca NULL. Rodapé: `revoke all ... from public, anon, authenticated` + `grant execute ... to authenticated, service_role` pela assinatura exata, e `comment on function`.
- `supabase/tests/supervisor_copilot_snapshot.sql` (NOVO): suíte que prova o contrato no banco local da tarefa, tudo dentro de `begin; ... rollback;` (nenhuma fixture persiste). T1 admin com números por fila/atendente e motivos de encerramento (exclui o de 30 dias); T2 supervisor permitido; T3 sem sessão negada (42501); T4 atendente comum negado; T5 papel real `anon` negado (permission denied); T6 papel real `service_role` permitido; T7 ACL (EXECUTE só authenticated/service_role, negado a anon/PUBLIC); T8 atendente sem resposta no período devolve 0 (número, não NULL).
- `src/integrations/supabase/types.ts`: adiciona `supervisor_copilot_snapshot: { Args: never; Returns: Json }` à lista de Functions, na ordem alfabética do gerador.

## Reuso e o que não dupliquei
O cartão manda reaproveitar o que PB-11/PB-39/PB-40/PF-01 já entregam. Procurei por esses identificadores em `docs/`, `docs/plans/`, `~/hermes-workspaces/.assets/paridade-resto/` e no repo V3 de referência e não achei nenhum deles, então reusei o que existe hoje: o predicado de "conversa aberta" (`contacts.deleted_at IS NULL AND conversation_status NOT IN ('resolved','archived')`) e o recorte `America/Sao_Paulo` do `public.dashboard_contact_counts`/`dashboard_kpi`; o gate `public.is_admin_or_supervisor`; e os nomes de campo em camelCase do dashboard. Não criei tabela, coluna, policy nem GRANT novo além do EXECUTE da própria função.

## Prova (vermelho antes, verde depois)
Banco local da tarefa `v2-2610130742b1e7`, copiado do retrato da produção (a migration foi aplicada nele por `hermes-db-migrar`; como o cartão pede DENY/ALLOW por papel, a suíte roda como `postgres` via `zapp-db-local psql` e exercita `set local role anon` / `set local role service_role` e as claims de sessão).

- vermelho antes (função removida com `drop function`): `zapp-db-local psql . v2-... -v ON_ERROR_STOP=1 < supabase/tests/supervisor_copilot_snapshot.sql` → `ERROR: function public.supervisor_copilot_snapshot() does not exist`, `exit=3`.
- verde depois (migration aplicada): mesmo comando → `NOTICE: T1 OK ... T8 OK: atendente sem resposta no período devolve 0 (não NULL)`, `ROLLBACK`, `exit=0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (banco_local só é conferido quando se passa o nome do conjunto — como o fechar chama).

## O que NÃO fiz e por quê
- Não liguei a RPC na tela: `SupervisorCopilot.tsx` não está em ARQUIVOS QUE PODE TOCAR — isso é do cartão filho t_9b19d420.
- Não mexi em `supabase/schema-manifest.json` nem em `docs/DB-INVENTORY.md` (não são meus e são gerados); a função nova aparece como diferença esperada do retrato quando o banco local é conferido com o nome do conjunto.
- Não toquei banco de produção, não fiz push nem deploy.
