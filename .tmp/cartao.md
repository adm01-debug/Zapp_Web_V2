Task t_d94b77b2: feat(db): execuções de automação registradas e eventos de gatilho enfileirados
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_d94b77b2
  max-retries: 2 (default)
  created:   2026-10-11 14:41 by claude
  started:   2026-10-11 16:02

Body:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3 (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE6_2026-10-11.md) e pedido do Joaquim em 11/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
FATOS: a tela de automações (src/components/automations/AutomationsManager.tsx) grava regras em automations (trigger_type new_message|keyword|time_inactive|tag_added|business_hours; ações send_message|assign_agent|add_tag|send_notification|close_conversation), mas NENHUMA função lê essa tabela: o usuário cria uma automação e nada acontece. A V3 tinha regras com log de execuções (/home/joaquim_ataides/projetos/Zapp_Web_V3/src/pages/admin/AdminAutomationsPage.tsx, AdminAutomationLogsPage.tsx).

O QUE FAZER
1. Tabela automation_executions: id, automation_id, contact_id, trigger_type, trigger_ref, status ('ok'|'erro'|'ignorada'), actions_done jsonb (só tipos e ids), error_code, created_at; índice único (automation_id, contact_id, trigger_ref) para idempotência. RLS: staff lê.
2. Fila automation_events (contact_id, trigger_type, trigger_ref, payload mínimo sem texto de mensagem — para keyword gravar só os termos casados —, created_at, processed_at) alimentada por gatilhos de banco: mensagem recebida (new_message/keyword) e etiqueta adicionada (tag_added); time_inactive e business_hours ficam com o executor.
3. Nunca gerar evento para mensagem enviada por automação (anti-laço).
4. Testes de contrato.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_automation_runtime.sql
- supabase/tests/ ou tests/contracts/
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Base de execução com idempotência e anti-laço.
2. zapp-verify . --rapido verde.


Events (40):
  [2026-10-11 16:19] [run 10437] heartbeat
  [2026-10-11 16:20] [run 10437] heartbeat
  [2026-10-11 16:21] [run 10437] heartbeat
  [2026-10-11 16:22] [run 10437] heartbeat
  [2026-10-11 16:23] [run 10437] heartbeat {'note': 'migration automation_runtime escrita; teste red→green OK no Postgres descartável; aplicando no banco local da tarefa'}
  [2026-10-11 16:23] [run 10437] heartbeat
  [2026-10-11 16:24] [run 10437] heartbeat
  [2026-10-11 16:25] [run 10437] heartbeat
  [2026-10-11 16:27] [run 10437] heartbeat
  [2026-10-11 16:28] [run 10437] heartbeat
  [2026-10-11 16:29] [run 10437] heartbeat
  [2026-10-11 16:30] [run 10437] heartbeat
  [2026-10-11 16:31] [run 10437] heartbeat
  [2026-10-11 16:32] [run 10437] heartbeat
  [2026-10-11 16:33] [run 10437] heartbeat
  [2026-10-11 16:34] [run 10437] heartbeat
  [2026-10-11 16:34] [run 10437] heartbeat {'note': 'relato escrito e commitado; rodando hermes-tarefa-fechar (zapp-verify --rapido)'}
  [2026-10-11 16:35] [run 10437] heartbeat
  [2026-10-11 16:36] [run 10437] heartbeat
  [2026-10-11 16:37] [run 10437] heartbeat

Runs (1):
  #10437 running      @workersql  active  2026-10-11 16:02
