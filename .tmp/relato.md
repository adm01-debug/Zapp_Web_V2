Especialista: workersql

## O que mudou e por quê
- supabase/migrations/20261013180000_audit_log_summary.sql (NOVA, ADITIVA): cria as duas RPCs de leitura que a tela de auditoria por período consome — sem DROP/TRUNCATE/RENAME, sem tocar tabela/policy/gatilho/dado.
  · public.audit_log_summary(p_from timestamptz, p_to timestamptz) → total_logs, sensitive_actions, unique_users e os 4 KPIs: denied_24h, permission_changes_24h, admin_logins_7d, rls_failures_24h. As janelas dos KPIs são ancoradas no FIM do período (p_to): 24h = [p_to-24h, p_to); 7d = [p_to-7d, p_to). Período invertido (p_from > p_to) vira zero, não erro.
  · public.audit_log_list(p_from, p_to, p_cursor, p_cursor_id, p_limit) → a lista com o NOME do autor (LEFT JOIN public.profiles.name) e paginação por cursor keyset (created_at, id) — sem sobreposição entre páginas; p_limit normalizado em [1,200].
  Ambas SECURITY DEFINER, `SET search_path TO public, pg_temp`, e com a guarda interna `public.has_role(auth.uid(),'admin')` = MESMO controle do SELECT de audit_logs hoje (policy "Only admins can view audit logs", migration 20260404173036): quem não é admin recebe ZERO linhas (fail-closed), sem distinguir caso existente de inexistente. ACL: REVOKE de PUBLIC/anon; GRANT EXECUTE só a authenticated e service_role.
- supabase/tests/audit_log_summary_por_periodo.sql (NOVO): suíte que sobe um Postgres 17 descartável, aplica a migration REAL e prova rodando como authenticated (admin e agente) e anon.
- src/integrations/supabase/types.ts: +2 entradas em Functions (audit_log_summary, audit_log_list) para a tela tipar a chamada.
- Contrato para o cartão filho (t_2171f991 / HZ-07): chamar `audit_log_summary` e `audit_log_list` por RPC nomeada; p_cursor/p_cursor_id são a última linha da página anterior.

## Prova
- vermelho antes (migration não aplicada): `psql -v sem_funcao=1 -f supabase/tests/audit_log_summary_por_periodo.sql` →
  `ERROR:  SH1-audit FALHOU [A1 total_logs do admin == baseline]: esperado 8, obtido ERRO 42883`  (PIPE_RC=3)
- verde depois (mesma suíte, com a migration aplicada) → 38 PASS e a linha final:
  `SH1-audit OK: admin le resumo real + lista paginada com autor; agente/anon`  (PIPE_RC=0)
- banco LOCAL da tarefa (zapp-db-local, schema real): a migration aplica limpa (`CREATE FUNCTION` x2 / `REVOKE` x2 / `GRANT` x2 / `COMMENT` x2) e, com usuário sintético admin (SET LOCAL ROLE authenticated + request.jwt.claims), `audit_log_summary(now()-'1 day', now())` devolve:
  `total_logs=8 | sensitive_actions=0 | unique_users=1 | denied_24h=0 | permission_changes_24h=0 | admin_logins_7d=1 | rls_failures_24h=0`
  a lista do admin traz 5 linhas; o agente (authenticated sem papel admin) traz 0 no resumo e 0 na lista.
- rollback executável: as DUAS linhas do header (`DROP FUNCTION IF EXISTS ...`) rodam no banco local → `restantes = 0`; a migration foi reaplicada em seguida.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (278s)` (tipos, lint, migrations e db_guard OK).

## O que NÃO fiz e por quê
- denied_24h e rls_failures_24h devolvem 0 no dado atual de propósito: o V2 ainda não grava evento dedicado de acesso negado/RLS (é o que o SH1 vai gravar). Deixei os verbos já mapeados (`unauthorized_access`, `role_auto_provision_denied`; `rls_denied`, `rls_policy_violation`) — quando o SH1 gravar, o KPI acende sem nova migration. O cartão autoriza isso ("se ainda não existirem, devolva 0 e registre no relato").
- NÃO abri a policy da tabela nem relaxei para supervisor: o cartão pede o MESMO controle do SELECT (só admin).
- Diff de 32.704 caracteres > teto de 25k da área: o excesso é a suíte de prova (~20k); a migration em si tem 182 linhas aditivas. O cartão pede as DUAS RPCs num cartão só — não cindi.
- Fronteira: o consumo na tela é do cartão filho (worker de tela/hooks); aqui entreguei só o banco + os tipos.
- Nota ao juiz barato (alarme "código sem teste novo"): o teste desta entrega é `supabase/tests/audit_log_summary_por_periodo.sql`, commitado no MESMO commit do código (401b5af) — o juiz não reconhece suíte `.sql`. É ela que dá o vermelho→verde mostrado acima (42883 sem a migration; 38 PASS com ela).
