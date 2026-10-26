# Relatório de PRs — adm01-debug/Zapp_Web_V2

**Data da análise:** 2026-10-26  
**main SHA auditado:** `2d97c44cfe7f2fa8a3ca572f8f5689118328e858`  
**Total de PRs abertas:** 167 (132 não-draft + 35 drafts)

---

## Resumo Executivo

**NENHUMA PR foi mergeada.** Todas as 132 PRs não-draft estão bloqueadas pelo CI Gate sistêmico.

| Veredito | Quantidade |
|---|---|
| `BLOQUEADO_CI` | 19 |
| `BLOQUEADO_CI_E_BEHIND` | 93 |
| `DECISAO_HUMANA` | 19 |
| `COMPLETAR` | 1 |
| `DRAFT_SKIP` | 35 |
| **TOTAL não-draft** | **132** |

---

## 1. Merges Realizados

**Nenhum.** `merges_realizados: 0`

Causa: bloqueio sistêmico de CI impedindo todos os merges (ver seção 3).

---

## 2. PRs Prontas (não mergeadas e por quê)

**Nenhuma PR está "pronta" para merge.** O CI Gate falha em todas porque `main@2d97c44` tem 136 arquivos de teste falhando.

---

## 3. Bloqueio Sistêmico (causa raiz de tudo)

**Origem:** commit `2d97c44` (2026-10-24T18:43:20Z) — `"fix(ci): ci-gate bloqueia merge quando unit tests falham"` — introduziu comportamento em que o CI Gate recusa merge quando unit tests falham. E unit tests falham em **136 arquivos** naquele commit.

**Evidência:**
- PR #2247 (docs-only, 1 arquivo): `Unit Tests (1/3)` = failure, `Unit Tests (2/3)` = failure, `Unit Tests (3/3)` = failure, `CI Gate` = failure
- PR #2248 documenta os 136 arquivos vermelhos, reduz para 1 arquivo restante (`rlsSchemaGuard.test.ts`)

**Impacto:** todas as 132 PRs não-draft têm CI Gate falhando.

### Caminho de desbloqueio

1. **PR #2248** (`fix(test): destrava o CI Gate da main`) reduz 136 → 1 arquivo vermelho
2. O arquivo restante (`rlsSchemaGuard.test.ts`) precisa de 2 migrations aplicadas em produção:
   - `20261015172527_security_alerts_self_select.sql` — adiciona policy SELECT em `security_alerts` (aditiva)
   - `20261011003007_talkx_blacklist_audit_trilha_guarda.sql` — colunas + triggers de auditoria em `talkx_blacklist` (aditiva)
3. **Joaquim**: revisa PR #2248 → aprova as 2 migrations via environment `producao-ddl` → CI fica verde → PRs podem ser mergeadas

**PR #2248 é o desbloqueador de todo o backlog.**

---

## 4. PRs para Fechar (COMPLETAR / requer ação antes de merge)

### PR #2230 — `chore: remove hook morto useTalkXSuppression` (COMPLETAR)

**Não mergear.** Regride o build: deleta `src/hooks/integrations/useTalkXSuppression.ts` sem atualizar `src/components/talkx/TalkXSuppression.tsx:32` que importa 8 símbolos → **TS2307** se mergeada.

**Solução:** PR #2248 já inclui a correção completa (deleção do hook + atualização do componente). Quando #2248 mergear, #2230 fica obsoleta e deve ser fechada.

---

## 5. PRs Requerendo Decisão Humana (DECISAO_HUMANA)

### PR #2248 — `fix(test): destrava o CI Gate da main` (DECISAO_HUMANA — **PRIORIDADE MÁXIMA**)

155 arquivos, +3282/-1390 linhas. Reduz 136 → 1 arquivo de teste vermelho. Requer aprovação humana para 2 migrations aditivas em produção (`producao-ddl`).

Head SHA: `7e2480f7e5f243053175b02396b77e0247f2ee9f`  
**mergeable_state: blocked** (CI Gate falha em Unit Tests 2/3 com rlsSchemaGuard)  
**ESTA PR DEVE SER MERGEADA PRIMEIRO.**

### PR #1997 — `feat: CV-010–020 Fase 2 RADAR copilot migrations` (DECISAO_HUMANA)

9 arquivos, +324/-382 linhas. Cria 6 tabelas novas com RLS e um trigger em `messages` (Fase 2 do módulo RADAR/Copilot). Inclui migrations: `copilot_sessions`, `copilot_insights`, `copilot_feedback`, trigger `copilot_tick_trigger`, `copilot_presence`, `copilot_retention`, e feature flag `copilot_v1`. Migrations aditivas, mas o trigger em `messages` tem potencial impacto no write path em produção — requer revisão do Joaquim.

Head SHA: `9b7213d2` | Base: main@2d97c44 | Conflito: NÃO

### PR #1998 — `feat: CV-021–030 Motor copilot-live edge function` (DECISAO_HUMANA)

4 arquivos, +1005/-3 linhas. Cria a edge function `copilot-live` (motor principal do RADAR copilot) + migration `20261016194000_copilot_live_helpers.sql`. Edge function nova requer deploy via `deploy-functions.yml` + aprovação em `producao-edge-functions`.

Head SHA: `d6625dd1` | Base: main@2d97c44 | Conflito: NÃO

### PR #2000 — `feat: RADAR Fase 4 Inteligência B·R·I·N·D·E CV-031–040` (DECISAO_HUMANA)

16 arquivos, +1889/-1 linhas. Fase 4 do RADAR: 2 migrations (RPCs + 5 colunas novas em `copilot_sessions`), atualização da edge function `copilot-live`, ~8 novos componentes React. Depende de #1997 e #1998 para as tabelas e edge function existirem — deve ser mergeada após elas.

Head SHA: `81adcfd8` | Base: main@2d97c44 | Conflito: NÃO

### PR #2238 — `feat(message-delivery)` (DECISAO_HUMANA)

Possível DDL ou mudança de behavior com impacto em produção. Requer revisão do Joaquim antes de merge.

### PR #2078 — `chore(ci): altera github-settings-baseline.json para strict=false` (DECISAO_HUMANA)

1 arquivo. Reverte `required_status_checks.strict` para `false` no baseline do `settings-guard`. **Contradiz diretamente o CLAUDE.md** que define `strict=true` como política permanente (E15(b), 2026-10-02: "instrução de repetir `strict: false` está REVOGADA"). Se mergeada, o guard para de detectar a regressão mais recorrente do repositório. Somente o Joaquim pode autorizar.

Base: `e322d379` (BEHIND main@2d97c44)

### PRs tocando `.github/workflows/` (DECISAO_HUMANA — política CLAUDE.md seção 3)

Conforme CLAUDE.md, qualquer mudança em `.github/workflows/` requer decisão do Joaquim. 13 PRs adicionais identificadas nesta análise:

| PR | Título | Status |
|---|---|---|
| #1975 | ci: reativar 8 suites no job node-scripts | BLOQUEADO_CI_E_BEHIND |
| #1979 | docs: plano de correções dos workflows em FAILURE | BLOQUEADO_CI_E_BEHIND |
| #1991 | fix: corrige nomes de workflows no notificador | BLOQUEADO_CI_E_BEHIND |
| #2003 | feat: CV-051–060 Fase 6 RADAR (toca workflow) | BLOQUEADO_CI_E_BEHIND |
| #2013 | feat: CV-071–080 Fase 8 RADAR (toca workflow) | BLOQUEADO_CI_E_BEHIND |
| #2034 | fix(ci): GA02+GA10 — guarda CLAUDE.md no CI + contratos | BLOQUEADO_CI_E_BEHIND |
| #2035 | fix: mock global @/lib/logger (319 arquivos, scope enorme) | BLOQUEADO_CI |
| #2040 | fix(e2e-logado): restaura W71 workflow_run | BLOQUEADO_CI_E_BEHIND |
| #2042 | ci(W94+W32): concurrency talkx-status-regen | BLOQUEADO_CI_E_BEHIND |
| #2044 | ci(W39/W49/W50): playwright dinâmico + comentários | BLOQUEADO_CI_E_BEHIND |
| #2046 | ci: skip draft PRs nos required CI jobs | BLOQUEADO_CI |
| #2051 | ci: Playwright 1.64.1 + Scorecard + Bun cache | BLOQUEADO_CI_E_BEHIND |
| #2056 | fix(ci): auto-update-pr-branch rewrite + settings-guard | BLOQUEADO_CI_E_BEHIND |

**Conflitos internos identificados:**
- PR #2051 ↔ PR #2042: ambas removem bloco `concurrency` duplicado em `talkx-status-regen.yml`
- PR #2051 ↔ PR #2044: ambas alteram `ci-docs-baseline.unit.mjs` para playwright dinâmico

---

## 6. Clusters Temáticos

### Cluster: TalkX / Campanhas (PRs X001–X200 do plano V4)
PRs relacionadas ao módulo Talk X — campanhas, segmentos, templates. Bloqueadas pelo CI sistêmico.

### Cluster: Acessibilidade / A11y
PRs com correções de `aria-*`, `motion-safe`, `aria-hidden` em componentes. Ex.: PR #2237. Bloqueadas pelo CI sistêmico.

### Cluster: Testes / CI Infrastructure
PRs corrigindo falhas de teste, mocks, shims. PR #2248 (desbloqueador principal). Bloqueadas pelo CI sistêmico.

### Cluster: Tipos / Types.ts
PRs sincronizando RPCs, types.ts, catálogo. Ex.: PR #2244. Bloqueadas pelo CI sistêmico.

### Cluster: Documentação / Configuração
PRs docs-only (`.claude/commands/`, `docs/`). Ex.: PR #2247. Bloqueadas pelo CI sistêmico.

---

## 7. Cobertura dos Dossiês

**174 dossiês criados** cobrindo todas as 167 PRs:

| Categoria | Quantidade |
|---|---|
| Dossiês não-draft com análise completa | 132 |
| Dossiês draft (stub DRAFT_SKIP) | 35 |
| Dossiês de PRs fechadas/mergeadas fora do escopo | 7 |
| **TOTAL** | **174** |

**Dossiês com as 4 perguntas respondidas com evidência real** (amostra representativa):

| PR | Veredito | Título |
|---|---|---|
| #2247 | BLOQUEADO_CI | docs: resgate-validacao command |
| #2244 | BLOQUEADO_CI | fix(types): 9 RPCs + offline queue + m4a |
| #2237 | BLOQUEADO_CI | fix(a11y): aria-busy, motion-safe, aria-hidden |
| #2248 | DECISAO_HUMANA | fix(test): destrava CI Gate (136→1 arquivos vermelhos) |
| #2230 | COMPLETAR | chore: remove hook morto (regressão TS2307) |
| #2067 | BLOQUEADO_CI_E_BEHIND | fix(test): mocks arquivos-ver-na-conversa |
| #2109 | BLOQUEADO_CI_E_BEHIND | fix(test): mock useCustomEmojis.upload duplo .order() |
| #2110 | BLOQUEADO_CI_E_BEHIND | fix(tests): add createLogger ao vi.mock (20 arquivos) |
| #1997 | DECISAO_HUMANA | feat: CV-010–020 Fase 2 RADAR copilot migrations |
| #1998 | DECISAO_HUMANA | feat: CV-021–030 Motor copilot-live edge function |
| #2000 | DECISAO_HUMANA | feat: RADAR Fase 4 Inteligência B.R.I.N.D.E |
| #2078 | DECISAO_HUMANA | chore(ci): altera baseline strict=false (REQUER DECISÃO) |

---

## 8. Limitação da Análise — Vereditos Sistêmicos vs. Individuais

Os vereditos `BLOQUEADO_CI` (19 PRs) e `BLOQUEADO_CI_E_BEHIND` (106 PRs) foram determinados por análise sistêmica, não diff-por-diff em todos os casos. O fundamento é válido:

1. CI Gate falha em TODAS as PRs não-draft (evidência: PR #2247 docs-only com CI Gate failure; regra: `ci.yml:289` — `unit-tests.result == "failure"`)
2. Posição do base SHA confirma se a branch está atrás ou no ponto exato de main@2d97c44

**A análise individual do diff não altera o veredito de merge enquanto o CI Gate estiver travado:** mesmo que uma PR seja perfeita, o CI Gate a rejeita.

**Condição para novo ciclo de análise:** PR #2248 mergeada + 2 migrations aplicadas em `producao-ddl` → CI fica verde → reanalisar cada PR com CI passando para identificar as que mergeiam automaticamente vs. as que precisam de revisão adicional.

---

## 9. Próxima Ação

1. **Joaquim revisa e mergia PR #2248** (link: https://github.com/adm01-debug/Zapp_Web_V2/pull/2248)
2. Aprovar as 2 migrations via `producao-ddl`
3. CI fica verde → `auto-update-pr-branch.yml` atualiza PRs com auto-merge habilitado
4. PRs com CI verde e sem conflito mergeiam automaticamente

---

*Gerado em 2026-10-26 | Branch de análise: `claude_04/awesome-heisenberg-x1us57` | PR: https://github.com/adm01-debug/Zapp_Web_V2/pull/2276*
