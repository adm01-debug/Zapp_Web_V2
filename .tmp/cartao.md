Task t_3c129d07: feat(edge): listar e encerrar sessões de um usuário (admin)
  status:    running
  assignee:  workerauth
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_3c129d07
  max-retries: 2 (default)
  created:   2026-10-12 08:31 by claude
  started:   2026-10-12 11:47

Body:
ESPECIALISTA DA ÁREA: edgar (Edge Functions e APIs). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: edgar`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3, segunda passada (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE7_SEGUNDA_PASSADA_2026-10-12.md) e pedido do Joaquim em 12/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

PROBLEMA
FATOS: na V2 o admin só tem 'forçar logout' de todas as sessões (ForceLogoutButton -> revoke-auth-sessions scope global; src/components/admin/AdminUsersTable.tsx ~l.101-111). A V3 listava as sessões do usuário com dispositivo, IP e último uso e encerrava uma específica (AdminUserSessionsDialog.tsx ~l.68,89; rpc sessions_list, edge revoke-session).

O QUE FAZER
1. Edge 'admin-user-sessions' (só admin pelo JWT): ação list(user_id) devolve sessões (id, criada, último uso, user agent resumido, IP) a partir do esquema auth via service role; ação revoke(user_id, session_id) encerra só aquela sessão; auditoria das revogações.
2. Testes Deno (papel, lista, revogar uma).

ARQUIVOS QUE PODE TOCAR
- supabase/functions/admin-user-sessions/ (novo)
- supabase/config.toml (somente a entrada)
- testes da função

CRITÉRIO DE PRONTO
1. Admin investiga e encerra uma sessão específica.
2. zapp-verify . --rapido verde.


Events (28):
  [2026-10-12 11:47] [run 11093] heartbeat
  [2026-10-12 11:48] [run 11093] heartbeat
  [2026-10-12 11:49] [run 11093] heartbeat
  [2026-10-12 11:50] [run 11093] heartbeat
  [2026-10-12 11:51] [run 11093] heartbeat
  [2026-10-12 11:52] [run 11093] heartbeat
  [2026-10-12 11:53] [run 11093] heartbeat
  [2026-10-12 11:54] [run 11093] heartbeat
  [2026-10-12 11:55] [run 11093] heartbeat
  [2026-10-12 11:57] [run 11093] heartbeat
  [2026-10-12 11:58] [run 11093] heartbeat
  [2026-10-12 11:59] [run 11093] heartbeat
  [2026-10-12 12:00] [run 11093] heartbeat
  [2026-10-12 12:01] [run 11093] heartbeat
  [2026-10-12 12:02] [run 11093] heartbeat
  [2026-10-12 12:03] [run 11093] heartbeat
  [2026-10-12 12:04] [run 11093] heartbeat
  [2026-10-12 12:06] [run 11093] heartbeat
  [2026-10-12 12:07] [run 11093] heartbeat
  [2026-10-12 12:08] [run 11093] heartbeat

Runs (1):
  #11093 running      @workerauth  active  2026-10-12 11:47
