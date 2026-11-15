# Dossiê — claude__fix-healthcheck-http414-261109-1900 (PR #2907, CLOSED 2026-11-09)

**Propósito da branch** (1 commit `d088b315d`): no `scripts/edge-deploy/health-check.mjs`, tratar HTTP 414
(URI Too Long) como `TransientAnalyticsError` (warning em vez de falha hard) porque a SQL com 85 cláusulas
`OR` no GET da Management API estourava o tamanho da URL.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência |
|---|---|---|---|
| `scripts/edge-deploy/health-check.mjs` | `+ \|\| response.status === 414` ausente na main (main:193 segue `if (response.status >= 500)`) | **OBSOLETA — causa raiz resolvida de outra forma na main** | `77dd76417` (2026-11-09, posterior ao merge-base `fe6c6b0bf`) "reverte queryAnalytics para GET e evita HTTP 414 em escopos grandes": `buildLogsSql(slugs, matchAll)` — `matchAll` quando `scope='all'` gera SQL sem filtro de pathname (main:111-119); >20 slugs usa `startsWith('/functions/v1/')` em vez de enumerar rotas (main:128-130); chamador em main:248-252. Teste em `health-check.unit.mjs:134-141` ("usa prefixo /functions/v1/ para escopos com mais de 20 funções") protege o comportamento. |

Linha de tempo: `3a8161c7e` (POST, 404 na Management API) → `77dd76417` (GET + SQL curta) → `77694900e` (#2917) → `d1fc5ad6a` (#2955). O 414 deixa de ocorrer porque a URL ficou curta; mascarar 414 como transiente (o que a branch fazia) esconderia um erro de cliente determinístico, que não se resolve com retry — abordagem superada.

## Veredito
**OBSOLETA** · confiança alta · `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma. Hunk da branch (para registro):
```
-  if (response.status >= 500) {
+  if (response.status >= 500 || response.status === 414) {
```

## Verificação adversarial

**Concordo com OBSOLETA.** Tentei refutar por três vias; todas fecham a favor da triagem.

1. **O único hunk da branch não está na main — confirmado, mas é inútil.**
   `git diff fe6c6b0bf d088b315d` = 1 arquivo, 1 linha:
   `- if (response.status >= 500) {` → `+ if (response.status >= 500 || response.status === 414) {`.
   `git show origin/main:scripts/edge-deploy/health-check.mjs` linha **194** segue `if (response.status >= 500)`.
   Nenhum `=== 414` em main (`git log -S"=== 414" origin/main -- scripts/edge-deploy/health-check.mjs` → vazio):
   não houve remoção deliberada, o hunk simplesmente nunca entrou.

2. **A substituição alegada cobre a necessidade — verificado no código da main, não só na mensagem do commit.**
   `77dd764175e2b0f8634b9d398eacda5566ba76d0` é ancestral de `origin/main` (`git merge-base --is-ancestor` → ok).
   - `buildLogsSql(slugs, matchAll)` em main:111-134: com `matchAll` o SQL sai **sem cláusula de pathname**
     (main:112-120, ~200 chars); sem `matchAll` e com >20 slugs usa `startsWith(…, '/functions/v1/')` (main:123-125).
   - **Único chamador** é `runHealthCheck` em main:249-252, com `matchAll = (!args.scope || args.scope === 'all')`
     (main:248). E `resolveScope` (main:97-103) devolve **a lista toda exatamente quando `scope` é vazio/`all`**
     (= `matchAll` true) e **um único slug** em qualquer outro caso. Logo o caminho que enumerava 85 predicados
     `OR` na querystring é **inalcançável em produção**: SQL de escopo `all` é curto e SQL de escopo único tem
     1 predicado. O HTTP 414 não pode mais ocorrer — não há cenário residual em que o hunk da branch agiria.
   - Guardado por teste: `health-check.unit.mjs:134-141` (prefixo `/functions/v1/` para >20 funções).

3. **O hunk contraria a decisão vigente da main, então nem como defesa em profundidade vale.**
   `health-check.unit.mjs:230-258` ("queryAnalytics falha fechado em 4xx e contrato; 5xx e transporte são
   transitórios") fixa 401 e 429 como falha **hard** e só 5xx/transporte como `TransientAnalyticsError`.
   Mover 414 (4xx determinístico, que não se resolve com retry) para o ramo transitório transformaria um
   erro de cliente em `::warning::` + `status: 'warning'` (main:258-261) — exatamente o mascaramento que o
   dossiê aponta. Valor do hunk: **negativo**, não "médio não coberto".

**Resultado:** nenhum hunk de valor ≥ médio fora da main. `veredito_final = OBSOLETA`, `apagar_branch_seguro = true`.
Nada verificado no banco (item é só script de CI; nenhuma consulta necessária).
