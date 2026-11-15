# claude__chore-prod-readiness-261112-1421 — INCORPORADA

- Ref: `origin/claude/chore-prod-readiness-261112-1421` @ `dc3424ee5`
- merge_base: `7bdbe2e3f`
- PR: [#3022](https://github.com/adm01-debug/Zapp_Web_V2/pull/3022) — "docs(prontidao): relatório de prontidão para produção com inventário provado"
- Pré-classificação mecânica: MISTO_CONFLITO, 1 arquivo, 665 linhas "em lacuna" → **falso positivo** (ver prova abaixo)

## Propósito
3 commits, só documentação:
```
dc3424ee5 Merge branch 'main' into claude/chore-prod-readiness-261112-1421
d755120bf docs(prontidao): corrige afirmações que a main atual desmentiu
ed45bcdd2 docs(prontidao): relatório de prontidão para produção com inventário provado
```
`git diff --stat 7bdbe2e3f origin/claude/...` → `docs/prod-readiness.md | 1100 +++++` (1 arquivo, 1100 inserções, 0 remoções).
Conteúdo: relatório de prontidão para produção com inventário provado da `main` @ `81f67b0db` — telas/rotas (18 rotas URL, 55 vistas), 94 edges, banco (224 relações, lints, migrations), 24 workflows, integrações externas, produção ao vivo, "sem pela metade" (15 itens OK + B1–B11), apêndice dos 247 arquivos órfãos de `src/` e uma auditoria em 3 partes (reexecução de provas, 29 categorias novas X1–X29, linhas sem prova).

## Arquivo × achado × evidência

| arquivo | status mecânico | achado | evidência |
|---|---|---|---|
| `docs/prod-readiness.md` | BOTH_CHANGED / CONFLICT, 665 linhas "missing_in_main" | **Já está na main, byte a byte** — o commit `cb6576b2a` (pacote #3035, 13/11) criou o arquivo com exatamente este conteúdo | `git show cb6576b2a:docs/prod-readiness.md` e `git show origin/claude/chore-prod-readiness-261112-1421:docs/prod-readiness.md` → **md5 idêntico `0c564f990661cc7b4e7e01675b475142`**, `cmp` sem diferença, 1100 linhas em ambos |

### Por que o mecânico apontou 665 linhas
A `main` **atual** (`ab657aa34`) tem a versão sucessora do mesmo arquivo, com 1857 linhas, reescrita por PRs posteriores:
```
b24e31500 2026-11-14 chore: pacote 7 (#3123)
41853318c 2026-11-14 chore(pacote): pacote 6 (#3113)
88f50d0d3 2026-11-14 docs(prod-readiness): fechamento (#3066)
e50daef6a 2026-11-14 docs(prod-readiness): fechamento — pacote 2 (#3061)
cb6576b2a 2026-11-13 Pacote: 20 PRs (#3035)   <-- criou o arquivo = conteúdo desta branch
```
As 665 linhas são **medições velhas** (frame `81f67b0db`) que as rodadas seguintes atualizaram no mesmo arquivo. Nada foi descartado:

- Seções 1–5 da branch estão na `main` **na íntegra**, em `## 18. Trazido da #3061 — íntegra das seções 1–5…` (`main.md:1661-1774`). Diferenças são só de status: `fila de merge` → `mergeada (<sha>)`; placares `85/79/6` → `85/84/1` e `29/23/6` → `29/25/4`.
- Inventários: **100% dos itens da branch aparecem na versão da main** — 18/18 rotas URL, 55/55 vistas `?view=`, 94/94 edges, 24/24 workflows, 224/224 relações do schema `public` (a main agrupa em `### B1b … agrupado por estado idêntico` + `B1c`, soma 224 e nomeia cada relação com a contagem de policies). Conferido por varredura de nomes: 0 ausentes em cada categoria.
- `Parte 2 — categorias que não estavam inventariadas` (X1–X29): a main diz textualmente em `## 14. Extras…` → "**X1–X29 do relatório anterior reexecutados**; X30–X33 novos; X34–X39 acrescentados na auditoria. Nenhum item removido" (45 itens no fechamento).
- `Sem pela metade`: itens 1–15 e B1–B11 da branch estão na `## 13.` da main, com promoções rastreadas ("Promovidos vs. relatório anterior (BLOQUEADO → OK): **B2, B3, B7, B8, B9** (todos via #3035)") e novos B12–B16.
- Apêndice de órfãos: branch 247 → main 238 (`## 13.1`). Os 9 que saíram são exatamente os arquivos do relatório Talk X (`src/components/talkx/report/*`, `src/lib/talkxCsv.ts`, `src/lib/talkxReportPdf.ts`) + `src/hooks/integrations/useKnowledgeBaseSearch.ts`, que deixaram de ser inalcançáveis quando o #3035 ligou o relatório (item 19 da seção 13 da main). A lista da main é a correta/atual.
- `Parte 1` (reexecução de provas) e `Parte 3` (linhas sem prova) apontam para arquivos `inv-*.md` de scratchpad que **nunca existiram no repo** (`git ls-tree -r --name-only origin/main | grep inv-` → vazio); o efeito delas já foi aplicado no próprio arquivo (commit `d755120bf`) e a main tem `### Auditoria` por seção + `## 15. Crítica de completude`.
- Achados de negócio e bloqueios do dono da branch continuam na main: QR do `PRINCIPAL`, Gmail `invalid_grant`, `SIP_PASSWORD`/`get-sip-password` 503, `crm_sync_outbox_url` no Vault, crédito OpenRouter/ElevenLabs, 2466 `permission denied for table whatsapp_connections`/dia, `multiplix-audience` 502, ruído de `localhost:5173` e `snapshot_reader` — todos com ocorrências no `docs/prod-readiness.md` da main (grep: 16, 5, 21/31, 8, 8, 5, 18, 6, 5 hits).

## Veredito
**INCORPORADA** (confiança alta). Sem migration, workflow, `src/` ou edge (counts do item: 0 em todos). O comentário de fechamento da #3022 ("incorporado e mergeado pelo pacote #3035, squash `cb6576b2a`") está **confirmado por md5**.

## Lacunas a recuperar
Nenhuma.

## Branch
`apagar_branch_seguro = true` — conteúdo idêntico ao que está na main desde `cb6576b2a`.

## Verificação adversarial

Papel: refutar a triagem (INCORPORADA). **Não consegui refutar — concordo.** Nenhum hunk de valor ≥ médio ficou fora da main.

### Prova decisiva: o conteúdo da branch é um ancestral da main
- `git merge-base --is-ancestor cb6576b2a origin/main` → exit 0 (`cb6576b2a` está na main).
- `git show origin/claude/chore-prod-readiness-261112-1421:docs/prod-readiness.md | md5sum` e `git show cb6576b2a:docs/prod-readiness.md | md5sum` → ambos `0c564f990661cc7b4e7e01675b475142`, 1100 linhas. Byte a byte igual.
- `git diff --stat 7bdbe2e3f origin/claude/chore-prod-readiness-261112-1421` → `docs/prod-readiness.md | 1100 +++`, 1 arquivo, 0 deleções. PR #3022 pela API: `changed_files: 1`, `additions: 1100`, `deletions: 0`, `state: closed`, `merged: false` (o conteúdo entrou pelo squash `cb6576b2a` do pacote #3035).
- Ou seja: o arquivo da branch **foi** a main em `cb6576b2a`. Nada se perdeu no merge; a questão passa a ser se as rodadas seguintes removeram valor.

### Histórico depois do merge (main hoje: `dac285f62`, arquivo com 1857 linhas, md5 `b39eb00185048be2cd8245a98261e309`)
`git log --oneline --follow origin/main -- docs/prod-readiness.md`: `cb6576b2a` (#3035) criou → `e50daef6a` (#3061) → `88f50d0d3` (#3066) → `41853318c` (#3113) → `b24e31500` (#3123).

### Varredura de cobertura (identificadores da branch × versão da main) — 0 ausências reais
Extraí a 1ª coluna de cada tabela de inventário da branch e testei cada valor com `grep -F` contra `origin/main:docs/prod-readiness.md`:

| categoria | itens testados | ausentes na main |
|---|---|---|
| Rotas URL (branch:99-119) | 18 + cabeçalho | 0 |
| Vistas `?view=` (branch:122-181) | 55 + cabeçalho | 0 |
| Edge functions (branch:224-321) | 94 + cabeçalho | 0 |
| Relações schema `public` (branch:369-597) | 224 + cabeçalho | 0 |
| Workflows (branch:608-648) | 29 + cabeçalho | 3 "ausentes" → **todos falsos positivos** (ver abaixo) |

Os 3 falsos positivos são a mesma linha com rótulo reescrito e prova **reexecutada** (mais fresca) na main:
- branch:624 `db-live-guard.yml (última execução)` → main:847 `db-live-guard.yml (DB Live Guard) — última execução` (mesmo run `42678012070`).
- branch:625 `db-live-guard.yml (agendamento semanal)` → main:848 (BLOQUEADO, reexecutado 22:55Z) + main:199 (§5.2 B3.11) + main:256 (§4) + main:744.
- branch:639 `dynamic/copilot-pull-request-reviewer` → main:861 `dynamic/agents/copilot-pull-request-reviewer (Copilot)`.

### Seções 1–5 da branch: íntegra na main
`origin/main:docs/prod-readiness.md:1661-1774` (`## 18. Trazido da #3061 — íntegra das seções 1–5...`). Conferi a tabela de §2 lado a lado: as 8 categorias e os totais (85 / 94 / 9 / 29 / 15 / 12 / 26 / 29) são idênticos; só os placares mudaram **para melhor** (Telas e rotas 79/6 → 84/1; GitHub Actions 23/6 → 25/4) e os estados de PR de `fila de merge` → `mergeada (<sha>)`. §3/§4/§5 da branch também estão lá (main:1696-1756), mais `## 19. Trazido da #3066`.

### Extras X1–X29: todos na main, com substância (não só o rótulo)
`grep -oE 'X[0-9]+\.'` → branch tem X1..X29; main tem **X1..X45**. Testei as strings de prova, não o rótulo: `GMAIL_OIDC_AUDIENCE` (branch 3× / main 9×), `TALKX_CONVERT_SECRET` (3/26), `ELEVENLABS_AGENT_ID` (3/12), `crm_sync_outbox_url` (3/8), `WHATSAPP_APP_SECRET` (2/10), `SERVICE_WORKER_ENABLED` (1/1), `disable_signup` (1/3), `rate_limit_email` (1/2), `audio-memes` (3/7), `realtime.messages` (1/3), `pgmq` (1/2), `zappwebv2-juca1` (1/5). X14 na main (`:1479`) e X16 (`:1481`) estão reexecutados com números atualizados (X14: 53 nomes / 26 sem secret, vs 56 / 28 na branch).

### Apêndice de órfãos 247 → 238: não é perda, é ganho
Os 9 que saíram da lista: `src/components/talkx/report/{TalkXCampaignReport,TalkXReportFunnel,TalkXReportHeatmap,TalkXReportPerformance}.tsx`, `.../talkxReportCharts.ts`, `.../talkxReportData.ts`, `src/hooks/integrations/useKnowledgeBaseSearch.ts`, `src/lib/talkxCsv.ts`, `src/lib/talkxReportPdf.ts`. Os 9 **continuam existindo** na main (`git cat-file -e origin/main:<arquivo>` → 0 nos 9) e saíram do apêndice porque passaram a ser **alcançáveis**: `git grep -l 'TalkXCampaignReport\|useKnowledgeBaseSearch' origin/main -- 'src/*'` → importados por `src/components/talkx/TalkXView.tsx` e `src/components/inbox/KnowledgeBaseSearchPanel.tsx` / `src/hooks/integrations/index.ts`. A própria main documenta: `docs/prod-readiness.md:1215` — "Vs. relatório anterior (247): saíram 9, todos agora alcançados (relatório Talk X via `TalkXView.tsx:55` e `useKnowledgeBaseSearch`); nenhum novo."

### O que de fato só existe na branch (684 linhas por `grep -vxF`) — valor abaixo de médio
Duas classes, nenhuma portável:
1. **Medições velhas substituídas.** Cabeçalhos ancorados em `main @ 81f67b0db` / `cfa8959b9`, placares de PR `fila de merge`, bundle `/assets/index-CFJIkylk.js` (que a própria branch já marca como HTTP 404 em branch:1019), ledger 1105 migrations (main: 1129, `:734`). A main reancora tudo em `a49ef4ad5`/`ab657aa34` com auditoria por seção + "Adendo da crítica de completude".
2. **Meta-crítica de arquivos de rascunho que não existem mais.** A "Parte 3" (branch:1082-1106) aponta problemas em `inv-producao.md:16`, `inv-rotas.md:7`, `inv-workflows.md:21` etc. — arquivos intermediários de `/tmp` daquela sessão, não do repo. A main substitui isso por `## 15. Crítica de completude` (`:1543-1615`) com tabela de lacunas sobre o arquivo consolidado.

### Veredito
`concorda = true` · `veredito_final = INCORPORADA` · `apagar_branch_seguro = true`. A branch não tem commit meu nesta sessão; só leitura foi usada (`show`, `diff`, `log`, `ls-tree`, `cat-file -e`, `grep`, `merge-base --is-ancestor`). Nenhum arquivo do repo foi alterado.
