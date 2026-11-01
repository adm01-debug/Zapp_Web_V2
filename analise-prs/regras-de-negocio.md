# Regras de Negócio — Zapp Web V2

**SHA main de referência:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`  
**Data:** 2026-11-01

## Fontes consultadas

- `CLAUDE.md` (regras gerais, banco, CI, workflows)
- `supabase/migrations/` (schema e RLS)
- `src/hooks/`, `src/services/` (lógica de negócio)
- `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`
- `docs/audits/`

---

## 1. Contatos

**Regra vigente (F5/D4, migration 20260930450000):**

Contato visível = `deleted_at IS NULL` + `is_lid_legacy = false` + `phone ~ '^[0-9]{10,15}$'`

Qualquer PR que altere esse critério deve atualizar **simultaneamente**:
1. Migration com nova RLS
2. `CONTACT_VISIBLE_PHONE_PATTERN` em `src/hooks/crm/contactsAggregates.ts`
3. `scripts/db-audit/contacts-legacy-visibility.test.sh`

---

## 2. Conversas / Inbox

**Estados de transição (migration de constraint):**  
`archived → open` ou `archived → pending` são as únicas transições permitidas desde `cbe53b574`.  
PR #2463 (contexto): sem DDL de conversa, só serviço de mídia.

**Regra de undo de archive:**  
Voltar conversa arquivada ao estado original respeita constraint `archived → open|pending`.

---

## 3. Copiloto / RADAR (em desenvolvimento)

**Tabelas copilot** (migration 20261030145126 — PR #2461):
`copilot_sessions`, `copilot_insights`, `copilot_conversation_context`, `copilot_product_catalog`, `copilot_objection_patterns`, `copilot_success_patterns`, `copilot_performance_metrics`

**Edge functions copilot** (PR #2460 — BLOQUEADO):
Dependem das tabelas acima + `copilot_sessions`/`copilot_insights` da migration 20261030200000 (ainda em `producao-ddl`). Não mergear edge functions antes das tabelas.

---

## 4. TalkX / Campanhas

**Plano vigente:** V4 (200 etapas X001–X200), `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`  
V3 e anteriores: substituídos, não executar.

**Convenção de branch:** `<agente>/<tipo>-talkx-x<NNN>-<slug>-<AAMMDD-HHMM>`

---

## 5. Migrations — regras obrigatórias

Ver `CLAUDE.md` seção 1 para detalhes completos. Resumo:

- **Aditiva e não destrutiva:** sem `DROP`, `RENAME`, `ALTER TYPE`, `DELETE`/`UPDATE` em massa
- **Ordem obrigatória:** arquivo → PR → merge → deploy → apply
- **Teste:** aplicar toda cadeia de migrations em Postgres temporário
- **Registro:** `version` > max(ledger), `statements` = SQL real (não prosa)
- **RLS:** sempre com teste provando que nenhum acesso foi ampliado

---

## 6. Edge Functions

- Deploy automático: push na `main` que altera `supabase/functions/` ou `supabase/config.toml`
- Autenticação: nunca afrouxar (sem remover `Authorization` checks, sem ampliar roles)
- Testes obrigatórios antes do merge

---

## 7. Permissões / Roles

- `is_admin_or_supervisor()`: admins e supervisores
- `is_admin()`: apenas admins
- RLS: toda nova policy deve ser testada isoladamente em Postgres temporário
- Nunca ampliar acesso via RLS sem evidência de teste

---

## 8. Workflows de CI (.github/workflows/)

Proibido alterar workflows nesta sessão (regra de segurança). PRs com apenas mudanças de workflow → SKIP_WORKFLOWS.

6 required checks: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`

CI Gate = aggregate check `✅ CI Gate (required check)` — aparece após todos os individuais.

---

*Gerado automaticamente em 2026-11-01 com base nas fontes acima.*
