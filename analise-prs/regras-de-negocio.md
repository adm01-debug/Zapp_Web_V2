# Regras de Negócio — Zapp Web V2

**Gerado em:** 2026-11-02  
**Fontes:** CLAUDE.md, docs/PRONTO_PRODUCAO.md, docs/DB-INVENTORY.md, docs/DB-SECURITY.md,  
`src/config/supabase.ts`, migrations, policies e testes identificados na análise de 98 PRs.

---

## 1. Congelamento de features (desde 2026-11-01)

**Fonte:** `.claude/CLAUDE.md` (adicionado pelo PR #2545, mergeado 2026-11-02T03:01Z)

Só entram na `main`:
- Correção de bug nos 9 fluxos críticos de `docs/PRONTO_PRODUCAO.md`
- Correção de CI que impede verificar esses fluxos
- Correção de segurança (RLS aberta, segredo exposto, vazamento de dados)

**Não entra:**
- Feature nova (TalkX V4, Copiloto/Radar, War Room, gamificação, metas, IA nova)
- Ajuste visual, contraste, a11y, animação, snapshot — salvo se quebra fluxo crítico
- Relatório, dossiê, inventário ou placar em markdown/JSON
- Workflow, guarda ou script de CI novo

---

## 2. Fluxos críticos de produção (9 fluxos)

**Fonte:** `docs/PRONTO_PRODUCAO.md` (PR #2545)

| # | Fluxo | Estado (2026-11-01) |
|---|---|---|
| 1 | Login, sessão e papéis (agente/supervisor/admin) | NÃO VERIFICADO |
| 2 | Conectar número WhatsApp (QR / instância Evolution) | **QUEBRADO** |
| 3 | Receber mensagem (webhook → banco → inbox) | **QUEBRADO** |
| 4 | Enviar mensagem (texto e mídia) | **QUEBRADO** |
| 5 | Inbox: lista, atribuição, transferência, fechamento | NÃO VERIFICADO |
| 6 | Contatos (criar, editar, buscar, mesclar, excluir) | NÃO VERIFICADO |
| 7 | Admin de usuários (criar, editar, desativar, papéis) | NÃO VERIFICADO |
| 8 | Filas e roteamento (Talk-me, SLA) | NÃO VERIFICADO |
| 9 | Saúde da conexão (monitor e alerta de queda) | PARCIAL |

"Pronto" = todos os 9 fluxos OK **com prova em produção** (query/request/log real com data+hora) **e** E2E passando na `main`.

---

## 3. Tenancy e isolamento de dados

**Fonte:** RLS policies em produção + migrations + `docs/DB-SECURITY.md`

- Toda tabela com dados de usuário tem RLS ativado
- Isolamento por `tenant_id` (cada empresa/conta tem acesso somente aos seus dados)
- Acesso cross-tenant: apenas funções com `security definer` e GRANT explícito
- Papéis: `authenticated` (agentes), `service_role` (edge functions), `anon` (sem acesso a dados sensíveis)
- Hierarquia: `admin` > `supervisor` > `agent`; permissões verificadas via `user_has_permission()`
- Função `is_admin_or_supervisor()` — guards policies de escrita sensível

---

## 4. Regras de escrita em `department_invites`

**Fonte:** Migration `20261102012200` (PR #2570, mergeado 2026-11-02T06:01Z)  
**Evidência:** `analise-prs/dossies/PR-2570.md` + query ao banco em produção

- `INSERT` em `department_invites`: apenas admins (`is_admin_or_supervisor()`)
- `DELETE` em `department_invites`: apenas admins
- `SELECT`: qualquer autenticado
- RPC `create_department_invite`: substitui INSERT direto do front — valida `created_by` + permissão

---

## 5. Contatos — critério de visibilidade

**Fonte:** `CLAUDE.md §Contatos`, migration `20260930450000`, `src/hooks/crm/contactsAggregates.ts`

Contato visível em Contatos = **todos os 3** critérios:
1. `deleted_at IS NULL`
2. `is_lid_legacy = false`
3. `phone ~ '^[0-9]{10,15}$'`

`include_legacy: true` só quando toggle "Mostrar legados" está ligado (`localStorage contact-show-legacy`).  
Mudar o critério exige alterar os três pontos juntos: migration + `CONTACT_VISIBLE_PHONE_PATTERN` + `scripts/db-audit/contacts-legacy-visibility.test.sh`.

---

## 6. WhatsApp / Evolution GO

**Fonte:** `CLAUDE.md §2`, edge function `evolution-api`, runbook de QR Code

- Instância padrão: `PRINCIPAL` (Evolution GO, flavor `go`)
- Autenticação: `EVOLUTION_API_KEY` (admin) e `EVOLUTION_INSTANCE_TOKEN` (por instância)
- Secrets são de edge functions — nunca no front
- Status `connected` = pré-requisito para qualquer operação de envio
- Reconexão automática: edge `connection-health-check` (checagem ~5 min); se `jid` presente mas `connected=false` → recria instância na GO (delete + create com mesmo token, sem mudar `whatsapp_connections`)
- Banco interno da Evolution GO ≠ banco do projeto — nunca aplicar migrations do repo nele

---

## 7. RLS sem WITH CHECK — contexto PR #2481

**Fonte:** Análise PR #2481 em `analise-prs/dossies/PR-2481.md`

8 tabelas têm policies `UPDATE` sem `WITH CHECK`:
Isso permite que usuário autenticado atualize linha para valor que não satisfaz a policy.
Exemplo: policy `USING (owner_id = auth.uid())` sem `WITH CHECK (owner_id = auth.uid())` → usuário pode "passar a propriedade" para outro UID após o UPDATE ser aceito.

**Impacto:** brecha de segurança ativa em produção. Correção = PR #2481 (aguardando aprovação do Joaquim).

---

## 8. Migrations — regras de apply

**Fonte:** `CLAUDE.md §1`

- Apply em produção: arquivo em `supabase/migrations/` → PR → merge em `main` → deploy → `db-migrate.yml`
- Nunca DDL antes do merge (exceto DDL aditivo + compatível com main atual — ver seção 0 CLAUDE.md)
- Migrations destrutivas (DROP, RENAME, ALTER TYPE, DELETE/UPDATE em massa) exigem aprovação do Joaquim
- `statements` no ledger = SQL completo, nunca resumo em prosa
- Versão nova = `max(version) + 10000`; reservar via `reserve_migration_version()` antes de criar arquivo

---

## 9. Tabelas `copilot_*` — inventário pendente

**Fonte:** falha em `db-inventory-doc.unit.mjs:406`, PR #2494

7 tabelas existem no banco de produção mas **não estão documentadas** em `docs/DB-INVENTORY.md`:
- `copilot_connections`
- `copilot_conversations`
- `copilot_messages`
- `copilot_objection_catalog`
- `copilot_outcomes`
- `copilot_seller_settings`
- `copilot_usage`

CI `Contrato DB offline` falha em qualquer PR que rode o `db-inventory-doc.unit.mjs`. Corrigir = adicionar as 7 ao inventário ou atualizar o step `types-sync.yml` para regenerar automaticamente.

---

## 10. Edge Functions — deploy

**Fonte:** `CLAUDE.md §Retificação de 2026-10-07`

- Deploy automático ao alterar código em `supabase/functions/` ou `supabase/config.toml` (exceto `*.test.ts`, `.md`, `fixtures/`)
- Push em `main` → `deploy-functions.yml` → environment `producao-edge-functions` (sem aprovação humana)
- `workflow_dispatch` para: rollback, função única, dry-run, rotação de secrets

---

## 11. Banco oficial e bancos proibidos

**Fonte:** `CLAUDE.md §1`

| Banco | Uso |
|---|---|
| `tnnnlkbymytvtqngbbqh` | **banco oficial do projeto** — único destino de migrations |
| `uqysyzndkfiwfztbqvsl` | MCP legado — NUNCA escrever |
| `vpkmqeumtxhrwgawxdrl` | read-only legado — NUNCA escrever |
| `pgxfvjmuubtbowutlide` | Gestão de Clientes/CRM — externo, somente leitura |
| `doufsxqlfjyuvxuezpln` | Catálogo de Produtos — externo, somente leitura |

---

## 12. SINGU — somente leitura

Qualquer PR que escreva no sistema SINGU não é mergeada. SINGU é externo e Read-Only para este projeto.

---

## 13. Verificação pós-merge (quando aplicável)

Para PRs com migration ou edge function, confirmar em produção via MCP `SUPABASE - ZAPP WEB V2 - MCP`:
- Migration: `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '<versão>'`
- Edge function: deploy automático confirmado no run de `deploy-functions.yml`
- Logs: zero erros novos nas últimas 1h

**Evidência de verificação pós-merge nesta sessão:**
- PR #2570 (migration `20261102012200` + RPC `create_department_invite`): verificado via `db_query` em `tnnnlkbymytvtqngbbqh` — migration presente, 3 policies em `pg_policy`, função em `pg_proc` ✅ (ver `analise-prs/dossies/PR-2570.md §Verificação pós-merge`)
