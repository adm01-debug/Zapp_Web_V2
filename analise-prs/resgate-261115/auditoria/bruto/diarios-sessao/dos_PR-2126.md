# Dossiê PR #2126

**Título:** fix(ci): Fases 4+5+6 do plano GA49-GA74
**Branch:** `claude/fix-ga-fase456-fila-sast-guard-261020-2200`
**Head SHA:** `403cf6b3ad6c6d27ab8bff7b994f95c3e51a35b4`
**Base SHA:** `351ccb2a651f0394b5e78fd660695c09b4f799cf` (BEHIND main@c4c7139e)
**Criado em:** 2026-10-20
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

(Requer resolução do conflito — `mergeable_state: "dirty"` — via `update_pr_branch` antes do merge)

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 224 arquivos (a maioria são `scripts/db-audit/*.test.sh` com adição de cabeçalho `# docs:` — mudança de metadados; mudanças de lógica concentradas em ~15 arquivos de scripts de CI)

### Diff lido — trechos-chave

**`scripts/ci/fila-merge.mjs` (GA49/GA50):**
```diff
+// GA49: COMPLETED com conclusion fora de PASSOU (inclui CANCELLED e
+// ACTION_REQUIRED) e' defeito travado: sem isso a PR ficava "pendente eterna"
+function estadoConclusao(conclusion) {
+  if (PASSOU.has(conclusion)) return 'passou';
+  if (FALHOU.has(conclusion)) return 'falhou';
+  return 'bloqueado';
+}
+export const TETO_TRAVADA_MS = 45 * 60 * 1000;

+// GA50: motivo de estar fora da fila para o resumo
+export function motivoFora(pr) {
+  if (pr.isDraft) return 'draft';
+  if (!pr.autoMergeRequest) return 'sem auto-merge';
+  if (pr.mergeable === 'CONFLICTING') return 'conflito';
+  return null;
+}

-export function classificar(pr, obrigatorios) {
+export function classificar(pr, obrigatorios, agoraMs = Date.now()) {
+  if (motivoFora(pr)) return 'fora';
   const estados = obrigatorios.map((n) => estadoDoCheck(pr.statusCheckRollup, n));
-  if (estados.includes('falhou')) return 'bloqueada';
+  if (estados.includes('falhou') || estados.includes('bloqueado')) return 'bloqueada';
+  // GA49: 45 min sem check em andamento = travada (CI morreu sem conclusion)
+  if (!temCheckEmAndamento(...) && agoraMs - ultimoStartedAt > TETO_TRAVADA_MS) return 'bloqueada';
```

**`scripts/ci/actions-kpi.mjs` (GA54):**
```diff
+// GA54: branch com > 15 runs em 24h provavelmente recebeu > 15 pushes no lote
+export const LIMITE_PUSHES_LOTE = 15;
+export function detectarLote(runs, ...) { ... }
+export function tabelaLote(lotes) { ... lotes.map((l) => `${l.branch}: ${l.pushes} runs — prefira lote`) }
```

**`.github/workflows/talkx-pr-body.yml`** (NOVO — 62 linhas):
```diff
+name: Talk X corpo da PR
+on:
+  pull_request:
+    branches: [main]
+    types: [opened, edited, synchronize, reopened, ready_for_review]
+  workflow_dispatch:
+# GA57: lê titulo/corpo AGORA pela API (gh pr view), nao do evento congelado.
+# Sem `(X<NNN>)` no titulo o verificador nao se aplica.
+- run: node scripts/ci/check-talkx-pr-body.mjs
```

**`scripts/ci/check-test-inventory.mjs` (GA73):**
```diff
-const testShInGuard = new Set(
-  [...dbGuardYaml.matchAll(/\bscripts\/db-audit\/\S+\.test\.sh\b/g)].map(m => m[0])
-);
+// GA73: so bloco `run:` conta (mencao em comentario nao executa nada).
+const testShEmGuard = new Set(refsShEmBlocos(blocosRunDeWorkflow(dbGuardYaml)));
```

**`.github/workflows/types-sync.yml` (GA61):**
```diff
+  # GA61: known-violations.json e artefato gerado (merge do sync nao redispara)
+  - '!scripts/db-audit/known-violations.json'
+# Grupo fixo para push; dispatch/schedule tem run proprio
+  group: types-sync-${{ ... github.event_name == 'push' && 'push' || github.run_id }}
```

**224 arquivos `scripts/db-audit/*.test.sh`:** apenas adição do cabeçalho `# docs:` documentando o que cada teste prova — zero mudança de lógica.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — resolve bug real: CANCELLED e ACTION_REQUIRED deixavam PRs em "pendente eterna" na fila de merge; o teto de 45 min previne travamento por CI morto silencioso |
| 2 | Traz regressão? | **NÃO** — apenas CI scripts, workflows e metadados de teste; zero código de produção alterado |
| 3 | Já está em main? | **NÃO** — `TETO_TRAVADA_MS`, `motivoFora()`, `detectarLote()` e `talkx-pr-body.yml` são adições novas |
| 4 | Regra de negócio correta? | **SIM** — CANCELLED como "bloqueado" é mais seguro que "pendente"; teto de 45 min libera a fila sem espera infinita |

## Nota sobre o tamanho

224 arquivos parecem enormes mas ~210 são `scripts/db-audit/*.test.sh` com adição de bloco `# docs:` de 4 linhas — mudanças de metadados sem impacto em lógica. O diff real de lógica são ~14 arquivos.

## Bloqueio atual

`mergeable_state: "dirty"` — conflito com `main`. Base SHA `351ccb2a` difere do das outras PRs GA (que usam `d7af7a67`) — esta branch foi criada num ponto ligeiramente diferente. Sem auto_merge — requer merge manual.

## Ação necessária

1. Atualizar branch contra `main` (`update_pr_branch`).
2. Aguardar os 6 checks obrigatórios ficarem verdes.
3. Fazer merge manual (squash).
