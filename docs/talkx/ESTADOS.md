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
| `src/components/talkx/TalkXAnalytics.tsx` | `279` | `277`, `362` | `274` | — | — | — |
| `src/components/talkx/TalkXAudienceFilters.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXCampaignPaused.tsx` | `89` | `86` | `82` | — | — | — |
| `src/components/talkx/TalkXCampaignRunning.tsx` | — | `175`, `313`, `558`, `649`, `915` | `169`, `309`, `404`, `554`, `643`, `911` | — | — | — |
| `src/components/talkx/TalkXCampaignScheduled.tsx` | `108` | `105` | `101` | — | — | — |
| `src/components/talkx/TalkXCampaignWizard.tsx` | — | — | — | — | `402` | — |
| `src/components/talkx/TalkXContactSelector.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXInteractiveEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXLiveMonitor.tsx` | `150`, `276` | `148`, `228`, `274`, `306` | `144`, `224`, `270`, `302` | — | — | — |
| `src/components/talkx/TalkXMediaDropzone.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessageEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessagePreview.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXOverview.tsx` | `210`, `298` | `203`, `205` | `195` | — | — | — |
| `src/components/talkx/TalkXScheduleTimeline.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXSegments.tsx` | `141`, `143` | `139`, `233` | `110`, `135` | — | — | — |
| `src/components/talkx/TalkXSettings.tsx` | — | `32` | `28` | — | — | — |
| `src/components/talkx/TalkXSuppression.tsx` | `602`, `604` | `600`, `683`, `845` | `596` | — | — | — |
| `src/components/talkx/TalkXTemplateEditor.tsx` | — | `381` | — | — | — | — |
| `src/components/talkx/TalkXTemplates.tsx` | `160`, `164`, `171` | `158` | `154` | — | — | — |
| `src/components/talkx/TalkXView.tsx` | — | `355` | — | — | `480` | — |
| `src/components/talkx/TalkXWizardDelivery.tsx` | — | — | — | — | `73` | — |

## Resumo

- **Vazio**: 8 de 21 telas
- **Carregando (esqueleto)**: 12 de 21 telas
- **Erro de consulta**: 10 de 21 telas
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
