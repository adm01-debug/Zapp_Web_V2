# Relatório de Análise de PRs — adm01-debug/Zapp_Web_V2

**Data:** 2026-10-26  
**Analista:** Claude Code (sessão `session_01EDEgwWPwt8dGYSVZqozESg`)  
**Main SHA auditado:** `2d97c44cfe7f2fa8a3ca572f8f5689118328e858`  
**Total de PRs abertas:** 164  

---

## Conclusão executiva

**Nenhuma PR pode ser mergeada agora.** Há um bloqueio sistêmico no CI da `main`:

> O commit `2d97c44` (2026-10-24 — "fix(ci): ci-gate bloqueia merge quando unit tests falham") faz com que o `✅ CI Gate` bloqueie merge sempre que `Unit Tests` falham. E os unit tests estão falhando em **136 arquivos** naquele commit.

**Evidência direta:** PR #2247 (docs-only, 1 arquivo markdown — o caso mais simples possível):
- `🧪 Unit Tests (1/3)` → `failure`
- `🧪 Unit Tests (2/3)` → `failure`  
- `🧪 Unit Tests (3/3)` → `failure`
- `✅ CI Gate` → `failure`
- `Contrato DB offline` → `failure`
- `mergeable_state` → `"blocked"`

O `Build` aparece como `skipped` porque o CI Gate aborta o workflow antes de chegar nele.

---

## Bloqueio sistêmico: detalhes técnicos

### Causa raiz

`main@2d97c44` tem 136 arquivos de teste falhando. Documentado na própria PR que criou o bloqueio e na PR de correção (#2248).

### PR desbloqueadora: #2248

**"fix(test): destrava o CI Gate da main (136 → 1 arquivo vermelho; falta migration)"**

- Reduz 136 → 1 arquivo vermelho (`rlsSchemaGuard.test.ts`)
- O arquivo restante falha porque o banco local não tem 2 migrations que existem só em produção
- Essas 2 migrations precisam ser aplicadas via `producao-ddl` — gate de aprovação humana

**Caminho de desbloqueio (ordem obrigatória):**
1. Joaquim revisa PR #2248
2. Approve as 2 migrations via environment `producao-ddl` no GitHub Actions
3. CI fica verde
4. `auto-update-pr-branch.yml` atualiza as PRs com auto-merge
5. PRs com auto-merge mergeiam automaticamente quando o CI passa

---

## Resumo por categoria

| Categoria | Quantidade | Observação |
|---|---|---|
| **Draft** (fora do escopo de merge) | 32 | Não analisadas para merge |
| **BLOQUEADO_CI** (base em main@2d97c44) | 24 | Sem conflito, bloqueadas pelo CI |
| **BLOQUEADO_CI_E_BEHIND** (base em SHA anterior) | 107 | Desatualizadas + CI falho |
| **DECISAO_HUMANA** | 1 | PR #2248 — requer aprovação das migrations |
| **Total não-draft** | 132 | Todas bloqueadas |

---

## PRs de maior prioridade (após desbloqueio)

### 1. PR #2248 — DECISAO_HUMANA (desbloqueador)
- Corrige 136 → 1 arquivo vermelho nos unit tests
- É o pré-requisito para todos os outros merges

### 2. PRs que ficam prontas após CI verde (exemplos validados)

| PR | Título | Tipo | Observação |
|---|---|---|---|
| #2247 | cmd /resgate-validacao | docs | 1 arquivo; zero código de prod |
| #2244 | 9 assinaturas RPC em types.ts | typecheck | types.ts apenas; fix puro |
| #2237 | aria-busy Button (C297) | a11y | fix mínimo de acessibilidade |
| #2239 | seletor período em Metas (C130) | front | UI only, sem migration |
| #2240 | filtros TalkX (C011) | front | UI only, sem migration |
| #2234 | chip sequência estado zero (C125) | front | UI only, sem migration |
| #2230 | remove hook morto useTalkXSuppression | chore | limpeza, sem impacto |

### 3. PRs que precisam de análise individual após CI verde

PRs com base em SHA anterior (107 PRs) precisam ser:
1. Atualizadas com main (via `auto-update-pr-branch.yml` ou rebase)
2. Nova rodada de CI
3. Análise individual dos dossies

---

## Inventário completo de PRs não-draft

### PRs com base em main@2d97c44 (bloqueadas só por CI)

| PR | Título | Criado | Veredito |
|---|---|---|---|
| #2273 | fix: retry em HTTP 5xx no fila-merge.mjs | 2026-10-26 | BLOQUEADO_CI |
| #2272 | ⬆️ docker: Bump golang | 2026-10-26 | BLOQUEADO_CI |
| #2271 | ⬆️ deps: Bump deps-semanal (19 updates) | 2026-10-26 | BLOQUEADO_CI |
| #2270 | ⬆️ ci: Bump codeql-action (2 updates) | 2026-10-26 | BLOQUEADO_CI |
| #2248 | fix(test): destrava CI Gate da main | 2026-10-25 | DECISAO_HUMANA |
| #2247 | chore: cmd /resgate-validacao | 2026-10-25 | BLOQUEADO_CI |
| #2246 | fix: retry fila-merge.mjs HTTP 504 | 2026-10-25 | BLOQUEADO_CI |
| #2244 | fix(types): 9 assinaturas RPC ausentes | 2026-10-25 | BLOQUEADO_CI |
| #2240 | feat(talkx): filtros, paginação persistida | 2026-10-24 | BLOQUEADO_CI |
| #2239 | feat(metas): seletor período Hoje/Semana/Mês | 2026-10-24 | BLOQUEADO_CI |
| #2238 | feat(message-delivery): PD-79 + PD-80 | 2026-10-24 | DECISAO_HUMANA |
| #2237 | fix(ui): aria-busy Button | 2026-10-24 | BLOQUEADO_CI |
| #2236 | feat(monitoramento): painel "Entrada muda" | 2026-10-24 | BLOQUEADO_CI |
| #2235 | feat(db): investigação incidentes pausa (C121) | 2026-10-24 | BLOQUEADO_CI |
| #2234 | fix(dashboard): chip sequência estado zero | 2026-10-24 | BLOQUEADO_CI |
| #2233 | fix: 3 falhas Vitest (SL-070, HZ5-09, a11y) | 2026-10-24 | BLOQUEADO_CI |
| #2232 | test(inbox): seletor CSS TtsButton | 2026-10-24 | BLOQUEADO_CI |
| #2231 | feat(notas): editar e fixar notas contato (C126) | 2026-10-24 | BLOQUEADO_CI |
| #2230 | chore: remove hook morto useTalkXSuppression | 2026-10-24 | BLOQUEADO_CI |
| #2223 | feat(tarefas): modal Nova tarefa redesenhado | 2026-10-24 | BLOQUEADO_CI |
| #2218 | fix: corrigir CI — RE_RECON, Playwright, etc | 2026-10-24 | BLOQUEADO_CI |
| #2002 | feat: RADAR CV-041–050 | 2026-10-16 | BLOQUEADO_CI |
| #2000 | feat: RADAR Fase 4 CV-031–040 | 2026-10-16 | BLOQUEADO_CI |
| #1998 | feat: CV-021–030 Motor copilot-live | 2026-10-16 | BLOQUEADO_CI |
| #1997 | feat: CV-010–020 Fase 2 RADAR | 2026-10-16 | BLOQUEADO_CI |

### PRs com base em SHA anterior (bloqueadas por CI + desatualizadas) — amostra

(107 PRs total; dossies individuais em `analise-prs/dossies/PR-<n>.md`)

Os grupos mais relevantes:

| Grupo base | Qtd | Contexto |
|---|---|---|
| `bac62ba9` | 40 | Commits de correções de UI/testes (out/22-23) |
| `e322d379` | 21 | Correções de CI/segurança (out/18) |
| `d7af7a67` | 13 | Plano GA (GitHub Actions 100 etapas) |
| `ee294749` | 8 | Correções de CI/types (out/19) |
| `f66d7331` | 7 | Correções CI + RADAR copiloto |
| Outros | 18 | PRs diversas |

---

## Ação recomendada

**Uma única ação desbloqueia tudo:**

```
PR #2248 → Aprovação das 2 migrations → CI verde → Merge em cascata
```

Após o desbloqueio, retomar esta análise com CI verde para classificar definitivamente cada PR.

---

## Artefatos gerados

| Arquivo | Descrição |
|---|---|
| `analise-prs/prs.json` | Inventário completo (164 PRs) em JSON |
| `analise-prs/prs.csv` | Inventário completo em CSV |
| `analise-prs/regras-de-negocio.md` | Critérios e regras de merge |
| `analise-prs/dossies/PR-<n>.md` | 132 dossies (um por PR não-draft) |
| `analise-prs/RELATORIO_PRS.md` | Este relatório |

---

*Gerado por Claude Code — sessão https://claude.ai/code/session_01EDEgwWPwt8dGYSVZqozESg*
