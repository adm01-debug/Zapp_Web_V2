# Dossiê — `claude/fix-ci-workflows-hxupgs` (tip `aac5bfce`, base `2f2cc18c`)

## Propósito
1 commit docs-only (`aac5bfceb 2026-11-05 chore: relatório CI com baseline local e pendências de workflows`), 2 arquivos (`PENDENCIAS.md` +3/-2, `RELATORIO_CI.md` +56/-20). É um refinamento do próprio relatório que a branch já havia entregue: o merge-base `2f2cc18ce` É a PR #2730 desta mesma branch ("chore: relatório CI e pendências de workflows (fix-ci-workflows-hxupgs)"). O commit sobra reescreve o relatório em tabelas (baseline local, inventário, estado final, detalhe do Deploy Edge Functions bloqueado pela PR #2707, comparação baseline×final) e ajusta 3 linhas de `PENDENCIAS.md` sobre o mesmo bloqueio.

## Arquivo × achado × evidência

| Arquivo | Lacuna (branch tem, main não) | Achado | Evidência |
|---|---|---|---|
| `PENDENCIAS.md` | 3 linhas: link da run #956 (`41883030015`), "Última run na main #956…", "Por que não posso corrigir — PR #2707…" | **OBSOLETA** — o bloqueio descrito não existe mais e o arquivo foi reescrito do zero na main (documento de 2026-11-12, 445 linhas, outra estrutura) | PR #2707 mergeada em `4ac4bd4ed 2026-11-06 fix: cron do drain de ai_usage_outbox… (#2707)`; `origin/main:supabase/deployment-manifest.json:1403` contém `"name": "ai-usage-outbox-drain"`; `origin/main:PENDENCIAS.md:17` = "Deploy Edge Functions … Resolvido … `conclusion=success`" e `:116` run #43189662194 success; `git grep 2707 origin/main -- PENDENCIAS.md` → 0 ocorrências |
| `RELATORIO_CI.md` | 42 linhas: cabeçalho "SHA main no início", §1 tabela de baseline (bun install/build/tsc/eslint/claude-md/usage-guard/node ci/vitest skipped), §2 inventário, §3 estado final em tabela, "Anti-regressão PR #2730", §4 detalhe Deploy Edge, §5 comparação | **INCORPORADA em outra forma / superada** — main tem as mesmas seções 1–5 datadas de 2026-11-05 com mais detalhe (saídas reais dos 3 shards vitest, 4273 testes node) e depois §6–§11 da sessão 2026-11-12 que resolveu os bloqueios | `origin/main:RELATORIO_CI.md:9` "## 1. Baseline local (comandos rodados em 2026-11-05)" (1.1–1.8 = mesmos comandos da tabela da branch); `:114` "## 2. Inventário…"; `:120` linha Deploy Edge `#41883030015` / `afd8c7ca` / `ai-usage-outbox-drain` (mesma run que a branch cita); `:126` "## 3. Estado final (2026-11-05…)"; `:149-156` "## 4. Bloqueios documentados — 4.1 Deploy Edge Functions … PR #2707"; `:185` "## 5. Baseline × estado final"; `:205+` sessões posteriores. Histórico: `1616f7b73`, `f1d8e5f9a`, `15923813a`, `65cf38544` (2026-11-12) reescreveram o arquivo citando esta branch (`git log -S'fix-ci-workflows-hxupgs'`). A linha removida pela branch ainda na main (`|---|---|---|`) é separador de tabela markdown — ruído. |

## Veredito
**OBSOLETA** (docs-only; o conteúdo útil já está na main em forma mais completa e o estado que o relatório fotografava — Deploy Edge bloqueado pela PR #2707 — foi resolvido em 2026-11-06). Nenhuma lacuna com valor > nenhum. `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma. Não portar: as 46 linhas são snapshot de 2026-11-05 de um relatório que a main já atualizou (§1–§11) e cujo bloqueio não existe mais.

## Verificação adversarial

Parecer: **concordo com OBSOLETA**. Tentei refutar hunk por hunk; nenhum achado de valor ≥ médio sobrou.

Diff integral conferido (`git diff 2f2cc18c origin/claude/fix-ci-workflows-hxupgs`): 2 arquivos, +59/-22, 100% markdown. Zero `src/`, `supabase/`, `.github/`, `scripts/`. Nada executável a perder.

Hunk por hunk:

| Hunk da branch | Está na main? | Evidência |
|---|---|---|
| Correção da URL da run #956 (`41541397024` → `41883030015`) — a única correção factual do commit | **SIM** | `origin/main:RELATORIO_CI.md:120` e `:144` já usam `41883030015`; `git grep -F 41541397024 origin/main -- RELATORIO_CI.md PENDENCIAS.md` → 0 ocorrências (a URL errada não sobrevive na main) |
| §1 tabela de baseline (8 comandos) | **SIM, em forma melhor** | `origin/main:RELATORIO_CI.md:9` "## 1. Baseline local (comandos rodados em 2026-11-05)" com §1.1–1.8 = os mesmos 8 comandos, com saída real em bloco de código (`:67-75` node `tests 4275 / pass 4273`; `:79` 3 shards vitest). Números literais da branch (`668 installs`, `28199 bytes`, `20.00s`) não estão — são valores de um snapshot que a main refez com mais precisão |
| §2 inventário | **SIM, em forma melhor** | `origin/main:RELATORIO_CI.md:114-123`. Método da main ("última run de cada workflow na main") é mais correto que o da branch ("últimas 50 runs com failure", que arrastava falhas já autorreparadas de 2026-11-04); os 3 workflows realmente em falha estão lá com URL completa |
| §3 estado final em tabela | **SIM, superado** | `origin/main:RELATORIO_CI.md:126-146`: 16 workflows com run, conclusão e URL, contra 5 da branch |
| §3 "Anti-regressão — checks do PR #2730 (`306c7022`) verdes" | NÃO | Nota transitória sobre PR já mergeada em 2026-11-05T13:14Z. Valor **nenhum** |
| §4 detalhe Deploy Edge + 3 linhas de `PENDENCIAS.md` (bloqueio pela PR #2707) | **Fato extinto** | PR #2707 mergeada: `4ac4bd4ed 2026-11-06 fix: cron do drain de ai_usage_outbox e comentario do CodeQL (#2707)`; `origin/main:supabase/deployment-manifest.json:503,1403` contêm `ai-usage-outbox-drain`; `origin/main:PENDENCIAS.md:21` "Deploy Edge Functions \| #43143197204 \| Resolvido em sessão anterior \| `conclusion=success`". A main ainda guarda o registro histórico do bloqueio em `RELATORIO_CI.md:149-156` (§4.1) |
| "Última run na main: `fa7d882` não alterou `supabase/functions/` nem `config.toml`, portanto não disparou o workflow" (única frase realmente ausente da main) | NÃO | Explicação de por que a run do deploy estava velha **em 2026-11-05**. Desde então o workflow rodou e passou (#43143197204). Valor **baixo**, sem efeito em decisão |
| Linha removida que segue na main (`\|---\|---\|---\|`) | — | Separador de tabela markdown. Ruído, como a triagem disse |

Teste de remoção deliberada: `git log -S'41541397024' --oneline origin/main -- RELATORIO_CI.md PENDENCIAS.md` e `git log -S'fix-ci-workflows-hxupgs' --oneline origin/main` mostram que `RELATORIO_CI.md` foi reescrito pelas sessões de 2026-11-12 citando esta própria branch — ou seja, a main **evoluiu** o documento, não o descartou.

Segurança de apagar: só existe a PR #2730 para esta `headRefName`, estado `MERGED` (mergedAt 2026-11-05T13:14:19Z, headRefOid `306c7022`) — `github_graphql` em `pullRequests(headRefName:"claude/fix-ci-workflows-hxupgs")`. O commit `aac5bfceb` foi empurrado depois do merge e nunca entrou em PR. Apagar a branch não fecha nem órfã nenhuma PR aberta.

Veredito final: **OBSOLETA**, `apagar_branch_seguro = true`. Nada a portar.
