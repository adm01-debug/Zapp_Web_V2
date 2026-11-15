# claude__fix-external-db-bridge-column-injection-261108-2319 (PR #2879)

- ref: `origin/claude/fix-external-db-bridge-column-injection-261108-2319`
- tip: `bc00f402732025318854388bb1a5235e12167ee0` · merge_base: `7e128bc40305aa6917aec53a822fcc9c70098771`
- Veredito: **INCORPORADA** (confiança alta) · `apagar_branch_seguro = true`

## Propósito
Fechar SQL/PostgREST injection na edge `external-db-bridge`: `params.filters[].column`,
`params.filters[].operator` e `params.order.column` eram repassados crus ao
`supabaseAdmin.from(table).filter()/.order()` (cliente service_role, que ignora RLS).
A branch adiciona `validIdentifier()` (regex de identificador) + allowlist `FILTER_OPERATORS`
e devolve 400 quando coluna/operador não passam.

Commits (`git log 7e128bc..bc00f4027`): 3 commits de conteúdo (`3abbd232e`, `f25ba2b6f`,
`1d8dcc3e9`) + 1 reaplicação (`bc00f4027`) + 8 merges de `main` + 3 commits de artefato
(deno.lock / deployment-manifest).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/functions/external-db-bridge/index.ts` | **Já na main, em versão estritamente mais forte.** A main tem `POSTGREST_RESERVED` (bloqueia `select`/`or`/`and`/`not`/`order`/`limit`/`offset`/`on_conflict`/`columns`), `validIdentifier` com limite de 63 chars, `parseFilters()` com `MAX_FILTERS=20`, `MAX_IN_ITEMS=1000`, validação de escalar, tratamento de `in`/`is` com escape de aspas, e validação de `order.ascending`. A versão da branch é a iteração ANTERIOR e mais fraca. | `git show origin/main:supabase/functions/external-db-bridge/index.ts` linhas 22-81 (defs) e 223-244 (uso: `parseFilters` antes de montar a query privilegiada). Trazido por `dac285f62` "fix(edge): endurece o filtro da ponte de banco externo contra nome reservado (#3138)" — `git log -S'export function parseFilters' --oneline origin/main -- supabase/functions/external-db-bridge/index.ts` |
| `supabase/functions/external-db-bridge/filters-validation.test.ts` | **Idêntico byte a byte à main** (145 linhas). O teste da main cita `#2879` no cabeçalho e importa `parseFilters`/`validIdentifier` — ou seja, o trabalho desta branch entrou na main pelo PR #3138. | `git diff origin/main <branch> -- .../filters-validation.test.ts` → vazio |
| `scripts/ci/deno.lock` | **Ruído de formatação, zero conteúdo.** A branch tem o MESMO JSON, só minificado numa linha (0 newlines, 1 linha); a main mantém o lock identado (396 linhas). Comparação por `JSON.stringify` após `JSON.parse`: **igual**. As 323 "linhas removidas ainda na main" são só a identação. | main e merge_base = 396 linhas, idênticos (`git diff 7e128bc origin/main -- scripts/ci/deno.lock` → vazio); branch = 1 linha minificada; teste de igualdade semântica: `JSON igual: true` |
| `supabase/deployment-manifest.json` | **Artefato gerado; a main já tem a versão consistente e mais nova.** A main registra `bytes: 12589` / `sha256: f46caabe8010…` para `external-db-bridge/index.ts`, que casa exatamente com o `sha256sum` do arquivo da main. O manifest da branch, aliás, está INCONSISTENTE com ela mesma: aponta `f46caabe…`/12589 enquanto o `index.ts` da branch tem 10379 bytes e sha `2b0909f0e056…`. | `git show origin/main:.../index.ts \| sha256sum` → `f46caabe…`, `wc -c` → 12589; manifest da main linhas 658-660 e 2018-2021 (`source_sha256: 65431ea1a89c…`); hash do `index.ts` da branch → `2b0909f0e056…` / 10379 bytes |

## Observação relevante
A branch está **atrás** da main (`git diff --stat origin/main <branch>` → 638 arquivos, 45148 deleções
do lado da branch). O último commit da branch (`bc00f4027`) reaplicou a versão fraca de
`validIdentifier` POR CIMA da versão endurecida que já tinha vindo num merge de `main` —
ou seja, mergear esta branch hoje seria uma **regressão de segurança** (perderia
`POSTGREST_RESERVED`, `parseFilters`, limites de `filters`/`in`, escape de aspas no `in`) e
quebraria o próprio teste `filters-validation.test.ts`, que importa `parseFilters`.

## Lacunas a recuperar
Nenhuma. As 335 linhas de "lacuna" contadas pela pré-classificação são:
- 324 linhas de `scripts/ci/deno.lock` = identação (mesmo JSON);
- 2 linhas de `supabase/deployment-manifest.json` = hashes de artefato gerado, já corretos na main;
- 9 linhas de `index.ts` = a versão ANTIGA e mais fraca da validação, substituída de propósito na main por `dac285f62` (#3138).

Nada a portar. Branch pode ser apagada.

## Verificação adversarial

Papel: refutar a triagem (veredito INCORPORADA). Resultado: **triagem confirmada** — nenhum hunk de valor ≥ médio fora da main.

Escopo real do que a branch traz (`git diff --stat 7e128bc4 origin/claude/fix-external-db-bridge-column-injection-261108-2319`): exatamente 4 arquivos — `scripts/ci/deno.lock`, `supabase/deployment-manifest.json`, `supabase/functions/external-db-bridge/filters-validation.test.ts`, `supabase/functions/external-db-bridge/index.ts`. Não há nada além disso para procurar.

1. `supabase/functions/external-db-bridge/index.ts` — as 9 linhas "faltantes" são REGRESSÃO, não lacuna.
   `git diff origin/main <branch> -- supabase/functions/external-db-bridge/index.ts` mostra que mergear a branch REMOVERIA da main: `POSTGREST_RESERVED` (bloqueio de `select`/`or`/`and`/`not`/`order`/`limit`/`offset`/`on_conflict`/`columns`), o limite de 63 chars no regex de `validIdentifier`, `MAX_FILTERS = 20`, `MAX_IN_ITEMS = 1000`, `isScalar`, `inListItem` (escape de `\` e `"` na lista do `in`), `parseFilters` inteira e a validação de `ord.ascending`.
   Conferido abrindo `origin/main:supabase/functions/external-db-bridge/index.ts` linhas 22-81 (definições) e 174-195 (`parseFilters` chamada ANTES de montar a query do cliente service_role; 400 "Invalid filter column or operator" / "Invalid order column").
   A versão da branch é estritamente mais fraca: `validIdentifier` sem limite nem nome reservado, e `if (params?.filters) { for (const f of params.filters as Array<...>) }` — com `filters` objeto/não-array isso lança TypeError → 500, enquanto a main devolve 400.
   Origem da versão forte na main: `git log -S'export function parseFilters' --oneline origin/main -- supabase/functions/external-db-bridge/index.ts` → `dac285f62 fix(edge): endurece o filtro da ponte de banco externo contra nome reservado (#3138)`. Substituição deliberada, não remoção acidental.
   sha256 de `origin/main:.../index.ts` = `f46caabe801093dcf957733fee99b167317a21653aa9a21eadd867319f648746`; da branch = `2b0909f0e0566ce4502823b5c95ea248abae541f4ecbd48359c2eda83e8e97a8`.
   Marcador `SEC-Z018` (único texto exclusivo da branch, `index.ts:22`): `git grep -n SEC-Z018 origin/main` → vazio; é comentário solto, nenhum ledger ou teste da main o referencia. Valor nulo.

2. `supabase/functions/external-db-bridge/filters-validation.test.ts` — `git diff origin/main <branch> -- <arquivo>` → saída vazia (byte a byte igual). Na main tem 145 linhas, cita `#2879` no cabeçalho e importa `{ handleExternalDbBridge, parseFilters, validIdentifier }`. Confirma que o `index.ts` da branch quebraria o próprio teste da branch (não exporta `parseFilters`).

3. `scripts/ci/deno.lock` — igualdade semântica comprovada: `node -e 'JSON.stringify(JSON.parse(main))===JSON.stringify(JSON.parse(branch))'` → `JSON igual: true`. Main = merge-base (`git diff --stat 7e128bc4 origin/main -- scripts/ci/deno.lock` → vazio), 396 linhas identadas; branch = 1 linha minificada. Ruído puro.

4. `supabase/deployment-manifest.json` — artefato gerado. Na main o `external-db-bridge` tem `source_sha256` `65431ea1…b28b`; na branch `295f5aa2…111b`. A branch está 638 arquivos atrás da main, então o manifest dela é de um estado antigo do repo inteiro. Regenerável; zero valor.

Veredito final: **INCORPORADA**. Apagar a branch é seguro — e mergeá-la hoje seria regressão de segurança na edge que roda com service_role (ignora RLS), além de quebrar `filters-validation.test.ts`.
