# claude/fix-reconcilia-261026-sem-ci-261102-0912 — INCORPORADA

- ref: `origin/claude/fix-reconcilia-261026-sem-ci-261102-0912` · tip `757b6b362` · merge_base `b4a1d8f6f` (ambos 2026-11-02)
- PRs com o mesmo tip: nenhuma. Pré-classificação mecânica: MISTO_CONFLITO (3 arquivos, 339 linhas).

## Propósito
```
757b6b362 fix(db): TC-009/B.0c — remove AND read_at IS NULL apos backfill com trigger BEFORE UPDATE
33c5f1405 fix(db): adiciona migration 20261026240300, corrige TC-009/B.0c e atualiza replay-known-failures
```
Três coisas: (1) criar a migration reservada `20261026240300_drop_bkp_261023.sql`; (2) registrar as
3 migrations de 26/10 como falhas esperadas do replay local; (3) corrigir a asserção `B.0c` do teste
TC-009, que exigia `read_at IS NULL` depois de o backfill passar a usar trigger BEFORE UPDATE.

**O mesmo trabalho entrou na `main` pela PR #2615** — commit `4908feacd` (2026-11-02,
"fix(db): adiciona migration 20261026240300, 3 entradas no replay e corrige asserção B.0c"),
exatamente os mesmos 3 arquivos. Esta branch é a cópia sem CI do que foi mergeado.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/db-audit/replay-known-failures.json` | As 3 entradas entraram na main por `4908feacd`. Hoje só a de `20261026240300` está lá (main linha 103). As de `20261026220300` e `20261026230300` foram **removidas de propósito** por `a15fdfb81` (2026-11-09) porque `0c191b6b1` (2026-11-09, "IF EXISTS guards em migrations 220300 e 230300 para E2E") tornou as duas idempotentes — não falham mais em banco vazio, então não cabem na lista de falhas esperadas. `_atualizado_em` na main é `2026-11-09` (mais novo que o `2026-11-01` da branch). | `git show 4908feacd -- scripts/db-audit/replay-known-failures.json`; `git log -S'20261026220300_classificar_rls_sem_policy.sql' origin/main -- scripts/db-audit/replay-known-failures.json`; `git show origin/main:supabase/migrations/20261026230300_decidir_schemas_backup.sql` (linha 1 `DROP SCHEMA IF EXISTS ops_backup CASCADE;`, bloco `DO $$ … IF NOT EXISTS … RETURN`) |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | **A versão da branch está corrompida/truncada, não é trabalho.** 5 933 bytes na branch × 28 684 na main × 28 702 no merge_base. Termina no meio de `GRANT USABE ON SCHEMA ` e contém lixo binário dentro do heredoc `pre.sql` (`CREATE CREATE SCHEMA auth;`, `CREATE FU9\x02CTCU…`), além de texto corrompido no cabeçalho (`CODE_DATAPASE_TRUTH`, `TEAM_CID_PRESTATE=1us o bloco B`, `'$jwst'` em vez de `$jwt`) e aponta para `supabase/migrations/20261009241237_…_forced_v2.sql`, **arquivo que não existe em nenhuma das duas árvores** (o teste morreria em `fail "migration nao encontrada"`). A correção real pretendida já está na main: linha 413-414 passou a ser `'B.0c o backfill corrigiu conversation_id do recibo legado status=read'` **sem** `AND read_at IS NULL` (merge_base tinha `'B.0c o backfill preservou read_at NULL …' … AND read_at IS NULL`). | `git cat-file -s` nos 3 blobs; `git show <ref>:…test.sh \| cat -v`; `git show origin/main:…test.sh \| sed -n '413,414p'`; `git ls-tree -r origin/main --name-only \| grep team_receipts_reactions_conversation_id` |
| `supabase/migrations/20261026240300_drop_bkp_261023.sql` | Conteúdo da branch é **byte-a-byte idêntico** a `supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql` na main (`diff` vazio). O arquivo ativo na main virou tombstone de propósito em `0601e3b64` (2026-11-07, PR #2756 "reconcilia DB Live Guard sem repetir DROP destrutivo"): a versão já está no ledger, o SQL destrutivo fica pinado em `_superseded/` e o arquivo ativo é inexecutável para `db push`/replay não repetirem o `DROP SCHEMA … CASCADE`. | `diff <(git show <branch>:supabase/migrations/20261026240300_drop_bkp_261023.sql) <(git show origin/main:supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql)` → idêntico; `git log -S'Tombstone: a versão 20261026240300' origin/main -- …` |

## Produção (leitura, MCP `SUPABASE - ZAPP WEB V2 - MCP`)
- `select version,name from supabase_migrations.schema_migrations where version in ('20261026220300','20261026230300','20261026240300')` → **3 linhas**, as três registradas (`classificar_rls_sem_policy`, `decidir_schemas_backup`, `drop_bkp_261023`).
- `select schema_name from information_schema.schemata where schema_name in ('_bkp_261023','ops_backup')` → **só `_bkp_261023`**. `ops_backup` já foi dropado; `_bkp_261023` **ainda existe**.

Ou seja: a versão `20261026240300` está no ledger, mas o `DROP SCHEMA _bkp_261023 CASCADE` **não foi
executado** — coerente com o aviso "NÃO APLICAR ANTES DE 22/11/2026" do próprio arquivo. Isso não é
lacuna desta branch (ela só criou o arquivo reservado, que entrou na main); é uma pendência
operacional datada, hoje documentada no tombstone + `_superseded/`.

## Lacunas
Nenhuma lacuna com valor. Em detalhe:
1. 2 entradas do `replay-known-failures.json` (220300/230300) — **obsoletas**: entraram e foram
   removidas de propósito depois que as migrations ganharam guards de idempotência. Reintroduzi-las
   deixaria o gate de replay mentindo (falha "esperada" que não ocorre mais). valor: nenhum.
2. `_atualizado_em: 2026-11-01` — a main tem data mais nova (`2026-11-09`). valor: nenhum.
3. `test.sh` — 25 linhas "novas" da branch são corrupção de bytes; as 300 linhas que a branch
   "removeu" e a main ainda tem são o corpo íntegro do teste. Restaurar qualquer coisa daqui
   **quebraria** o teste TC-009. valor: nenhum.
4. `20261026240300_drop_bkp_261023.sql` com `DROP SCHEMA` ativo — idêntico ao arquivo pinado em
   `_superseded/`; restaurar o arquivo ativo reverteria a PR #2756 e faria `db push`/replay tentarem
   repetir um DROP destrutivo. valor: nenhum.

## Veredito
**INCORPORADA** — confiança alta. Todo o trabalho útil da branch entrou na `main` por `4908feacd`
(PR #2615); as diferenças restantes são (a) evolução deliberada da main depois disso
(`0c191b6b1`, `a15fdfb81`, `0601e3b64`) e (b) corrupção de arquivo na branch.

`apagar_branch_seguro`: **true**. Nada a portar.

## Verificação adversarial

Papel: refutar a triagem (veredito alegado INCORPORADA). Resultado: **não refutada — concordo**. Nenhum hunk de valor ≥ médio sobrou fora da main. Git somente leitura.

### 1. O trabalho da branch está mergeado na main
- Branch `b4a1d8f6f..757b6b362` = 2 commits, 3 arquivos (`git diff --stat`): replay-known-failures.json (14±), test.sh (369 linhas, quase tudo deleção), migration 240300 (+31).
- Main tem o mesmo trabalho: `4908feacd` "fix(db): adiciona migration 20261026240300, 3 entradas no replay e corrige asserção B.0c (#2615)" — mesmos 3 arquivos, `git merge-base --is-ancestor 4908feacd origin/main` = **ancestral da main**.

### 2. `supabase/migrations/20261026240300_drop_bkp_261023.sql` — OBSOLETA, restaurar seria regressão
- `diff <(git show 757b6b362:supabase/migrations/20261026240300_drop_bkp_261023.sql) <(git show origin/main:supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql)` → **vazio (byte-a-byte idêntico)**. A triagem citou o caminho sem `.sql`; o pin real é `_superseded/20261026240300_drop_bkp_261023.sql`. Erro de citação, não de conclusão.
- Arquivo ativo na main é tombstone deliberado: `origin/main:supabase/migrations/20261026240300_drop_bkp_261023.sql:1` = "-- Tombstone: a versão 20261026240300 já está registrada no ledger oficial." Introduzido por `0601e3b64` "fix: reconcilia DB Live Guard sem repetir DROP destrutivo (#2756)".
- Portar a versão da branch reativaria `DROP SCHEMA _bkp_261023 CASCADE` no replay/db push. Valor negativo.

### 3. `scripts/db-audit/replay-known-failures.json` — OBSOLETA
- As 2 entradas que faltam na main (`20261026220300_classificar_rls_sem_policy.sql`, `20261026230300_decidir_schemas_backup.sql`) foram **removidas de propósito**: `git show a15fdfb81 -- scripts/db-audit/replay-known-failures.json` mostra `-    "20261026220300_..."` e `-    "20261026230300_..."` no mesmo commit que subiu `_atualizado_em` de 2026-11-02 → 2026-11-09.
- Motivo técnico confere: `0c191b6b1` "fix(migrations): IF EXISTS guards em migrations 220300 e 230300 para E2E"; `origin/main:supabase/migrations/20261026230300_decidir_schemas_backup.sql:1` = `DROP SCHEMA IF EXISTS ops_backup CASCADE;` seguido de `DO $$ ... IF NOT EXISTS (...) THEN RETURN;`. Não falham mais em banco vazio → não cabem na lista de falhas esperadas. Reintroduzir faria o gate mentir.
- A 3ª entrada (240300) **está** na main: `origin/main:scripts/db-audit/replay-known-failures.json:103`.
- `_atualizado_em` da branch = 2026-11-01, da main = 2026-11-09. Branch é mais antiga.

### 4. `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` — corrupção, não trabalho
- Tamanhos (`git cat-file -s`): branch **5.933 bytes / 117 linhas**; main **28.684 bytes / 469 linhas**.
- A branch termina truncada no meio de uma função SQL, com lixo binário e typos: últimas linhas contêm `CREATE FU9\x02CTCU...`, `nullif(current_setting('request.jwt.claim.role', true), ''')` (quote malformado) e `GRANT USABE ON SCHEMA ` sem objeto.
- `grep -n "B.0c"` na versão da branch → **rc=1, nenhuma ocorrência**. A branch perdeu a própria asserção que o commit `757b6b362` dizia corrigir.
- A correção pretendida já está na main: merge-base `b4a1d8f6f:...:413-414` tinha `'B.0c o backfill preservou read_at NULL ...' ... AND read_at IS NULL;`; `origin/main:...:413-414` = `'B.0c o backfill corrigiu conversation_id do recibo legado status=read'` com `AND status='read';` e **sem** `AND read_at IS NULL`. Fix incorporado.
- As ~300 linhas que o diff conta como "removidas pela branch e ainda na main" são o corpo íntegro do TC-009. Portar quebraria o teste.

### Conclusão
INCORPORADA confirmada. Nada a recuperar; as 3 lacunas alegadas pelo `line_check` são (a) tombstone deliberado, (b) remoção deliberada pós-guards, (c) corrupção de bytes. Branch `origin/claude/fix-reconcilia-261026-sem-ci-261102-0912` pode ser apagada com segurança.
