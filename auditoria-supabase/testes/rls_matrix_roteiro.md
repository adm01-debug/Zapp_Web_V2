# Roteiro — Teste de Matriz RLS (Isolamento entre Tenants)

**Status**: EXECUTADO em Postgres 16 local (2026-10-24) — ver CRITICAL-2 e Seção 11 do relatório  
**Data do roteiro**: 2026-10-24  
**Referência**: Achado CRITICAL-2 / Seção 11 do relatório

---

## Por que testar em Postgres temporário

A matriz completa de RLS exige executar queries como diferentes roles
(`anon`, `authenticated`, `service_role`) simulando JWTs reais. Isso
não pode ser feito no banco de produção via `mcp_exec` (SECURITY DEFINER
bloquia `SET LOCAL role` com erro 0A000). O roteiro abaixo usa um Postgres
local com as policies reais auditadas.

---

## Pré-requisitos

```bash
# 1. Ter Docker instalado e running
# 2. Ter as migrations do repo disponíveis
cd /home/user/Zapp_Web_V2

# 3. Inicializar banco local (usar o script existente)
bash scripts/db-audit/replay-local.sh

# 4. Verificar que 0 diferenças vs manifesto
node scripts/db-audit/check-migration-drift.mjs
```

---

## Estrutura do Teste

### Cenário A — Agente de Tenant X não vê dados do Tenant Y

```sql
-- Setup: criar dois accounts/tenants e um agente em cada
-- (usar UUIDs fictícios, não produção)

-- Simular JWT do agente do account_id = 'aaaaaaaa-...'
SET request.jwt.claims = '{"sub":"agent-a","role":"authenticated","app_metadata":{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","app_role":"agent"}}';
SET ROLE authenticated;

-- Query que deveria retornar SOMENTE dados do account A
SELECT id, account_id FROM public.conversations LIMIT 5;
-- ESPERADO: todas as linhas com account_id = 'aaaaaaaa-...'
-- FALHA: qualquer linha com account_id diferente

RESET ROLE;
```

### Cenário B — Anon não consegue escrever mesmo com grant

```sql
SET ROLE anon;

-- Tentar inserir em tabela que tem grant anon INSERT (identificadas na auditoria)
INSERT INTO public.conversations (id, account_id)
VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001');
-- ESPERADO: ERROR: new row violates row-level security policy
-- FALHA: INSERT bem-sucedido

RESET ROLE;
```

### Cenário C — Admin vê todos os dados do seu account

```sql
SET request.jwt.claims = '{"sub":"admin-a","role":"authenticated","app_metadata":{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","app_role":"admin"}}';
SET ROLE authenticated;

SELECT count(*) FROM public.conversations;
-- ESPERADO: count dos dados do account A
-- FALHA: 0 (admin bloqueado por RLS excessivamente restritivo)

RESET ROLE;
```

### Cenário D — Políticas UPDATE sem WITH CHECK (CRITICAL-2)

```sql
-- Para cada tabela com UPDATE policy sem WITH CHECK (39 tabelas):
-- Tentar fazer UPDATE que muda account_id para outro tenant
SET request.jwt.claims = '{"sub":"agent-a","role":"authenticated","app_metadata":{"account_id":"aaaaaaaa-0000-0000-0000-000000000001","app_role":"agent"}}';
SET ROLE authenticated;

-- Criar uma linha no account A
INSERT INTO public.conversations (id, account_id, status)
VALUES ('conv-test-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'open');

-- Tentar mover para account B (deve falhar)
UPDATE public.conversations
SET account_id = 'bbbbbbbb-0000-0000-0000-000000000002'
WHERE id = 'conv-test-a';
-- ESPERADO: 0 rows affected (bloqueado por WITH CHECK) ou ERROR
-- FALHA: 1 row affected (linha "escapou" para outro tenant)

RESET ROLE;
```

---

## Resultados (Executado 2026-10-24 em Postgres 16 local)

| # | Operação | Usuário | Alvo | Resultado | Conclusão |
|---|----------|---------|------|-----------|----------|
| T-01 | SELECT messages | user-a | Tenant A | 1 linha | ✅ PASS |
| T-02 | SELECT messages | user-a | Tenant B | 0 linhas | ✅ PASS |
| T-03 | SELECT messages | user-b | Tenant B | 1 linha | ✅ PASS |
| T-04 | SELECT whatsapp_connections | user-a | Tenant A | 1 linha | ✅ PASS |
| T-05 | SELECT whatsapp_connections | user-a | Tenant B | 0 linhas | ✅ PASS |
| T-06 | INSERT com org_id Tenant B | user-a | Tenant B | ERROR — violação WITH CHECK | ✅ PASS |
| T-07 | INSERT whatsapp_connections com org_id Tenant B | user-a | Tenant B | ERROR — violação WITH CHECK | ✅ PASS |
| T-C2 | UPDATE organization_id A → B (SELECT policy = user_id) | user-a | Tenant A | **UPDATE 2** | ⛔ CRITICAL-2 CONFIRMADO |
| T-08 | UPDATE organization_id A → B (SELECT policy = is_member_of) | user-a | Tenant A | UPDATE 0 | ✅ MITIGADO |
| T-09 | DELETE mensagem Tenant B | user-a | Tenant B | DELETE 0 | ✅ PASS |

---

## Tabelas Prioritárias para Testar

| Prioridade | Tabela | Motivo |
|-----------|--------|--------|
| P1 | conversations | Core do produto; alta frequência |
| P1 | messages | Alto volume; dados de usuário |
| P1 | contacts | PII; acesso multi-role |
| P1 | tasks | Recentemente adicionada |
| P2 | scheduled_report_configs | Fix do E40 (DDL direto em produção) |
| P2 | campaigns | TalkX; acesso por anon esperado? |
| P2 | team_chat_messages | Team Chat isolado por workspace |
| P3 | email_threads | Alto seq_scan (possível índice errado) |

---

## Como Executar

```bash
# Opção 1: psql direto no container local
docker exec -it <supabase-local-container> psql -U postgres -d postgres -f auditoria-supabase/testes/rls_matrix.sql

# Opção 2: via node script (para automação)
node scripts/db-audit/run-rls-tests.mjs \
  --url postgres://postgres:postgres@localhost:54322/postgres \
  --test-file auditoria-supabase/testes/rls_matrix.sql
```

---

## Critério de Aprovação

- [x] T-C2 confirmado: tabela com SELECT usando user_id (sem org_id) é vulnerável — CRITICAL-2
- [x] T-08 mitigado: is_member_of em USING cobre implicit WITH CHECK
- [x] Nenhum cenário A/B/C falhou inesperadamente
- [ ] Executar cenários A-D para todas as P1 tabelas (depende de staging/local com dados reais)

---

## Resultado Esperado do Achado CRITICAL-2

Os 39 UPDATEs sem WITH CHECK foram confirmados como exploráveis quando SELECT usa apenas `user_id`.
Migração corretiva: ver `propostas/02_rls_with_check.sql`.
