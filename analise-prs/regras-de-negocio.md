# Regras de Negócio — Zapp Web V2

> Extraídas de: `CLAUDE.md`, `docs/`, `supabase/migrations/`, `.github/workflows/`, `src/`, auditoria de código
> Cada regra indica a fonte (arquivo:seção ou PR).

**Fontes primárias:**
- `CLAUDE.md` — seção "Perímetro do GitHub" (estado canônico 2026-10-03)
- `CLAUDE.md` — seção "Fluxo Git"
- `CLAUDE.md` — seção "E15(b)" (strict=true policy desde 02/10)
- `CLAUDE.md` — seção "Auditoria de workflows"
- `.github/workflows/ci.yml` — definição dos required checks
- API `GET /repos/adm01-debug/Zapp_Web_V2/branches/main/protection` — verified 2026-10-23

## 1. Banco de dados

- Projeto Supabase oficial: `tnnnlkbymytvtqngbbqh` (Cloud)
- DDL deve sempre seguir: arquivo em `supabase/migrations/` → PR → merge em `main` → deploy → apply
- `supabase_apply_migration` está bugado; usar `db_query` + INSERT no ledger
- Registro de migration: `scripts/db-audit/register-migration.mjs`
- Nunca aplicar DDL em branch paralela (causa drift)
- Migration destrutiva (REVOKE, DROP, rename de contrato) só após deploy do código correspondente

## 2. Evolution GO (WhatsApp)

- Flavor: Evolution GO (`evoapicloud/evolution-go`)
- URL: `https://evolution-go-rxj2.srv1481814.hstgr.cloud`
- Instância: `PRINCIPAL`
- Auth via `EVOLUTION_API_KEY` (global) e `EVOLUTION_INSTANCE_TOKEN` (por instância)
- Secrets só em Edge Functions, nunca no front
- Tradução de rotas em `supabase/functions/_shared/evolution-go-routes.ts`

## 3. Contatos — critério de visibilidade (F5/D4)

- Contato visível = `deleted_at IS NULL` AND `is_lid_legacy = false` AND `phone ~ '^[0-9]{10,15}$'`
- `search_contacts` e `contacts_count_by_type` aceitam `include_legacy boolean DEFAULT false`
- Front envia `include_legacy: true` só quando toggle "Mostrar legados" ativo
- Mudar critério = mudar migration + `CONTACT_VISIBLE_PHONE_PATTERN` + teste de contrato

## 4. Branch protection (perímetro canônico 2026-10-03)

**Fonte:** `CLAUDE.md` seção "Perímetro do GitHub — estado canônico (2026-10-03)" + API verificada em 2026-10-23

- `strict=true` (política vigente desde 01/10 — `CLAUDE.md` E15(b), 02/10/2026)
- `enforce_admins=true`
- 6 required checks DECLARADOS no CLAUDE.md: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`
- **Required checks REAIS (API branch protection, verificado 2026-10-23):** apenas `🏗️ Build` e `🔎 TypeCheck` — os demais rodam mas não bloqueiam merge pela API
- Squash merge apenas (`allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false`) — fonte: `CLAUDE.md` seção "Perímetro do GitHub"
- `delete_branch_on_merge=true`
- `allow_auto_merge=true`
- Sem required reviewers (vários agentes com auto-merge)

## 5. CI/CD

- Deploy front: Vercel automático no merge em `main`
- Deploy edge functions: `deploy-functions.yml` via `workflow_dispatch` — não é automático
- Merge em `main` ≠ deploy de edge function
- `auto-update-pr-branch.yml` atualiza PRs BEHIND com auto-merge quando `main` avança
- 16 workflows + 3 dinâmicos (Dependabot, Dependency Graph, Copilot)

## 6. Módulo Talk X / Campanhas

- Plano vigente: `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` (X001–X200)
- Branch: `<agente>/<tipo>-talkx-x<NNN>-<slug>-<AAMMDD-HHMM>`
- PR: título terminando em `(X<NNN>)`
- Uma etapa = uma PR

## 7. Fluxo Git (sessões paralelas)

- Nunca commitar em `main`/`master` diretamente
- Branch: `claude/<tipo>-<slug>-<AAMMDD-HHMM>`
- Uma tarefa = uma branch = uma PR
- PRs com sobreposição de arquivos: parar e avisar antes de abrir segunda
- Nunca fechar PR de outra sessão sem confirmar que conteúdo chegou em `main`

## 8. Tema / UI

- Token `--inbox-panel-bg` para fundo de painéis do inbox (não `bg-black` fixo)
- Sempre incluir variante `dark:` para mudanças de cor
- Contraste mínimo WCAG AA: 4.5:1

## 9. SalesView/Journey

- IDs internos `orders`/`history` ficam mesmo com renomeação de rótulo
- Renomear ID requer `TAB_REDIRECTS` em `useInboxUIState.ts`
- Sem % de variação em estatísticas sem query real

## 10. Segurança

- `sha_pinning_required=true` para workflows
- Secrets não em repos públicos
- RLS em todas as tabelas com dados de usuário
- `supabase-usage-guard.mjs` deve retornar `novas: 0` antes de mergear

## 11. Escrita no GitHub

**Fonte:** `CLAUDE.md` seção "Repo e escrita" + `/goal` hard rules da sessão

- **SOMENTE** via MCP `GITHUB - MCP - FOREVER` (`github_push_files`)
- MCP padrão do GitHub retorna 403 em write
- **Nesta sessão de análise:** única escrita permitida é `github_merge_pull_request` (regra do goal)
- `github_update_pr_branch` NÃO está autorizado → PRs BEHIND não podem ser atualizadas por esta sessão
