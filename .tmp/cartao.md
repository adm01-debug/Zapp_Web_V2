Task t_72907808: [refazer 2] fix(seguranca): `find-status-messages` só devolve status de contato que o usuário pode ver
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_72907808
  max-retries: 2 (default)
  created:   2026-10-16 08:18 by claude
  started:   2026-10-16 13:39

Body:
ESPECIALISTA DA ÁREA: senior (refazer). A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: senior`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado, sem 'parcial'.
CONTEXTO (16/10): este cartão NÃO pede trabalho novo. O refazer anterior foi concluído pelo semisenior enquanto a guarda estava congelada (MODO_V2 ausente de 14/10 10:45 a 15/10 14:07); por isso o agente COMMITOU o trabalho mas NÃO o entregou na fila do integrador (a fila ainda mostra o commit antigo e recusado). A guarda já voltou. Sua tarefa é ENTREGAR o commit estacionado: abra o workspace (`hermes-tarefa-iniciar`), traga o commit indicado abaixo para a base `dia/` atual (cherry-pick ou checkout do commit da branch), resolva conflito se houver sem desfazer o que já está na dia, rode a verificação e feche com `hermes-tarefa-fechar`. Se o commit já estiver na dia, prove com `git merge-base --is-ancestor` e feche como vazio justificado.
REGRAS: `zapp-verify . --rapido` verde; sem dependência nova; nada vai para produção; sem log de telefone, token ou texto de mensagem; texto de interface em pt-BR. NÃO refaça nem 'melhore' o conteúdo: o revisor só apontou os pontos descritos abaixo e o refazer anterior já os corrigiu.

ENTREGA ESTACIONADA: branch `v2/find-status-messages-por-contato-261013100782ed`, commit `2575c6c87c` (agulhas só com DDD: fecha o vazamento entre DDDs; teste de console sem telefone; relato assinado `Especialista: edgar` na época, agora deve ser `senior`). Deno 42 passed, vitest 12 passed. O commit original é `09fe45e2fd` na MESMA branch: entregue a ponta da branch. ATENÇÃO: o PH-16 (t_fdd5274f) mexe no mesmo hook `useWhatsAppStatus.ts`; não desfaça o `number: phone` que este cartão acrescentou.


Events (12):
  [2026-10-16 08:18] created {'assignee': 'senior', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-16 08:21] reprioritized {'priority': 1}
  [2026-10-16 13:39] [run 19734] claimed {'lock': 'Joaquim:25096', 'expires': 1792169696, 'run_id': 19734}
  [2026-10-16 13:39] [run 19734] spawned {'pid': 48088, 'started_at': '|179216879700'}
  [2026-10-16 13:40] [run 19734] heartbeat
  [2026-10-16 13:41] [run 19734] heartbeat
  [2026-10-16 13:42] [run 19734] heartbeat
  [2026-10-16 13:43] [run 19734] heartbeat
  [2026-10-16 13:43] [run 19734] heartbeat {'note': 'Commits do cartão trazidos para a dia/2026-10-16; rodando testes'}
  [2026-10-16 13:44] [run 19734] heartbeat
  [2026-10-16 13:45] [run 19734] heartbeat
  [2026-10-16 13:46] [run 19734] heartbeat

Runs (1):
  #19734 running      @senior  active  2026-10-16 13:39
