# Dossiê — claude__chore-mapa-resgate-pos-24-10-261101-1415 (PR #2479)

**Veredito: OBSOLETA** · confiança média · apagar branch: seguro (conteúdo recuperável em `refs/remotes/pr/2479` = `7f572d1f8`).

## Propósito
Só documentação. 1 commit próprio (`34c717da1 docs(resgate): mapa do delta pos 24/10 do trabalho local`) + 3 merges de `main`.
Cria `docs/resgate/MAPA_pos-24-10.md` (103 linhas) e `docs/resgate/progresso_pos-24-10.json` (23 linhas): inventário de 2026-11-01
das 59 branches locais só-locais arquivadas como tags `resgate/pos-24-10/*` (classes LIXO 34 / SÓ LOCAL 20 / PARCIAL 5; validade
`git apply --check`: 10 absorvidos / 8 divergentes / 7 "sobra") e "decisões do coordenador" da época.
`git diff --stat 1252bb5a4 origin/claude/chore-mapa-resgate-pos-24-10-261101-1415`: 2 files, +126/-0; zero `src/`, edge, migration, workflow.

PR #2479 fechada em 2026-11-01T23:49Z pelo congelamento de features (#2545): "Branch preservada — reabrir quando esta PR destravar um fluxo crítico". Nunca destravará: é relatório.

## Arquivo × achado × evidência
| arquivo | status | achado | evidência |
|---|---|---|---|
| `docs/resgate/MAPA_pos-24-10.md` | NEW_FILE_ABSENT_IN_MAIN (89 linhas ausentes) | Não está na main em nenhuma forma (`git grep -i "pos-24-10\|532aa09bae\|MAPA_pos" origin/main` → vazio). **Pasta-alvo `docs/resgate/` foi esvaziada de propósito**: `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)` moveu `docs/resgate/MAPA_2026-10-24.md` → `docs/_arquivo/docs/resgate/` ("Relatórios antigos … confundem agentes novos"). `git ls-tree origin/main docs/resgate/` → vazio. | commit c570d5d46; `git ls-tree origin/main docs/_arquivo/docs/resgate/` → só `MAPA_2026-10-24.md` |
| `docs/resgate/progresso_pos-24-10.json` | NEW_FILE_ABSENT_IN_MAIN (18 linhas ausentes) | Idem: contadores do mesmo snapshot (4268 branches, 2390 tags, classes/validade). Nenhum script lê esse JSON (`git grep progresso_pos origin/main` → vazio). | idem |

## Por que OBSOLETA (e não PERDIDA)
1. O repositório decidiu, após o fechamento da PR, que mapas de resgate são "prosa morta" e os tirou de `docs/` (#2630). Mergear a branch hoje recriaria `docs/resgate/` que a main acabou de arquivar.
2. O dado bruto que o mapa descreve está preservado fora do doc: tags `resgate/pos-24-10/*` no remoto (45 presentes neste clone: `git tag -l "resgate/pos-24-10/*" | wc -l` = 45; PR declara 61 enviadas). As branches citadas como "sobra" estão sendo retriadas item a item por esta própria triagem (ex.: `items/claude__feat-metas-seletor-periodo-261101-1208.json`, `codex__consolidacao-baseline-pr-20261101.json`), que substitui a heurística `git apply --check` do mapa (o próprio doc marca sua validade como "NAO VERIFICADO").
3. "Decisões do coordenador" referem-se a PRs já processadas (#2477, #2468) — valor só histórico.

## Lacuna (valor baixo, opcional)
Se o dono quiser histórico completo ao lado de `MAPA_2026-10-24.md`: copiar os 2 arquivos para `docs/_arquivo/docs/resgate/` (não para `docs/resgate/`).
Fonte: `git show 7f572d1f8:docs/resgate/MAPA_pos-24-10.md` e `git show 7f572d1f8:docs/resgate/progresso_pos-24-10.json` (ou `refs/remotes/pr/2479`). Trechos essenciais do mapa (para não reler a branch):
- 7 "SOBRA (ausente na main)" em 01/11: `claude/feat-metas-seletor-periodo-261024-1743` (GoalsDashboard.tsx, GoalsTable.tsx, useGoalsDashboard.ts), `claude/radar-telas-fases-4-6-301030` (29 arq., dito "coberto" por `claude/feat-radar-motor-telas-261101-1330`), `codex/consolidacao-baseline-20261101` (dito coberto pela #2477), `codex/fix-typecheck-baseline-20261101` (QueueAlertsDisplay.tsx, useInboxFilters.type-url.test.tsx), 3 `importado/local/*`.
- 8 "DIVERGENTE": feat-modal-nova-tarefa-painel-261024-1336, feat-talkx-segmentos-filtros-261024-1753, fix-unit-tests-main-261025-0825, codex/consolida-contatos-fab, consolida-conversa-reabertura-tipos, consolida-sentimento-trend-tipos, fixa-docs-deploy-edge-20261029, reconcile-live-migration-sources-20261029.
- Gamificação `creditMiniGameXp` na tag `resgate/pos-24-10/nao-commitado/clone-principal-5-arquivos`: "descartada de propósito — não reintegrar".

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Tentei refutar procurando hunk de valor ≥ médio não coberto; não achei.

Escopo confirmado por conta própria (não pelo JSON):
- `git diff --name-status 1252bb5a4 origin/claude/chore-mapa-resgate-pos-24-10-261101-1415` → exatamente `A docs/resgate/MAPA_pos-24-10.md` + `A docs/resgate/progresso_pos-24-10.json`, `--stat` = 2 arquivos, +126/-0. `git log` do intervalo = 1 commit próprio (`34c717da1`) + 3 merges de `main`. Zero `src/`, `supabase/`, `.github/`.
- Ausente na main: `git grep -il "pos-24-10|532aa09bae|MAPA_pos|progresso_pos" origin/main` → vazio. `git ls-tree origin/main docs/resgate/` → vazio.

Substituição alegada, conferida no arquivo/commit da main:
- Arquivamento proposital: `c570d5d4687dfbcd3ed2b3b8fbf3f0f3404d5fe6` (2026-11-02, #2630), corpo lista `docs/` → `docs/_arquivo/docs/`: `… prompts/, resgate/, tasks/, …`, com justificativa "Relatórios antigos … confundem agentes novos". `git ls-tree origin/main docs/_arquivo/docs/resgate/` → só `MAPA_2026-10-24.md`. Mergear hoje recriaria a pasta que a main acabou de esvaziar.
- Dado bruto preservado no remoto, não só neste clone: `git ls-remote --tags origin 'refs/tags/resgate/pos-24-10/*'` → 121 linhas (~60 tags). As 7 "SOBRA" do mapa estão todas lá, inclusive as que **não** existem localmente: `resgate/pos-24-10/codex-fix-typecheck-baseline-20261101` (`15f6e0fb3`), `codex-consolidacao-baseline-20261101` (`8517c0a6f`), as 3 `importado-local-*` e `nao-commitado/clone-principal-5-arquivos` (`facde3025`). Logo o valor de índice do mapa é reproduzível com `git tag -l "resgate/pos-24-10/*"` após fetch.
- O único trecho do mapa com cara de regra ("gamificação `creditMiniGameXp` … descartada de propósito — não reintegrar") **já está na main, com mais detalhe**: `docs/_arquivo/docs/consolidacao/PLANO.md:18` ("XP dos minijogos — **DESCARTAR alterações locais de A**", contrato PB-18/D4) e `docs/_arquivo/docs/consolidacao/_levantamento/A-pendentes.tsv:200-205` (`MiniGameDialogs.tsx`, `miniGamesData.ts`, `useAgentGamification.ts` → DESCARTAR). Também `docs/_arquivo/analise-prs/dossies/PR-2077.md:11`. Nada se perde ao descartar o mapa.
- O resto do mapa é heurística que o próprio arquivo marca como "NAO VERIFICADO" (`git apply --check`, sem build/teste), hoje substituída por esta triagem item a item (381 itens em `scratchpad/items/`, incluindo `claude__feat-metas-seletor-periodo-261101-*`, `codex__consolidacao-baseline-pr-20261101`, a família `claude__feat-radar-*`).

Apagar a branch é seguro: conteúdo fica em `refs/pull/2479/head` = `7f572d1f83b034c07c0cee8e2290e1e26c1f118a` (confirmado por `git ls-remote origin 'refs/pull/2479/*'`), ref que o GitHub mantém após a deleção da branch.

Lacuna residual: só a de valor **baixo** já registrada (arquivar os 2 arquivos em `docs/_arquivo/docs/resgate/`). Nenhuma lacuna nova.
