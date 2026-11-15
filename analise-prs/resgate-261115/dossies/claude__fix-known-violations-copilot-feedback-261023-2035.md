# Dossiê — claude__fix-known-violations-copilot-feedback-261023-2035 (PR #2206)

**Branch:** `origin/claude/fix-known-violations-copilot-feedback-261023-2035` · tip `61f88092f` · merge-base `bac62ba98` (2026-10-23) · 1 commit.
**Commit:** `fix(ci): adiciona copilot_feedback ao baseline known-violations para desbloquear PR #2005`.

## Propósito
Em 2026-10-23 a tabela `copilot_feedback` ainda não existia no `schema-catalog.json`; o `supabase-usage-guard` acusava `from:copilot_feedback:src/hooks/copilot/useCopilotFeedback.ts` como violação nova e bloqueava a PR #2005. A branch adicionava essa chave ao baseline (`known`) e, de carona, removia 26 chaves já obsoletas na época.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência |
|---|---|---|---|
| `scripts/db-audit/known-violations.json` | +1 linha ausente na main: `"from:copilot_feedback:src/hooks/copilot/useCopilotFeedback.ts"` | **OBSOLETA** — o alvo passou a existir no catálogo, logo não há violação para registrar; a chave, se adicionada, seria "entrada obsoleta" e podada pelo próprio guard | `origin/main:supabase/schema-catalog.json:78` (`"copilot_feedback"` em tabelas) e `:836-839` (colunas); migrations em main: `supabase/migrations/20261026130300_copilot_feedback.sql`, `20261026140300_copilot_feedback_rls_fix.sql`, `20261026150300_copilot_feedback_created_by_nullable.sql`; guard: `origin/main:scripts/db-audit/supabase-usage-guard.mjs:317` (`obsoletas = baseline.filter(k => !seen.has(k))`) e `:342-353` (aviso + `--prune-obsolete` remove) |
| idem | −26 linhas (chaves antigas) | **INCORPORADA** — main já tem `"known": []` (todas removidas) | `git show origin/main:scripts/db-audit/known-violations.json` → `"known": []`; `removed_still_in_main: 0` no JSON do item; histórico: `b24e31500`, `ab657aa34`, `bd417f58d` |

O hook consumidor segue na main (`origin/main:src/hooks/copilot/useCopilotFeedback.ts:75,100` fazem `supabase.from('copilot_feedback').insert`), ou seja, a necessidade de negócio (feedback do copiloto gravado) está atendida pela tabela real, não por exceção de baseline.

## Veredito
**OBSOLETA** (confiança alta). A única linha que falta é uma exceção de CI para um alvo que hoje existe no catálogo; incluí-la só geraria aviso de "entrada obsoleta". A PR #2005 que ela desbloqueava já não depende dela. Triagem anterior (2026-11-08) também marcou OBSOLETA; aqui confirmado por código.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro: sim.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar e não achei hunk de valor ≥ médio fora da main. `origin/main` em `dac285f62`.

Provas levantadas por mim (independentes do dossiê):

1. **Diff da branch tem um único arquivo e um único acréscimo.** `git diff bac62ba98 origin/claude/fix-known-violations-copilot-feedback-261023-2035` toca só `scripts/db-audit/known-violations.json`: +1 chave (`"from:copilot_feedback:src/hooks/copilot/useCopilotFeedback.ts"`), −26 chaves e um `\n` final. Nenhum `src/`, migration, edge ou workflow. Commit único `61f88092f` — "adiciona copilot_feedback ao baseline ... para desbloquear PR #2005", cujo corpo diz explicitamente "ainda não tem migration. Migration virá em etapa separada".
2. **A premissa do commit caiu.** A migration veio: `supabase/migrations/20261026130300_copilot_feedback.sql` (+ `20261026140300_copilot_feedback_rls_fix.sql`, `20261026150300_copilot_feedback_created_by_nullable.sql`) estão em `origin/main`, e a tabela está no catálogo: `origin/main:supabase/schema-catalog.json:78` (lista de tabelas) e `:836-847` (colunas), `:3055-3057` (checks).
3. **Com o alvo no catálogo, a chave teria valor negativo, não nulo.** `origin/main:scripts/db-audit/supabase-usage-guard.mjs:301-304` filtra violação por `!relations.has(alvo)` — `copilot_feedback` está em `relations`, então nada entra em `seen`; `:317` `obsoletas = [...baseline].filter(k => !seen.has(k))` captura a chave e `:343-353` emite "Entradas obsoletas no baseline" e a poda com `--prune-obsolete`. Ou seja: aplicar a branch hoje reintroduziria ruído que o próprio CI manda remover.
4. **Main é estritamente mais apertada que a branch.** `git diff <branch> origin/main -- scripts/db-audit/known-violations.json`: main tem `"known": []` — não só as 26 chaves que a branch removeu, mas também as 5 que ela *mantinha* (`rpc:log_search_event:*`, `rpc:get_search_insights:*`, `rpc:talkx_campaign_resume_precheck:*`, `rpc:should_send_away_message:*`, `rpc:record_away_message:*`) já saíram. Aplicar a branch **afrouxaria** o ratchet. O `_resolvido` da main é idêntico ao da branch (nenhuma justificativa perdida) e a main ainda ganhou a NOTA 2026-11-14 no `_comment`, que a branch não tem.
5. **A necessidade de negócio está atendida por código real, não por exceção.** `origin/main:src/hooks/copilot/useCopilotFeedback.ts:75` e `:100` fazem `supabase.from('copilot_feedback').insert` contra a tabela que agora existe com RLS.
6. **Risco de remoção acidental: descartado.** As 26 chaves não foram "perdidas" — foram podadas pelo fluxo normal do guard (poda automática do types-sync), e a main chegou a `known: []`, estado mais restritivo. Não há `revert` da funcionalidade envolvido: o que a branch pedia (exceção) deixou de ser necessário porque o DDL entrou.

**Lacunas adicionais: nenhuma.** **Apagar a branch (e fechar a PR #2206): seguro.** Único efeito de não apagar é manter PR aberta sobre um arquivo de baseline que a main já zerou — fonte provável de conflito em futuras PRs de `known-violations.json`.
