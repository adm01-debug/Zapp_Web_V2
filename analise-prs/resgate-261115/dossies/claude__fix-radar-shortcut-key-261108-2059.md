# Dossiê — claude__fix-radar-shortcut-key-261108-2059 (PR #2837, fechada 2026-11-11)

**Ref:** `origin/claude/fix-radar-shortcut-key-261108-2059` · tip `3b36017` · merge-base `e6e467b` (2026-11-08) · 2 commits.

## Propósito
1. `5e3e828 fix(shortcuts)`: registra `radar-toggle` (Ctrl+Shift+A, categoria chat) em `DEFAULT_SHORTCUTS` e em `SHORTCUTS_SOMENTE_INFORMATIVOS` (sem executor). O título diz "corrige 'R' → 'a'", mas no merge-base a entrada não existia: o diff só adiciona 3 linhas.
2. `3b36017 test(talkx)`: `TalkXCampaignReport.test.tsx` no merge-base tinha só mocks (sem `describe`/`it` → "No test suite found" na CI); a branch acrescenta 3 testes (série diária, heatmap 7x24, render da tela com Resumo + 3 gráficos, sem série "Conversões").

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/shortcuts/defaultShortcuts.ts` (+3) | **OBSOLETA.** `radar-toggle` nunca existiu na main (`git grep radar-toggle origin/main` vazio; `git log -S'radar-toggle' origin/main -- src` vazio). O RADAR que entrou na main (#2828) implementa o toggle por listener próprio em **Ctrl+Shift+L**: `src/components/inbox/copilot/RadarPanel.tsx:129-135` (`e.ctrlKey && e.shiftKey && tecla.toLowerCase() === 'l'`), rodapé `RadarPanel.tsx:457` ("Ctrl+Shift+L: abrir/fechar"), teste `src/components/inbox/copilot/__tests__/RadarLive.test.tsx:96-100`. A entrada da branch seria informativa-apenas (sem executor em `criarAcoesGlobais`, oculta da ajuda por `listarAtalhosEditaveis`) e anunciaria Ctrl+Shift+A, contradizendo a tecla real. A pendência "decidir um só atalho e registrá-lo" já está rastreada em issue #2967 item 4. | ver citações |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` (+88/-27) | **INCORPORADA por abordagem equivalente (superset).** Main `568d3f932` (2026-11-09, "12 testes reais para TalkXCampaignReport e talkxReportData") cobre a mesma intenção X164: série diária/horária (`origin/main:...test.tsx:65-106`), heatmap 7x24 inclusive `[0][7]` segunda (`:107-123`), render com 3 cartões e `hasConversionSource=false` (`:187-215`), mais exportação CSV/PDF (mocks `talkxReportPdf`, `:15-20`). Branch tem 3 testes; main 12 — mergear regrediria (apontado em #2967). Diferenças da branch sem equivalente exato na main: asserção do heatmap em domingo `grid[6][9]` e do nome do responsável via `creators` ("Fulana de Tal", `TalkXCampaignReport.tsx:327`). Valor baixo. | `git log origin/main -- <arquivo>` |

## Veredito
**OBSOLETA** · confiança alta · `apagar_branch_seguro = true` (head também preservado em `refs/pull/2837/head`).

## Lacunas (opcional, valor baixo — só se alguém for retomar #2967 item 4)
- Atalho RADAR: não portar a entrada desta branch tal como está (Ctrl+Shift+A sem executor contradiz Ctrl+Shift+L de `RadarPanel.tsx:133`). Se registrar no registry, mover a lógica do listener do `RadarPanel` para uma ação em `criarAcoesGlobais` (`src/hooks/ui/useGlobalKeyboardShortcuts.ts`) ou manter em `SHORTCUTS_SOMENTE_INFORMATIVOS` com a tecla real — `atalhosSemExecutor.test.ts` cobra a consistência.
- Hunk da branch (referência):
```ts
// defaultShortcuts.ts, após 'audio-toggle-mute'
// CV-056 — painel flutuante RADAR Fase 6
{ id: 'radar-toggle', name: 'Painel RADAR', description: 'Abre ou fecha o painel RADAR de análise de vendas', defaultKey: 'a', defaultModifiers: { ctrlKey: true, shiftKey: true }, category: 'chat' },
// SHORTCUTS_SOMENTE_INFORMATIVOS, após 'attach-file'
'radar-toggle',
```
- Teste extra opcional para somar aos 12 da main (domingo → linha 6; responsável via `creators`):
```ts
const grid = talkxReportHeatmapFromTimestamps(['2026-10-05T12:00:00.000Z','2026-10-06T12:00:00.000Z','2026-10-11T12:00:00.000Z'], 'America/Sao_Paulo');
expect(grid[0][9]).toBe(1); expect(grid[1][9]).toBe(1); expect(grid[6][9]).toBe(1);
// render com creators={{ u1: 'Fulana de Tal' }} e campaign.owner='u1' → screen.getByText('Fulana de Tal')
```

## Verificação adversarial

**Concordo com OBSOLETA** · `apagar_branch_seguro = true`. Tentei refutar hunk por hunk; nada de valor ≥ médio sobrou.

Diff real conferido: `git diff e6e467b 3b36017 --stat` → só 2 arquivos (`defaultShortcuts.ts` +3; `TalkXCampaignReport.test.tsx` +91/-27). Commits `5e3e828` e `3b36017`.

1. `src/hooks/shortcuts/defaultShortcuts.ts` (+3) — **sem valor, não só obsoleto.**
   - `git grep -n radar-toggle origin/main` → vazio; `git log -S'radar-toggle' --oneline origin/main -- src` → vazio. A entrada nunca existiu na main (o título "corrige defaultKey" é falso).
   - Tecla real da main: `origin/main:src/components/inbox/copilot/RadarPanel.tsx:133` (`e.ctrlKey && e.shiftKey && tecla.toLowerCase() === 'l'`), rodapé `:457` ("Ctrl+Shift+L: abrir/fechar"), teste `__tests__/RadarLive.test.tsx:96` (`fireEvent.keyDown(document, { key: 'L', ctrlKey: true, shiftKey: true })` → `onToggleCollapsed`). A branch anunciaria **Ctrl+Shift+A** — contradiz a implementação.
   - Novo (não estava na triagem): a entrada também entra em `SHORTCUTS_SOMENTE_INFORMATIVOS`, e `listarAtalhosEditaveis` (`defaultShortcuts.ts:115-116`) a remove de **todas** as telas que listam atalhos (`KeyboardShortcutsDialog.tsx:151`, `KeyboardShortcutsSettings.tsx:207`, `KeyboardShortcutsHelp.tsx:23`, `InboxEmptyChat.tsx:71`). Resultado: zero efeito de UI e zero executor — dado morto, nem informativo.
   - Verifiquei se mergear quebraria CI: `atalhosSemExecutor.test.ts:22-32` deriva `SEM_EXECUTOR` dinamicamente de `criarAcoesGlobais()`, então a dupla inclusão passaria no teste. Ou seja, o hunk não quebra nada **nem faz nada** — confirma que não há o que resgatar.

2. `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` — **main é superset; mergear regrediria.**
   - Branch: 3 `it`. Main (`origin/main`, 215 linhas, via `568d3f932` 2026-11-09 + `cb6576b2a`): **13 `it`** — série day (`:72`, `:84`), granularidade hour (`:99`), heatmap vazio (`:109`) e `[0][7]` (`:115`), nulls (`:119`), título (`:168`), nome (`:172`), 3 cartões (`:176`), `data-has-conversion=false` (`:189`), falha de PDF (`:201`).
   - Únicas asserções sem equivalente na main (confirmei por grep: main não tem `creators`, `Fulana`, nem `grid[6]`): `grid[1][9]`/`grid[6][9]` + células zeradas (`branch:100-101`) e `screen.getByText('Fulana de Tal')` com `creators={{ u1: 'Fulana de Tal' }}` (`branch:85,120`). São 2 asserções sobre funções já cobertas — valor **baixo**, não médio; não muda o veredito.

3. Segurança de apagar: `git ls-remote origin` → `refs/pull/2837/head` = `3b36017477123676805250c1b09ac8363b6a38ed` (mesmo tip da branch). Conteúdo preservado fora da branch.

Nenhuma lacuna nova de valor ≥ médio. Veredito final: **OBSOLETA**.
