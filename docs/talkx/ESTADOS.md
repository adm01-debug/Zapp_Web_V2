# Talk X — matriz tela × estado (X055)

> Gerado por `node scripts/talkx/gen-estados.mjs`. Não edite à mão: rode o
> gerador. `node scripts/talkx/gen-estados.mjs --check` falha quando este
> arquivo divergir do código.

Cada célula traz o `arquivo:linha` onde a tela adota aquele estado do sistema.
`—` significa que a tela ainda não trata o estado (dívida conhecida, não
esquecimento).

Estado forçado para conferência visual (prancha `?view=talkx-kit`, só em DEV ou
com `VITE_TALKX_KIT=1`, lido de `src/components/talkx/kit/forcedState.ts`):
`?talkxState=empty` · `?talkxState=loading` · `?talkxState=error` · `?talkxState=crm` · `?talkxState=wa` · `?talkxState=perm`

| Tela | Vazio | Carregando (esqueleto) | Erro de consulta | CRM 360 indisponível | WhatsApp desconectado | Sem permissão |
|---|---|---|---|---|---|---|
| `src/components/talkx/TalkXAnalytics.tsx` | `329` | `327`, `412` | `324` | — | — | — |
| `src/components/talkx/TalkXAudienceFilters.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXCampaignPaused.tsx` | `166` | `163` | `159` | — | — | — |
| `src/components/talkx/TalkXCampaignRunning.tsx` | — | `180`, `481`, `594`, `891` | `174`, `327`, `477`, `588`, `887` | — | — | — |
| `src/components/talkx/TalkXCampaignScheduled.tsx` | `121` | `118` | `114` | — | — | — |
| `src/components/talkx/TalkXCampaignWizard.tsx` | — | — | — | — | `434` | — |
| `src/components/talkx/TalkXContactSelector.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXHelp.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXInteractiveEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXLiveMonitor.tsx` | `201`, `329` | `199`, `281`, `327`, `360` | `195`, `277`, `323`, `356` | — | — | — |
| `src/components/talkx/TalkXMediaDropzone.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessageEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessagePreview.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXOverview.tsx` | `388`, `439` | `381`, `383` | `373` | — | — | — |
| `src/components/talkx/TalkXScheduleTimeline.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXSegments.tsx` | `514`, `516` | `439`, `512`, `622` | `449`, `508` | — | — | — |
| `src/components/talkx/TalkXSettings.tsx` | — | `32` | `28` | — | — | — |
| `src/components/talkx/TalkXSuppression.tsx` | `616`, `618` | `614`, `694`, `850` | `610` | — | — | — |
| `src/components/talkx/TalkXTemplateEditor.tsx` | — | `519` | `515` | — | — | — |
| `src/components/talkx/TalkXTemplateImportDialog.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXTemplates.tsx` | `422`, `426`, `433` | `374`, `420`, `462`, `496` | `416` | — | — | — |
| `src/components/talkx/TalkXView.tsx` | `573` | `63`, `517`, `570` | `566` | — | `706` | — |
| `src/components/talkx/TalkXWizardDelivery.tsx` | — | — | — | — | `65` | — |

## Resumo

- **Vazio**: 9 de 23 telas
- **Carregando (esqueleto)**: 12 de 23 telas
- **Erro de consulta**: 12 de 23 telas
- **CRM 360 indisponível**: 0 de 23 telas
- **WhatsApp desconectado**: 3 de 23 telas
- **Sem permissão**: 0 de 23 telas

## Como usar

1. `node scripts/talkx/gen-estados.mjs` regenera este arquivo.
2. `node scripts/talkx/gen-estados.mjs --check` (rc 0) prova que ele bate com o código.
3. Para ver o estado na tela de verdade: abra o módulo com
   `?view=talkx&talkxState=<valor>` (ex.: `error`) e confira contra
   `docs/talkx/references/17_Estados_do_Sistema_e_Modais.png`.

## Estado forçado — cobertura no código

O parâmetro `?talkxState=` e os valores acima vêm de
`src/components/talkx/kit/forcedState.ts` (`TALKX_FORCED_STATES`); o
`TalkXQueryBoundary` (`src/components/talkx/kit/states.tsx`) respeita o estado
forçado antes da consulta real. Implementação (arquivo:linha):
- `src/components/talkx/kit/forcedState.ts:10`
- `src/components/talkx/kit/forcedState.ts:63`
- `src/components/talkx/kit/forcedState.ts:72`
- `src/components/talkx/kit/states.tsx:9`
- `src/components/talkx/kit/states.tsx:374`

Estados sem nenhuma tela adotando: CRM 360 indisponível, Sem permissão.
