Task t_f7a0c254: feat(db): saúde de todas as contas de e-mail para o admin (sem tokens)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_f7a0c254
  max-retries: 2 (default)
  created:   2026-10-11 14:42 by claude
  started:   2026-10-11 17:01

Body:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3 (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE6_2026-10-11.md) e pedido do Joaquim em 11/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
FATOS: GmailWebhookMonitor usa get_own_gmail_accounts, então o admin só vê as próprias contas, não a validade das contas da equipe. A V3 tinha AdminEmailStatusPage com a saúde de cada conta.

O QUE FAZER
1. Função admin_email_accounts_health() só admin: conta, dono, status do token (válido/expirando/expirado, sem o token), último sincronismo, falhas recentes, última validação.
2. Testes de contrato.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_admin_email_health.sql
- supabase/tests/ ou tests/contracts/
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Consulta segura disponível.
2. zapp-verify . --rapido verde.


Events (28):
  [2026-10-11 17:05] [run 10460] heartbeat
  [2026-10-11 17:06] [run 10460] heartbeat
  [2026-10-11 17:07] [run 10460] heartbeat
  [2026-10-11 17:08] [run 10460] heartbeat
  [2026-10-11 17:09] [run 10460] heartbeat
  [2026-10-11 17:10] [run 10460] heartbeat
  [2026-10-11 17:11] [run 10460] heartbeat
  [2026-10-11 17:12] [run 10460] heartbeat
  [2026-10-11 17:13] [run 10460] heartbeat
  [2026-10-11 17:14] [run 10460] heartbeat
  [2026-10-11 17:15] [run 10460] heartbeat
  [2026-10-11 17:16] [run 10460] heartbeat
  [2026-10-11 17:17] [run 10460] heartbeat
  [2026-10-11 17:18] [run 10460] heartbeat
  [2026-10-11 17:19] [run 10460] heartbeat
  [2026-10-11 17:20] [run 10460] heartbeat
  [2026-10-11 17:21] [run 10460] heartbeat
  [2026-10-11 17:22] [run 10460] heartbeat
  [2026-10-11 17:23] [run 10460] heartbeat
  [2026-10-11 17:24] [run 10460] heartbeat

Runs (1):
  #10460 running      @workersql  active  2026-10-11 17:01
