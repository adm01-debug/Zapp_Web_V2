# Dossiê — claude__chore-reconcile-ledger-drift-261101-2249 (PR #2533)

**Ref:** `origin/claude/chore-reconcile-ledger-drift-261101-2249` · tip `2388e1ac5` · merge-base `1252bb5a4` (2026-11-01)
**Veredito:** INCORPORADA (com pedaço OBSOLETO/ruído) · **apagar branch: SEGURO**

## Propósito
Reconciliar drift do ledger: criar o arquivo `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql` (migration aplicada em produção sem arquivo no repo) e registrar em `scripts/db-audit/replay-known-failures.json` a falha esperada da `20261031100000` (CREATE POLICY duplicado no replay fresco). Commits: `2f401936f`, `79937c668`, `2388e1ac5`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql` (novo na branch, 116 linhas) | **JÁ NA MAIN** com outro texto: main tem o mesmo arquivo em formato compacto (30 linhas), mesmas 7 tabelas (`copilot_outcomes`, `copilot_objection_catalog`, `copilot_usage`, `copilot_seller_settings`, `copilot_help_requests`, `copilot_learning_moments`, `copilot_conversation_scores`), mesmas colunas/CHECKs e as mesmas 16 policies. Única diferença: a branch antepõe `DROP POLICY IF EXISTS` a cada `CREATE POLICY`. Isso é inócuo: a migration já consta no ledger de produção (nunca mais roda lá) e, no replay local, ela é a primeira a rodar, então os DROPs não evitam a falha da `20261031100000` (que é a que colide). | `git show origin/main:supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql`; entrou em `587ec25f8` (#2551, 2026-11-02). Produção (db_query, só leitura): `schema_migrations` tem `20261030145126` e `20261031100000`; `pg_tables` lista as 7 tabelas; `pg_policies` lista as 16 policies `copilot_*_insert/select/update`. |
| `scripts/db-audit/replay-known-failures.json` — hunk nova entrada `20261031100000_copilot_fases13_15_tabelas.sql` | **JÁ NA MAIN** com texto diferente (categoria `nao-idempotente-inerte`, motivo reescrito e medido em 02/11/2026). | `git show origin/main:scripts/db-audit/replay-known-failures.json` linhas 107-110; commit `587ec25f8`. |
| `scripts/db-audit/replay-known-failures.json` — hunk `_atualizado_em` 2026-10-30 → 2026-11-01 | **OBSOLETO**: main já está em `2026-11-09` (linha 5, commit `a15fdfb81`). | idem |
| `scripts/db-audit/replay-known-failures.json` — hunks em 4 motivos existentes ("CREATE POLCIY IE NOT EXISTS", "DROP FU8CHION", "Mesta funcao", "CREATE TABLE IE NOT EXISTS") | **RUÍDO/REGRESSÃO**: a branch *introduz* erros de digitação em texto que na main está correto ("CREATE POLICY IF NOT EXISTS", "DROP FUNCTION", "Mesma funcao", "CREATE TABLE IF NOT EXISTS" — linhas 21, 33, 37, 93 da main). Não portar. | `git diff 1252bb5a4 origin/claude/chore-reconcile-ledger-drift-261101-2249 -- scripts/db-audit/replay-known-failures.json` |

## Contexto da PR #2533
Fechada em 2026-11-11 sem merge: "migration já está no main (587ec25f8c) … diff corrompia textos do JSON". Hipótese confirmada acima pelo código.

## Lacunas a recuperar
Nenhuma. O único conteúdo não presente byte a byte na main (`DROP POLICY IF EXISTS` na 20261030145126) não altera comportamento em produção nem no replay (a colisão fica na 20261031100000, imutável por `db-guard`). Valor: nenhum.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. Apagar a branch é seguro.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Escopo real do diff (conferido, não só o JSON do item): `git diff --stat 1252bb5a4 origin/claude/chore-reconcile-ledger-drift-261101-2249` = exatamente 2 arquivos, 3 commits (`2f401936f`, `79937c668`, `2388e1ac5`). Nada escondido.

1. `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql` — main tem o arquivo (30 linhas, compacto). Comparei objeto por objeto: as mesmas 7 tabelas (`copilot_outcomes`, `copilot_objection_catalog`, `copilot_usage`, `copilot_seller_settings`, `copilot_help_requests`, `copilot_learning_moments`, `copilot_conversation_scores`), colunas, defaults e CHECKs idênticos (`outcome IN ('closed','lost')`, `score BETWEEN 1 AND 5`, tags de learning_moments), `ENABLE ROW LEVEL SECURITY` nas 7, e as mesmas 16 policies com os mesmos `USING`/`WITH CHECK`. Delta exclusivo da branch: **só** os 16 `DROP POLICY IF EXISTS`.
2. Valor desses 16 DROPs = zero, por dois motivos independentes:
   - `scripts/db-audit/replay-local.sh:166-167` roda cada migration **uma única vez**, em ordem de nome (`ls … | sort`). A `20261030145126` é a primeira a criar as policies; em banco vazio não há nada para dropar. Quem colide é a `20261031100000`, logo depois — e os DROPs na 145126 não a salvam.
   - Portar os DROPs para a main seria **proibido pelo CI**: `.github/workflows/db-guard.yml:105-169` bloqueia PR que altera o conteúdo de migration já existente ("nunca edite o arquivo original"). A 145126 já está na main desde `587ec25f8`.
3. `scripts/db-audit/replay-known-failures.json` — a entrada da `20261031100000` está na main (linhas 107-110, categoria `nao-idempotente-inerte`, medida em 02/11/2026) e descreve a mesma causa com texto melhor. `_atualizado_em` na main é `2026-11-09` (linha 5), à frente do `2026-11-01` da branch.
4. Confirmei a regressão apontada pela triagem: a branch **introduz** 4 erros de digitação em motivos corretos na main (`CREATE POLCIY IE NOT EXISTS`, `DROP FU8CHION`, `Mesta funcao`, `CREATE TABLE IE NOT EXISTS`). Mergear seria perda, não ganho.
5. Produção (`db_query`, só leitura, 15/11/2026): `schema_migrations` contém as duas versões (`ledger_hits=2`), `pg_tables` lista as 7 tabelas, `pg_policies` tem 22 policies `copilot*` (as 16 desta migration + 6 de outras tabelas copilot). O efeito pretendido está aplicado.

Lacunas adicionais: nenhuma.
