# Dossiê — claude/feat-talkx-relatorio-concluida-261112-1158 (PR #3009)

**Propósito**: Talk X — campanha `completed` abre o Relatório (tela 14, `?screen=report`) com exportação CSV/PDF em vez do monitor; deep link `?screen=report` resistente a lista em erro; cancelada segue no monitor.
Commits (`cca5655b8..331ceb96f`): `b9949feec feat(talkx)`, `8f220d68b test(talkx)`, `43964db48 merge main`, `331ceb96f fix(talkx) relatório com PDF, CSV e deep link`.
Fechamento alegado: incorporada pelo pacote #3035 (squash `cb6576b2a`) — **confirmado** (`git log origin/main` linha 41: `cb6576b2a Pacote: 20 PRs aprovadas integradas num único merge (#3035)`).

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado |
|---|---|---|
| `src/components/talkx/TalkXView.tsx` | PRESENT_REVERSE_APPLIES | Já na main (prova mecânica). |
| `src/components/talkx/talkxRoute.ts`, `report/TalkXCampaignReport.tsx`, `report/__tests__/TalkXCampaignReport.test.tsx`, `src/lib/talkxCsv.ts`, `src/lib/__tests__/talkxCsv.test.ts`, `__tests__/talkxRoute.test.ts`, `e2e/talkx-visual.spec.ts`, `scripts/ui-audit/view-container-padding.unit.mjs`, `docs/talkx/ARQUITETURA.md` | IDENTICAL_TO_MAIN | Idênticos à main. |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx` | CONFLICT (0 linhas faltando; 3 "removidas ainda na main") | As 3 linhas (`afterEach(() => vi.clearAllMocks())`, `waitFor(...has('screen')).toBe(false)`, `findByRole('Abrir novo wizard')`) são genéricas e existem em **outros** describes da main (linhas 101/304/432/484/664; 620; 368/377/612/621…). O bloco substituído ("TL-152 normaliza ?screen=report sem abrir outra tela") **não existe mais na main** (`git grep "sem tela própria\|finalizada cai no monitor" origin/main` → vazio). Os blocos da branch estão na main: `describe('TalkXView ?screen=report abre o relatório (X163)')` linha 558 (com `f.isError`, linhas 7/15/569/627), `it('sem screen, finalizada abre o relatório')` linha 687, `it('sem screen, cancelada segue no monitor em leitura')` linha 694. → **INCORPORADA**. |
| `docs/talkx/ESTADOS.md` | CONFLICT (1 linha faltando) | Branch: `TalkXView.tsx \| — \| 61, 478 \| — \| — \| 622`. Main (linha 37): `61, 491 \| … \| 639`. Tabela gerada de números de linha; a main está mais nova (último toque `6423dc237` 2026-11-14) e os números da main apontam para o código certo (`TalkXView.tsx:61` e `:491` = `<TalkXSkeletonRows>`, `:639` = `<TalkXWhatsAppDisconnectedState>`). Valores da branch estão desatualizados. → **OBSOLETA/ruído**, valor nenhum. |

## Veredito
**INCORPORADA** — confiança alta. Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. Resultado: **não refutado — concordo**. `origin/main` em `dac285f62`, merge-base `cca5655b8`, tip `331ceb96f`.

### 1. Blobs idênticos (9 de 12 arquivos)
`git rev-parse <ref>:<arquivo>` compara hash de blob — igualdade byte a byte, não heurística:

| arquivo | branch == main |
|---|---|
| `docs/talkx/ARQUITETURA.md` | IDÊNTICO |
| `e2e/talkx-visual.spec.ts` | IDÊNTICO |
| `scripts/ui-audit/view-container-padding.unit.mjs` | IDÊNTICO |
| `src/components/talkx/__tests__/talkxRoute.test.ts` | IDÊNTICO |
| `src/components/talkx/report/TalkXCampaignReport.tsx` | IDÊNTICO |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | IDÊNTICO |
| `src/components/talkx/talkxRoute.ts` | IDÊNTICO |
| `src/lib/__tests__/talkxCsv.test.ts` | IDÊNTICO |
| `src/lib/talkxCsv.ts` | IDÊNTICO |

### 2. `src/components/talkx/TalkXView.tsx` — hunk por hunk na main
O diff tem 10 hunks. Cada um conferido em `git show origin/main:src/components/talkx/TalkXView.tsx`:

- import lazy de `TalkXCampaignReport` → main:55
- `TalkXTopView` com `'report'` → main:66
- `useState reportCampaignId` → main:113
- guarda `screen === 'report' && !campaign` → main:175
- `case 'report': setReportCampaignId(campaignId)` → main:188
- `setTopView(... || screen === 'report' ? screen : 'monitor')` → main:191
- `awaitingReportList = isError && initialScreen.route?.screen === 'report'` + guarda → main:228-229; deps `[isError, isLoading, syncFromBrowserHistory]` → main:235
- `openReport` → main:311
- `backToList` com `setReportCampaignId(null)` → main:313-315
- `if (c.status === 'completed') { openReport(c); return; }` + deps com `openReport` → main:388/390
- bloco de render `reportCampaign` + `SectionErrorBoundary sectionName="Relatório da campanha"` + `onViewMonitor` → main:446-458
- comentário reescrito "`?screen=` inválido (fora de SCREENS em talkxRoute.ts)" → main:143

Dependência de contexto também existe na main: `isError` é exposto por `src/hooks/integrations/useTalkX.ts:556` e desestruturado em `TalkXView.tsx:86`. Nada do hunk ficou órfão.

### 3. `src/components/talkx/__tests__/TalkXView.route.test.tsx`
Os 62 adds estão na main: mock de `report` (main:76-77), `f.isError` (main:7/15/569/627), `describe('TalkXView ?screen=report abre o relatório (X163)')` (main:558) com os 6 `it` (main:571/578/591/~605/616/625), `it('sem screen, finalizada abre o relatório')` (main:687), `it('sem screen, cancelada segue no monitor em leitura')` (main:694). As 3 linhas "removidas ainda na main" são boilerplate repetido em outros describes — a remoção era local ao bloco antigo, que de fato saiu da main. Nenhum ganho perdido.

### 4. `docs/talkx/ESTADOS.md`
Único "faltando" é a linha da tabela de números de linha. Main (`:37`) traz `61, 491 … 639`, posterior e correta para o `TalkXView.tsx` atual; a branch traz `61, 478 … 622`, obsoleta. Aplicar a linha da branch **degradaria** a doc. Valor negativo, não lacuna.

### 5. Procedência
`cb6576b2a` ("Pacote: 20 PRs aprovadas integradas num único merge (#3035)") toca exatamente `TalkXView.tsx` (+48/-10 na soma com os outros dois), `report/TalkXCampaignReport.tsx` e `src/lib/talkxCsv.ts` — bate com o diffstat da branch. O comentário de fechamento da PR #3009 confere com o código.

### Parecer
`concorda = true` · `veredito_final = INCORPORADA` · `apagar_branch_seguro = true`. Nenhum hunk de valor ≥ médio fora da main; o único resíduo é ruído de doc desatualizada.
