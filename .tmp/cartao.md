Task t_a77a5aad: feat(db): configuração e registro de reconexão automática por conexão
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a77a5aad
  max-retries: 2 (default)
  created:   2026-10-12 08:29 by claude
  started:   2026-10-12 09:54

Body:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3, segunda passada (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE7_SEGUNDA_PASSADA_2026-10-12.md) e pedido do Joaquim em 12/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
FATOS: a V2 não deixa configurar nem auditar reconexão automática (grep auto_reconnect_enabled, reconnection_logs: nada) e o cartão não mostra o motivo de saúde (grep health_reason: nada), então conexão 'fantasma' aparece como conectada. A V3: InstanceSettingsDialog.tsx ~l.125-155,268-330; ConnectionCard.tsx ~l.73-77,303-326.

O QUE FAZER
1. Colunas na tabela de conexões: auto_reconnect_enabled (padrão true), reconnect_interval_seconds (60..3600), reconnect_max_attempts (1..20), health_reason (texto curto).
2. Tabela reconnection_logs (conexão, tentativa, resultado, motivo, created_at); RLS staff; retenção 30 dias.
3. Testes de contrato.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_auto_reconnect.sql
- supabase/tests/ ou tests/contracts/
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Base com RLS e testes.
2. zapp-verify . --rapido verde.


Events (25):
  [2026-10-12 09:55] [run 10918] heartbeat
  [2026-10-12 09:56] [run 10918] heartbeat
  [2026-10-12 09:57] [run 10918] heartbeat
  [2026-10-12 09:58] [run 10918] heartbeat
  [2026-10-12 09:59] [run 10918] heartbeat
  [2026-10-12 10:00] [run 10918] heartbeat
  [2026-10-12 10:01] [run 10918] heartbeat
  [2026-10-12 10:02] [run 10918] heartbeat
  [2026-10-12 10:03] [run 10918] heartbeat
  [2026-10-12 10:04] [run 10918] heartbeat
  [2026-10-12 10:05] [run 10918] heartbeat
  [2026-10-12 10:06] [run 10918] heartbeat
  [2026-10-12 10:07] [run 10918] heartbeat
  [2026-10-12 10:08] [run 10918] heartbeat
  [2026-10-12 10:09] [run 10918] heartbeat
  [2026-10-12 10:10] [run 10918] heartbeat
  [2026-10-12 10:12] [run 10918] heartbeat
  [2026-10-12 10:13] [run 10918] heartbeat
  [2026-10-12 10:14] [run 10918] heartbeat
  [2026-10-12 10:15] [run 10918] heartbeat

Runs (1):
  #10918 running      @workersql  active  2026-10-12 09:54
