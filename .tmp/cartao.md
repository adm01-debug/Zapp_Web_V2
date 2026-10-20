Task t_549f87e1: feat(filas): avisos de limite de fila (50/75/100 %) em qualquer tela, com métrica real
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_549f87e1
  max-retries: 2 (default)
  created:   2026-10-13 08:56 by claude
  started:   2026-10-15 21:20
  parents:   t_35099565, t_36560a6e

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/24-hooks-raiz-2.md (hooks da raiz de src/hooks: contato, dashboard, e-mail/Gmail, Evolution, APIs externas, grupos, metas) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_RAIZ2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
Depende da RPC do PM-02. Hoje o alerta só existe dentro de `QueuesView.tsx` (2 dos 4 limites) e `useGoalNotifications` da V2 não toca `queue_goals`. V3: avisa ao CRUZAR 50/75/100 % (invertido 25/50/75 para taxa de atribuição), uma vez por faixa, NULL = 'não medido' nunca dispara.

O QUE FAZER
1. Hook `useQueueGoalAlerts` (novo, em `src/hooks/analytics/`), só para supervisor/admin e membros da fila, intervalo de 5 min pausado em aba oculta, faixas 50/75/100, dedupe por (meta, métrica, faixa, dia) em `sessionStorage` (try/catch), nome real da fila no aviso, respeitando `useNotificationSettings` (som, horário silencioso).
2. Monte-o junto do `GoalNotificationProvider` e troque a conta inventada de `QueuesView.tsx` pela RPC, acrescentando os 2 limites que faltam.
3. Testes: 50 → 75 → 100 avisa uma vez cada; NULL não avisa; 0 é dado; taxa invertida.

ARQUIVOS QUE PODE TOCAR
- src/hooks/analytics/useQueueGoalAlerts.ts (novo)
- src/hooks/business/useQueueGoals.ts
- src/components/notifications/GoalNotificationProvider.tsx
- src/components/queues/QueuesView.tsx
- testes correspondentes

CRITÉRIO DE PRONTO
1. Aviso aparece com o app em qualquer tela; nenhum valor de fórmula inventada; 4 métricas avaliadas (testes).
2. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-15 21:15] workersql: RPC do PM-02 entregue no cartão t_35099565 (commit `7070a5ac2`, branch `v2/rpc-metricas-meta-fila-2610152019c517`, na fila do integrador). Para o hook de avisos de limite de fila:

`public.rpc_queue_goal_metrics()` — SEM parâmetro (janela de atribuição fixa em 7 dias). Chamar como o usuário logado (o EXECUTE é só de `authenticated`; `anon`/service_role são negados).

Colunas devolvidas, uma linha por fila ATIVA visível ao usuário (staff vê todas; agente vê só as filas em que é membro ativo):
`queue_id`, `queue_name`, `coverage`, `contacts_open`, `waiting_contacts`, `avg_wait_minutes`, `assignment_rate`, `received_contacts`, `assigned_contacts`, `messages_pending`.

Regra do NULL (importante para o alerta não disparar sozinho):
- `coverage = 'sem_base'` → a fila não tem nenhum contato; as 6 métricas vêm NULL. Silêncio total.
- `coverage = 'parcial'` → só a métrica sem base vem NULL (`avg_wait_minutes` sem posição de espera; `assignment_rate`/`received_contacts`/`assigned_contacts` sem contato recebido na janela).
- `coverage = 'completa'` → tudo medido.
- 0 é DADO (fila existe e está vazia) e não é motivo para silêncio: `waiting_contacts = 0` e `messages_pending = 0` valem alerta de limite quando a meta é 0.

As metas NÃO vêm nessa RPC — continuam em `queue_goals` (o painel de metas já lê a tabela direto), então o hook compara a métrica da RPC com o limite lido de `queue_goals`.

Prova de banco: `supabase/tests/rpc_queue_goal_metrics.sql` (P1–P13, papéis reais admin/supervisor/agente/anon) — `NOTICE: rpc_queue_goal_metrics: suite VERDE (P1-P13)`.

Events (32):
  [2026-10-15 21:25] [run 18733] heartbeat
  [2026-10-15 21:26] [run 18733] heartbeat
  [2026-10-15 21:27] [run 18733] heartbeat
  [2026-10-15 21:28] [run 18733] heartbeat
  [2026-10-15 21:29] [run 18733] heartbeat
  [2026-10-15 21:30] [run 18733] heartbeat
  [2026-10-15 21:31] [run 18733] heartbeat
  [2026-10-15 21:32] [run 18733] heartbeat
  [2026-10-15 21:33] [run 18733] heartbeat
  [2026-10-15 21:35] [run 18733] heartbeat
  [2026-10-15 21:36] [run 18733] heartbeat
  [2026-10-15 21:37] [run 18733] heartbeat
  [2026-10-15 21:38] [run 18733] heartbeat
  [2026-10-15 21:39] [run 18733] heartbeat
  [2026-10-15 21:40] [run 18733] heartbeat
  [2026-10-15 21:41] [run 18733] heartbeat
  [2026-10-15 21:42] [run 18733] heartbeat
  [2026-10-15 21:44] [run 18733] heartbeat
  [2026-10-15 21:45] [run 18733] heartbeat
  [2026-10-15 21:46] [run 18733] heartbeat

Runs (1):
  #18733 running      @hugo  active  2026-10-15 21:20
