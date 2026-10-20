Task t_b0724fdc: feat(db): consulta de tentativas de login e contas bloqueadas para o admin
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_b0724fdc
  max-retries: 2 (default)
  created:   2026-10-11 14:41 by claude
  started:   2026-10-11 16:11

Body:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: auditoria de paridade V3 -> V2 do documento docs/estado/01-frontend.md da V3 (relatório em docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE6_2026-10-11.md) e pedido do Joaquim em 11/10/2026 ("crie todos os cartões já"). Antes de mexer, confira no código ATUAL (branch dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono que valem aqui: nenhuma informação sai do sistema (sem exportar, baixar, copiar payload ou imprimir); toda tela nova só para os papéis indicados (NavigationService/ProtectedRoute) e com RLS no banco.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
FATOS: a Edge auth-login grava login_attempts, mas nenhuma tela lê; o admin não vê tentativas nem quem está bloqueado agora. A V3 tinha AdminFailedAuthMessagesPage.

O QUE FAZER
1. Função admin_login_attempts(periodo, email_like, so_falhas, pagina) e admin_blocked_accounts() (bloqueados agora, até quando, motivo), só admin, sem devolver senha/hash nem token.
2. Conferir RLS de login_attempts (sem leitura direta por não-admin). Testes de contrato.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<timestamp>_admin_login_attempts.sql
- supabase/tests/ ou tests/contracts/
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Consultas seguras disponíveis.
2. zapp-verify . --rapido verde.


Events (50):
  [2026-10-11 16:38] [run 10440] heartbeat
  [2026-10-11 16:39] [run 10440] heartbeat
  [2026-10-11 16:40] [run 10440] heartbeat
  [2026-10-11 16:41] [run 10440] heartbeat
  [2026-10-11 16:42] [run 10440] heartbeat
  [2026-10-11 16:43] [run 10440] heartbeat
  [2026-10-11 16:44] [run 10440] heartbeat
  [2026-10-11 16:45] [run 10440] heartbeat
  [2026-10-11 16:46] [run 10440] heartbeat
  [2026-10-11 16:47] [run 10440] heartbeat
  [2026-10-11 16:48] [run 10440] heartbeat
  [2026-10-11 16:49] [run 10440] heartbeat
  [2026-10-11 16:50] [run 10440] heartbeat
  [2026-10-11 16:51] [run 10440] heartbeat
  [2026-10-11 16:52] [run 10440] heartbeat
  [2026-10-11 16:54] [run 10440] heartbeat
  [2026-10-11 16:55] [run 10440] heartbeat
  [2026-10-11 16:56] [run 10440] heartbeat
  [2026-10-11 16:57] [run 10440] heartbeat
  [2026-10-11 16:58] [run 10440] heartbeat

Runs (1):
  #10440 running      @workersql  active  2026-10-11 16:11
