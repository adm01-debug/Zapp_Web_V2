Task t_0be31284: Avisar no cartao de tipo de notificacao quando playNotificationSound devolver false
  status:    running
  assignee:  worker
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_0be31284
  max-retries: 2 (default)
  created:   2026-10-16 15:27 by iris
  started:   2026-10-16 15:27
  parents:   t_6367b145

Body:
Achado do cartão t_6367b145 (mesmo defeito, arquivo fora do escopo dele — registrado em comentário lá, nunca tocado):

CONTEXTO: `playNotificationSound`/`previewSound` (src/utils/notificationSounds.ts) devolvem `boolean` — `false` quando o navegador recusa tocar o som. Os painéis SoundCustomizationPanel e NotificationSettingsPanel já foram corrigidos para avisar na recusa (entregas t_d692c925 e t_219641c9, fila .v2-fila/). O mesmo defeito continua em:

PROBLEMA: src/components/notifications/NotificationTypeCards.tsx, linha 53 — `playNotificationSound(notificationType, value as SoundType, soundVolume);` ignora o retorno. O botão "Testar som de <tipo>" (linha ~73) fica sem aviso quando o navegador recusa, e a pessoa acha que tocou.

CRITÉRIO DE PRONTO: ao testar o som e receber `false`, o cartão de tipo de notificação mostra aviso curto e claro (toast/inline já usado nesse arquivo — não inventar componente novo) dizendo que o navegador não deixou tocar o som, sem alterar a preferência. Quando `true`, comportamento atual. Teste que prova os dois ramos (mock de `playNotificationSound` devolvendo false/true), vermelho antes e verde depois.

ARQUIVOS QUE PODE TOCAR: src/components/notifications/NotificationTypeCards.tsx e o teste dele.

NÃO tocar em src/utils/notificationSounds.ts nem em src/hooks/**.

OBS (integração): src/utils/notificationSounds.ts é hotspot — está sendo tocado por t_3fd6b3a8 e pelas entregas dos dois filhos do t_6367b145; conferir a base antes de empilhar.

Events (10):
  [2026-10-16 15:27] created {'assignee': 'worker', 'status': 'todo', 'parents': ['t_6367b145'], 'creator_task_id': 't_6367b145', 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-16 15:27] dependency_wait {'reason': 'parent_not_done', 'parent': 't_6367b145'}
  [2026-10-16 15:27] promoted
  [2026-10-16 15:27] [run 19826] claimed {'lock': 'Joaquim:25096', 'expires': 1792176156, 'run_id': 19826}
  [2026-10-16 15:27] [run 19826] spawned {'pid': 8976, 'started_at': '|179217525613'}
  [2026-10-16 15:27] [run 19826] heartbeat
  [2026-10-16 15:28] [run 19826] heartbeat
  [2026-10-16 15:29] [run 19826] heartbeat
  [2026-10-16 15:30] [run 19826] heartbeat
  [2026-10-16 15:31] [run 19826] heartbeat

Runs (1):
  #19826 running      @worker  active  2026-10-16 15:27
