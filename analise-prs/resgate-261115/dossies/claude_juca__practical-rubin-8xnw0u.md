# claude_juca/practical-rubin-8xnw0u — triagem

- ref: `origin/claude_juca/practical-rubin-8xnw0u` · tip `652c56961` · merge_base `1252bb5a4` (18 commits, 2026-11-01→02)
- PRs: nenhuma. Pré-classificação mecânica: MISTO_CONFLITO (28 arquivos com lacuna).
- **Veredito: PERDIDA_PARCIAL** · `apagar_branch_seguro = false`

## Propósito
Lote de etapas do plano Talk X V4: X048 (estado de permissão + painel de status dos serviços),
X053 (trilha no cabeçalho/Monitor), X054 (busca ⌘K no cabeçalho), X081 (ações em massa na lista de
campanhas), X082 (dica do dia rotativa), X092/X093 (importar/exportar templates em CSV/JSON),
X168 (exportar relatório de campanha em CSV/PDF) + testes e o ledger `P046.json`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/talkx/TalkXView.tsx` (X053/X054) | **INCORPORADO em forma melhor** | main `TalkXView.tsx:535` usa `ModuleBreadcrumb ... onItemClick={(i)=>{if(i===1) backToList();}}`; `primitives.tsx:57` dá `aria-label="Voltar à campanhas"` ao item clicável com `h-9 hover:bg-muted/50` → cobre o botão solto que a branch removia e o teste `TalkXView.route.test.tsx:313` da main continua válido. ⌘K: main `TalkXView.tsx:330,574-576` (`openCommandPalette`, `aria-label="Buscar (⌘K)"`). |
| `src/hooks/integrations/useTalkXCommandItems.ts` (X054) | **INCORPORADO** | main linhas 13-17: `STATUS_LABEL` já canônico com `sending: 'Em andamento'` (sem `running`). Teste coberto em `src/hooks/integrations/__tests__/useTalkXCommandItems.test.ts:12-28`. |
| `src/lib/talkxCsv.ts`, `src/lib/talkxReportPdf.ts`, `report/TalkXCampaignReport.tsx`, `src/lib/__tests__/talkxCsv.test.ts`, `report/__tests__/TalkXCampaignReportExport.test.tsx` (X168) | **OBSOLETO — superado** | main implementa a mesma necessidade por X164/TL-080: `src/lib/talkxCsv.ts:1` (`buildTalkXCampaignCsvBlob`), `src/lib/talkxReportPdf.ts:1` (`buildTalkXCampaignPdfBlob`, jsPDF dinâmico) e `report/TalkXCampaignReport.tsx:9-10,112,220-235` (CSV **e** PDF via `downloadFileWithPermission` com gate `useDownloadPermission`). A versão da branch é inferior (exporta `nome`/`telefone` vazios, só CSV). Não portar. |
| `src/components/talkx/__tests__/ActiveCampaignIndicator.test.tsx`, `__tests__/ModuleHeader.test.tsx` | **INCORPORADO (movidos)** | main tem as provas em `kit/__tests__/ActiveCampaignIndicator.test.tsx` e `kit/__tests__/ModuleHeader.test.tsx`, mais completas (ordenação por `started_at`, contrato do `nav`). |
| `src/pages/ViewRouter.tsx` (X048) | **PARCIAL** | main `ViewRouter.tsx:141-143` já desvia `talkx` para `<TalkXNoPermissionState />`, mas **sem** `onContactAdmin` → o botão "Falar com o administrador" nunca aparece (`kit/states.tsx:193-209` só renderiza o botão quando a prop existe). Lacuna: 1 linha. |
| `src/components/talkx/kit/states.tsx` (X048) | **PERDIDO** | `42501` não existe em `kit/states.tsx` da main (`git grep 42501 origin/main -- src` só acha `src/__tests__/rls-boundary.test.ts` e um comentário em `admin/SearchInsightsView.tsx`). RLS negada no Talk X ainda cai no erro genérico. |
| `src/components/talkx/kit/ServiceStatusSheet.tsx` + `talkxShared.ts` (X048) | **PERDIDO, mas a branch deixou pela metade** | arquivo novo (92 linhas), ausente da main; **nenhum consumidor** nem na própria branch (só `talkxShared.ts:15` reexporta). O gatilho já está na main: `kit/states.tsx:175` `{onViewStatus && <GhostButton…>Ver status dos serviços</GhostButton>}`, e **ninguém passa `onViewStatus`** na main (`git grep onViewStatus origin/main -- src` → só states.tsx e o teste). Para ficar pronto: renderizar o Sheet no `TalkXView`/telas que usam `TalkXCrmUnavailableState` e passar `onViewStatus`. |
| `src/components/talkx/TalkXOverview.tsx` (X081 massa + X082 dica) | **PERDIDO** | main `TalkXOverview.tsx:453-455,466`: três `RailAction` e `TipCard` com texto fixo; nenhum `TalkXBulkBar` na Visão geral (o componente existe em `kit/table.tsx:76` e já é usado em `TalkXSegments.tsx:475` e `TalkXSuppression.tsx:598`, só a lista de campanhas ficou sem). `TIPS`/`tipOffset` inexistentes na main. |
| `src/components/talkx/kit/constants.ts` (X082) | **PERDIDO** | `TIPS` ausente na main (`git grep TIPS origin/main -- src` → só `CATALOG_RAIL_TIPS`, `TOUR_TIPS` do Catálogo). |
| `src/components/talkx/kit/rail.tsx` (X082) | **PERDIDO** | main `rail.tsx:101` `TipCard({ tip })` sem `onNext`/seta "›". |
| `src/components/talkx/talkxTemplateFile.ts`, `TalkXTemplateImportDialog.tsx`, `TalkXTemplates.tsx` (X092/X093) | **PERDIDO (feature inteira)** | nenhum dos dois arquivos existe na main (`git ls-tree origin/main`), nem referência (`git grep talkxTemplateFile/TalkXTemplateImportDialog origin/main -- src` → vazio). Na branch está ponta a ponta: entrada na UI (barra de filtros + Ações rápidas, gated por `canDownload`), dialog com prévia/erros por linha, parse CSV+JSON com limites (500 linhas / 2 MB), conflito por nome (pular/sobrescrever/cópia) e persistência pelo hook existente `createTemplate`. |
| `__tests__/TalkXOverview.bulk.test.tsx`, `__tests__/TalkXOverview.rail.test.tsx`, `__tests__/TalkXTemplateImportDialog.test.tsx`, `__tests__/talkxTemplateFile.test.ts`, `__tests__/TalkXTemplatesRail.test.tsx` (hunk), `src/pages/__tests__/ViewRouter.talkx-permission.test.tsx` | **PERDIDO (acompanham as lacunas acima)** | ausentes na main; `ViewRouter.talkx-permission.test.tsx` tem 3 casos — 2 passam na main hoje, o caso "Falar com o administrador → team-chat" exige o hunk do ViewRouter. |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx`, `report/__tests__/TalkXCampaignReport.test.tsx` | **OBSOLETO** | ajustes para a implementação da branch (remoção do botão solto / mock de `useDownloadPermission` com `canDownload:false`); a main já tem os testes equivalentes ajustados à sua própria implementação. |
| `docs/reconciliation/tasks/P046.json` | **NÃO PORTAR** | ledger de reconciliação reescrito/pretty-printed (16.733 linhas) marcando 137 etapas como `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE`; a main tem 28 (`plan.status_counts`). Aplicar na main gravaria status falso para código que não está lá. Valor: nenhum. |

## Lacunas a recuperar (ordem de valor)

### 1. X093/X092 — importar/exportar templates (CSV/JSON) — valor médio
Portar na íntegra, são arquivos novos (não há conflito):
```
git show 652c56961:src/components/talkx/talkxTemplateFile.ts            > src/components/talkx/talkxTemplateFile.ts
git show 652c56961:src/components/talkx/TalkXTemplateImportDialog.tsx   > src/components/talkx/TalkXTemplateImportDialog.tsx
git show 652c56961:src/components/talkx/__tests__/talkxTemplateFile.test.ts
git show 652c56961:src/components/talkx/__tests__/TalkXTemplateImportDialog.test.tsx
```
API de `talkxTemplateFile.ts`: `TEMPLATE_FILE_MAX_BYTES` (2 MB), `TEMPLATE_FILE_MAX_ROWS` (500),
`parseTemplateFile()`, `serializeTemplatesToCsv()`, `serializeTemplatesToJson()`, `downloadTemplateFile()`,
tipos `TemplateImportRow`/`ConflictAction`/`ParsedTemplateRow`/`ParseResult`.
Dialog: `<TalkXTemplateImportDialog existingTemplates onImport onClose />`.
Fiação em `TalkXTemplates.tsx` (hunks exatos em `git diff 1252bb5a4 652c56961 -- src/components/talkx/TalkXTemplates.tsx`):
imports (`Download, Upload`, `useDownloadPermission`, dialog, helpers), `const [showImport, setShowImport] = useState(false)`,
`handleExportCsv`/`handleExportJson`/`handleImport` (usa `createTemplate.mutateAsync` + `refetch`),
`rightSlot` da `FilterBarV2` com os botões CSV/JSON/Importar sob `canDownload`, `RailAction` "Importar templates"
e o render condicional do dialog. Teste de fiação: hunk de `__tests__/TalkXTemplatesRail.test.tsx`
(mock de `useDownloadPermission` + caso "Importar templates abre o dialog").
Nota: o CSV da branch duplica o escape de `talkxCsv.ts` da main — ao portar, vale reaproveitar o `esc` já existente.

### 2. X081 — ações em massa na lista de campanhas — valor médio
`src/components/talkx/TalkXOverview.tsx` (usa `TalkXBulkBar` que já está em `kit/table.tsx:76`):
```tsx
// import: + TalkXBulkBar  (de './talkxShared')
const selectedList = useMemo(() => campaigns.filter((c) => selected.has(c.id)), [campaigns, selected]);
const pauseEligible  = selectedList.filter((c) => c.status === 'sending');
const cancelEligible = selectedList.filter((c) => c.status === 'sending' || c.status === 'paused' || c.status === 'scheduled');
const deleteEligible = selectedList.filter((c) => c.status === 'draft' || c.status === 'cancelled');
const bulkLabel = (count: number, label: string) => count > 0 ? `${label} (${count} de ${selected.size})` : label;
// depois da FilterBarV2, antes da <section> da tabela:
{selected.size > 0 && (
  <TalkXBulkBar count={selected.size} onClear={() => setSelected(new Set())} actions={<>
    <button type="button" disabled={pauseEligible.length === 0}
      onClick={() => pauseEligible.forEach((c) => rowActions.run('pause', c))}
      className="text-xs font-semibold text-foreground-secondary hover:text-foreground disabled:opacity-40 transition-colors">
      {bulkLabel(pauseEligible.length, 'Pausar')}</button>
    <button type="button" disabled={cancelEligible.length === 0}
      onClick={() => cancelEligible.forEach((c) => rowActions.run('cancel', c))}
      className="text-xs font-semibold text-foreground-secondary hover:text-foreground disabled:opacity-40 transition-colors">
      {bulkLabel(cancelEligible.length, 'Cancelar')}</button>
    <button type="button" disabled={deleteEligible.length === 0}
      onClick={() => deleteEligible.forEach((c) => onDelete(c.id))}
      className="text-xs font-semibold text-destructive hover:text-destructive/80 disabled:opacity-40 transition-colors">
      {bulkLabel(deleteEligible.length, 'Excluir')}</button>
  </>} />
)}
```
Prova: `git show 652c56961:src/components/talkx/__tests__/TalkXOverview.bulk.test.tsx`.

### 3. X048 — RLS negada vira estado de permissão — valor médio (segurança/UX de erro)
`src/components/talkx/kit/states.tsx`, dentro de `TalkXQueryBoundary`, no bloco `if (query.isError)` (main linha ~355):
```tsx
if (query.isError) {
  const errCode = (query.error as { code?: string } | undefined)?.code;
  if (errCode === '42501') return <TalkXNoPermissionState />;
  return <TalkXErrorState entity={entity} error={query.error} onRetry={onRetry} />;
}
```
E em `src/pages/ViewRouter.tsx:141-143` (main já desvia a view `talkx`), completar com o botão:
```tsx
if (currentView === 'talkx') {
  return <TalkXNoPermissionState onContactAdmin={() => navigateToView('team-chat')} />;
}
// + import { navigateToView } from '@/hooks/system/useNavigationHistory';
```
Prova: `git show 652c56961:src/pages/__tests__/ViewRouter.talkx-permission.test.tsx` (3 casos).

### 4. X048 — painel "Status dos serviços" — valor médio, exige completar
`git show 652c56961:src/components/talkx/kit/ServiceStatusSheet.tsx` (92 linhas, Sheet lateral com 3 linhas:
WhatsApp / CRM 360 / Tempo real) + `export * from './kit/ServiceStatusSheet';` em `talkxShared.ts`.
**Falta (a branch não fez):** renderizar o Sheet e passar `onViewStatus` nos estados que o oferecem
(`TalkXCrmUnavailableState`/`TalkXWhatsAppDisconnectedState` em `kit/states.tsx:163-176`), com
`whatsappConnected` do `useTalkXServiceStatus` (já usado em `TalkXView.tsx:93`). Sem isso, é código morto.

### 5. X082 — dica do dia rotativa — valor baixo
`kit/constants.ts`: array `TIPS` com 10 dicas (`git show 652c56961:src/components/talkx/kit/constants.ts | tail -18`).
`kit/rail.tsx`: `TipCard({ tip, onNext })` + botão "›" `aria-label="Próxima dica"`.
`TalkXOverview.tsx`: `const [dayBase] = useState(() => Math.floor(Date.now()/86400000)); const [tipOffset,setTipOffset]=useState(0); const tipIndex=(dayBase+tipOffset)%TIPS.length;`
e `<TipCard tip={TIPS[tipIndex]} onNext={() => setTipOffset((o)=>(o+1)%TIPS.length)} />`.
Prova: `git show 652c56961:src/components/talkx/__tests__/TalkXOverview.rail.test.tsx`.
**Não portar junto** o `RailAction` "Importar contatos" do mesmo hunk: ele chama `onGoTab('contacts')`
que na branch cai em `goTab('segments')` (`TalkXView.tsx`), ou seja, rótulo que leva ao lugar errado.

## Não portar
`docs/reconciliation/tasks/P046.json`; `src/lib/talkxCsv.ts`, `src/lib/talkxReportPdf.ts`,
`report/TalkXCampaignReport.tsx` e os dois testes de export (X168, superado por X164/TL-080);
ajustes de `TalkXView.route.test.tsx` e `TalkXCampaignReport.test.tsx`;
`__tests__/ActiveCampaignIndicator.test.tsx` e `__tests__/ModuleHeader.test.tsx` (duplicariam os de `kit/__tests__/`).

## Verificação adversarial

Veredito mantido: **PERDIDA_PARCIAL**. Branch `origin/claude_juca/practical-rubin-8xnw0u`
(tip `652c56961`, merge-base `1252bb5a4`) conferida contra `origin/main` em `dac285f62`
(15/11/2026 03:16). Nenhum dos itens alegados como perdidos está na main; nenhum foi
removido de propósito (`git log -S` só devolve os commits de docs `dcb471bf8` e `2b4dac2d3`,
nada de revert/remove de código).

Provas de que a lacuna é real:
- X093 (import/export de templates): `git ls-tree origin/main -- src/components/talkx`
  não lista `talkxTemplateFile.ts` nem `TalkXTemplateImportDialog.tsx`; `git grep -n
  "talkxTemplateFile\|parseTemplateFile\|TalkXTemplateImportDialog" origin/main -- src`
  = 0 ocorrências; `git grep -n "Download\|Upload\|canDownload\|Export" origin/main --
  src/components/talkx/TalkXTemplates.tsx` = 0 ocorrências.
- X081 (ações em massa): `git grep -n "TalkXBulkBar" origin/main` só aparece em
  `kit/table.tsx:76` (definição), `TalkXSegments.tsx:475`, `TalkXSuppression.tsx:598` e
  `kit/__tests__/barrel.test.ts:81` — nunca em `TalkXOverview.tsx`. A main já mantém o
  estado de seleção (`TalkXOverview.tsx:92` `const [selected, setSelected]`, repassado em
  `:349-351` com `selectionResetKey`), então o hunk encaixa sem refactor.
- X082 (dica do dia): `git grep -n "TIPS" origin/main -- src/components/talkx` = 0;
  `origin/main:src/components/talkx/kit/rail.tsx` ainda tem `TipCard({ tip })` sem `onNext`.
- X048 (42501): `origin/main:src/components/talkx/kit/states.tsx:352-358` — o passo 2 do
  `TalkXQueryBoundary` cai direto em `TalkXErrorState` sem olhar `error.code`.
- X048 (botão na tela de permissão): `origin/main:src/pages/ViewRouter.tsx:143` renderiza
  `<TalkXNoPermissionState />` sem prop; o botão existe mas só sob `onContactAdmin`
  (`kit/states.tsx:207`), logo nunca aparece em produção.
- X048 (painel de serviços): `ServiceStatusSheet.tsx` não existe na main
  (`git grep -rn "ServiceStatusSheet" origin/main -- src` = 0).

Correções/nuances ao parecer da triagem (não mudam o veredito):
1. "o botão que o abre existe na main e não abre nada" é impreciso: em `origin/main` o
   botão "Ver status dos serviços" (`kit/states.tsx:175`) está sob `onViewStatus &&` e
   **nenhum** chamador passa a prop (`git grep -n "onViewStatus" origin/main -- src` só
   acha a definição e o teste `kit/__tests__/states.test.tsx:102-110`). Ou seja: na main o
   botão nem renderiza.
2. O `ServiceStatusSheet` também é **código morto na própria branch**: o único uso é o
   re-export em `talkxShared.ts:15`; ninguém monta o Sheet nem passa `onViewStatus`
   (conferido em `652c56961`). Portar o arquivo isolado não entrega o painel — precisa de
   fiação nova (estado `open` no `TalkXView` + `onViewStatus` nos estados de CRM/WhatsApp)
   para fechar como "funcionalidade pronta" (AGENTS: ponta a ponta).
3. X168 realmente superado: `origin/main:src/lib/talkxCsv.ts:1-11` e
   `src/lib/talkxReportPdf.ts:1-6` são a versão X164/TL-080, e
   `report/TalkXCampaignReport.tsx:9-11,112,220-235` já exporta CSV **e** PDF via
   `downloadFileWithPermission` + `useDownloadPermission`. A versão da branch exportava
   `nome: ''` / `telefone: ''` — inferior. Confirmado: não portar.
4. X053 realmente superior na main: `origin/main:TalkXView.tsx:535` tem
   `ModuleBreadcrumb ... onItemClick={(i) => { if (i === 1) backToList(); }}`, enquanto a
   branch (diff do `TalkXView.tsx`) **apaga** o botão "Voltar à campanhas" e não coloca
   `onItemClick` — a branch perdia o caminho de volta. Confirmado: não portar.
5. X054 incorporado: `origin/main:TalkXView.tsx:330,574-576` (`openCommandPalette`,
   `aria-label="Buscar (⌘K)"`). Rótulo `sending: 'Em andamento'` já em
   `origin/main:src/hooks/integrations/useTalkXCommandItems.ts:14-15`.

Encaixe no código atual (tudo que as lacunas usam existe na main):
`useTalkXTemplates.ts:35` (`TemplateInput`), `:101-102` e `:249` (`createTemplate` com
`mutateAsync`), `kit/constants.ts:63` (`TEMPLATE_CATEGORIES`), `kit/filters.tsx:37,157`
(`rightSlot` da FilterBarV2), `kit/table.tsx:76` (`TalkXBulkBar`), `src/components/ui/sheet.tsx`,
`src/hooks/system/useDownloadPermission.ts`.

Branch **não** pode ser apagada antes de portar X093 (feature inteira), X081, X082, os três
pedaços do X048 (42501, `onContactAdmin` no ViewRouter, painel de serviços **com fiação**).
`docs/reconciliation/tasks/P046.json` (+22.045 linhas) é ledger de docs — a main já tem sua
própria versão (`b24c0aa73`) e o ledger ao vivo é a verdade: descartar.
