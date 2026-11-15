# Dossiê — fix/sincronizar-migrations-sql-divergente-261101-0400

- Ref: `origin/fix/sincronizar-migrations-sql-divergente-261101-0400` · tip `2e2f97fb9` · merge_base `1252bb5a4` · 2 commits (01/11/2026) · sem PR.
- Propósito: reduzir 5 falhas "SQL divergente" do `db-live-guard`: (a) editar a migration `20261031100000_copilot_fases13_15_tabelas.sql` adicionando 16 `DROP POLICY IF EXISTS` para o arquivo bater byte a byte com o ledger de produção; (b) registrar 4 exceções `pinned-replay` em `scripts/db-audit/migration-evidence.json` (20261016180000, 20261016190000, 20261016220000, 20261031130000); (c) documentar em `PENDENCIAS.md` §4 (remote_only) e §5 (congelamento PR #2545).

## Veredito: OBSOLETA (abordagem superada; necessidade coberta na main)

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql` (+16 `DROP POLICY IF EXISTS`) | OBSOLETA — main escolheu outra estratégia: manter o arquivo imutável e **fixar por hash** no evidence como `ledger-divergence/pinned-replay` (`reason: safer-replay`), além de registrar a falha de replay em `replay-known-failures.json`. Aplicar o patch da branch quebraria o pin (`file_sha256` da main = `753f2272…`, igual ao arquivo atual; branch geraria `3476b171…`). | `origin/main:scripts/db-audit/migration-evidence.json:1217-1228` (`"version": "20261031100000"`, `file_sha256: 753f2272f159…`, "Migration imutavel; arquivo fixado por hash proprio"); `origin/main:scripts/db-audit/replay-known-failures.json:107-110` (`nao-idempotente-inerte`); `sha256sum` do arquivo em main = `753f2272f1593da181e64c11046a58243145524f7afcf346445f6a3811770309`; commit `b1040225d` (#2579) adicionou a entrada. Produção: ledger `20261031100000` tem 46 statements, 16 com `DROP POLICY IF EXISTS` (db_query) — a branch estava factualmente correta, mas a main cobriu a divergência pelo pin. |
| `scripts/db-audit/migration-evidence.json` (4 entradas novas) | INCORPORADA — as 4 versões já constam na main com os **mesmos** `file_sha256`, `file_sql_sha256`, `ledger_statements_sha256`, `ledger_sql_sha256` e `kind: ledger-divergence/pinned-replay`; só `reason`/`justification` divergem (main: `safer-replay` em 20261016190000 e 20261031130000, texto genérico "Hashes medidos em 02/11/2026"). Ordem de chaves difere (por isso o CONFLICT mecânico). | `origin/main:scripts/db-audit/migration-evidence.json:1117` (20261016180000), `:1130` (20261016190000), `:1143` (20261016220000), `:1230` (20261031130000); commit `b1040225d` (#2579). |
| `PENDENCIAS.md` (§4 remote_only + §5 congelamento) | INCORPORADA via arquivo histórico — `PENDENCIAS.md` da main foi reescrito (itens novos de 11–15/11); o conteúdo antigo foi movido para `docs/_arquivo/PENDENCIAS.md`, que contém §5 na íntegra (inclusive a menção a esta branch) e §4 marcado "✅ RESOLVIDO (PR #2551)" — as 3 versões remote_only ganharam arquivo (`20261030145126`, `20261031170000`, `20261101213000`). | `origin/main:docs/_arquivo/PENDENCIAS.md:219-262`; commit `c570d5d46` (#2630) arquivou; `git log origin/main -- PENDENCIAS.md` mostra 8 reescritas posteriores (último `1d4702804` #3128). |

## Lacunas a recuperar
Nenhuma. As justificativas da branch no evidence são mais precisas ("ledger registrou resumo em prosa", "tokenizer não normaliza `$function$`") que as da main ("possivelmente com ajuste de lista de dominios"), mas são texto explicativo, sem efeito no guard (os hashes são idênticos). Valor: baixo/nenhum; não justifica PR.

## apagar_branch_seguro: true
Todos os 3 arquivos têm prova: 1 obsoleto por abordagem superada (pin por hash + replay-known-failures), 2 incorporados (evidence com mesmos hashes; PENDENCIAS arquivado em `docs/_arquivo/`).

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** (apagar branch é seguro). Tentei refutar os 3 arquivos; nenhum hunk de valor ≥ médio sobrou.

Reproduzido do zero (`origin/main` = `dac285f62`, branch tip `2e2f97fb9`, merge-base `1252bb5a4`, diff = 3 arquivos / 119 inserções / 0 remoções):

1. **`supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql` (+16 `DROP POLICY IF EXISTS`) — obsoleta e hoje seria nociva.**
   - `git show origin/main:…20261031100000_copilot_fases13_15_tabelas.sql | grep -c "DROP POLICY IF EXISTS"` = **0**; sha256 do arquivo na main = `753f2272f1593da181e64c11046a58243145524f7afcf346445f6a3811770309`; com o patch da branch = `3476b1719282e79e5a87226b94d2875e03e092c903be0db0f808a1371411aa53`.
   - `origin/main:scripts/db-audit/migration-evidence.json:1217-1228` fixa exatamente `753f2272…` (`kind: ledger-divergence/pinned-replay`, `reason: safer-replay`, "Migration imutavel; arquivo fixado por hash proprio").
   - O guard falharia em dois pontos: `scripts/db-audit/check-migration-drift.mjs:436` (`file_sha256 divergente do manifesto`) e, se alguém re-pinasse o hash novo, `:817-818` (`excecao pinned-replay obsoleta`, porque `ledgerSql === fileSql`).
   - `.github/workflows/db-guard.yml:142` isenta do bloqueio de edição justamente arquivos com `kind=ledger-divergence/pinned-replay`, logo o PR não travaria no guard por-PR — ele quebraria depois, no drift/live-guard. Isto reforça a obsolescência: aplicar a intenção da branch hoje exigiria editar arquivo + re-hashear + remover a exceção, que é outra mudança, contrária a `docs/agentes/banco.md` regra 7 ("Resumo obriga exceção pinned-replay … para sempre") e ao texto do próprio guard ("um arquivo ja aplicado nao pode mudar depois … crie um NOVO arquivo com version maior").
   - Divergência de fato existe (não é invenção da branch): `db_query` em produção → `20261031100000` tem **46 statements, 16 com `DROP POLICY IF EXISTS`**. Mas o ganho colateral que a branch traria (tornar a migration idempotente no replay) já está coberto/neutralizado em `origin/main:scripts/db-audit/replay-known-failures.json:107-110` — `nao-idempotente-inerte`, "Efeito real: nenhum".

2. **`scripts/db-audit/migration-evidence.json` (4 exceções) — incorporada, hash a hash.** Comparei por `jq` as 4 versões (`20261016180000`, `20261016190000`, `20261016220000`, `20261031130000`) entre `origin/main` e a branch: `file_sha256`, `file_sql_sha256`, `ledger_statements_sha256`, `ledger_sql_sha256` e `kind` **idênticos** nas 4. Única divergência: `reason` em 2 delas (main `safer-replay`, branch `ledger-summary`) e o texto de `justification`. Ambos os valores de `reason` estão no conjunto válido (`check-migration-drift.mjs:41-47` `PINNED_REPLAY_REASONS`), e `justification` é texto livre sem efeito no guard → valor baixo, não justifica PR.

3. **`PENDENCIAS.md` (§4 + §5) — incorporada via arquivo histórico.** `origin/main:docs/_arquivo/PENDENCIAS.md:222-272` traz §5 praticamente verbatim (inclusive o parágrafo que cita esta branch) e §4 como "✅ RESOLVIDO" com `remote_only_count=0` e os 3 arquivos criados (PR #2551). As instruções da branch para o dono em §4 estão superadas pelo próprio resultado.

Lacunas adicionais encontradas: **nenhuma**. Nada a resgatar; `apagar_branch_seguro=true`.
