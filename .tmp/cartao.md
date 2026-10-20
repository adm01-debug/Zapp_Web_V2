Task t_c7a31efb: [refazer 2] fix(db): "agente ausente" passa a usar a presença real (agent_presence), não a última atividade de sessão
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_c7a31efb
  max-retries: 2 (default)
  created:   2026-10-16 08:18 by claude
  started:   2026-10-16 13:42

Body:
ESPECIALISTA DA ÁREA: senior (refazer). A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: senior`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado, sem 'parcial'.
CONTEXTO (16/10): este cartão NÃO pede trabalho novo. O refazer anterior foi concluído pelo semisenior enquanto a guarda estava congelada (MODO_V2 ausente de 14/10 10:45 a 15/10 14:07); por isso o agente COMMITOU o trabalho mas NÃO o entregou na fila do integrador (a fila ainda mostra o commit antigo e recusado). A guarda já voltou. Sua tarefa é ENTREGAR o commit estacionado: abra o workspace (`hermes-tarefa-iniciar`), traga o commit indicado abaixo para a base `dia/` atual (cherry-pick ou checkout do commit da branch), resolva conflito se houver sem desfazer o que já está na dia, rode a verificação e feche com `hermes-tarefa-fechar`. Se o commit já estiver na dia, prove com `git merge-base --is-ancestor` e feche como vazio justificado.
REGRAS: `zapp-verify . --rapido` verde; sem dependência nova; nada vai para produção; sem log de telefone, token ou texto de mensagem; texto de interface em pt-BR. NÃO refaça nem 'melhore' o conteúdo: o revisor só apontou os pontos descritos abaixo e o refazer anterior já os corrigiu.

ENTREGA ESTACIONADA: branch `v2/absent-agents-presence-26101322020396`, commit `c1b63cbf5e` (rollback total com todas as linhas testadas, trigger anti-hijack REAL instalado no harness, governança do parâmetro `inactive_minutes` provada; harness 39/39 verde 2x). Commit original `32ec274900` na MESMA branch: entregue a ponta. ATENÇÃO: existe a migration irmã `20261013235905` que muda a assinatura para `(integer, boolean)`: confira se ela já está na dia e, se estiver, MESCLE para não criar overload ambíguo (um só `reassign_absent_agents`). Prova de banco no banco LOCAL com papéis reais (admin, supervisor, service_role, agente sem papel, anon).


Events (13):
  [2026-10-16 08:18] created {'assignee': 'senior', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-16 08:21] reprioritized {'priority': 1}
  [2026-10-16 13:42] [run 19736] claimed {'lock': 'Joaquim:25096', 'expires': 1792169841, 'run_id': 19736}
  [2026-10-16 13:42] [run 19736] spawned {'pid': 25584, 'started_at': '|179216894163'}
  [2026-10-16 13:42] [run 19736] heartbeat
  [2026-10-16 13:43] [run 19736] heartbeat
  [2026-10-16 13:44] [run 19736] heartbeat
  [2026-10-16 13:45] [run 19736] heartbeat
  [2026-10-16 13:46] [run 19736] heartbeat
  [2026-10-16 13:47] [run 19736] heartbeat
  [2026-10-16 13:48] [run 19736] heartbeat
  [2026-10-16 13:49] [run 19736] heartbeat
  [2026-10-16 13:50] [run 19736] heartbeat

Runs (1):
  #19736 running      @senior  active  2026-10-16 13:42
