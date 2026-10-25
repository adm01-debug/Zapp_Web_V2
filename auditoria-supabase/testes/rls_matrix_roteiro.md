# Roteiro — Teste de Matriz RLS (Isolamento entre Tenants)

**Status**: EXECUTADO — Postgres 16 local em 2026-10-24 (ver resultados em `01_rls_matrix.sql`)  
**Data do roteiro**: 2026-10-24  
**Referência**: CRITICAL-2 / Seção 11 do RELATORIO_AUDITORIA_SUPABASE.md

---

## Por que testar em Postgres temporário

A matriz completa de RLS exige executar queries como diferentes roles
(`anon`, `authenticated`, `service_role`) simulando JWTs reais. Isso
não pode ser feito no banco de produção (proibido escrever dados de teste
em produção). O roteiro abaixo usa um Postgres local com as migrations
do repo aplicadas.

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

### Cenário D — Políticas UPDATE sem WITH CHECK

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

## Tabelas Prioritárias para Testar

Baseado no volume e criticidade:

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

- [ ] Nenhum cenário B retorna INSERT bem-sucedido para anon
- [ ] Nenhum cenário D permite atualizar account_id para outro tenant
- [ ] Cenário A retorna somente linhas do account correto
- [ ] Cenário C não retorna 0 para admin do próprio account

---

## Resultado da Execução — CRITICAL-2 CONFIRMADO (2026-10-24, Postgres 16 local)

```
T-01: PASS — user-a vê dados do Tenant A
T-02: PASS — user-a não vê dados do Tenant B
T-03: PASS — user-b vê dados do Tenant B
T-06: PASS — INSERT cross-tenant bloqueado
T-C2: *** CRITICAL-2 CONFIRMADO *** — UPDATE 2 linhas com org_id de Tenant B
T-08: PASS — is_member_of implicit WITH CHECK bloqueia (UPDATE 0)
T-09: PASS — DELETE cross-tenant bloqueado
```

Script SQL completo: `testes/01_rls_matrix.sql`

Se os 39 UPDATEs sem WITH CHECK forem confirmados como exploráveis,
gerar migration corretiva antes de aplicar em produção:

```sql
-- Ver propostas/02_rls_with_check.sql para o template
```
