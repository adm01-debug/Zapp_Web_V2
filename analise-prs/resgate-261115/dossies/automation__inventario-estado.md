# Dossiê — automation__inventario-estado (branch `origin/automation/inventario-estado`, PR #2848)

## Propósito
Branch gerada pelo workflow `.github/workflows/inventario-estado-semanal.yml` (cron segunda 10:23 UTC, linha 21;
`peter-evans/create-pull-request` com `branch: automation/inventario-estado`, `delete-branch: true`, linhas 91-98).
Regenera `inventario/estado/{banco,edges,rotas}.json` a partir do banco oficial + código. Commits:
- `e317c89cf chore: inventario do estado real [auto]` (2026-11-09)
- `72de368f7 Merge branch 'main' into automation/inventario-estado` (2026-11-09)

## Arquivo × achado × evidência
| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| inventario/estado/banco.json | IDENTICAL_TO_MAIN | incorporado | PRESENT_BYTE |
| inventario/estado/rotas.json | IDENTICAL_TO_MAIN | incorporado | PRESENT_BYTE |
| inventario/estado/edges.json | BOTH_CHANGED / CONFLICT (1 linha) | incorporado e depois **superado** por snapshot mais novo | PR #2848 mergeada em `1c3535a04 chore: inventário do estado real (semanal) (#2848)` 2026-11-09; `git diff --stat 1c3535a04 origin/automation/inventario-estado -- inventario/estado/` = vazio (árvore idêntica). Main regenerou o arquivo em `ab657aa34` (2026-11-14): `gerado_em` 2026-11-14T02:24:51Z, `total` 92, 14 sem chamador — vs. branch `gerado_em` 2026-11-09T10:27:23Z, `total` 85, 16 sem chamador. |

O "conflito" é só o arquivo JSON de 1 linha: a versão da branch entrou na main via squash e foi substituída por um
inventário mais recente (regerado pela automação). Nada do conteúdo da branch está perdido; o que a main tem agora é
estritamente mais novo (dados gerados, não trabalho manual).

## Veredito
**INCORPORADA** (confiança alta). Nenhuma lacuna a recuperar.

## Branch
Segura para apagar: o workflow tem `delete-branch: true` e recria `automation/inventario-estado` a cada run com
mudança; o ref remanescente é resíduo (o merge squash #2848 já entrou). Nenhuma PR aberta aponta para ela (a única,
#2848, está mergeada).

## Verificação adversarial
Tentei refutar o veredito INCORPORADA procurando qualquer hunk útil da branch ausente na main. Não achei nenhum.

1. **Trabalho real da branch = 3 arquivos gerados, nada mais.** `git diff --name-status 4de916012 origin/automation/inventario-estado`
   → só `inventario/estado/{banco,edges,rotas}.json` (M). Os 2 commits exclusivos (`git log origin/main..origin/automation/inventario-estado`)
   são `e317c89cf chore: inventario do estado real [auto]` e `72de368f7 Merge branch 'main'` — zero código, zero script,
   zero migration, zero workflow. O merge-base `4de916012` já é ancestral de `origin/main` (`git merge-base --is-ancestor` = YES).
2. **banco.json e rotas.json: idênticos bit a bit.** Blob SHAs iguais nas duas pontas —
   `banco` `feaab66a66086ce40952dcd90d3bc3bdaf098f68`, `rotas` `084045f5613f86ed585a239d9f1f43dcdb7bd5ed` (branch = `origin/main`).
3. **edges.json: a main cobre tudo e mais.** Comparação chave por chave do JSON (branch `3bf892852` vs main `6f95fd334`):
   `edge_functions` só-na-branch = **[]** (conjunto vazio); só-na-main = 7 (`ai-deadline-calculator`, `ai-lead-temperature`,
   `ai-loss-risk`, `ai-multimodal-analysis`, `ai-objection-handler`, `ai-price-anchor`, `ai-product-recommendation`).
   As 30 funções com payload diferente divergem só em contadores do snapshot (ex.: `ai-proxy` `migrations` 0→3;
   `copilot-live` `linhas` 225→296). `sem_chamador_no_repo` só-na-branch = `talkx-scheduler`, `talkx-storage-purge` —
   ambos agora **têm** chamador na main (`talkx-storage-purge` `migrations:3`), ou seja, a main é mais correta, não mais pobre.
   Nenhuma informação da branch desaparece: é o mesmo gerador rodando 5 dias depois (`gerado_em` 2026-11-09T10:27:23Z/85
   → 2026-11-14T02:24:51Z/92).
4. **A entrada na main está provada pelo conteúdo, não pelo PR.** `git diff --stat 1c3535a04 origin/automation/inventario-estado -- inventario/estado/`
   = vazio, e `git log origin/main -- inventario/estado/edges.json` lista `1c3535a04 (#2848)` seguido de `ab657aa34 (#3064)`.
   A única "perda" de 1 linha apontada pelo `line_check` é a própria linha-arquivo do JSON antigo, substituída pelo snapshot novo.

**Parecer: concordo — INCORPORADA.** Branch segura para apagar (dado gerado, substituível por um run da automação;
tip `72de368f7` não está na main, mas seu único conteúdo original está).
