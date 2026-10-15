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
| `src/components/talkx/TalkXAnalytics.tsx` | `300` | `298`, `383` | `295` | — | — | — |
| `src/components/talkx/TalkXAudienceFilters.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXCampaignPaused.tsx` | `89` | `86` | `82` | — | — | — |
| `src/components/talkx/TalkXCampaignRunning.tsx` | — | `176`, `315`, `563`, `654`, `920` | `170`, `311`, `409`, `559`, `648`, `916` | — | — | — |
| `src/components/talkx/TalkXCampaignScheduled.tsx` | `110` | `107` | `103` | — | — | — |
| `src/components/talkx/TalkXCampaignWizard.tsx` | — | — | — | — | `407` | — |
| `src/components/talkx/TalkXContactSelector.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXInteractiveEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXLiveMonitor.tsx` | `151`, `277` | `149`, `229`, `275`, `308` | `145`, `225`, `271`, `304` | — | — | — |
| `src/components/talkx/TalkXMediaDropzone.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessageEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessagePreview.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXOverview.tsx` | `210`, `298` | `203`, `205` | `195` | — | — | — |
| `src/components/talkx/TalkXScheduleTimeline.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXSegments.tsx` | `282`, `284` | `221`, `280`, `376` | `231`, `276` | — | — | — |
| `src/components/talkx/TalkXSettings.tsx` | — | `32` | `28` | — | — | — |
| `src/components/talkx/TalkXSuppression.tsx` | `612`, `614` | `610`, `690`, `852` | `606` | — | — | — |
| `src/components/talkx/TalkXTemplateEditor.tsx` | — | `514` | `510` | — | — | — |
| `src/components/talkx/TalkXTemplates.tsx` | `251`, `255`, `262` | `222`, `249` | `245` | — | — | — |
| `src/components/talkx/TalkXView.tsx` | — | `57`, `386` | — | — | `519` | — |
| `src/components/talkx/TalkXWizardDelivery.tsx` | — | — | — | — | `74` | — |

## Resumo

- **Vazio**: 8 de 21 telas
- **Carregando (esqueleto)**: 12 de 21 telas
- **Erro de consulta**: 11 de 21 telas
- **CRM 360 indisponível**: 0 de 21 telas
- **WhatsApp desconectado**: 3 de 21 telas
- **Sem permissão**: 0 de 21 telas

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
- `src/components/talkx/kit/states.tsx:327`

Estados sem nenhuma tela adotando: CRM 360 indisponível, Sem permissão.
