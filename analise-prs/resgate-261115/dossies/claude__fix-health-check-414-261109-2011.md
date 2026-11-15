# Dossiê — claude__fix-health-check-414-261109-2011

- Ref: `origin/claude/fix-health-check-414-261109-2011` · tip `e808365e3` · merge_base `fe6c6b0bf` (2026-11-09 15:52 -03) · 1 commit, sem PR.
- Pré-classificação mecânica: TRABALHO_AUSENTE_APLICA_LIMPO (1 arquivo, 2 linhas).

## Propósito
Commit `e808365e3 fix(edge-deploy): trata HTTP 414 como TransientAnalyticsError no health-check` (2026-11-09 20:12 UTC).
Diff único em `scripts/edge-deploy/health-check.mjs`:
```diff
-  if (response.status >= 500) {
+  if (response.status >= 500 || response.status === 414) {
     throw new TransientAnalyticsError(`Management API indisponível (HTTP ${response.status})`);
```
Intenção: quando a URL GET da Management API (`/analytics/endpoints/logs?sql=...`) ficava longa demais (85 funções enumeradas no `WHERE`), o 414 derrubava o health-check como erro permanente; a branch o reclassifica como transiente (→ `runHealthCheck` devolve `status: 'warning'`, cf. `origin/main:scripts/edge-deploy/health-check.mjs:258`).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/edge-deploy/health-check.mjs` | Lacuna textual real (main ainda tem `if (response.status >= 500) {` em `origin/main:...:193`), mas a **causa do 414 foi eliminada na main** por outro caminho, 1 min depois da branch | `77dd76417 2026-11-09 20:13:25 -0300 fix(edge-deploy): reverte queryAnalytics para GET e evita HTTP 414 em escopos grandes` (não é ancestral do merge_base — `git merge-base --is-ancestor` falhou). Na main: `buildLogsSql(slugs, matchAll)` — `scope='all'` gera SQL sem filtro de pathname (`health-check.mjs:111-119`); `>20` slugs usa `startsWith(log_attributes['request.pathname'], '/functions/v1/')` em vez de enumerar (`:122-124`); `runHealthCheck` passa `matchAll = !args.scope || args.scope === 'all'` (commit 77dd76417, hunk @@ -227). Antecedente: `3a8161c7e fix(ci): converte health-check para POST evitando HTTP 414 com 85 funções` (revertido pelo 77dd76417 porque a API só aceita GET). |

## Veredito: OBSOLETA (confiança alta)
- A branch é um paliativo (mascarar 414 como "indisponibilidade transitória") para um problema cuja causa raiz — URL com 85 predicados de pathname — a main corrigiu em `77dd76417` na mesma noite, da mesma sessão de trabalho (ambas Claude Sonnet 4.6, 20:12 UTC vs 20:13 -03).
- Portar a linha hoje seria **pior** que não portar: 414 é erro determinístico de construção de query (não transiente); classificá-lo como `TransientAnalyticsError` faria o health-check reportar `warning` e seguir, escondendo uma regressão real em `buildLogsSql`. Com a main atual, 414 cai em `if (!response.ok)` → erro duro, que é o comportamento desejado.
- Nenhum teste da branch; os testes da main (`health-check.unit.mjs`, 10/10 citados no commit 77dd76417) cobrem o caminho GET + matchAll.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial
Parecer: **CONCORDO com OBSOLETA** (tentei refutar; não achei hunk de valor ≥ médio).

Único hunk da branch (confirmado por `git diff fe6c6b0bf origin/claude/fix-health-check-414-261109-2011`): 1 linha em
`scripts/edge-deploy/health-check.mjs` — `if (response.status >= 500)` → `if (response.status >= 500 || response.status === 414)`.
Lacuna textual confirmada: `origin/main:scripts/edge-deploy/health-check.mjs:193` ainda tem a condição antiga.

Por que a lacuna não tem valor (causa do 414 inalcançável na main):
1. `77dd764175e2b0f8634b9d398eacda5566ba76d0` **é ancestral de `origin/main`** e **não é** ancestral do merge-base `fe6c6b0bf`
   (`git merge-base --is-ancestor`), ou seja, a correção de raiz entrou depois que a branch nasceu.
2. `buildLogsSql(slugs, matchAll)` na main: `matchAll` → SQL sem filtro de pathname
   (`origin/main:scripts/edge-deploy/health-check.mjs:111-119`); `>20` slugs → um único
   `startsWith(...,'/functions/v1/')` (`:122-124`). Nenhum caminho enumera 85 pathnames.
3. O único chamador real é o workflow: `--scope "${FN:-all}"` (`origin/main:.github/workflows/deploy-functions.yml:604-608`).
   `parseArgs` exige `validateSlug` para escopo ≠ 'all' (`:78`), então `resolveScope` devolve **1 slug** ou
   **todos com `matchAll=true`** (`:227`, `:250`). Lista com várias funções é inexpressável pela CLI → URL sempre curta.
   A query string é `sql` + 2 timestamps ISO: alguns centenas de bytes no pior caso.
4. Portar seria regressão de semântica: `TransientAnalyticsError` → `status: 'warning'` e deploy segue (`:258-261`).
   414 é erro determinístico de construção de query; na main cai em `if (!response.ok)` → erro duro, que é o correto.

Checagens de refutação que fiz e deram negativo: nenhum outro arquivo na branch; nenhum teste na branch;
nenhum commit da main com "remove/revert/desativa" tirando um tratamento de 414 que a branch tivesse.

`apagar_branch_seguro = true`. Nenhuma lacuna adicional.
