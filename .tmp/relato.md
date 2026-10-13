Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261013230003_log_audit_event_allowlist.sql` (NOVO): recria `public.log_audit_event`
  com uma ALLOWLIST de ações. Antes a função gravava QUALQUER texto em `audit_logs.action` (o único
  filtro da coluna era “não vazio”), então um agente autenticado forjava `role_granted` /
  `settings_changed` / `''` e a trilha aceitava. Agora só passam as ações que a ponta realmente envia
  hoje — `login, logout, client_error, unauthorized_access, searchbox_session, searchbox_cost_guard,
  searchbox_budget_warning, searchbox_selected, location_sent, call_started, call_ended,
  gdpr_deletion_request` (levantadas por `git grep` em `src`: `src/lib/audit.ts`, `src/lib/errorReporter.ts`,
  `src/components/calls/CallDialog.tsx`, `src/components/auth/ProtectedRoute.tsx`,
  `src/components/contacts/LocationPicker.tsx`, `src/components/compliance/LGPDComplianceView.tsx` e os
  módulos de searchbox). Ação fora da lista devolve NEUTRO (void, sem erro) — não grava e não revela nada.
  Junto, as guardas pedidas, todas neutras: teto de 4096 bytes em `p_details`, rate limit de 60 eventos/min
  por usuário, `login` no máximo 1x por dia por usuário, e um `pg_advisory_xact_lock` por usuário em volta do
  “checa-e-grava” (sem ele, duas chamadas simultâneas poderiam furar o limite/login). Preservado o resto:
  `auth.uid()` nulo não grava e `p_entity_id` inválido vira `entity_id` nulo.
  Ações sensíveis (papéis, configurações, rede, contas) NÃO entram na allowlist: ficam só por gatilho
  (dono da tabela) ou service_role.
- `supabase/tests/log_audit_event_allowlist.sql` (NOVO): prova no banco LOCAL montado com as migrations REAIS
  (`zapp-db-local up`), exercendo a RPC **sob o papel real** (`SET LOCAL ROLE authenticated`/anon/service_role
  com `request.jwt.claims`), nunca como superusuário. Cobre A) fora da allowlist não grava, B) dentro grava do
  dono, C) login 1x/dia, D) teto de 4 KB (limite grava / limite+1 barra), E) rate limit 60/min, F) INSERT
  direto segue negado, G) anon/service_role não gravam pela RPC, H) `entity_id` inválido não derruba,
  I) o ROLLBACK roda e devolve a função anterior.

**Verificação do que NÃO mudou:** o INSERT direto em `audit_logs` pelo cliente JÁ é bloqueado no banco pela
política existente `"Block direct audit log inserts"` (WITH CHECK false) — confirmei as 4 policies de
`audit_logs` antes de mexer, então a migration NÃO toca policy, RLS nem tabela. As duas linhas de ACL
(`REVOKE ... FROM PUBLIC, anon` / `GRANT ... TO authenticated, service_role`) reafirmam a ACL vigente
(`{postgres, authenticated, service_role}`) — `CREATE OR REPLACE` preserva; é o contrato explícito, não
amplia acesso. `RETURNS void` e a assinatura não mudaram, então `src/integrations/supabase/types.ts` fica igual.

## Prova
- vermelho antes (mesma suíte FINAL, contra a função anterior): `python3 -c "…red_head.sql + suíte…" | zapp-db-local psql . v2-26101304032a5b`
  → `ERROR:  ALLOWLIST FALHOU [A1 role_granted NAO grava]: esperado OK / n=0, obtido OK / n=1`
- verde depois: `zapp-db-local psql . v2-26101304032a5b < supabase/tests/log_audit_event_allowlist.sql`
  → todas as asserções `PASS` (A1..I1) e a linha final
  `log_audit_event_allowlist OK: fora da allowlist nao grava; dentro grava 1x do dono;`
- rollback executado (armadilha nº 1 do workersql): o bloco I roda as MESMAS statements do cabeçalho
  `-- Rollback (SQL executável, na ordem)` no banco local e a saída foi
  `PASS [I1 depois do rollback a acao sensivel volta a gravar] -> OK / n=1` (a versão anterior volta a aceitar
  `role_granted`), com a transação inteira revertida no fim (`ROLLBACK`).

## O que NÃO fiz e por quê
- Não mexi em policy/RLS/tabela: o furo do cartão é a RPC; o INSERT direto já estava fechado.
- Não criei `scripts/db-audit/*.test.sh` (fora do escopo de arquivos do cartão). A suíte mora em
  `supabase/tests/`, que não entra no inventário do `db-guard`.
  REGISTRO PENDENTE: supabase/tests/log_audit_event_allowlist.sql
- Não toquei o front: nenhuma ação enviada hoje ficou de fora da allowlist; se surgir ação nova, ela é
  ignorada até ser incluída (decisão consciente do cartão: “só as que existirem”).

CONCLUÍ: defeito corrigido, provado vermelho→verde no banco local com papel real, rollback testado.
