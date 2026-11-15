# Dossiê: claude/br-dossies-lote2-261031 (PR #2415)

- **Ref**: `origin/claude/br-dossies-lote2-261031` · tip `599e60294` · merge-base `004e74a8c` · 1 commit
- **Commit**: `599e60294 docs(br): dossiês lote 2 — 5 branches analisadas (2 COBERTA, 3 INTEGRAR-LIMPO)`
- **Propósito**: docs-only. Adiciona 5 dossiês de auditoria de branches em `analise/dossies/` e 9 entradas em `analise/progresso.json` (hermes/telefonia, automation/types-sync, fervent-noether, fix-deploy-functions-2408, fix-types-sync-is-pinned, fix-ci-workitem-tz, fix-unit-tests-inbox, pensive-cori, fix-plano-190-etapas). Zero código, zero migration, zero workflow.

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `analise/dossies/claude-fix-ci-workitem-tz-261025-1350.md` | INCORPORADA — movido para `docs/_arquivo/analise/dossies/` | blob idêntico: `0896b495c…` na branch e em `origin/main:docs/_arquivo/analise/dossies/claude-fix-ci-workitem-tz-261025-1350.md` |
| `analise/dossies/claude-fix-plano-190-etapas-261019-1200.md` | INCORPORADA — movido | blob idêntico `fd50592cd…` (branch = main arquivo) |
| `analise/dossies/claude-fix-types-sync-is-pinned-261029.md` | INCORPORADA — movido | blob idêntico `b900a0b65…` |
| `analise/dossies/claude-fix-unit-tests-inbox-261023-1108.md` | INCORPORADA — movido | blob idêntico `9767afdb6…` |
| `analise/dossies/claude-pensive-cori-i93zgf.md` | INCORPORADA — movido | blob idêntico `1ee3405f5…` |
| `analise/progresso.json` (+97 linhas, CONFLICT mecânico) | INCORPORADA — conteúdo está em `docs/_arquivo/analise/progresso.json` | 97 linhas adicionadas; 96 presentes byte a byte no arquivo da main; a única divergente é `"confianca": 0.90` (branch) vs `"confianca": 0.9` (main, entrada `claude/fix-plano-190-etapas-261019-1200`) — mesmo valor JSON. As 9 branches (`grep -c "<branch>"`) aparecem 1× cada em `origin/main:docs/_arquivo/analise/progresso.json`. O `analise/progresso.json` atual da main foi reescrito pela auditoria nova (`529389d3f`, PR #2761) e é outro documento. |

## Cadeia de commits na main
- `df4d597dc chore: recriar dossiês de análise e relatório CI final (substitui #2429 #2415 #2413 #2396 #2372 #2200) (#2458)` — reaplicou o conteúdo documental de #2415 (dossiês + união do `progresso.json`), por conflito em `analise/progresso.json`.
- `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)` — moveu `analise/dossies/*` e `analise/progresso.json` para `docs/_arquivo/analise/`.
- `529389d3f chore(analise): auditoria de branches — lote 1 e 2 (#2761)` — novo `analise/progresso.json` (schema 1.0, outra auditoria).

## Veredito
**INCORPORADA** (confiança alta). Os 6 arquivos têm o conteúdo integral na main (5 blobs idênticos; `progresso.json` com 97/97 linhas semanticamente presentes). O caminho mudou (`analise/` → `docs/_arquivo/analise/`) por decisão explícita de arquivamento (#2630). Nada a portar.

**Lacunas a recuperar**: nenhuma. **Apagar branch**: seguro.

## Verificação adversarial

Verificador independente, 2026-11-15. Veredito da triagem: INCORPORADA. **CONCORDO** — tentei refutar e não achei nenhum hunk útil fora da main.

Diff `004e74a8c..origin/claude/br-dossies-lote2-261031`: 6 arquivos, **333 inserções, 0 remoções** — nada é apagado pela branch, logo não há nada a "perder" por remoção.

Prova arquivo por arquivo (comparação de conteúdo, não de caminho):

1. Os 5 dossiês da branch são **byte-idênticos** aos arquivados na main. `diff <(git show origin/claude/br-dossies-lote2-261031:analise/dossies/<X>.md) <(git show origin/main:docs/_arquivo/analise/dossies/<X>.md)` → vazio para todos:
   - `claude-fix-ci-workitem-tz-261025-1350.md`
   - `claude-fix-plano-190-etapas-261019-1200.md`
   - `claude-fix-types-sync-is-pinned-261029.md`
   - `claude-fix-unit-tests-inbox-261023-1108.md`
   - `claude-pensive-cori-i93zgf.md`

2. `analise/progresso.json` (marcado CONFLICT / 61 linhas "ausentes"): o conflito é só de posição no array. Comparei as 9 entradas da branch, como objetos, contra `origin/main:docs/_arquivo/analise/progresso.json` (75 entradas). **As 9 estão presentes e idênticas campo por campo** (`branch`, `tip_sha`, `veredito`, `confianca`, `dossie`, `analisado_em`, `sessao`, `notas`): `hermes/telefonia-contrato-dados-26092615475e51`, `automation/types-sync`, `claude/fervent-noether-vvq63j`, `claude/fix-deploy-functions-2408`, `claude/fix-types-sync-is-pinned-261029`, `claude/fix-ci-workitem-tz-261025-1350`, `claude/fix-unit-tests-inbox-261023-1108`, `claude/pensive-cori-i93zgf`, `claude/fix-plano-190-etapas-261019-1200`. `schema_version` 1.0 em ambos. As 61 linhas contadas como ausentes são artefato do diff textual sobre JSON reordenado.

3. Cadeia de incorporação confirmada na main:
   - `df4d597dc` — "chore: recriar dossiês de análise e relatório CI final (substitui #2429 **#2415** #2413 #2396 #2372 #2200) (#2458)"; `git merge-base --is-ancestor df4d597dc origin/main` → verdadeiro.
   - `c570d5d46` — "chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)", último commit a tocar `docs/_arquivo/analise/progresso.json`. Explica a diferença de caminho (`analise/` → `docs/_arquivo/analise/`) sem perda de conteúdo.

4. Zero migration, zero workflow, zero `src/`, zero edge function (`counts` do JSON, confirmado pelo diff stat). Nada que precise de decisão do dono.

Observação sem impacto neste item: os dossiês arquivados recomendam "INTEGRAR-LIMPO" para outras branches (p.ex. `claude/fix-ci-workitem-tz-261025-1350`, que adiciona `process.env.TZ` ao `vitest.config.ts`). Isso é o conteúdo dos documentos, não trabalho desta branch — o destino dessas branches é item próprio da auditoria e não altera o veredito aqui.

**Conclusão: INCORPORADA. Apagar `claude/br-dossies-lote2-261031` é seguro — todo o conteúdo está na main.**
