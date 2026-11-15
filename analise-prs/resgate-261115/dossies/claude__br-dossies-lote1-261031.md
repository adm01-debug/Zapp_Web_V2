# Triagem: `claude/br-dossies-lote1-261031` (PR #2413)

- Ref: `origin/claude/br-dossies-lote1-261031` · tip `278354677` · merge-base `004e74a8c` (1 commit à frente)
- Commit: `278354677 docs(br): dossiês lote 1 — 3 branches analisadas (2 SUPERADA, 1 COBERTA)`
- Pré-classificação mecânica: MISTO_CONFLITO (falso positivo — arquivos foram movidos para `docs/_arquivo/`)
- Triagem 2026-11-08: OBSOLETA (hipótese; verificação abaixo mostra INCORPORADA)

## Propósito
Só documentação de auditoria de branches: 3 dossiês markdown (`analise/dossies/*.md`) + 4 entradas em `analise/progresso.json` registrando que `automation/types-sync`, `claude/fervent-noether-vvq63j` e `claude/fix-deploy-functions-2408` já estavam cobertas pela `main`. Zero `src/`, `supabase/`, workflows.

## Arquivo × achado × evidência

| Arquivo na branch | Achado | Evidência |
|---|---|---|
| `analise/dossies/automation-types-sync.md` | INCORPORADO (movido) | `diff <(git show REF:analise/dossies/automation-types-sync.md) <(git show origin/main:docs/_arquivo/analise/dossies/automation-types-sync.md)` → vazio (byte-idêntico). Blob main `1a48742de`. |
| `analise/dossies/claude-fervent-noether-vvq63j.md` | INCORPORADO (movido) | mesmo diff → vazio. Blob main `c387f6b6d`. |
| `analise/dossies/claude-fix-deploy-functions-2408.md` | INCORPORADO (movido) | mesmo diff → vazio. Blob main `ed272885e`. |
| `analise/progresso.json` (4 entradas) | INCORPORADO (movido) | As 4 entradas (`hermes/telefonia-contrato-dados-…`, `automation/types-sync`, `claude/fervent-noether-vvq63j`, `claude/fix-deploy-functions-2408`) existem em `origin/main:docs/_arquivo/analise/progresso.json` (linhas 4–45) com todos os campos idênticos (comparação JSON campo a campo → IDENTICA ×4; arquivo da main tem 75 entradas). |

Histórico na main: conteúdo re-landado por `df4d597dc chore: recriar dossiês de análise e relatório CI final (substitui #2429 #2415 #2413 …) (#2458)` e depois arquivado por `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)`. O `analise/progresso.json` atual da main (recriado em `529389d3f` #2761, 21 entradas) é um novo ledger e não contém estas 4 entradas — mas elas estão preservadas integralmente no arquivo em `docs/_arquivo/`; o CONFLICT mecânico vem só disso.

## Veredito
**INCORPORADA** — confiança alta. Todo o conteúdo da branch está na `main` byte a byte, em `docs/_arquivo/analise/`. Nada a recuperar.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro (true).

## Verificação adversarial

Tentei refutar o veredito INCORPORADA procurando qualquer hunk de valor não coberto pela `main`. Não achei nenhum. Concordo.

**Escopo real da branch** — 1 commit (`278354677`, 2026-10-31), diff vs merge-base `004e74a8c`: 4 arquivos, 149 linhas, todas adições. `git diff --stat` confirma: zero `src/`, zero `supabase/migrations/`, zero `supabase/functions/`, zero `.github/workflows/`. Branch é só prosa de auditoria.

**Os 3 dossiês: byte a byte na main.** md5 do blob da branch == md5 do blob da main em `docs/_arquivo/analise/dossies/`:
- `automation-types-sync.md` → `88f8885e480b5c21e24afb6c835e1d21` (branch e main)
- `claude-fervent-noether-vvq63j.md` → `2cd0d558729572470289b5c41610baa7`
- `claude-fix-deploy-functions-2408.md` → `747549778f7aa8716a24c44c8e04b2c7`

O `missing_in_main` do JSON (19+18+24 linhas) é artefato do caminho: a triagem automática comparou `analise/dossies/<f>.md` e o conteúdo vive em `docs/_arquivo/analise/dossies/<f>.md` (campo `same_basename_in_main` do próprio JSON já apontava isso, com `missing_vs_same_basename: 0`).

**Trilha de como chegou lá** (`git log --diff-filter=A`): os três arquivos entraram na main por `df4d597dc` — *"chore: recriar dossiês de análise e relatório CI final (substitui #2429 #2415 #2413 #2396 #2372 #2200)"* (#2458), que cita explicitamente a PR desta branch (#2413). Depois foram movidos para `docs/_arquivo/` por `c570d5d46` (#2630, "arquiva prosa morta"). Confirmei o md5 idêntico também em `c570d5d46^:analise/dossies/<f>.md`, antes do arquivamento — ou seja, não houve edição no caminho.

**`analise/progresso.json`: as 4 entradas estão na main.** Comparei objeto por objeto (parse JSON, não texto) contra `origin/main:docs/_arquivo/analise/progresso.json` (75 entradas): as 4 entradas da branch (`hermes/telefonia-contrato-dados-26092615475e51`, `automation/types-sync`, `claude/fervent-noether-vvq63j`, `claude/fix-deploy-functions-2408`) batem **campo a campo, incluindo `notas`, `tip_sha`, `veredito` e `confianca`**. O `CONFLICT` do JSON é conflito textual de arquivo inteiro (branch cria com 4 entradas, main tem outro arquivo no mesmo caminho), não perda de conteúdo.

**Observação, não lacuna:** o `analise/progresso.json` vivo da main foi **recriado** por `529389d3f` (#2761, "auditoria de branches — lote 1 e 2, 21 branches, 18 deletadas") e tem 21 entradas de uma auditoria nova; ele não lista as 3 branches desta branch. O ledger histórico com essas entradas é o arquivado (#2630). Nada se perdeu: o registro existe e as 3 branches já foram analisadas e apagadas. Não vale rematerializar prosa de auditoria num ledger que outra auditoria substituiu.

**Veredito mantido:** INCORPORADA. Apagar a branch remota é seguro — nenhum byte dela é exclusivo.
