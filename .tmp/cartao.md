Task t_f2ba20a8: docs(tarefas): auditoria de leitura das notificações de lembrete contra o fluxo novo
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_f2ba20a8
  max-retries: 2 (default)
  created:   2026-10-11 14:04 by claude
  started:   2026-10-11 14:35

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: hugo`.
Origem: plano `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (v2), aprovado pelo Joaquim em 11/10/2026 com as decisões D1 (Quadro por estado; agrupar por prazo opcional), D13 (tempo médio = da criação à conclusão) e D14 (painel de detalhes não modal). Enquanto o plano não estiver integrado na branch do dia, leia a cópia em `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`; as 5 imagens de referência estão em `~/hermes-workspaces/.assets/tarefas/01.png` a `05.png`. Antes de mexer, confira no código ATUAL o que já existe; se a etapa já estiver feita, prove no relato e não reescreva. Respeite as decisões vigentes de `docs/design/TAREFAS_QUADRO_STATUS.md` (G-5 sem parser de linguagem natural, G-6 limites, G-8 concluídas 7 dias, B13 uma query só). Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema (sem exportar/baixar/imprimir).

O QUE FAZER (etapas do plano)
- Etapa 176, Auditoria de notificações (somente leitura): Conferir `notify_due_tasks` e `useWorkItemNotifications` contra os novos fluxos (lembrete antes do prazo; adiar rearma `notified_at`) e relatar; sem banco novo.

ARQUIVOS QUE PODE TOCAR
- docs/tarefas/AUDITORIA_NOTIFICACOES.md (novo)

CRITÉRIO DE PRONTO
1. Relatório com o caminho do lembrete (cron `notify_due_tasks`, `notifications.reminder_due`, `useWorkItemNotifications`): o que acontece ao adiar, concluir e trocar o prazo, com trechos de código e casos de risco.
2. Somente leitura: nenhum código nem banco alterado.
3. zapp-verify . --rapido verde.


Events (10):
  [2026-10-11 14:04] created {'assignee': 'hugo', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 14:35] [run 10368] claimed {'lock': 'Joaquim:13456', 'expires': 1791741019, 'run_id': 10368}
  [2026-10-11 14:35] [run 10368] spawned {'pid': 12020, 'started_at': '|179174011989'}
  [2026-10-11 14:35] [run 10368] heartbeat
  [2026-10-11 14:36] [run 10368] heartbeat
  [2026-10-11 14:37] [run 10368] heartbeat
  [2026-10-11 14:38] [run 10368] heartbeat
  [2026-10-11 14:39] [run 10368] heartbeat
  [2026-10-11 14:40] [run 10368] heartbeat
  [2026-10-11 14:41] [run 10368] heartbeat

Runs (1):
  #10368 running      @hugo  active  2026-10-11 14:35
