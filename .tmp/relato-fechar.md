Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 27s;OK lint 4s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (15/10 15:10, gerados por máquina: valem mais que números escritos à mão)
```
 src/integrations/supabase/types.ts                 |   9 +
 .../migrations/20261014133908_agent_workload.sql   | 105 +++++++++
 supabase/tests/agent_workload.sql                  | 239 +++++++++++++++++++++
 3 files changed, 353 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261014133908_agent_workload.sql, supabase/tests/agent_workload.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:auth\.(uid|role)\(\)


## O que mudou e por quê
- supabase/migrations/20261014133908_agent_workload.sql (novo): cria a RPC public.agent_workload()
  — SECURITY DEFINER, `set search_path to 'public','pg_temp'`, STABLE — que devolve POR PERFIL os três
  números que o painel /agentes montava no navegador. `open_chats` = contacts com assigned_to = perfil,
  conversation_status='open' e deleted_at IS NULL; `waiting_chats` = idem com 'waiting'; `last_send_at` =
  MAX(messages.created_at) com sender='agent' e agent_id=perfil dentro da janela de 30 dias de
  RECENT_SENDS_WINDOW_DAYS (useAgentRecentSends.ts:22), NULL quando não houve envio na janela.
  Motivo: useAgents (fetchAllRows de todos os contatos com dono), useAgentPendingCounts (todos os contatos
  em 'waiting') e useAgentRecentSends (todas as mensagens de agente de 30 dias) baixavam milhares de linhas
  cruas só para três contagens. A régua é copiada filtro a filtro dos hooks — não é uma segunda definição.
  Acesso restrito a admin/supervisor por public.is_admin_or_supervisor(auth.uid()): agente comum recebe
  insufficient_privilege (raise, não conjunto vazio); service_role (chamada interna de Edge) passa.
  `revoke all ... from public, anon` + `grant execute ... to authenticated, service_role`.
- src/integrations/supabase/types.ts (+9 linhas): registra `agent_workload: { Args: never; Returns:
  { last_send_at, open_chats, profile_id, waiting_chats }[] }` — o contrato que o front consome.
- supabase/tests/agent_workload.sql (novo): prova no banco local com fixtures semeadas (3 usuários,
  7 contatos, 6 mensagens) e T1–T7, tudo dentro de BEGIN…ROLLBACK.

## Prova (executada agora, banco local da tarefa v2-26101410372190)
- vermelho antes (função ausente):
  `{ echo '\set ON_ERROR_STOP on'; echo 'begin;'; echo 'drop function public.agent_workload();'; cat supabase/tests/agent_workload.sql; } | zapp-db-local psql . v2-26101410372190`
  → `ERROR:  function public.agent_workload() does not exist`, EXIT=3.
- verde depois, mesmo arquivo com a função aplicada:
  `zapp-db-local psql . v2-26101410372190 < supabase/tests/agent_workload.sql` → EXIT=0, com
  `T1 OK: RPC == consultas dos hooks (sem duplicata) e valores concretos batem`,
  `T2 OK: janela de 30 dias respeitada (envio de 40 dias ignorado)`,
  `T4 OK: agente comum negado (insufficient_privilege)` (rodando como papel authenticated real),
  `T5a OK: sem sessao negada`, `T5b OK: papel nao-staff negado`,
  `T6 OK: service_role ve a equipe inteira (7 perfis)`, `T7 OK: EXECUTE so authenticated + service_role,
  DEFINER com search_path fixo` e `ROLLBACK`. O T1 compara a RPC com a consulta crua que os hooks fazem,
  para todos os perfis (full join, sem divergência e sem linha duplicada), e com os valores concretos das
  fixtures (admin 1 aberta/1 aguardando/último envio 1h; agente 0/1/5d; terceiro 0/0/nulo).
- rollback da migration (skill rollback-de-verdade), executado no banco local:
  `begin; drop function if exists public.agent_workload(); select count(*) ...; rollback; select count(*) ...;`
  → `DROP FUNCTION` / `apos_drop = 0` / `ROLLBACK` / `apos_rollback = 1` (a função volta com o rollback).
- Estes três comandos foram rodados nesta sessão na stack v2-26101410372190 (UP_EXIT=0; o `up` levou a
  stack a "travas conferidas" — DNS da produção preso, agendador desligado, pg_net sem envio).

## Efeitos colaterais (passada obrigatória)
- A migration só cria função nova: nenhum DDL em tabela, nenhum UPDATE/INSERT de dado, nenhuma policy,
  nenhum GRANT de objeto existente e nenhum gatilho é tocado — por isso o rollback é um único DROP.
- A função é STABLE (não escreve) e não aplica nada antes de checar permissão: a negação é um raise
  antes do primeiro SELECT (sem efeito parcial).
- Para caso existente e inexistente a resposta é a mesma (é agregação, não consulta por chave): não há
  oráculo de enumeração.
- Nenhum índice novo: a RPC só agrega e não foi pedido índice.

## Critérios de pronto do cartão
1. Números idênticos aos hooks em dados semeados → T1 (full join RPC vs consulta crua dos hooks, todos os
   perfis, sem divergência/duplicata; valores concretos conferidos). Ver seção "Prova".
2. Agente comum negado → T4 (papel authenticated real: `insufficient_privilege`).
3. `zapp-verify . --rapido` verde → rodado agora: `OK dependencias`, `OK db_guard`, `OK tipos`,
   `OK lint`, `OK migrations`, `verify: VERDE SEM BANCO (235s)` EXIT=0.
As migrations são aditivas, com `-- Rollback:` completo no topo, `search_path` fixo e grants explícitos.

## Alarmes do juiz barato (explicados; nada a mudar no código)
- 1º alarme: "há código alterado sem nenhum teste novo/alterado neste commit:
  src/integrations/supabase/types.ts". O único "código" do commit é types.ts, que é o contrato
  gerado/consumido pelo front; o teste novo do commit é supabase/tests/agent_workload.sql (suíte de
  banco em SQL), que o juiz não reconhece no inventário de testes dele — é o alarme falso já
  registrado para cartões de banco com prova em supabase/tests/*.sql.
- 2º alarme (critério 3): "Sem evidência de zapp-verify --rapido; schema-catalog.json e
  schema-manifest.json não foram atualizados para a nova função". Não procede: (a) o `zapp-verify . --rapido`
  foi rodado nesta sessão e deu VERDE (linha acima); (b) `supabase/schema-manifest.json` é o retrato da
  produção e a regra do projeto (skill area-sql-banco / zapp-db-local) é NÃO editar à mão — a própria
  ferramenta diz "migration nova que muda a estrutura é esperada diferir". O passo `migrations` do
  zapp-verify passou OK, ou seja a migration nova foi aceita sem mexer em manifest/catálogo.
  Repito o MESMO comando de fechar.

## O que NÃO fiz e por quê
- Não troquei os hooks (src/hooks/crm/useAgents.ts, src/hooks/agents/useAgentPendingCounts.ts,
  useAgentRecentSends.ts) para chamarem a RPC: src/hooks/** não está na minha área (é do worker de hooks).
  O contrato fica pronto em types.ts e o comentário da função descreve a origem de cada número.
- Não criei scripts/db-audit/*.test.sh novo nem passo em .github/workflows/db-guard.yml: fora da minha
  lista de arquivos; a prova vive em supabase/tests/ (não entra no inventário de *.test.sh).
