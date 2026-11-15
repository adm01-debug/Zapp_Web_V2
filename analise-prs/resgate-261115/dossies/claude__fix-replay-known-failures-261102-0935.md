# Dossiê — claude/fix-replay-known-failures-261102-0935

**Ref:** `origin/claude/fix-replay-known-failures-261102-0935` · tip `86f6e8c3` · merge-base `68a5c356` · 2 commits (2026-11-02)
**Veredito:** OBSOLETA (trabalho já mergeado via PR #2615 = `4908feacd`; diferenças residuais superadas de propósito na main) · **apagar branch: SEGURO**

## Propósito
Destravar o check `Contrato DB offline`: (1) 3 exceções novas em `scripts/db-audit/replay-known-failures.json` (20261026220300/230300/240300), (2) criar o arquivo `supabase/migrations/20261026240300_drop_bkp_261023.sql` (DROP SCHEMA _bkp_261023 CASCADE) que estava só no ledger, (3) corrigir asserção B.0c em `team-receipts-reactions-conversation-id.test.sh`.

Mesmo conteúdo foi mergeado na main em `4908feacd` "fix(db): adiciona migration 20261026240300, 3 entradas no replay e corrige asserção B.0c (#2615)" (2026-11-02). `git diff --stat 86f6e8c3 4908feacd -- scripts/db-audit supabase/migrations/20261026240300_drop_bkp_261023.sql` = só 2 arquivos, 15/15 linhas (acentuação/1 linha de data).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | INCORPORADA (byte-idêntico) | `hunk: PRESENT_BYTE`; `git diff 86f6e8c3 origin/main -- <arquivo>` vazio |
| `scripts/db-audit/replay-known-failures.json` — entrada `20261026240300_drop_bkp_261023.sql` | INCORPORADA | `origin/main:scripts/db-audit/replay-known-failures.json:103`, texto idêntico ao da branch |
| `replay-known-failures.json` — entradas `20261026220300` e `20261026230300` | OBSOLETA (removidas de propósito) | Entraram em `4908feacd` (#2615); `0c191b6b1` (2026-11-09) "fix(migrations): IF EXISTS guards em migrations 220300 e 230300" tornou-as replay-safe (`20261026220300_...sql:11-15` usa `DO $$ IF EXISTS (... table_name='_zapp_fn_before')`; `20261026230300_...sql:1` = `DROP SCHEMA IF EXISTS ops_backup CASCADE`); `a15fdfb81` (2026-11-09) removeu as 2 exceções, agora desnecessárias |
| `replay-known-failures.json` — `_atualizado_em: 2026-11-01` | OBSOLETA | main está em `2026-11-09` (mais recente) |
| `supabase/migrations/20261026240300_drop_bkp_261023.sql` (DROP executável) | OBSOLETA (substituída por tombstone de propósito) | Entrou em `4908feacd`; `0601e3b64` "fix: reconcilia DB Live Guard sem repetir DROP destrutivo (#2756)" trocou por tombstone só-comentários e pinou o SQL original em `origin/main:supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql` (conteúdo igual ao da branch, com acentos). Motivo: ledger já registra `20261026240300` mas o schema ainda existe → reexecutar o DROP seria repetição destrutiva. Guard `ledger-archive/registered-tombstone` em `scripts/db-audit/migration-evidence.json:1204-1207` |

## Estado real em produção (consulta read-only, 2026-11-15, `tnnnlkbymytvtqngbbqh`)
- `supabase_migrations.schema_migrations`: `20261026220300 classificar_rls_sem_policy`, `20261026230300 decidir_schemas_backup` (stmt `DROP SCHEMA ops_backup CASCADE`), `20261026240300 drop_bkp_261023` (stmt `DROP SCHEMA _bkp_261023 CASCADE`) — 3 presentes.
- `information_schema.schemata`: `_bkp_261023` **ainda existe**; `ops_backup` não existe.
- Ou seja: a versão 20261026240300 está no ledger sem o DROP ter sido executado — situação já conhecida e tratada na main (#2756; pendência "só o dono", `docs/_arquivo/analise/PLANO_COORDENACAO.md:97,130`). Não é lacuna desta branch.

## Lacunas a recuperar
Nenhuma. Nada a portar.

## Verificação adversarial

**Parecer: CONCORDO com a triagem — OBSOLETA, apagar branch é SEGURO.** Tentei refutar hunk por hunk do `git diff 68a5c356 origin/claude/fix-replay-known-failures-261102-0935` (3 arquivos, 46 inserções / 3 remoções). Nenhum hunk de valor ≥ médio sobrou fora da main.

| Hunk da branch | Teste de refutação | Resultado |
|---|---|---|
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` (asserção B.0c) | `git diff <branch> origin/main -- <arquivo>` vazio; `git ls-tree` dá o **mesmo blob `249a09e70`** e o mesmo modo `100644` nas duas pontas; `origin/main:...test.sh:413` = `'B.0c o backfill corrigiu conversation_id do recibo legado status=read'` | INCORPORADA, byte-idêntico (inclusive o modo — a branch trocava 100755→100644, a main já está 100644) |
| `replay-known-failures.json` → entrada `20261026240300_drop_bkp_261023.sql` | `origin/main:scripts/db-audit/replay-known-failures.json:103`, texto idêntico | INCORPORADA |
| `replay-known-failures.json` → entradas `20261026220300` / `20261026230300` | Removidas na main em `a15fdfb81` (2026-11-09 11:58). Checado se a remoção foi acidental: `0c191b6b1` (2026-11-09 **12:55**, mesmo dia, "IF EXISTS guards em migrations 220300 e 230300 para E2E") deixou as duas replay-safe — `origin/main:supabase/migrations/20261026220300_classificar_rls_sem_policy.sql:11-18` embrulha o `COMMENT ON TABLE public._zapp_fn_before` em `DO $$ IF EXISTS (… table_name='_zapp_fn_before')`, e `origin/main:supabase/migrations/20261026230300_decidir_schemas_backup.sql:1` = `DROP SCHEMA IF EXISTS ops_backup CASCADE`. Além disso o gate **não penaliza entrada sobrando**: `scripts/db-audit/replay-classify.py:44-59` só fica VERMELHO com falha fora da allowlist (`inesperadas`) | OBSOLETA — reportar as 2 entradas não mudaria a cor de nenhum check; valor nulo |
| `replay-known-failures.json` → `_atualizado_em: 2026-11-01` | main está em `2026-11-09` (`:5`) | OBSOLETA (regressão de data) |
| `supabase/migrations/20261026240300_drop_bkp_261023.sql` com `DROP SCHEMA _bkp_261023 CASCADE;` | Conteúdo pinado em `origin/main:supabase/migrations/_superseded/20261026240300_drop_bkp_261023.sql` (blob `f13088288`): `diff` contra a branch acusa **só linhas de comentário sem acento** — o corpo e o `DROP …` final são iguais. O arquivo ativo na main é tombstone explícito: "Este arquivo ativo é intencionalmente não executável para impedir que db push ou replay tentem repetir DROP SCHEMA _bkp_261023 CASCADE" (`0601e3b64`, PR #2756) | OBSOLETA — e **restaurar seria destrutivo** |

**Produção (read-only, `tnnnlkbymytvtqngbbqh`, 2026-11-15):** `information_schema.schemata` tem `_bkp_261023` (1 linha) e não tem `ops_backup` (0); `supabase_migrations.schema_migrations` registra `20261026240300 drop_bkp_261023` com `statements = {DROP SCHEMA _bkp_261023 CASCADE}`, mais `20261026220300` e `20261026230300`. Confirma a premissa da main: a versão está no ledger **sem** o DROP ter sido executado, então reintroduzir o arquivo executável da branch faria o replay/apply repetir um `DROP SCHEMA … CASCADE` sobre um schema vivo de 3.730 contatos de snapshot. A branch não só não tem valor residual — aplicá-la andaria para trás.

**Nenhuma lacuna adicional encontrada.** Branch pode ser apagada.
