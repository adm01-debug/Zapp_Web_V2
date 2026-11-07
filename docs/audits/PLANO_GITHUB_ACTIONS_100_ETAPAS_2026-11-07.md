# Reauditoria mensal do GitHub Actions — Zapp Web V2 (2026-11-07)

**Data:** 2026-11-07 (13:50 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD auditado:** `0601e3b`
**Baseline anterior:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`
**Método:** API ao vivo (workflows, runs recentes, branch protection, environments, secrets, actions permissions).

---

## Resumo executivo

| Item | Out/01 | Nov/07 | Delta |
|---|---|---|---|
| Workflows estáticos (`.github/workflows/`) | 16 | 24 | +8 |
| Workflows dinâmicos | 3 | 4 | +1 |
| **Total** | **19** | **28** | **+9** |
| Required checks (`main`) | **6** | **3** | ⚠️ **REGRESSÃO** |
| Environments | 7 | 9 | +2 |
| Secrets (repo+environments) | 14 | 18 | +4 |
| `sha_pinning_required` | ✅ true | ✅ true | — |
| `allowed_actions: selected` | ✅ | ✅ | — |
| `delete_branch_on_merge` | ✅ true | ✅ true | — |
| CI ativa com falha na `main` | 0 | 2 | ⚠️ |

**Achado crítico:** branch protection da `main` regrediu de 6 para 3 required checks.
Os checks `🧪 Unit Tests`, `🔒 Security Audit`, `Contrato DB offline` e `🎭 E2E Tests (Playwright)` saíram da lista de required, e um check não-canônico (`✅ CI Gate (required check)`) foi adicionado. Isso significa que merges chegaram a `main` sem passar pelos 4 portões faltantes.

---

## 1. Inventário de workflows

### 1.1 Estáticos — existentes desde o baseline de Out/01

| Workflow | Arquivo | Atualizado | Notas |
|---|---|---|---|
| CI/CD Pipeline | `ci.yml` | 2026-10-24 | required check base |
| DB Guard (offline) | `db-guard.yml` | 2026-11-01 | required check "Contrato DB offline" |
| Deploy Edge Functions | `deploy-functions.yml` | — | manual dispatch |
| types-sync | `types-sync.yml` | 2026-09-24 | — |
| DB Live Guard | `db-live-guard.yml` | — | ⚠️ FAILING hoje |
| DB Migrate (production) | `db-migrate.yml` | — | gate `producao-ddl` |
| CodeQL | `codeql.yml` | — | não é required check |
| Targeted Ledger Evidence | `targeted-ledger-evidence.yml` | — | — |
| CRM Sync Worker | `crm-sync-worker.yml` | — | schedule comentado |
| Branch Hygiene Audit | `branch-hygiene-audit.yml` | 2026-10-16 | — |
| E2E logado | `e2e-logado.yml` | 2026-11-05 | ⚠️ FAILING hoje |
| Auto Update PR Branches | `auto-update-pr-branch.yml` | 2026-11-01 | suporte `strict=true` |
| Settings Guard | `settings-guard.yml` | 2026-10-28 | restaura branch protection 6h |
| Talk X V4 placar regen | `talkx-status-regen.yml` | 2026-10-24 | — |
| E2E Talk X | `e2e-talkx.yml` | 2026-10-21 | — |

**Ausente:** `supabase-sync.yml` — deliberadamente desarmado desde 25/09 (ver CLAUDE.md); ausência esperada.

### 1.2 Estáticos — novos desde Out/01

| Workflow | Arquivo | Adicionado | Propósito |
|---|---|---|---|
| Notifica falha na main | `notifica-falha-main.yml` | 2026-10-15 | alerta automático de CI vermelha |
| Talk X PR body check | `check-talkx-pr-body.yml` | 2026-10-19 | valida corpo de PR do módulo Talk X |
| V043-V065 Vercel Env Cleanup | `vercel-env-cleanup.yml` | 2026-10-19 | limpeza de vars Vercel (auditoria de 18/10) |
| Talk X corpo da PR | `talkx-pr-body.yml` | 2026-10-20 | idem (duplicidade a verificar com `check-talkx-pr-body.yml`) |
| patch-plano | `patch-plano.yml` | 2026-10-28 | — (nome/propósito a documentar) |
| Inventário do estado real (semanal) | `inventario-estado-semanal.yml` | 2026-11-02 | snapshot semanal ao vivo |
| Contexto para agentes de IA (10 min) | `contexto.yml` | 2026-11-03 | injeta contexto para sessões de agente |
| E2E isolado — login e suíte completa | `e2e-logado-isolado.yml` | 2026-11-04 | backend descartável para E2E |
| Front release targets (V2/V3) | `front-release-targets.yml` | 2026-11-06 | — |

### 1.3 Dinâmicos

| Workflow | Existia Out/01 | Nov/07 |
|---|---|---|
| Dependabot Updates | ✅ | ✅ |
| Dependency Graph | ✅ | ✅ |
| Copilot reviewer | ✅ | ✅ |
| Copilot cloud agent | ❌ | ✅ novo (adicionado ~22/10) |

---

## 2. Branch protection — REGRESSÃO CRÍTICA

**Medido ao vivo em 07/11/2026.**

### Estado canônico (CLAUDE.md — tabela "Perímetro do GitHub")

| Required check | Status Nov/07 |
|---|---|
| `🔍 Lint & TypeCheck` | ⚠️ **AUSENTE** na lista required |
| `🧪 Unit Tests` | ⚠️ **AUSENTE** |
| `🏗️ Build` | ✅ presente |
| `🔒 Security Audit` | ⚠️ **AUSENTE** |
| `Contrato DB offline` | ⚠️ **AUSENTE** |
| `🎭 E2E Tests (Playwright)` | ⚠️ **AUSENTE** |

**Check presente mas não-canônico:**
- `✅ CI Gate (required check)` — não constava no baseline; provavelmente adicionado por uma sessão ao refatorar `ci.yml` (atualizado 24/10)
- `🔎 TypeCheck` — variante de nome do `🔍 Lint & TypeCheck`

**Outros campos de branch protection:**
- `enforce_admins`: ✅ true (canônico)
- `strict`: ✅ true (canônico, restaurado por `settings-guard`)
- `required_linear_history`: **true** — novo, não estava no baseline Out/01
- Revisão obrigatória: nenhuma (deliberado)

**Hipótese da regressão:** a atualização de `ci.yml` em 24/10 provavelmente renomeou ou consolidou os jobs, mudando os nomes dos check-runs. O `settings-guard.yml` (atualizado 28/10) pode ter sincronizado com os nomes novos em vez de restaurar os 6 canônicos. Os 4 checks faltantes não aparecem mais nos runs recentes de `ci.yml`.

**Risco concreto:** merges em `main` a partir de ~24/10 até hoje não passaram pelo portão de Unit Tests, Security Audit, Contrato DB offline e E2E — qualquer PR com regressão nesses vetores pode ter entrado sem bloqueio.

---

## 3. Estado da CI em 07/11/2026 (runs recentes na `main`)

| Workflow | Conclusão | Último run | Detalhe |
|---|---|---|---|
| DB Live Guard | ❌ failure | 2026-11-07 | step "Consolidar veredito do contrato vivo" falhou |
| E2E logado | ❌ failure | 2026-11-07 | step "Validar grupo e executar a suíte no backend descartável"; deduped ("mesma causa da última vez") |
| Notifica falha na main | ✅ success | 2026-11-07 | disparado pela falha do E2E (correto) |
| Front release targets (V2/V3) | ✅ success | 2026-11-07 | — |
| Talk X V4 placar regen | ✅ success | 2026-11-07 | — |

**DB Live Guard em falha persistente:** o step de consolidação falha, o que indica divergência entre o ledger e o manifesto/catálogo no banco de produção. Isso é uma falha real do contrato, não ruído de transporte — o guard tem retry de conexão desde PR #707.

**E2E logado em falha repetida:** o dedupe "mesma causa da última vez" indica que a falha existe há pelo menos dois runs consecutivos sem correção. O step falha no backend descartável do `e2e-logado-isolado.yml` (novo desde 04/11), o que sugere problema na separação dos backends E2E.

---

## 4. Environments

| Environment | Out/01 | Nov/07 | Notas |
|---|---|---|---|
| `copilot` | ✅ | ✅ | — |
| `db-ledger-evidence` | ✅ | ✅ | — |
| `legacy-import-destrutivo` | ✅ | ✅ | — |
| `Preview` | ✅ | ✅ | — |
| `producao-ddl` | ✅ | ✅ | gate aprovação humana |
| `producao-edge-functions` | ✅ | ✅ | gate aprovação humana |
| `Production` | ✅ | ✅ | — |
| `banco-leitura` | ❌ | ✅ **novo** | leitura diagnóstica do banco |
| `perimetro-leitura` | ❌ | ✅ **novo** | leitura do perímetro GitHub |

---

## 5. Secrets

**18 secrets** medidos (repo + environments combinados). +4 desde Out/01.
Nomes não são impressos por política. Os 4 novos estão provavelmente relacionados aos novos environments `banco-leitura` e `perimetro-leitura`, e/ou ao workflow `contexto.yml`.

---

## 6. Achados consolidados e prioridade

| ID | Severidade | Achado | Ação necessária |
|---|---|---|---|
| **N01** | 🔴 CRÍTICO | 4 de 6 required checks ausentes da `main` desde ~24/10 | Restaurar os 6 canônicos via `github_update_required_status_checks`; confirmar nomes reais dos check-runs do `ci.yml` atual |
| **N02** | 🔴 CRÍTICO | DB Live Guard falhando — divergência de contrato no banco de produção | Diagnóstico: `db_query` para comparar ledger vs catálogo; corrigir drift |
| **N03** | 🟠 ALTO | E2E logado falhando repetidamente — falha não corrigida | Diagnóstico: verificar `e2e-logado-isolado.yml` (novo 04/11) vs `e2e-logado.yml` |
| **N04** | 🟡 MÉDIO | Dois workflows para "Talk X PR body" (`check-talkx-pr-body.yml` + `talkx-pr-body.yml`) — duplicidade | Verificar se são distintos ou redundantes; eliminar o redundante |
| **N05** | 🟡 MÉDIO | `patch-plano.yml` sem nome/propósito documentado | Verificar conteúdo; documentar ou remover |
| **N06** | 🟡 MÉDIO | `required_linear_history: true` novo — não estava no baseline canônico | Decidir se é política desejada; atualizar `CLAUDE.md` e `github-settings-baseline.json` |
| **N07** | ⚪ INFO | `Copilot cloud agent` adicionado como workflow dinâmico | Registrar no CLAUDE.md como 4º dinâmico |
| **N08** | ⚪ INFO | `settings-guard.yml` atualizado em 28/10 — verificar se o baseline interno foi atualizado com os nomes corretos dos checks | Se foi atualizado com os 3 checks errados, está perpetuando a regressão N01 |

---

## 7. Etapas do baseline Out/01 — situação atual

Revisão seletiva das etapas do `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`:

| Etapa | Título | Status Nov/07 |
|---|---|---|
| E13 | Criar `settings-guard.yml` | ✅ CONCLUÍDO (existia desde PR #1436) |
| E14 | `github-settings-guard.mjs` + testes | ✅ CONCLUÍDO |
| E15 | Política `strict=true` permanente | ✅ VIGENTE (restaurado por settings-guard) |
| E16 | `auto-update-pr-branch.yml` | ✅ ATIVO (reativado em 01/10, atualizado 01/11) |
| E44 | Dedupe `db-live-guard` | ✅ ATIVO |
| E47 | `docker-shim` em `db-guard.yml` | ✅ ATIVO (atualizado 01/11) |
| E51 | Política de issues com >20 comentários de bot | ✅ DOCUMENTADA |
| Fix 1-5 (PR #946) | 5 correções auditoria de 5 agentes | ✅ MERGEADO (27/09) |
| — | Required checks: 6 canônicos | ⚠️ REGREDIDO (achado N01) |
| — | DB Live Guard verde | ⚠️ FALHANDO (achado N02) |
| — | E2E logado verde | ⚠️ FALHANDO (achado N03) |

---

## 8. Próxima auditoria

**Programada:** 2026-12-07 (triggered pelo scheduled task `trig_01U3A3HNTFC4J46jC55CabKC`).
**Ações de alta prioridade antes disso:**
1. Restaurar os 6 required checks (N01) — sem isso, qualquer PR pode mergear com regressão silenciosa
2. Corrigir o DB Live Guard (N02) — a falha indica drift real no banco de produção
3. Corrigir E2E logado (N03) — required check ausente da lista, mas afeta qualidade real

---

*Documento gerado automaticamente por sessão Claude Code em 2026-11-07.*
*Fonte de verdade de configuração: `scripts/ci/github-settings-baseline.json` + `CLAUDE.md`.*
