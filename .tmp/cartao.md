Task t_31f0d04b: feat(db): carga por atendente agregada no servidor (abertas, aguardando e último envio)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_31f0d04b
  max-retries: 2 (default)
  created:   2026-10-13 08:14 by claude
  started:   2026-10-13 16:33

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: 3ª passada da auditoria de paridade V3 -> V2 do doc `docs/estado/05-features-admin.md` (módulo admin da V3). As passadas PD (12/10) e PF/PG (13/10) já geraram cartões; estes são os ACHADOS QUE ELAS DEIXARAM PASSAR (relatórios de 3 leitores, com os mais graves reconferidos no código da branch viva em 13/10/2026). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia sempre `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`: a árvore de trabalho está 99 commits atrás); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor (atomicidade do XP, presença no servidor, sem reprocesso automático, lease de envio). FORA DE ESCOPO (decisões do dono): tags/etiquetas, exportar/importar/baixar/copiar/imprimir/CSV, edição em massa, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador, Evolution fallback, Retry config por tela, API pública, Sicoob, STS, route_permissions dinâmico. Antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`useAgents.ts` baixa contatos abertos com `fetchAllRows`, `hooks/agents/useAgentPendingCounts.ts` baixa todos os contatos `waiting` e `hooks/agents/useAgentRecentSends.ts` baixa todas as mensagens de agente dos últimos 30 dias só para achar o `MAX(created_at)` por atendente: milhares de linhas no navegador. (A V2 é mais correta que a V3 aqui, mas pesada.)

O QUE FAZER
1. RPC `agent_workload()` (SECURITY DEFINER, `search_path` fixo, só admin/supervisor) devolvendo por perfil: conversas abertas (status open, sem excluídas), aguardando e último envio na janela de 30 dias.
2. Os números devem coincidir com os dos hooks atuais.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_agent_workload.sql (novo)
- supabase/tests/
- src/integrations/supabase/types.ts

CRITÉRIO DE PRONTO
1. Prova no banco local: números idênticos aos atuais em dados semeados.
2. Agente comum é negado.
3. `zapp-verify . --rapido` verde.


Latest summary:
Ambiente congelado: hermes-tarefa-fechar sai 75 ("CONGELADO") porque existe ~/.local/libexec/hermes-guard/CONGELADO e falta ~/.local/libexec/hermes-guard/MODO_V2. A entrega está pronta e commitada (migration + supabase/tests/agent_workload.sql + types.ts; prova verde e vermelho provado), mas não consigo pô-la na fila do integrador sem o MODO_V2. Decisão registrada: 20261014-105646-75ad-agent-workload-rpc. Só o Joaquim retoma.

Comments (2):
  [2026-10-14 10:56] workersql: **Entrega pronta e commitada no workspace; fechar bloqueado pelo congelamento do ambiente.**

O que está feito (branch `v2/agent-workload-rpc-26101410372190` @ `3d523573e0`):
- `supabase/migrations/20261014133908_agent_workload.sql` — cria `public.agent_workload()` (SECURITY DEFINER, `search_path` fixo, STABLE, sem argumentos): devolve por perfil `profile_id`, `open_chats` (contatos `assigned_to` com `conversation_status='open'` e `deleted_at is null`), `waiting_chats` (`'waiting'`) e `last_send_at` (máximo de `messages.created_at` com `sender='agent'` e `agent_id` do perfil, janela de 30 dias). Agrega no servidor (uma varredura por tabela, sem paginação parcial). Só admin/supervisor (via `is_admin_or_supervisor(auth.uid())`) e `service_role`; agente comum recebe `insufficient_privilege`. `EXECUTE` só para `authenticated` + `service_role` (`anon`/`PUBLIC` sem acesso). Rollback: `drop function if exists public.agent_workload();` (testado).
- `supabase/tests/agent_workload.sql` — prova no banco local (fixture semeada, `BEGIN…ROLLBACK`): T1 números iguais aos filtros dos hooks + valores concretos; T2 janela de 30 dias/excluído/sem dono; T4 agente comum negado; T5 sem sessão/`anon` negado; T6 `service_role` vê a equipe; T7 ACL + DEFINER com `search_path`. Vermelho provado com a função ausente (EXIT 3).
- `src/integrations/supabase/types.ts` — registra a RPC (contrato que o front consome).

**Bloqueio:** `hermes-tarefa-fechar` sai **75** com "CONGELADO": existe `~/.local/libexec/hermes-guard/CONGELADO` e **não** existe `~/.local/libexec/hermes-guard/MODO_V2`, então o fechar V2 recusa (guarda no topo do script). Não toco nos arquivos de guarda. Decisão registrada: `20261014-105646-75ad-agent-workload-rpc`.

Pendência de outro especialista: trocar os hooks (`src/hooks/crm/useAgents.ts`, `src/hooks/agents/useAgentPendingCounts.ts`, `src/hooks/agents/useAgentRecentSends.ts`) para chamar `agent_workload()` — fora de `src/hooks/**`, que não é meu (worker hooks).
  [2026-10-15 14:14] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (448):
  [2026-10-15 14:51] [run 18473] heartbeat
  [2026-10-15 14:52] [run 18473] heartbeat
  [2026-10-15 14:53] [run 18473] heartbeat
  [2026-10-15 14:54] [run 18473] heartbeat
  [2026-10-15 14:55] [run 18473] heartbeat
  [2026-10-15 14:56] [run 18473] heartbeat
  [2026-10-15 14:57] [run 18473] heartbeat
  [2026-10-15 14:58] [run 18473] heartbeat
  [2026-10-15 14:59] [run 18473] heartbeat
  [2026-10-15 15:00] [run 18473] heartbeat
  [2026-10-15 15:00] [run 18473] heartbeat {'note': 'Subindo o banco local (zapp-db-local up) para reexecutar a prova da RPC agent_workload; em andamento.'}
  [2026-10-15 15:01] [run 18473] heartbeat
  [2026-10-15 15:02] [run 18473] heartbeat
  [2026-10-15 15:03] [run 18473] heartbeat
  [2026-10-15 15:05] [run 18473] heartbeat
  [2026-10-15 15:06] [run 18473] heartbeat
  [2026-10-15 15:07] [run 18473] heartbeat
  [2026-10-15 15:08] [run 18473] heartbeat
  [2026-10-15 15:09] [run 18473] heartbeat
  [2026-10-15 15:10] [run 18473] heartbeat

Runs (22):
  #12689 rate_limited @workersql  33s  2026-10-13 16:33
        ! pid 37552 exited rate-limited (quota wall) — requeued without counting a failure
  #12830 rate_limited @workersql  23s  2026-10-13 16:39
        ! pid 23812 exited rate-limited (quota wall) — requeued without counting a failure
  #12985 rate_limited @workersql  34s  2026-10-13 16:45
        ! pid 38292 exited rate-limited (quota wall) — requeued without counting a failure
  #13156 rate_limited @workersql  34s  2026-10-13 16:50
        ! pid 21960 exited rate-limited (quota wall) — requeued without counting a failure
  #13338 rate_limited @workersql  24s  2026-10-13 16:56
        ! pid 44584 exited rate-limited (quota wall) — requeued without counting a failure
  #13498 rate_limited @workersql  46s  2026-10-13 17:02
        ! pid 35628 exited rate-limited (quota wall) — requeued without counting a failure
  #13661 rate_limited @workersql  34s  2026-10-13 17:07
        ! pid 37864 exited rate-limited (quota wall) — requeued without counting a failure
  #13836 rate_limited @workersql  23s  2026-10-13 17:13
        ! pid 23736 exited rate-limited (quota wall) — requeued without counting a failure
  #14006 rate_limited @workersql  34s  2026-10-13 17:19
        ! pid 26676 exited rate-limited (quota wall) — requeued without counting a failure
  #14171 rate_limited @workersql  36s  2026-10-13 17:24
        ! pid 42520 exited rate-limited (quota wall) — requeued without counting a failure
  #14348 rate_limited @workersql  80s  2026-10-13 17:30
        ! pid 7640 exited rate-limited (quota wall) — requeued without counting a failure
  #14552 rate_limited @workersql  38s  2026-10-13 17:37
        ! pid 38592 exited rate-limited (quota wall) — requeued without counting a failure
  #14712 rate_limited @workersql  39s  2026-10-13 17:43
        ! pid 35736 exited rate-limited (quota wall) — requeued without counting a failure
  #14900 rate_limited @workersql  44s  2026-10-13 17:49
        ! pid 2980 exited rate-limited (quota wall) — requeued without counting a failure
  #15093 rate_limited @workersql  34s  2026-10-13 17:55
        ! pid 39388 exited rate-limited (quota wall) — requeued without counting a failure
  #15270 rate_limited @workersql  36s  2026-10-13 18:01
        ! pid 7640 exited rate-limited (quota wall) — requeued without counting a failure
  #15435 rate_limited @workersql  34s  2026-10-13 18:07
        ! pid 20960 exited rate-limited (quota wall) — requeued without counting a failure
  #15599 rate_limited @workersql  35s  2026-10-13 18:13
        ! pid 34868 exited rate-limited (quota wall) — requeued without counting a failure
  #15778 rate_limited @workersql  34s  2026-10-13 18:19
        ! pid 41812 exited rate-limited (quota wall) — requeued without counting a failure
  #15958 rate_limited @workersql  23s  2026-10-13 18:24
        ! pid 34868 exited rate-limited (quota wall) — requeued without counting a failure
  #16480 blocked      @workersql  1194s  2026-10-14 10:37
        → Ambiente congelado: hermes-tarefa-fechar sai 75 ("CONGELADO") porque existe ~/.local/libexec/hermes-guard/CONGELADO e falta ~/.local/libexec/hermes-guard/MODO_V
  #18473 running      @workersql  active  2026-10-15 14:19
