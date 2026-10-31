# Roteiro de Testes RLS — Zapp Web V2

**Banco local:** usar banco local da cópia de trabalho (CLAUDE.md seção 0 — nunca testar contra produção)
**Data de criação:** 2026-10-22
**Referência:** auditoria S3 + S11

---

## Por que testar RLS manualmente

O CI já cobre RLS via `supabase/tests/` e `scripts/db-audit/*.test.sh`. Este roteiro cobre:
1. **Verificação de cruzamento de tenants** (usuário A tenta ver dados do usuário B)
2. **Tabelas com achados da auditoria** (department_invites, storage, tabelas na publicação realtime)
3. **Método manual reproduzível** sem dependência de framework

---

## Pré-requisitos

```bash
# Banco local levantado com dados de exemplo
# VITE_ZAPP_LOCAL_SUPABASE_URL e VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY configurados
# psql disponível apontando para o banco local

export PGURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$PGURL" -c "SELECT version();"
```

---

## Método: BEGIN / SET LOCAL / SELECT / ROLLBACK

O MCP não suporta `SET LOCAL ROLE` dentro de transação. Para testar via `psql`:

```sql
-- Padrão de teste de RLS por role
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-usuario-a>", "role": "authenticated"}';

-- Executar a query de teste aqui
SELECT count(*) FROM public.<tabela>;

ROLLBACK;  -- sempre — nunca commitar testes de RLS
```

---

## Matriz de Testes — Tabelas Sensíveis

### 1. `contacts` — isolamento de tenant por assignment

```sql
-- Setup: dois usuários com IDs conhecidos no banco local
-- Usuario A: <uuid-a>  (agente com contatos atribuídos a ele)
-- Usuario B: <uuid-b>  (agente com contatos atribuídos a outro)

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-a>", "role": "authenticated"}';

-- Teste 1: usuário A só vê seus próprios contatos
SELECT count(*) as total_contacts_vistos_por_a FROM public.contacts;
-- Esperado: apenas contatos com assigned_to = <uuid-a> (ou sem assignment se admin)

-- Teste 2: usuário A não vê contatos atribuídos a B
SELECT count(*) as contatos_de_b_visiveis
FROM public.contacts
WHERE assigned_to = '<uuid-b>';
-- Esperado: 0

ROLLBACK;

-- Repetir com uuid-b para confirmar simetria
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-b>", "role": "authenticated"}';

SELECT count(*) as contatos_de_a_visiveis_por_b
FROM public.contacts
WHERE assigned_to = '<uuid-a>';
-- Esperado: 0

ROLLBACK;
```

### 2. `messages` — isolamento por contact assignment

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-a>", "role": "authenticated"}';

-- Usuário A não deve ver mensagens de contatos atribuídos a B
SELECT count(*) as msgs_de_contatos_de_b
FROM public.messages m
JOIN public.contacts c ON c.id = m.contact_id
WHERE c.assigned_to = '<uuid-b>';
-- Esperado: 0

ROLLBACK;
```

### 3. `department_invites` — ACHADO S3-01 (alta prioridade)

```sql
-- ATENÇÃO: Este teste confirma a vulnerabilidade encontrada na auditoria.
-- Executar apenas em banco LOCAL com dados de exemplo.

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-usuario-sem-privilegio>", "role": "authenticated"}';

-- Teste 1: usuário sem privilégio pode ver todos os convites?
SELECT count(*) as total_invites_vistos FROM public.department_invites;

-- Teste 2: usuário pode deletar convite alheio? (VULNERABILIDADE ESPERADA antes da correção P001)
-- NÃO EXECUTAR EM PRODUÇÃO — apenas em banco local
DELETE FROM public.department_invites WHERE id = '<id-de-convite-de-outro-usuario>'
RETURNING id;
-- Esperado ANTES de P001: retorna 1 row (vulnerabilidade confirmada)
-- Esperado APÓS P001: retorna 0 rows (corrigido)

ROLLBACK;  -- sempre reverter
```

### 4. `talkx_campaigns` — isolamento por owner

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-a>", "role": "authenticated"}';

-- Usuário A só vê campanhas com owner = uuid-a
SELECT count(*) as campanhas_de_b_visiveis
FROM public.talkx_campaigns
WHERE owner = '<uuid-b>';
-- Esperado: 0

ROLLBACK;
```

### 5. `scheduled_report_configs` — owner-only (pós E40)

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-a>", "role": "authenticated"}';

-- Usuário A só vê suas próprias configs
SELECT count(*) as configs_alheias
FROM public.scheduled_report_configs
WHERE created_by != '<uuid-a>';
-- Esperado: 0

-- Teste UPDATE sem ser owner
UPDATE public.scheduled_report_configs
SET name = 'hack'
WHERE created_by = '<uuid-b>'
RETURNING id;
-- Esperado: 0 rows

ROLLBACK;
```

### 6. `whatsapp_connections` — admin/supervisor only

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-agente-simples>", "role": "authenticated"}';

-- Agente simples não deve ver whatsapp_connections (apenas admin/supervisor)
SELECT count(*) as connections_visiveis FROM public.whatsapp_connections;
-- Esperado: 0 (se is_admin_or_supervisor() retorna false para este usuário)

ROLLBACK;
```

### 7. `sales_deals` — isolamento por assigned_to

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-a>", "role": "authenticated"}';

SELECT count(*) as deals_de_b
FROM public.sales_deals
WHERE assigned_to = '<uuid-b>';
-- Esperado: 0

ROLLBACK;
```

### 8. Tabelas com 0 policies (default-deny total)

```sql
-- Estas tabelas devem retornar 0 linhas para qualquer role não-service_role

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<uuid-qualquer>", "role": "authenticated"}';

SELECT count(*) FROM public.ai_jobs;             -- Esperado: 0
SELECT count(*) FROM public.ai_budget_reservations; -- Esperado: 0
SELECT count(*) FROM public.edge_rate_limits;    -- Esperado: 0
SELECT count(*) FROM public.gmail_oauth_states;  -- Esperado: 0
SELECT count(*) FROM public.talkx_test_send_claims; -- Esperado: 0

ROLLBACK;
```

### 9. Role `anon` — nenhuma linha em tabelas sensíveis

```sql
BEGIN;
SET LOCAL ROLE anon;
-- Sem JWT claims (anon não tem auth.uid())

SELECT count(*) FROM public.contacts;            -- Esperado: 0
SELECT count(*) FROM public.messages;            -- Esperado: 0
SELECT count(*) FROM public.profiles;            -- Esperado: 0
SELECT count(*) FROM public.talkx_campaigns;     -- Esperado: 0
SELECT count(*) FROM public.whatsapp_connections; -- Esperado: 0

ROLLBACK;
```

---

## Testes de Storage RLS

```sql
-- Storage usa pg_policies no schema 'storage'
-- Testar via API do Supabase Storage (não via SQL direto)

-- Verificar policies existentes:
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, cmd;

-- Checar policy 'public' em vez de 'authenticated' (achado S3-03/S8-02):
SELECT policyname, roles
FROM pg_policies
WHERE schemaname = 'storage' AND 'public' = ANY(roles);
-- Esperado após P006: 0 rows (policy corrigida para 'authenticated')
```

---

## Script de Verificação Automatizada (banco local)

```bash
#!/bin/bash
# scripts/db-audit/verify-rls-tenant-isolation.sh
# Executar apenas contra banco LOCAL

set -e
PGURL="${VITE_ZAPP_LOCAL_SUPABASE_URL/https:\/\//postgresql://postgres:postgres@localhost:54322/postgres}"

run_test() {
  local desc="$1"
  local sql="$2"
  local expected="$3"
  local result
  result=$(psql "$PGURL" -tAc "$sql")
  if [ "$result" = "$expected" ]; then
    echo "OK  $desc"
  else
    echo "FAIL $desc (esperado=$expected, obtido=$result)"
    exit 1
  fi
}

# Verificar 0 policies em tabelas que devem ser default-deny
run_test "ai_jobs default-deny para authenticated" \
  "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL \"request.jwt.claims\" TO '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}'; SELECT count(*) FROM public.ai_jobs; ROLLBACK;" \
  "0"

run_test "anon bloqueado em contacts" \
  "BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.contacts; ROLLBACK;" \
  "0"

echo "Todos os testes RLS passaram."
```

---

## Referência dos Testes Existentes no CI

Os seguintes arquivos já cobrem RLS no CI (`db-guard.yml`):

- `supabase/tests/rls_dashboard.sql`
- `supabase/tests/rls_conversation_tab_counts_files_total.sql`
- `supabase/tests/rls_message_reactions_autoria.sql`
- `supabase/tests/rls_message_templates.sql`
- `supabase/tests/rls_whatsapp_media_select_via_messages.sql`
- `supabase/tests/rls_whatsapp_media_storage_acl.sql`
- `supabase/tests/contact_protection_policy_rls.sql`
- `scripts/db-audit/e44-whatsapp-connections-anon-grants.test.sh`
- `scripts/db-audit/security_acl_alerts_monitor.sql`

Este roteiro **complementa** (não substitui) os testes existentes, focando nos achados da auditoria de 2026-10-22 e no cruzamento de tenants não coberto nos arquivos acima.
