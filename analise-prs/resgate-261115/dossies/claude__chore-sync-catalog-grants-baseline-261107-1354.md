# Dossiê — claude__chore-sync-catalog-grants-baseline-261107-1354

- Ref: `origin/claude/chore-sync-catalog-grants-baseline-261107-1354` · tip `e30d4ca0` · merge-base `0601e3b6` (2026-11-07) · sem PR.
- Commit único: `e30d4ca08 chore: sync schema-catalog e grants-baseline com estado do banco (2026-11-07)`.
- `git diff --stat`: só `scripts/db-audit/grants-baseline.json` (+6/−7). Apesar do título, o schema-catalog não foi tocado.

## Propósito
Regenerar o snapshot `grants-baseline.json` (artefato gerado por `scripts/db-audit/grants-baseline.sql`) com o estado do banco em 2026-11-07: `generated_at` 2026-11-04→2026-11-07, `service_role_execute_count` 391→392, `authenticated_execute_count` 222 (igual), `anon_execute` `[]` (igual), lista `anon_table_select` com 99 tabelas (igual). Mudanças restantes são só reordenação de chaves e formatação de `[]`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/db-audit/grants-baseline.json` | OBSOLETA — snapshot de 2026-11-07 superado por snapshot de 2026-11-15 já na main | `git show origin/main:scripts/db-audit/grants-baseline.json`: `generated_at: "2026-11-15"`, `service_role_execute_count: 411`, `authenticated_execute_count: 226`, `anon_table_select: []`, `anon_execute: []`. Último commit na main: `2cf0153ae 2026-11-15 chore(pacote 8)...(#3135)`; regenerações intermediárias em `ff0a5dbca` (#3070), `ff9043905` (#2902), `014270223`. |
| idem — lista `anon_table_select` (99 tabelas) que a branch mantinha | OBSOLETA de propósito | `93bff6705 2026-11-12 fix(security): revoga 99 grants SELECT de anon em todas as tabelas públicas (#2859)` — a main esvaziou a lista; reintroduzir a versão da branch contradiria esse fix de segurança. |
| idem — reordenação de chaves / `[]` compacto | NENHUM valor | `scripts/db-audit/check-grants-fresh.mjs:5-7,71`: compara só conteúdo ACL e ignora `generated_at/note/how_to_regenerate`; ordem de chaves JSON é irrelevante para o guard. A ordem da main é a emitida pelo gerador atual (`grants-baseline.sql`). |

## Veredito
**OBSOLETA** (confiança alta). Artefato gerado, datado; a main já tem versão mais nova regenerada pelo mesmo gerador, refletindo inclusive a revogação dos grants anon (#2859). Nada a portar.

`apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA**. Tentei refutar e não achei um único hunk de valor ≥ médio fora da main.

Checagens feitas (todas de leitura):

1. **Escopo real da branch** — `git diff --name-status 0601e3b6 origin/claude/chore-sync-catalog-grants-baseline-261107-1354` devolve exatamente uma linha: `M scripts/db-audit/grants-baseline.json`. Confirma o dossiê: apesar do título do commit `e30d4ca08` citar schema-catalog, `supabase/schema-catalog.json` não foi tocado na branch. Não há arquivo adicionado nem apagado escondido no commit.

2. **O diff inteiro, hunk por hunk** (único commit, +6/−7). Só três coisas: `generated_at` 2026-11-04→2026-11-07; `service_role_execute_count` 391→392; e reordenação de chaves com `"anon_execute": []` compactado. `authenticated_execute_count` (222) e a lista `anon_table_select` (99 tabelas) ficaram idênticas ao merge-base — a branch não as alterou, só as reposicionou. Nenhum hunk de lógica, SQL, gerador ou guard.

3. **A substituição alegada cobre a necessidade** — `git show origin/main:scripts/db-audit/grants-baseline.json` (11 linhas): `generated_at: "2026-11-15"`, `service_role_execute_count: 411`, `authenticated_execute_count: 226`, `anon_execute: []`, `anon_table_select: []`. Toda métrica que a branch traz é um valor mais antigo da mesma métrica, pelo mesmo gerador (`how_to_regenerate` idêntico nos dois). Não existe campo na branch ausente na main.

4. **A main está certa e a branch errada contra o banco ao vivo** — esta é a prova que fecha o caso. `db_query` (SELECT, produção `tnnnlkbymytvtqngbbqh`) sobre `information_schema.role_table_grants` / `role_routine_grants`, schema `public`: `anon_table_select_count=0`, `anon_execute_count=0`, `authenticated_execute_count=226`, `service_role_execute_count=411` — casa dígito por dígito com a main. Portar a branch introduziria drift deliberado contra o banco em 4 campos e derrubaria o DB Live Guard.

5. **O esvaziamento de `anon_table_select` foi de propósito, não perda** — `93bff6705` (2026-11-12, #2859) `fix(security): revoga 99 grants SELECT de anon em todas as tabelas públicas`; corpo do commit: o `SELECT` de `anon` era residual do `GRANT ON ALL TABLES` original do Supabase e nunca foi usado pela aplicação. Reintroduzir as 99 tabelas da branch reverteria um fix de segurança já aplicado no banco (ponto 4 confirma: 0 grants hoje).

6. **A reordenação de chaves tem valor zero, verificado no código do guard** — `git show origin/main:scripts/db-audit/check-grants-fresh.mjs`: `const METADADOS = new Set(['generated_at', 'note', 'how_to_regenerate'])` + `aclOnly()` descartam os metadados, e `canon()` ordena as chaves com `Object.keys(value).sort(...)` antes de comparar. Ou seja: ordem de chaves e metadados são provadamente ignorados pela única coisa que lê este arquivo. A ordem da main é a que o gerador atual emite (snapshot de 2026-11-15 saiu assim).

7. **Nada pendente** — `prs_with_same_tip: []` no JSON do item; `git log origin/main -- scripts/db-audit/grants-baseline.json` mostra 5 regenerações posteriores à branch (`2cf0153ae` #3135 2026-11-15, `b24e31500` #3123, `ff0a5dbca` #3070, `93bff6705` #2859, `ff9043905` #2902).

Conclusão: artefato gerado e datado, superado por regeneração mais nova que confere com o banco ao vivo. `apagar_branch_seguro = true`. Lacunas adicionais: nenhuma.
