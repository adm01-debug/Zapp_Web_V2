# Dossiê PR #2129

**Título:** fix(ci): Fases 7+8 do plano GA75-GA95
**Branch:** `claude/fix-ga-fase78-perimetro-custo-261020-2200`
**Head SHA:** `1b2db4d1b64b221ac7e2b09a445e80150cc43775`
**Base SHA:** `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (BEHIND main@c4c7139e)
**Criado em:** 2026-10-20
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

(Requer resolução do conflito — `mergeable_state: "dirty"` — via `update_pr_branch` antes do merge)

⚠️ **Atenção:** `.github/toolchain.json` documenta `"playwright": "1.63.0"`. A PR #2123 atualizou os pins inline nos workflows para `1.64.1`. Essas PRs precisam ser coordenadas — merge da #2123 primeiro (ou rebase desta) garante consistência.

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 21 (workflows, scripts CI, toolchain, dependabot, infrastructure)

### Diff lido — trechos-chave

**`.github/toolchain.json` — deduplicação + Playwright:**
```diff
-  "actionlint-version": "1.7.7",
-  "actionlint-sha256": "023...",
   "shellcheck-version": "0.10.0",
   "shellcheck-sha256": "6c88...",
   "zizmor": "1.30.1",
-  "zizmor-version": "1.30.1",
-  "zizmor-sha256": "e653..."
+  "playwright": "1.63.0"
```
Remove chaves duplicadas (`*-version` e `*-sha256` redundantes); adiciona `"playwright": "1.63.0"` como fonte única da versão.

**`.github/dependabot.yml` — GA88 (scorecard no grupo):**
```diff
+  # GA88: scorecard-action isolado abria PR propria a cada bump; no grupo
+  # de actions ela anda junto sem quebrar o Scorecard agendado.
+  - "ossf/scorecard-action*"
```

**`ci.yml` — GA87 (build da imagem Go sem push):**
```diff
+  egress-image:
+    name: 🐳 Egress proxy image (build, sem push)
+    timeout-minutes: 10
+    steps:
+      - run: docker build --file infrastructure/preview-egress-proxy/Dockerfile ...
+# Nao e required check: so prova que Dockerfile + go.mod compilam.
```

**`branch-hygiene-audit.yml` — GA93 (KPI job + kpi.json):**
```diff
+  continue-on-error: true  # GA92: KPI estourava limite de 1k req/h
+  KPI_JSON_PATH: ${{ runner.temp }}/kpi.json
+  run: node scripts/ci/actions-kpi.mjs
+
+  publicar-kpi:
+    name: 📊 Publicar kpi.json
+    permissions:
+      contents: write
+      pull-requests: write
+    # Abre PR automation/kpi com docs/ci/kpi.json — merge MANUAL
+    uses: peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1
```

**`scripts/ci/github-settings-guard.mjs` — GA77 (alerts only, sem PATCH automático):**
```diff
-  * confere o perimetro e RESTAURA o que sabe restaurar.
+  * GA77: o guard NAO restaura nada sozinho — PATCH fora de script
+  * versionado e proibido (CLAUDE.md, secao 0). Divergencia vira alerta.
+  * A aplicacao do perimetro vive em scripts/ci/aplicar-perimetro.mjs (GA80).
+// GA77: sem PATCH de restauracao.
```
**Mudança de comportamento importante:** o `settings-guard` parava de auto-patchar o perímetro do GitHub. Agora só alerta. A aplicação do baseline fica em `aplicar-perimetro.mjs` com aprovação explícita.

**`scripts/ci/aplicar-perimetro.mjs`** (NOVO — 155 linhas):
```diff
+// GA80: aplica github-settings-baseline.json no repositório vivo.
+// DRY-RUN POR PADRÃO: só lista PATCHes que faria.
+// Aplicar exige --apply --confirm=APLICAR-PERIMETRO
+// e token com administration:write (nunca o GITHUB_TOKEN de workflow).
+async function planejar(ler = api) {
+  // Lê proteção atual, compara com baseline, planeja PATCHes necessários
```

**`scripts/ci/github-settings-guard.mjs` — GA76 (GraphQL para campos de merge):**
```diff
+// GA76: leitura via GraphQL (repository.autoMergeAllowed e irmaos).
+// REST omite campos de merge para tokens sem permissao push/admin.
+async function ghGraphQL(query, variables) { ... }
```

**`scripts/ci/actions-kpi.mjs`** — versão estendida da PR #2126 (ambas tocam o mesmo arquivo — possível conflito; merge da #2126 primeiro resolve).

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — GA77 é correção de design importante: o guard nunca deveria auto-patchar (foi essa auto-aplicação que causou as 4 regressões de `strict` documentadas no CLAUDE.md) |
| 2 | Traz regressão? | **NÃO** — zero código de produção (src/, supabase/functions/) alterado; `egress-image` não é required check; KPI usa `continue-on-error` |
| 3 | Já está em main? | **NÃO** — `aplicar-perimetro.mjs` é arquivo novo; `settings-guard` sem auto-PATCH é mudança nova; toolchain.json sem duplicatas é adição nova |
| 4 | Regra de negócio correta? | **SIM** — guard que só alerta é mais seguro que guard que aplica silenciosamente; `aplicar-perimetro.mjs` com `--confirm=` obrigatório garante intencionalidade |

## Conflitos potenciais com outras PRs abertas

- **PR #2123:** atualiza Playwright para `1.64.1` nos workflows; esta PR adiciona `"playwright": "1.63.0"` ao toolchain.json. Merge da #2123 primeiro, depois rebase desta.
- **PR #2126:** ambas tocam `scripts/ci/actions-kpi.mjs` — merge da #2126 primeiro.

## Bloqueio atual

`mergeable_state: "dirty"` — conflito com `main`. Sem auto_merge — requer merge manual.

## Ação necessária

1. Merge da PR #2123 primeiro (Playwright), depois PR #2126 (actions-kpi).
2. Atualizar esta branch contra `main` (`update_pr_branch`).
3. Aguardar os 6 checks obrigatórios ficarem verdes.
4. Fazer merge manual (squash).
