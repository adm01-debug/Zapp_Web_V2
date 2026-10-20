Task t_ac2fa555: feat(db): listar e ligar/desligar tarefas agendadas (pg_cron) pelo admin, com lista permitida
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_ac2fa555
  max-retries: 2 (default)
  created:   2026-10-11 14:42 by claude
  started:   2026-10-11 17:02

Body:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3 (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE6_2026-10-11.md) e pedido do Joaquim em 11/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
FATOS: não há como ver ou pausar os jobs agendados sem ir ao banco; a V3 tinha CronSchedulerPage (rpc_list_cron_jobs, rpc_toggle_cron_job).

O QUE FAZER
1. Funções admin_list_cron_jobs() (nome, agenda, ativo, última execução e resultado de cron.job_run_details) e admin_toggle_cron_job(nome, ativo) SÓ para jobs de uma lista permitida definida na migration (os da própria aplicação; nunca jobs de manutenção crítica), com auditoria.
2. Testes de contrato.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_admin_cron_jobs.sql
- supabase/tests/ ou tests/contracts/
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Consulta e alternância seguras.
2. zapp-verify . --rapido verde.


Events (39):
  [2026-10-11 17:18] [run 10463] heartbeat
  [2026-10-11 17:19] [run 10463] heartbeat
  [2026-10-11 17:20] [run 10463] heartbeat
  [2026-10-11 17:21] [run 10463] heartbeat
  [2026-10-11 17:22] [run 10463] heartbeat
  [2026-10-11 17:23] [run 10463] heartbeat
  [2026-10-11 17:24] [run 10463] heartbeat
  [2026-10-11 17:25] [run 10463] heartbeat
  [2026-10-11 17:26] [run 10463] heartbeat
  [2026-10-11 17:27] [run 10463] heartbeat
  [2026-10-11 17:28] [run 10463] heartbeat
  [2026-10-11 17:29] [run 10463] heartbeat
  [2026-10-11 17:30] [run 10463] heartbeat
  [2026-10-11 17:31] [run 10463] heartbeat
  [2026-10-11 17:32] [run 10463] heartbeat
  [2026-10-11 17:33] [run 10463] heartbeat
  [2026-10-11 17:34] [run 10463] heartbeat
  [2026-10-11 17:35] [run 10463] heartbeat
  [2026-10-11 17:36] [run 10463] heartbeat
  [2026-10-11 17:38] [run 10463] heartbeat

Runs (1):
  #10463 running      @workersql  active  2026-10-11 17:02
