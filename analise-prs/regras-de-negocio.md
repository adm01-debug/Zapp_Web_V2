# Regras de Negócio — Zapp Web V2
**Gerado em:** 2026-11-02  
**main SHA:** `c4280ef4c` (após merge #2599)  
**Fontes:** CLAUDE.md, .claude/CLAUDE.md, docs/PRONTO_PRODUCAO.md, docs/MIGRATIONS.md, src/integrations/supabase/types.ts, supabase/migrations/20261101213000_rls_update_with_check_explicit.sql, supabase/migrations/20261102012200_department_invites_restringe_escrita.sql, src/hooks/team-chat/README.md

---

## 1. Congelamento de features (`.claude/CLAUDE.md`, 2026-11-01)

**O QUE PODE entrar:**
1. Correção de bug em um dos fluxos críticos de `docs/PRONTO_PRODUCAO.md`.
2. Correção de CI que impede verificar esses fluxos.
3. Correção de segurança (vazamento, RLS aberta, segredo exposto).

**O QUE NÃO ENTRA:**
- Feature nova ou etapa de plano (TalkX V4, Copiloto, War Room, gamificação, metas, IA nova).
- Ajuste visual, contraste, a11y, animação, snapshot, texto — salvo se quebra fluxo crítico.
- Relatório, auditoria, dossiê ou placar em markdown/JSON.
- Workflow, guarda ou script de CI novo.

---

## 2. Fluxos críticos de produção (`docs/PRONTO_PRODUCAO.md`, 2026-11-01)

| # | Fluxo | Estado |
|---|---|---|
| 1 | Login, sessão e papéis (agente/supervisor/admin) | NÃO VERIFICADO |
| 2 | Conectar número WhatsApp (QR / Evolution) | QUEBRADO |
| 3 | Receber mensagem (webhook → banco → inbox) | QUEBRADO |
| 4 | Enviar mensagem (texto e mídia) | QUEBRADO |
| 5 | Inbox: lista, atribuição, transferência, fechamento | NÃO VERIFICADO |
| 6 | Contatos (criar, editar, buscar, mesclar, excluir) | NÃO VERIFICADO |
| 7 | Admin de usuários (criar, editar, desativar, papéis) | NÃO VERIFICADO |
| 8 | Filas e roteamento (Talk-me, SLA) | NÃO VERIFICADO |
| 9 | Saúde da conexão (monitor e alerta de queda) | PARCIAL |

---

## 3. Papéis e permissões

**Fonte:** `src/integrations/supabase/types.ts` → `Constants.public.Enums.app_role`

```
app_role: ["admin", "supervisor", "agent", "special_agent"]
```

**Regra de acesso geral:**
- `admin`: acesso total, cria/apaga convites de departamento, modifica RLS críticas.
- `supervisor`: supervisão de filas, relatórios; não administra usuários.
- `agent` / `special_agent`: acesso restrito a conversas atribuídas.

**Funções de autorização:**
- `is_admin(uuid)` → papel `admin` em `user_roles` (`src/integrations/supabase/types.ts:is_admin_or_supervisor`)
- `is_admin_or_supervisor(uuid)` → papel `admin` ou `supervisor`
- `can_edit_contact(...)` → agente pode editar contato se atribuído à sua fila
- `get_visible_agent_ids(uuid)` → IDs de agentes visíveis para o usuário

---

## 4. Enums do banco

**Fonte:** `src/integrations/supabase/types.ts:Constants.public.Enums`

| Enum | Valores |
|---|---|
| `app_role` | `admin`, `supervisor`, `agent`, `special_agent` |
| `channel_type` | `whatsapp`, `instagram`, `telegram`, `messenger`, `webchat`, `email` |
| `multiplix_dispatch_status` | `draft`, `scheduled`, `sending`, `paused`, `completed`, `completed_with_failures`, `failed`, `cancelled` |
| `multiplix_item_status` | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `failed_transient`, `skipped`, `cancelled`, `outcome_unknown` |
| `multiplix_eligibility` | `eligible`, `no_destination`, `suppressed`, `out_of_scope`, `media_pending`, `connection_unavailable`, `requires_template` |
| `multiplix_recipient_status` | `pending`, `sending`, `sent`, `delivered`, `read`, `failed`, `skipped`, `cancelled`, `outcome_unknown` |
| `talkx_blacklist_reason` | `opt_out`, `invalid_number`, `manual`, `lgpd`, `no_commercial_permission`, `bounce` |
| `ai_provider_type` | `lovable_ai`, `openai_compatible`, `google_gemini`, `custom_webhook`, `custom_agent` |
| `service_account_type` | `google_sheets`, `google_docs`, `google_calendar`, `google_drive`, `dropbox` |
| `multiplix_block_type` | `text`, `voice_ai`, `audio_recorded`, `file` |

---

## 5. RLS — regras vigentes

**Fonte:** `supabase/migrations/20261101213000_rls_update_with_check_explicit.sql`

Migration `20261101213000` adicionou `WITH CHECK` explícito em 8 políticas UPDATE que
estavam sem essa cláusula (CRITICAL-2). As políticas corrigidas são:

| Tabela | Política |
|---|---|
| `contacts` | `Users can update their assigned contacts` — requer `can_edit_contact(...)` |
| `calls` | `Users can update their calls` — requer `agent_id ∈ profiles WHERE user_id = auth.uid()` |
| `message_templates` | `Users can update their own templates` — requer `user_id = auth.uid()` |
| `payment_links` | `Users can update own payment links` — requer `created_by` ou `is_admin_or_supervisor` |
| `sales_deals` | `Users can update assigned deals` — requer `assigned_to` ou `is_admin_or_supervisor` |
| `talkx_campaigns` | `Users can update own campaigns` — requer `created_by = profile` AND `is_admin_or_supervisor` |
| `talkx_recipients` | `Users can update recipients of own campaigns` — requer `campaign_id.created_by = profile` |
| `talkx_templates` | `talkx_templates_update` — requer `created_by = profile` OR `is_admin_or_supervisor` |

**PR #2481 (aberta):** tenta re-aplicar o mesmo `WITH CHECK` nas mesmas políticas com sintaxe diferente. A migration `20261101213000` JÁ resolve o problema. PR #2481 está em conflito por causa dessa migration.

---

## 6. Regras de migration (`docs/MIGRATIONS.md`)

1. **Arquivo + ledger devem ser idênticos:** `supabase/migrations/*.sql` e `supabase_migrations.schema_migrations` precisam do mesmo conjunto de versões (SHA-256 dos prefixos).
2. **`supabase_apply_migration` está bugado** — usar `db_query` via MCP com DDL + INSERT no ledger na mesma transação.
3. **Editar migration existente é proibido** — o `db-guard.yml` rejeita ("Rejeitar edição de migration já existente"). Migration existente que rodou em produção não deve ser alterada; criar nova migration corretiva.
4. **Migrations aditivas apenas:** sem `DROP TABLE`, `RENAME COLUMN`, `ALTER TYPE` destrutivo, `DELETE/UPDATE` em massa.
5. **Ordem obrigatória:** arquivo → PR → merge → deploy do código → apply. Nunca DDL de branch aberta.
6. **Idempotência:** `IF EXISTS`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` com `RETURNING` de conferência.
7. **`CREATE INDEX CONCURRENTLY`** falha no MCP (executa dentro de transação) — usar `CREATE INDEX` simples.

---

## 7. Convites de departamento (`supabase/migrations/20261102012200_department_invites_restringe_escrita.sql`, `src/hooks/team-chat/README.md`)

**Decisão do dono (2026-11-01):** somente `admin` cria e apaga convites de departamento.

- **`department_invites`** — tabela legada; nova política `dept_invites_insert_admin` (WITH CHECK: `is_admin(auth.uid()) AND created_by IN profiles`) e `dept_invites_delete_admin` (USING: `is_admin(auth.uid()`).
- **`department_invitations`** — tabela atual; política análoga.
- **RPC `create_department_invite`** — restrita a admin (SECURITY DEFINER).
- **`gen_random_bytes(16)`** sem prefixo `extensions.` — resolução via `search_path` padrão. PR #2589 tenta editar migration existente para corrigir isso; método correto seria nova migration.

---

## 8. UI — token de cor obrigatório

**Fonte:** `CLAUDE.md` seção 6 ("Painel escuro do inbox")

- **Usar:** `--inbox-panel-bg` (classe `bg-inbox-panel`, definida por tema em `src/styles/tokens.css`)
- **Nunca:** `bg-black` literal — causa texto preto sobre fundo preto no light/alto-contraste (incidente #755 → #774)
- Tokens CSS com `!important` em `src/styles/tokens.css` desde PR #2587 — testes de contraste devem usar regex `.replace(/\s*!important\s*$/, '')` antes de parsear HSL (fix: PR #2593, mergeada).

---

## 9. Testes — regras

**Fonte:** `CLAUDE.md` seção "Zero regressão"

- Nunca apagar, pular ou enfraquecer testes.
- Nunca atualizar snapshots sem justificativa.
- Nunca usar `@ts-ignore`, `|| true`, `continue-on-error` para esconder erros.
- Regressão = novo teste falhando que não estava falhando no main (baseline).
- CI Gate (`✅ CI Gate`) é o aggregador: falha se qualquer job crítico falhar.

---

## 10. Edge functions — regras

- Deploy automático quando push na `main` altera `supabase/functions/` (exceto `*.test.ts`, `.md`, `fixtures/`).
- CORS: origens permitidas em `supabase/functions/_shared/cors-origins.ts`; `FALLBACK_ORIGIN = https://zapp-web-v2.vercel.app`.
- Autenticação: nunca afrouxar verificação de token/JWT em edge functions.
- Secrets: nunca hardcoded — somente variáveis de ambiente do Supabase.
- `handleCors` deve ser chamado em TODOS os handlers (tanto `OPTIONS` quanto o método principal).

---

## 11. Critério de contato visível (decisão D4)

**Fonte:** `CLAUDE.md` seção 6 ("Contatos")

Contato visível = `deleted_at IS NULL` + `is_lid_legacy = false` + `phone ~ '^[0-9]{10,15}$'`.

Funções: `search_contacts(..., include_legacy boolean DEFAULT false)` e `contacts_count_by_type(include_legacy boolean DEFAULT false)`.

---

## 12. Git — Regra 8 (requer aprovação do Joaquim)

PRs que tocam:
- `.github/workflows/` — qualquer arquivo de workflow
- `supabase/migrations/` com DDL em produção
- Secrets, Dockerfile, stack/Swarm, Traefik
- Deleção de dado, mudança de arquitetura ou custo
- Conflito com PR de outro agente

---

## 13. Baseline do main (c4280ef4, 2026-11-02)

| Verificação | Estado |
|---|---|
| Build (`bun run build`) | ✅ exit 0 (20.96s) |
| TypeCheck (`tsc --noEmit`) | ❌ OOM/SIGABRT — falha pré-existente (sem RAM suficiente no container) |
| Lint (`eslint src/`) | ⚠️ 746 problemas (533 erros, 213 warnings) — todos pré-existentes |
| Testes (`vitest run`) | Em execução — veja `analise-prs/baseline/tests.txt` |

**Regressão se mede pela diferença:** uma PR só introduz regressão se adiciona NOVOS erros não presentes neste baseline.
