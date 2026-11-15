# Dossiê — claude/fix-reconcilia-migrations-20261026-261101-2230 (PR #2539)

- tip `06ae04404` · merge-base `1252bb5a4` · 1 commit: `fix: reconcilia migrations 20261026 + replay-known-failures + tc-009`
- Propósito: criar o arquivo `supabase/migrations/20261026240300_drop_bkp_261023.sql` (DROP do schema de backup), registrar 3 falhas esperadas no replay local e corrigir a asserção B.0c do teste TC-009. Mudança acidental de emoji no `ci.yml`.
- Equivalente mergeado: PR **#2615** (`4908feacd`, 2026-11-02, "adiciona migration 20261026240300, 3 entradas no replay e corrige asserção B.0c") — mesmos 3 arquivos, mesmo conteúdo.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência |
|---|---|---|---|
| `.github/workflows/ci.yml` | troca emoji `📏`→`📐` no step "Enforce initial bundle budget" | Cosmético/ruído (duplicaria o `📐` do step "Report bundle size"). Não está na main, valor nenhum. | `origin/main:.github/workflows/ci.yml:271` (`📏 Enforce...`), `:277` (`📐 Report bundle size`) |
| `scripts/db-audit/replay-known-failures.json` | entradas `20261026220300_classificar_rls_sem_policy.sql` e `20261026230300_decidir_schemas_backup.sql`; `_atualizado_em: 2026-11-01` | **Incorporada e depois superada**: as 3 entradas entraram via #2615 (`4908feacd`); em 2026-11-09 as duas migrations ganharam guards `IF EXISTS` (`0c191b6b1`) e as entradas foram removidas (`a15fdfb81`) porque passaram a aplicar em banco vazio. A entrada de `20261026240300` continua na main com texto idêntico. `_atualizado_em` na main = `2026-11-09` (mais novo). | `git log -S'20261026220300_classificar_rls_sem_policy.sql' origin/main -- scripts/db-audit/replay-known-failures.json` → `a15fdfb81`, `4908feacd`; `origin/main:supabase/migrations/20261026230300_decidir_schemas_backup.sql` começa com `DROP SCHEMA IF EXISTS ops_backup CASCADE;` + `IF NOT EXISTS (...schemata '_bkp_261023') THEN RETURN`; `20261026220300` envolve `COMMENT ON TABLE public._zapp_fn_before` em `IF EXISTS` |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | B.0c; última linha com `\"` escapado; mode 755→644 | B.0c **idêntica na main** (linhas 413-414, via #2615). Mode já é `100644` na main. A linha final com `\"` dentro de `"$(...)"` é variante equivalente/pior (aspas literais na comparação `[[ ]]`); main manteve a forma original (linha 469). Valor nenhum. | `git grep -n "B.0c" origin/main -- <arquivo>` → `:413`; `git ls-tree origin/main <arquivo>` → `100644` |
| `supabase/migrations/20261026240300_drop_bkp_261023.sql` | arquivo com `DROP SCHEMA _bkp_261023 CASCADE;` (25 linhas ausentes) | **Obsoleta de propósito**: main substituiu o arquivo ativo por tombstone não executável (#2741 `86c9ec831`, #2756 `0601e3b64` "sem repetir DROP destrutivo") e preservou o SQL original byte a byte em `supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql`. Reaplicar o arquivo da branch reintroduziria o DROP que o `db push`/replay não deve repetir. | `git show origin/main:supabase/migrations/20261026240300_drop_bkp_261023.sql` (tombstone); `git ls-tree origin/main supabase/migrations/_superseded/` contém o arquivo; `git log origin/main -- <arquivo>` → `0601e3b64`, `86c9ec831`, `4908feacd` |

## Banco (produção, só leitura, `db_query`)
- `supabase_migrations.schema_migrations`: `20261026220300 classificar_rls_sem_policy`, `20261026230300 decidir_schemas_backup`, `20261026240300 drop_bkp_261023` — todas registradas.
- `information_schema.schemata`: schema **`_bkp_261023` ainda existe** (o `ops_backup` não). Ou seja, a versão 20261026240300 está no ledger mas o DROP não foi executado — coerente com o tombstone da main e com a nota "NÃO APLICAR ANTES DE 22/11/2026". Fora do escopo desta triagem; fica como fato para o dono.

## Veredito
**INCORPORADA** (confiança alta). Todo o trabalho útil está na main via #2615; os únicos deltas restantes são (a) emoji no `ci.yml` (ruído), (b) escape `\"` no teste (ruído), (c) 2 entradas de replay tornadas desnecessárias por guards `IF EXISTS` (superadas), (d) DROP ativo substituído de propósito por tombstone + `_superseded/` (superado). Nada a recuperar.

`apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **CONCORDO** com INCORPORADA. `apagar_branch_seguro = true`. Rodei o diff completo `1252bb5a4..06ae04404` (4 arquivos, nada além do que o JSON lista) e tentei refutar cada item; nenhum hunk de valor ≥ médio ficou fora da main (`origin/main` = `dac285f62`).

| Delta da branch | Teste de refutação | Resultado |
|---|---|---|
| `supabase/migrations/20261026240300_drop_bkp_261023.sql` (novo, 31 linhas, `DROP SCHEMA _bkp_261023 CASCADE`) | comparar blob da branch com o da main | **Prova forte**: o blob do arquivo novo da branch é `f13088288354396b7429133e7722d1b63e8303cf` (diff: `index 000000000..f13088288`) e `git ls-tree -r origin/main supabase/migrations/_superseded/` traz exatamente `100644 blob f13088288354396b7429133e7722d1b63e8303cf supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql`. **Byte a byte idêntico** — zero perda. O arquivo ativo na main é tombstone de 5 linhas de comentário, deliberado ("intencionalmente não executável para impedir que db push ou replay tentem repetir DROP SCHEMA _bkp_261023 CASCADE"). Restaurar a versão da branch seria *regressão*, não resgate. |
| `replay-known-failures.json`: 2 entradas (`20261026220300`, `20261026230300`) | as entradas foram removidas de propósito? o replay fica vermelho sem elas? | Removidas em `a15fdfb81` (09/11 11:58); `0c191b6b1` (09/11 12:55, "IF EXISTS guards em migrations 220300 e 230300 para E2E") tornou as duas aplicáveis em banco vazio — `origin/main:...220300` envolve `COMMENT ON TABLE public._zapp_fn_before` em `IF EXISTS (…)` (linhas 13-15) e `...230300` abre com `DROP SCHEMA IF EXISTS ops_backup CASCADE;` + `IF NOT EXISTS (… '_bkp_261023') THEN RETURN`. E `scripts/db-audit/replay-classify.py:45,53` só marca `INESPERADA` como vermelho; entrada do allowlist que passou vira **aviso `OBSOLETA: … remova a entrada`**. Ou seja: devolver as 2 entradas pioraria a main (2 avisos de allowlist obsoleto), não a corrigiria. Ressalva de método: a mensagem de `a15fdfb81` não menciona a remoção (fala só de "5 novas entradas para 20261107*"), mas o estado atual da main a justifica. |
| `team-receipts-reactions-conversation-id.test.sh` (B.0c, mode, escape) | B.0c melhor na branch? | Não. `origin/main:413` é **literalmente** a versão da branch: `expect_value 'B.0c o backfill corrigiu conversation_id do recibo legado status=read' '1'` sem `AND read_at IS NULL`. `git ls-tree origin/main <arquivo>` → `100644` (mode já convertido). Sobra só a linha 469 com `\"` dentro de `"$(...)"`: dentro da substituição de comando o `\"` vira `"` literal nos dois lados do `[[ … = … ]]`, logo é **equivalente** e mais obscuro. Valor nenhum. |
| `.github/workflows/ci.yml` (📏→📐) | troca tem algum efeito? | `origin/main:271` mantém `📏 Enforce initial bundle budget` e `:277` `📐 Report bundle size`; aplicar a branch deixaria dois steps com `📐`. Cosmético, `run:` inalterado. Valor nenhum. |

Checagem extra: PR #2539 está **closed, não merged** (`closed_at` 2026-11-02T10:44Z, `merged_at: null`, `draft: true`, `mergeable_state: dirty`) — mesmo dia do merge de `4908feacd` (#2615). Apagar a branch não fecha PR aberta nem derruba trabalho em curso.

Nada a recuperar. Mantido o fato colateral do dossiê (ledger tem `20261026240300`, mas o schema `_bkp_261023` ainda existe em produção — DROP programado para após 22/11/2026, coerente com o tombstone); não é lacuna desta branch.
