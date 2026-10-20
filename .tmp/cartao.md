Task t_4d66a644: feat(db): resumo da auditoria de segurança agregado por período (só admin)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_4d66a644
  max-retries: 2 (default)
  created:   2026-10-13 07:42 by claude
  started:   2026-10-13 14:51
  children:  t_2171f991

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`components/security/AuditLogDashboard.tsx:85` lê só as últimas 200 linhas de `audit_logs` (`.limit(200)`) e calcula tudo sobre elas: 'Total de Logs' nunca passa de 200 e 'Hoje', 'Ações Sensíveis' e 'Usuários Únicos' são contagens dessas 200. A V3 (`AdminSecurityLogsPage`) mostra KPIs por período (tentativas negadas 24 h, mudanças de permissão 24 h, logins de admin 7 d, falhas de RLS 24 h) e o nome do ator. A policy de SELECT de `audit_logs` é só admin (`20260930170000_contacts_deleted_at_audit.sql:97`; confira a vigente). Não conflita com PD-17 (`AdminAuditTable`, outro componente).

O QUE FAZER
1. Crie `audit_log_summary(p_from, p_to)` (SECURITY DEFINER, só admin) com os totais reais do período, ações sensíveis, usuários únicos e os 4 KPIs, e `audit_log_list(p_from, p_to, p_cursor, p_limit)` com nome do ator e paginação por cursor; use os eventos que o SH1 grava para 'acesso negado' (se ainda não existirem, devolva 0 e registre no relato). Prova com papéis e `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_audit_log_summary.sql (novo)
- supabase/tests/
- src/integrations/supabase/types.ts

CRITÉRIO DE PRONTO
1. Totais reais do período.
2. Só admin.
3. Prova com papéis.
4. `zapp-verify . --rapido` verde.


Comments (2):
  [2026-10-13 14:28] default: [claude] AUDITORIA 13/10 — SOBREPOSIÇÃO com HZ-07 t_7d74e43f (hugo, outra sessão). Mesmo alvo da contagem de auditoria no servidor. Antes de criar a RPC, confira se o HZ-07 já criou; se sim, reaproveite.
  [2026-10-13 15:45] workersql: Contrato entregue para o cartão filho (t_2171f991 / HZ-07 — tela de auditoria por período):

- `public.audit_log_summary(p_from timestamptz, p_to timestamptz)` → 1 linha:
  `total_logs bigint, sensitive_actions bigint, unique_users bigint, denied_24h bigint, permission_changes_24h bigint, admin_logins_7d bigint, rls_failures_24h bigint`.
  Janelas dos KPIs ancoradas em `p_to`: 24h = [p_to-24h, p_to); 7d = [p_to-7d, p_to). Parâmetros nulos caem em defaults (p_to=now(), p_from=p_to-30d).
- `public.audit_log_list(p_from, p_to, p_cursor timestamptz, p_cursor_id uuid, p_limit integer)` → linhas:
  `id uuid, created_at timestamptz, user_id uuid, actor_name text, action text, entity_type text, entity_id uuid, details jsonb, ip_address text, user_agent text`.
  Ordenação `created_at DESC, id DESC`; paginação keyset: passar o (created_at, id) da ÚLTIMA linha como p_cursor/p_cursor_id; `p_limit` em [1,200] (default 50).
- Acesso: só admin (mesma política do SELECT de audit_logs); agente/supervisor e anon recebem 0 linhas. Tipos já em src/integrations/supabase/types.ts.
- denied_24h e rls_failures_24h = 0 hoje (sem evento gravado); só acendem quando o SH1 gravar `unauthorized_access`/`role_auto_provision_denied` e `rls_denied`/`rls_policy_violation`.

Events (61):
  [2026-10-13 15:27] [run 12575] heartbeat
  [2026-10-13 15:28] [run 12575] heartbeat
  [2026-10-13 15:29] [run 12575] heartbeat
  [2026-10-13 15:30] [run 12575] heartbeat
  [2026-10-13 15:31] [run 12575] heartbeat
  [2026-10-13 15:32] [run 12575] heartbeat
  [2026-10-13 15:33] [run 12575] heartbeat
  [2026-10-13 15:34] [run 12575] heartbeat
  [2026-10-13 15:35] [run 12575] heartbeat
  [2026-10-13 15:36] [run 12575] heartbeat
  [2026-10-13 15:37] [run 12575] heartbeat
  [2026-10-13 15:38] [run 12575] heartbeat
  [2026-10-13 15:39] [run 12575] heartbeat
  [2026-10-13 15:40] [run 12575] heartbeat
  [2026-10-13 15:41] [run 12575] heartbeat
  [2026-10-13 15:42] [run 12575] heartbeat
  [2026-10-13 15:43] [run 12575] heartbeat
  [2026-10-13 15:44] [run 12575] heartbeat
  [2026-10-13 15:45] commented {'author': 'workersql', 'len': 1259}
  [2026-10-13 15:45] [run 12575] heartbeat

Runs (1):
  #12575 running      @workersql  active  2026-10-13 14:51
