Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011180337_sla_alert_events_and_preferences.sql (novo): cria o
  histórico de alertas de SLA e as preferências de alerta do cartão.
  - public.sla_alert_events: id, contact_id (FK contacts ON DELETE CASCADE), alert_type
    CHECK ('first_response','resolution'), severity CHECK ('warning','breached'),
    created_at, resolved_at, resolved_by (FK profiles), queue_id (FK queues). Índice único
    PARCIAL (contact_id, alert_type, severity) WHERE resolved_at IS NULL — é ele que garante
    o "não duplica alerta ativo". Índice em contact_id para o cascade. CHECK
    sla_alert_events_resolved_consistente (resolved_by só existe junto de resolved_at).
    RLS ligada; REVOKE ALL de PUBLIC/anon; só GRANT SELECT para authenticated. INSERT/UPDATE
    não têm grant nem policy: o único caminho de escrita são as funções abaixo (SECURITY
    DEFINER, dono da tabela). SELECT usa a mesma regra de visibilidade de contato
    (public.is_contact_visible_to_user), que já inclui admin/supervisor (staff).
  - public.record_sla_alert(p_contact_id, p_alert_type, p_severity) → uuid, SECURITY DEFINER,
    SET search_path = pg_catalog, public. Idempotente: ON CONFLICT na índice parcial
    (DO NOTHING) e devolve o id do alerta ativo já existente. Exige sessão (auth.uid());
    permite service_role (cron). Valida tipo/severidade; só grava se o chamador vê o contato
    ou é staff. queue_id vem do contato.
  - public.resolve_sla_alert(p_event_id) → uuid, SECURITY DEFINER, search_path fixo. Só staff
    (is_admin_or_supervisor). Grava resolved_at = now() e resolved_by = profile do usuário —
    a auditoria é essa (dado de sistema, sem PII). Segunda chamada no mesmo alerta levanta
    P0002 ("alerta_inexistente_ou_ja_resolvido"); não é meia-atualização.
  - public.sla_alert_preferences: user_id PK (FK auth.users ON DELETE CASCADE), enabled,
    alert_first_response, alert_resolution, severity_warning, severity_breached, updated_at.
    RLS ligada; policies select/insert/update só na própria linha (user_id = auth.uid());
    DELETE não é permitido. Gatilho BEFORE UPDATE reusa public.update_updated_at_column().
- supabase/tests/sla_alert_events_and_preferences.sql (novo): suíte de contrato. Superfície
  mínima (roles, auth schema, tabelas ambiente) e em seguida \i das migrations REAIS em ordem
  (20251215025014 base, 20260329175853 enum, 20260909200000 helpers de visibilidade, a
  migration nova). Executa como authenticated/anon/service_role de verdade (SET LOCAL ROLE +
  request.jwt.claims) e termina em ROLLBACK. RED: -v sem_guarda=1 desliga RLS e as policies do
  contrato — prova que o teste é sensível.
- src/integrations/supabase/types.ts: adiciona as duas tabelas e as duas funções na posição
  alfabética do gerador, no formato dele (Row/Insert/Update/Relationships). Relationships
  usa os nomes reais das constraints conferidos no banco local
  (sla_alert_events_contact_id_fkey / _queue_id_fkey / _resolved_by_fkey; FK para auth.users
  fica fora, como em agent_presence). typecheck limpo.

## Prova
- vermelho antes (RLS/policies desligadas): `docker exec -i zapp-sla-r psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -v repo=/repo -v mig_dir=/repo/supabase/migrations -v sem_guarda=1 -f /repo/supabase/tests/sla_alert_events_and_preferences.sql`
  → `ERROR: SLA FALHOU [A3 agente B (atribuido a C1 + membro de Q2) ve 3 alertas]: esperado 3, obtido 4` (EXIT_RED=3)
- verde depois (container novo, postgres:17-alpine, repo montado read-only em /repo):
  `docker exec -i zapp-sla-g psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -v repo=/repo -v mig_dir=/repo/supabase/migrations -f /repo/supabase/tests/sla_alert_events_and_preferences.sql`
  → bloco A/B/C/D: 40 NOTICE `PASS [...]`, e `=== SLA ALERT: TODAS AS ASSERTIONS PASSARAM ===` (exit 0).
  Cobre: anon sem GRANT (42501) nos dois lados; admin/supervisor veem tudo; agente vê só
  alertas de contatos que enxerga (atribuído + membro de fila); agente de fora vê 0;
  authenticated sem INSERT/UPDATE/DELETE na tabela (42501 — só via função); record idempotente
  (mesma linha na repetição, combinação nova cria 1); resolve só staff (agente 42501, anon
  42501), grava resolved_at/resolved_by, repetição P0002; preferências só na própria linha
  (INSERT de outro e UPDATE de outro barrados, updated_at tocado pelo gatilho, DELETE sem grant).
- migration aplicada no banco LOCAL da tarefa: `hermes-db-migrar supabase/migrations/20261011180337_sla_alert_events_and_preferences.sql` → `APLICADA no banco LOCAL`.
- `node scripts/db-audit/supabase-usage-guard.mjs && node scripts/db-audit/check-migration-drift.mjs` → `OK: nenhuma violacao nova` / `arquivos validos em supabase/migrations: 819`.
- `npx tsc -b --force` → TSC_EXIT=0.

## O que NÃO fiz e por quê
- Não toquei script de CI/workflow nem ALLOWLIST: o teste é .sql em supabase/tests/ (fora do
  check-test-inventory, que continua vermelho só pelos 2 órfãos pré-existentes
  department-invite e team-chat-media — não são meus).
- Não escrevi em produção nem em ledger remoto (modo V2 local; DESTINO_URL ausente).
- Correção = migration nova (nada existente foi editado); rollback executável no topo.
