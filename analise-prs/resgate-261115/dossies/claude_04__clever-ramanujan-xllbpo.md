# Dossiê — claude_04/clever-ramanujan-xllbpo (PR #2277)

- Ref: `origin/claude_04/clever-ramanujan-xllbpo` · tip `63865d2f` · merge-base `005dc587` (2026-10-27) · 25 commits (vários merges de main).
- Pré-classificação mecânica: MISTO_CONFLITO (8 arquivos em conflito, 113 linhas em lacuna). Triagem 2804: JA_NA_MAIN.

## Propósito
GOAL "Backend Supabase 100% operacional" — seção 4: (1) classificar 17 tabelas com RLS ativa e zero policies via `COMMENT ON TABLE` e revogar grants indevidos de `link_preview_cache`; (2) decidir schemas de backup (DROP `ops_backup`, documentar prazo de `_bkp_261023`); (3) reservar migration `20261026240300` para DROP de `_bkp_261023` após 22/11/2026; (4) manutenção de CI: entradas no `replay-known-failures.json`, ajuste da asserção B.0c do teste TC-009, `SKIP_DOCKER_SHIM` em 2 steps do db-guard, timeout do job E2E 20→120 min.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026220300_classificar_rls_sem_policy.sql` | **INCORPORADA (refatorada)**. Main tem as mesmas 17 `COMMENT ON TABLE` + 2 `REVOKE` com 3 comentários embrulhados em `DO $$ IF EXISTS` e sem o cabeçalho de comentários; as 26 linhas "faltantes" são só o cabeçalho `--`. | `git show origin/main:<arquivo>` (REVOKE anon/authenticated presentes; comentário final idêntico). Commit `0c191b6b1 fix(migrations): IF EXISTS guards em migrations 220300 e 230300 para E2E`. Produção: ledger tem `20261026220300 classificar_rls_sem_policy`; `role_table_grants` de `link_preview_cache` para anon/authenticated = 0 linhas; `obj_description(public.link_preview_cache)` = "[RLS-sem-policy: intencional] Cache de previews de links…". |
| `supabase/migrations/20261026230300_decidir_schemas_backup.sql` | **INCORPORADA (refatorada)**. Main: `DROP SCHEMA IF EXISTS ops_backup CASCADE` + mesmos 10 `COMMENT` dentro de `DO $$ IF NOT EXISTS … RETURN`. Linhas faltantes = cabeçalho `--` e forma textual. | Mesmo commit `0c191b6b1`. Produção: ledger tem `20261026230300 decidir_schemas_backup`; `information_schema.schemata` não tem `ops_backup` (dropado) e tem `_bkp_261023`. |
| `supabase/migrations/20261026240300_drop_bkp_261023.sql` | **INCORPORADA (tombstone + _superseded)**. Main substituiu o arquivo ativo por tombstone não executável e preservou o SQL byte-a-byte em `supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql` (blob `f13088288`), de propósito, para `db push`/replay não repetirem o DROP. | Commits `0601e3b64 fix: reconcilia DB Live Guard sem repetir DROP destrutivo (#2756)`, `4908feacd (#2615)`. Ledger de produção tem `20261026240300 drop_bkp_261023`. **Nota operacional**: o schema `_bkp_261023` AINDA existe em produção (consulta em 15/11/2026) — o ledger foi registrado sem executar o DROP; a decisão da branch ("DROP após 22/11/2026") segue pendente como ação destrutiva do dono, não é lacuna de código. |
| `scripts/db-audit/replay-known-failures.json` | **INCORPORADA/OBSOLETA**. Entrada `20261026240300` está na main (linhas 103-105). Entradas `220300`/`230300` ficaram **obsoletas**: main tornou essas migrations idempotentes (`IF EXISTS`), logo não falham mais no replay e não devem constar como "esperadas". Remoção de `20260927570000_talkx_e27…` já está na main (grep sem resultado). `_atualizado_em` na main é `2026-11-09` (mais novo). | `git show origin/main:scripts/db-audit/replay-known-failures.json` + `0c191b6b1`, `4908feacd`. |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | **INCORPORADA**. Main linhas 413-414: `expect_value 'B.0c o backfill corrigiu conversation_id do recibo legado status=read' '1'` com a mesma query (sem `read_at IS NULL`). Faltam só as 4 linhas de comentário explicativo. | `4908feacd fix(db): … corrige asserção B.0c (#2615)`. |
| `.github/workflows/db-guard.yml` | **INCORPORADA (item 72) / OBSOLETA (DASH-091/092)**. Step "item 72" na main já tem `SKIP_DOCKER_SHIM: "1"` (linhas 426-429, com comentário diferente). Step DASH-091/092 **não** tem e não precisa: o docker-shim da main faz snapshot/restore de roles (`scripts/db-audit/docker-shim` L6, L10, L58-73), que era o motivo alegado pela branch; run de db-guard em main 15/11/2026 (`https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43684697261`) → step "Simular fronteira RLS das RPCs do Dashboard (DASH-091/092) => success". | `gh run view 43684697261 --json jobs`. |
| `.github/workflows/ci.yml` | **OBSOLETA**. Timeout E2E na main = 45 min, decidido depois da branch (20→45 `6271b716e #2283`, 45→75 `7ddb2160f #2294`, 75→45 `ab234da8f #2287`, 2026-10-28). 120 min contradiz a decisão vigente. Troca de emoji 📏→📐 no nome do step = ruído. | `git show origin/main:.github/workflows/ci.yml` L443. |
| `supabase/deployment-manifest.json` | **OBSOLETA**. Artefato gerado; main já tem hashes mais novos (`ai-audio-authz.ts` bytes 7464, `manifest_sha256 def318ea…`). | `git show origin/main:supabase/deployment-manifest.json` L18-20, L2814. |

## Veredito
**INCORPORADA** (confiança alta). Todo o trabalho de negócio (3 migrations, entradas de replay, asserção B.0c, SKIP_DOCKER_SHIM onde necessário) está na main, aplicado em produção e registrado no ledger. O restante (timeout 120, emoji, manifest, entradas de replay para migrations já idempotentes) foi superado de propósito pela main.

`apagar_branch_seguro`: **true**.

## Lacunas a recuperar
Nenhuma de código. Pendência operacional (fora do escopo da branch, chame o dono): executar `DROP SCHEMA _bkp_261023 CASCADE` após 22/11/2026, seguindo os pré-requisitos em `supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql` (conferir `count(*)` de `_bkp_261023.contacts` ≥ 3730 vs `public.contacts`). O ledger já contém a versão; não inserir de novo.

## Reexame de commits intermediários

Varredura mecânica apontou 41 linhas significativas que commits intermediários da branch adicionaram e commits posteriores da mesma branch removeram (5 achados, 2 arquivos). Parecer: **REFATORACAO_INTERNA** — nenhuma reversão de trabalho real. `apagar_branch_seguro` segue **true**.

### Achado 1 — `supabase/migrations/20261009193246_team_receipts_reactions_conversation_id_forced.sql` (3 linhas)
- Adicionado por `2e8ca238d fix(db): TC-009 backfill preserva read_at IS NULL desabilitando update guard`: `ALTER TABLE public.team_message_receipts DISABLE TRIGGER team_message_receipts_update_guard_trig;` antes do backfill de recibos + `ENABLE TRIGGER` depois + 3 linhas de comentário.
- Removido por `931bd4c25 fix(ci): reverte migration 20261009193246 para estado original e ajusta TC-009 B.0c` — motivo declarado: o guard "Rejeitar edicao de migration ja existente" (`db-guard.yml`) proíbe editar migration já registrada. A branch trocou de estratégia: afrouxou a asserção B.0c em vez de editar a migration.
- **A intenção sobrevive na main**: `git show origin/main:supabase/migrations/20261009193246_…sql` linha 35 tem exatamente `ALTER TABLE public.team_message_receipts DISABLE TRIGGER team_message_receipts_update_guard_trig;` e o `ENABLE TRIGGER` após o UPDATE, com o comentário reescrito em 2 linhas. Mesmo par também em `20261006222024_team_receipts_reactions_conversation_id_forced.sql`. Blob da main `6f10e546a` ≠ blob do merge-base `3df4c08e6` (a main editou; a branch desistiu). Perda: zero.

### Achados 2 a 5 — `scripts/db-audit/dashboard-rls-authorization.test.sh` (38 linhas, 4 commits)
Cadeia na branch (`git log --full-history 005dc587..ponta -- <arquivo>`):
1. `48d81a71e` — aponta `assert_last_definer 'RPC dashboard_kpi'` para `20261026210000_dashboard_kpi_periodo_aditivo.sql`, adiciona o arquivo à lista de existência e aplica a sobrecarga 4-arg na cadeia.
2. `55c9f541f` — **corrompeu o arquivo** (`667 +-----`, 1 inserção / 666 deleções; blob `c459ff815` = 1 linha binária). Acidente, não decisão.
3. `0baab887f` — restaura o arquivo inteiro e volta a origem para `20261007013217` porque "`20261026210000` existe apenas em main, não nesta branch". Os 17 "linhas" do achado são o reparo da corrupção.
4. `2fefc8eaf` — depois de a main chegar, reaplica a vigência/cadeia para `20261026210000`.
5. `cd8f5605f` — desambigua os overloads com `NULL::uuid` nas 13 chamadas de `dashboard_kpi`.
- Removedor final: `29fe7d43c fix(merge): integra main — atualiza assinatura dashboard_kpi com NULL::timestamptz`, merge de `005dc587` (o próprio merge-base/main) que resolveu pelo lado da main. Blob da ponta `c2d1d83a4` == blob do merge-base: toda edição da branch nesse arquivo foi descartada no merge.
- **A intenção sobrevive na main** (blob `55208e749`, mais novo que os dois): linha 103 `20261026210000_dashboard_kpi_periodo_aditivo.sql` na lista de existência; linha 166 `assert_last_definer 'RPC dashboard_kpi'` → `20261026210000_dashboard_kpi_periodo_aditivo.sql`; linha 455 `psql_file "$migrations_dir/20261026210000_dashboard_kpi_periodo_aditivo.sql" || fail "falha ao aplicar 20261026210000"`; linhas 439-442 documentam a 3-arg de `20261007013217` como definição chamada pelos testes; linhas 582-667 usam assinatura explícita `NULL::timestamptz, NULL::uuid, NULL::uuid` (desambiguação mais forte que o `::uuid` de `cd8f5605f`). Perda: zero.
- Observação (não é lacuna da branch): na main as asserções D6 e D7 (linhas 663 e 665) ainda chamam a forma 3-arg `(timestamptz, NULL::uuid, '$PERFIL_A'::uuid)` enquanto as vizinhas chamam a 4-arg — estado herdado do merge-base, não trabalho da branch.

### Evidências (comandos, somente leitura)
- `git show 2e8ca238d -- supabase/migrations/20261009193246_…sql` · `git show 931bd4c25 -- <mesmo>` · `git show origin/main:<mesmo> | sed -n '31,42p'`
- `git rev-parse origin/main:<arquivo>` vs `git rev-parse 005dc587:<arquivo>` vs `git rev-parse origin/claude_04/clever-ramanujan-xllbpo:<arquivo>`
- `git show 55c9f541f --stat` · `git show 48d81a71e|2fefc8eaf|cd8f5605f -- scripts/db-audit/dashboard-rls-authorization.test.sh`
- `git diff 29fe7d43c^1 29fe7d43c -- scripts/db-audit/dashboard-rls-authorization.test.sh`

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA** · `apagar_branch_seguro` = **true**. Refutação tentada nos 8 arquivos do diff completo; nenhum hunk de valor ≥ médio fora da main.

Escopo conferido de forma independente: `git diff --stat 005dc587 origin/claude_04/clever-ramanujan-xllbpo` = exatamente **8 arquivos / 190 inserções / 15 deleções**. Nada além do que o JSON lista (sem arquivo escondido sem "lacuna").

### Migrations (o trabalho de negócio) — tudo na main
- `20261026220300`: comparei os dois arquivos lado a lado. A main tem **as 17 `COMMENT ON TABLE` e os 2 `REVOKE ALL ON TABLE public.link_preview_cache FROM anon/authenticated`**, com `DO $$ … IF EXISTS` nas 3 tabelas efêmeras (`_rb_message_reactions_contato_20261007001008`, `_zapp_fn_before`, `_zapp_mig133_log`). As 26 linhas "faltantes" são só o cabeçalho `--` de diagnóstico. Zero SQL perdido.
- `20261026230300`: main tem `DROP SCHEMA IF EXISTS ops_backup CASCADE` + os **10 `COMMENT`** (schema + 9 tabelas) dentro de `DO $$ … IF NOT EXISTS … RETURN`. Texto do comentário do schema idêntico (só `—` → `–`). Zero SQL perdido.
- `20261026240300`: `diff` byte-a-byte entre `origin/main:supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql` e o arquivo da branch → **idênticos** (inclusive os pré-requisitos de contagem e o `DROP SCHEMA _bkp_261023 CASCADE`). O ativo na main é tombstone não executável, por decisão (`0601e3b64`, `4908feacd`).

### Produção (db_query, somente leitura, 15/11/2026)
Uma consulta cobriu as 4 provas: ledger tem `20261026220300 classificar_rls_sem_policy`, `20261026230300 decidir_schemas_backup`, `20261026240300 drop_bkp_261023`; `information_schema.schemata` → `ops_backup` **ausente**, `_bkp_261023` **presente**; `role_table_grants` de `public.link_preview_cache` para anon/authenticated → **0 linhas**; `obj_description` = `[RLS-sem-policy: intencional] Cache de previews de links…`. O efeito da branch está aplicado.

### Os 5 arquivos de manutenção — nada recuperável
| Arquivo | Tentativa de refutação | Resultado |
|---|---|---|
| `.github/workflows/db-guard.yml` | O único hunk genuinamente ausente da main é `SKIP_DOCKER_SHIM: "1"` no step **DASH-091/092** (item 72 já tem, main L429). Verifiquei o motivo alegado e o estado real. | **Obsoleto.** `origin/main:scripts/db-audit/docker-shim` L58-73 tira snapshot de `pg_roles` no `run` e dropa os papéis novos no `rm` — exatamente o problema que a branch contornava. Confirmei o run por mim mesmo (`github_list_workflow_run_jobs` run 43684697261, main, `dac285f62`, 15/11/2026): job "Contrato DB offline" `success`, **step 45 "Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)" → `success`** em 30 s, sem shim-skip. Adicionar a variável não corrige nada e reintroduz ~1 container por step. |
| `.github/workflows/ci.yml` | `timeout-minutes: 120` no job e2e. | **Obsoleto e contrário à decisão vigente.** Main L443 = `45`, e a série é posterior à branch: `6271b716e (#2283)` 20→45, `7ddb2160f (#2294)` 45→75, `ab234da8f (#2287)` 75→45 (`git log -S'timeout-minutes: 45'`). O outro hunk é 📏→📐 no nome do step de bundle budget — ruído, e pior: a main já usa 📐 no step vizinho "Report bundle size", então a troca duplicaria o ícone. |
| `scripts/db-audit/replay-known-failures.json` | Entradas `220300` e `230300`. | **Obsoletas por construção.** A main tornou as duas migrations idempotentes (guards acima), logo não falham mais no replay e não podem constar como falha esperada — o próprio `_comment` do arquivo proíbe entrada sem objeto medido. A entrada `240300` **está** na main (L103-105, mesmo `motivo`), a remoção de `20260927570000_talkx_e27…` **está** feita (grep sem resultado) e `_atualizado_em` da main é `2026-11-09` (> `2026-10-27` da branch). |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | Asserção B.0c. | **Incorporada.** Main L413-414 tem a asserção reescrita com **a mesma query** (sem `read_at IS NULL`). Faltam só as 4 linhas de comentário explicando o trigger `team_message_receipts_update_guard_trig` — valor baixo, e o mecanismo está documentado na própria main (`20261009193246` desabilita/reabilita o trigger, conforme reexame de commits). |
| `supabase/deployment-manifest.json` | 3 hashes + `manifest_sha256`. | **Obsoleto.** Artefato gerado; a main tem revisão mais nova de `ai-audio-authz.ts` (bytes 7464 / `f6886b08…` na main vs 7475 / `3171ca7e…` na branch) e `manifest_sha256 def318ea…` ≠ `42fcdc0b…`. Trazer os hashes da branch quebraria o comparador de manifesto. |

### Observação (não é lacuna da branch)
O schema `_bkp_261023` continua em produção com a versão `20261026240300` já no ledger — o registro foi reconciliado sem executar o `DROP`. É pendência operacional destrutiva do dono (após 22/11/2026, seguindo os pré-requisitos do arquivo `_superseded`), não trabalho perdido desta branch. Confere com o que a triagem já registrou.

Evidências (somente leitura): `git diff --stat 005dc587 origin/claude_04/clever-ramanujan-xllbpo` · `git show origin/main:supabase/migrations/20261026{220300,230300,240300}_*.sql` · `diff <(git show origin/main:supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql) <(git show origin/claude_04/clever-ramanujan-xllbpo:supabase/migrations/20261026240300_drop_bkp_261023.sql)` → sem diferença · `git show origin/main:.github/workflows/ci.yml | sed -n '438,446p'` · `git log -S'timeout-minutes: 45' origin/main -- .github/workflows/ci.yml` · `git show origin/main:scripts/db-audit/docker-shim` L58-73 · `github_list_workflow_run_jobs(run_id=43684697261)` step 45 `success` · `db_query` (ledger + schemata + role_table_grants + obj_description).
