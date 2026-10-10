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
| `src/components/talkx/TalkXAnalytics.tsx` | `175` | `173` | `170` | — | — | — |
| `src/components/talkx/TalkXCampaignRunning.tsx` | — | `136`, `216`, `438`, `522`, `760` | `130`, `212`, `300`, `434`, `516`, `756` | — | — | — |
| `src/components/talkx/TalkXCampaignScheduled.tsx` | `73` | `70` | `66` | — | — | — |
| `src/components/talkx/TalkXCampaignWizard.tsx` | — | — | — | — | `376` | — |
| `src/components/talkx/TalkXContactSelector.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXHelp.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXLiveMonitor.tsx` | `132`, `235` | `130`, `195`, `233`, `265` | `126`, `191`, `229`, `261` | — | — | — |
| `src/components/talkx/TalkXMessageEditor.tsx` | — | — | — | — | — | — |
| `src/components/talkx/TalkXOverview.tsx` | `137`, `219` | `130`, `132` | `122` | — | — | — |
| `src/components/talkx/TalkXSegments.tsx` | `132`, `134` | `102`, `130` | `126` | — | — | — |
| `src/components/talkx/TalkXSettings.tsx` | — | `32` | `28` | — | — | — |
| `src/components/talkx/TalkXSuppression.tsx` | `165`, `167` | `163` | `159` | — | — | — |
| `src/components/talkx/TalkXTemplateEditor.tsx` | — | `319` | — | — | — | — |
| `src/components/talkx/TalkXTemplates.tsx` | `142`, `146`, `153` | `140` | `136` | — | — | — |
| `src/components/talkx/TalkXView.tsx` | — | `239` | — | — | — | — |
| `src/components/talkx/TalkXWizardDelivery.tsx` | — | — | — | — | `61` | — |

## Resumo

- **Vazio**: 7 de 16 telas
- **Carregando (esqueleto)**: 11 de 16 telas
- **Erro de consulta**: 9 de 16 telas
- **CRM 360 indisponível**: 0 de 16 telas
- **WhatsApp desconectado**: 2 de 16 telas
- **Sem permissão**: 0 de 16 telas

## Como usar

1. `node scripts/talkx/gen-estados.mjs` regenera este arquivo.
2. `node scripts/talkx/gen-estados.mjs --check` (rc 0) prova que ele bate com o código.
3. Para ver o estado na tela de verdade: abra o módulo com
   `?view=talkx&talkxState=<valor>` (ex.: `error`) e confira contra
   `docs/talkx/references/17_Estados_do_Sistema_e_Modais.png`.

Estados sem nenhuma tela adotando: CRM 360 indisponível, Sem permissão.
