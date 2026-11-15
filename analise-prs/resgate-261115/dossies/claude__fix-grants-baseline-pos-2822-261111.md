# Dossiê — claude__fix-grants-baseline-pos-2822-261111 (PR #2973)

**Branch:** `origin/claude/fix-grants-baseline-pos-2822-261111` · tip `d27cb593e` · merge-base `bd62fc9d9` (#2822) · 1 commit.

## Propósito
`fix(db): mark_pause_investigated sem execute para service_role` — tirar o EXECUTE do `service_role` na RPC `public.mark_pause_investigated(uuid, text)`, editando a migration já aplicada `20261111181000_instance_pause_investigation.sql` (1 linha: adiciona `service_role` ao `REVOKE ALL ... FROM PUBLIC, anon, authenticated`).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261111181000_instance_pause_investigation.sql` | Hunk ausente na main (linha 149 ainda sem `service_role`), **mas intenção já entregue por outra migration** | main `20261112160000_talkx_blacklist_reconcilia_e_higiene.sql:179-181`: `-- 4. mark_pause_investigated: só authenticated executa (substitui a PR #2973).` + `REVOKE EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) FROM service_role;`; pós-condição em `:226-227` (`RAISE EXCEPTION 'pos-condicao: service_role ainda executa mark_pause_investigated'`). Commit `2ae0de787 fix(db): reconcilia talkx_blacklist com a 20261011003007 e higieniza acls (#3027)`. |

## Produção (somente leitura, `tnnnlkbymytvtqngbbqh`)
- `supabase_migrations.schema_migrations`: `20261111181000 instance_pause_investigation` e `20261112160000 talkx_blacklist_reconcilia_e_higiene` **ambas aplicadas**.
- `has_function_privilege(..., 'EXECUTE')`: `service_role=false`, `anon=false`, `authenticated=true` — exatamente o estado que a branch queria.

## Veredito: **INCORPORADA** (equivalente, via migration nova)
Editar a `20261111181000` na main seria inócuo (já aplicada; não reexecuta) e divergiria do ledger. A abordagem correta (REVOKE em migration nova) está na main e aplicada em produção. Nenhuma lacuna a recuperar.

**apagar_branch_seguro:** true.

## Verificação adversarial

Parecer: **CONCORDO — INCORPORADA**. `apagar_branch_seguro: true`. Tentei refutar e não achei nenhum hunk de valor fora da main.

Checagens feitas (independentes da triagem):
1. `git diff bd62fc9d9 origin/claude/fix-grants-baseline-pos-2822-261111` — o diff inteiro da branch é **1 linha**, em `supabase/migrations/20261111181000_instance_pause_investigation.sql:149`: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` → `... , service_role`. Nada mais (apesar do nome "grants-baseline", a branch não toca `scripts/ci/github-settings-baseline.json` nem qualquer outro arquivo).
2. Confirmei que a linha **continua ausente** na main: `git show origin/main:supabase/migrations/20261111181000_...sql | sed -n '149p'` ainda é a versão sem `service_role`. O arquivo tem um único commit na main (`bd62fc9d9`, #2822) — ou seja, a ausência não é remoção deliberada posterior, é simplesmente a versão original.
3. Confirmei a substituição alegada abrindo a main: `supabase/migrations/20261112160000_talkx_blacklist_reconcilia_e_higiene.sql:179-181` — comentário `-- 4. mark_pause_investigated: só authenticated executa (substitui a PR #2973).` seguido de `REVOKE EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) FROM service_role;`. Pós-condição em `:226-227` levanta exceção se `service_role` ainda executar; pré-condição em `:97-98` exige a `20261111181000` aplicada antes; rollback documentado em `:13`.
4. **Equivalência semântica:** em função, `REVOKE ALL` = `REVOKE EXECUTE` (EXECUTE é o único privilégio de função no Postgres). O efeito pretendido pela branch é idêntico ao que a main entrega.
5. **Ordem numa reconstrução do zero** (o único cenário em que editar a migration antiga teria efeito): `20261111181000` concede, `20261112160000` revoga — estado final correto. Logo a branch não cobre nenhum caso que a main deixe aberto.
6. **Produção** (`tnnnlkbymytvtqngbbqh`, SELECT via MCP): `service_role=false`, `authenticated=true`, `anon=false` em `has_function_privilege(...,'public.mark_pause_investigated(uuid, text)','EXECUTE')`; `schema_migrations` tem `20261111181000` e `20261112160000`. Exatamente o estado-alvo da branch.
7. **Cobertura de regressão existe na main:** `supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh:269-276` (B5) reproduz o estado ruim, aplica e exige `permission denied for function mark_pause_investigated` para `service_role` e EXECUTE mantido para `authenticated`. A branch não trazia teste algum.
8. Tip `d27cb593e` **não** é ancestral de `origin/main` (merge por equivalência, não por commit) — coerente com PR #2973 fechada e substituída pela #3027 (`2ae0de787`).

Único ponto a favor da branch, e é pró-apagar: aplicá-la hoje editaria uma migration já aplicada, divergindo do ledger — o que o próprio AGENTS.md/`docs/agentes/banco.md` proíbem. Zero lacuna adicional.
