# Talk X — matriz tela × estado (X055)

> Gerado por `node scripts/talkx/gen-estados.mjs`. Não edite à mão: rode o
> gerador. `node scripts/talkx/gen-estados.mjs --check` falha quando este
> arquivo divergir do código.

Cada célula traz o `arquivo:linha` onde a tela adota aquele estado do sistema.
`—` significa que a tela ainda não trata o estado (dívida conhecida, não
esquecimento).

Estado forçado para conferência visual (prancha `?view=talkx-kit`, só em DEV ou
com `VITE_TALKX_KIT=1`):
`?talkxState=empty` · `?talkxState=loading` · `?talkxState=error` · `?talkxState=crm` · `?talkxState=wa` · `?talkxState=perm`

| Tela | Vazio | Carregando (esqueleto) | Erro de consulta | CRM 360 indisponível | WhatsApp desconectado | Sem permissão |
|---|---|---|---|---|---|---|
| `src/components/talkx/TalkXAnalytics.tsx` | `216` | `214` | `211` | — | — | — |
| `src/components/talkx/TalkXAudienceFilters.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXCampaignPaused.tsx` | `85` | `82` | `78` | — | — | — |
| `src/components/talkx/TalkXCampaignRunning.tsx` | — | `141`, `233`, `455`, `539`, `789` | `135`, `229`, `317`, `451`, `533`, `785` | — | — | — |
| `src/components/talkx/TalkXCampaignScheduled.tsx` | `77` | `74` | `70` | — | — | — |
| `src/components/talkx/TalkXCampaignWizard.tsx` | — | — | — | — | `396` | — |
| `src/components/talkx/TalkXContactSelector.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXInteractiveEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXLiveMonitor.tsx` | `122`, `240` | `120`, `200`, `238`, `270` | `116`, `196`, `234`, `266` | — | — | — |
| `src/components/talkx/TalkXMediaDropzone.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessageEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXMessagePreview.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXOverview.tsx` | `213`, `301` | `206`, `208` | `198` | — | — | — |
| `src/components/talkx/TalkXSegments.tsx` | `141`, `143` | `139`, `233` | `110`, `135` | — | — | — |
| `src/components/talkx/TalkXSettings.tsx` | — | `32` | `28` | — | — | — |
| `src/components/talkx/TalkXSuppression.tsx` | `362`, `364` | `360`, `441`, `552` | `356` | — | — | — |
| `src/components/talkx/TalkXTemplateEditor.tsx` | — | `320` | — | — | — | — |
| `src/components/talkx/TalkXTemplates.tsx` | `152`, `156`, `163` | `150` | `146` | — | — | — |
| `src/components/talkx/TalkXView.tsx` | — | `275` | — | — | `398` | — |
| `src/components/talkx/TalkXWizardDelivery.tsx` | — | — | — | — | `71` | — |

## Resumo

- **Vazio**: 8 de 20 telas
- **Carregando (esqueleto)**: 12 de 20 telas
- **Erro de consulta**: 10 de 20 telas
- **CRM 360 indisponível**: 0 de 20 telas
- **WhatsApp desconectado**: 3 de 20 telas
- **Sem permissão**: 0 de 20 telas

## Como usar

1. `node scripts/talkx/gen-estados.mjs` regenera este arquivo.
2. `node scripts/talkx/gen-estados.mjs --check` (rc 0) prova que ele bate com o código.
3. Para ver o estado na tela de verdade: abra o módulo com
   `?view=talkx&talkxState=<valor>` (ex.: `error`) e confira contra
   `docs/talkx/references/17_Estados_do_Sistema_e_Modais.png`.

Estados sem nenhuma tela adotando: CRM 360 indisponível, Sem permissão.
