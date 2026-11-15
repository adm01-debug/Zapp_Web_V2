# Dossiê — claude__fix-db-live-guard-dup-261109-1800 (PR #2904, CLOSED sem merge em 2026-11-09 17:43Z)

## Propósito
1 commit (`ff8bafdfc`), 0 linhas de SQL alteradas: **renomeia** (similarity 100%) dois arquivos de
`supabase/migrations/` para `supabase/migrations/_superseded/` para calar falso drift no db-live-guard.
No merge_base `014270223` existiam só os arquivos sufixados `..._constraint.sql` / `..._column.sql`,
enquanto o ledger de produção registra os nomes-base sem sufixo.

## Arquivo × achado × evidência
| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/_superseded/20261107121000_message_reactions_one_per_agent_constraint.sql` | OBSOLETA — a main resolveu o mesmo drift renomeando o arquivo para o nome do ledger, em vez de arquivar | `fe6c6b0bf fix(db-audit): ... renomeia 2 arquivos` (2026-11-09 15:52, ancestral de `origin/main`) renomeia `..._constraint.sql` → `supabase/migrations/20261107121000_message_reactions_one_per_agent.sql`. Blob idêntico: `git diff --quiet origin/main:supabase/migrations/20261107121000_message_reactions_one_per_agent.sql <branch>:_superseded/..._constraint.sql` → sem diferença (blob `34bb9d33a`). Ledger prod: `select version,name from supabase_migrations.schema_migrations` → `20261107121000 / message_reactions_one_per_agent`. Evidence registrado em `scripts/db-audit/migration-evidence.json:1255-1264` (`ledger-divergence/pinned-replay`). |
| `supabase/migrations/_superseded/20261107122000_contacts_phone_search_digits_column.sql` | OBSOLETA — idem | Mesmo commit `fe6c6b0bf` renomeia `..._column.sql` → `supabase/migrations/20261107122000_contacts_phone_search_digits.sql`. Blob idêntico (`39a90a37d`). Ledger prod: `20261107122000 / contacts_phone_search_digits`. Evidence em `migration-evidence.json:1268-1277`. |

## Por que a abordagem da branch é inferior (não só diferente)
- Mover para `_superseded/` deixaria as versões `20261107121000`/`20261107122000` **sem arquivo ativo** em
  `supabase/migrations/`, apesar de constarem aplicadas no ledger — contrário à convenção de
  `_superseded/README.md` (lá vai o que **não** rodou no destino e foi substituído por outra migration).
- A main manteve o SQL ativo com o nome exato do ledger e registrou a divergência de conteúdo no evidence
  (`check-migration-drift.mjs:257` trata `archive_path` só para tombstones reais).
- Aplicar a branch hoje criaria cópias duplicadas em `_superseded/` do mesmo SQL que já está ativo (ruído).

## Veredito
**OBSOLETA** (confiança alta). Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** (confiança alta). `apagar_branch_seguro = true`. Nenhuma lacuna.

Tentativas de refutação e o que elas mostraram:

1. **"Há hunk útil fora da main?"** Não há hunk de conteúdo nenhum. `git diff -M --name-status 014270223
   origin/claude/fix-db-live-guard-dup-261109-1800` → apenas `R100` + `R100`; `--stat` → `2 files changed,
   0 insertions(+), 0 deletions(-)`. As 34 linhas de `line_check.missing_sample` no JSON do item são
   artefato do comparador por caminho: o conteúdo está na main, só com outro nome de arquivo.
   Prova por blob: `git rev-parse` dá o **mesmo** SHA nos dois lados —
   `34bb9d33a58b62feddb7234718e8beca49b24c6c` (`origin/main:supabase/migrations/20261107121000_message_reactions_one_per_agent.sql`
   = branch `_superseded/..._constraint.sql`) e `39a90a37d6a075802dee14cb102dc0b8cbc586ec`
   (`origin/main:supabase/migrations/20261107122000_contacts_phone_search_digits.sql` = branch
   `_superseded/..._column.sql`). `git diff` entre os pares: saída vazia.
   Grep direto das strings do `missing_sample` na main:
   `origin/main:supabase/migrations/20261107121000_message_reactions_one_per_agent.sql:3,6,9,11,33` e
   `origin/main:supabase/migrations/20261107122000_contacts_phone_search_digits.sql:7`.

2. **"A substituição alegada cobre a necessidade?"** Sim. `fe6c6b0bf83dbeeec257016e85013314d7d9ff93`
   (09/11/2026 15:52, `git merge-base --is-ancestor fe6c6b0bf origin/main` → verdadeiro) faz os mesmos dois
   `R100` para os nomes do ledger **e** registra a divergência de conteúdo em
   `scripts/db-audit/migration-evidence.json:1255-1265` e `:1268-1278` como
   `ledger-divergence/pinned-replay`, com `justification` citando explicitamente o rename ("Arquivo renomeado
   de _constraint/_column para corresponder ao nome aplicado em producao"). É esse registro que cala o drift
   no guard, não o diretório.

3. **"A premissa da branch se sustenta?"** Não. A mensagem de `ff8bafdfc` afirma que cada versão "tinha dois
   arquivos .sql (nome base + sufixo)". No merge-base `014270223` havia **um** arquivo por versão:
   `git ls-tree -r --name-only 014270223 -- supabase/migrations | grep 2026110712` lista só
   `..._one_per_agent_constraint.sql` e `..._phone_search_digits_column.sql`. O mismatch 2:1 descrito no
   commit não existia nessa árvore.

4. **"Aplicar a branch hoje seria inócuo?"** Não, seria regressão: as versões `20261107121000` e
   `20261107122000` estão aplicadas em produção — ledger ao vivo (`db_query` em
   `supabase_migrations.schema_migrations`): `20261107121000 / message_reactions_one_per_agent` e
   `20261107122000 / contacts_phone_search_digits` —, e `_superseded/` é, por
   `supabase/migrations/_superseded/README.md`, para DDL que **não** rodou no destino. Mover deixaria
   registro no banco sem arquivo ativo no repo. O próprio evidence da main rejeita essa manobra em outro caso:
   `migration-evidence.json:783` — "mover para _superseded criaria 'registro no banco sem arquivo no repo'".
