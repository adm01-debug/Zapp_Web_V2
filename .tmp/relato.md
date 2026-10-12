Especialista: complexo (front, plano worker-telas executado pelo Claude Code)

## O que mudou e por quê
- A entrega anterior de TL-146 foi recusada por motivo procedural ("a branch da tarefa andou depois do fechar"): a branch antiga acumulou commits de outros cartões. Reapliquei a entrega original (commit 31eadcd02) via cherry-pick -n neste workspace limpo, sem os commits estranhos, sem alterar o conteúdo funcional.
- src/components/talkx/TalkXCampaignWizard.tsx: "Editar" da revisão abre o passo pedido com return=4 na rota; botão principal vira "Voltar à revisão" quando o passo foi aberto pela revisão.
- src/components/talkx/TalkXView.tsx: propaga routeReturnTo para o wizard.
- src/components/talkx/TalkXWizardDelivery.tsx: linhas da revisão com dados reais (objetivo com descrição, segmentos com nomes e resumo) e botão "Editar" por linha.
- src/components/talkx/talkxWizardRoute.ts + kit/constants.ts + useCampaignEditor.ts: Route aceita o parâmetro return; editor sustenta navegação de ida e volta.
- 3 testes (TalkXView.revisaoVolta.test.tsx novo; TalkXView.route.test.tsx e talkxWizardRoute.test.ts estendidos) chamando o código real.
- Divergência registrada: o cartão autoriza só 2 arquivos, mas o critério de pronto exige Delivery e Route (fora da lista). Mantive os 9 arquivos idênticos ao commit original recusado — reaplicar não amplia escopo; nenhum arquivo novo fora da entrega original.

## Prova
- vermelho antes (fontes revertidos à base, testes do commit mantidos): `npx vitest run src/components/talkx/__tests__/TalkXView.revisaoVolta.test.tsx src/components/talkx/__tests__/TalkXView.route.test.tsx src/components/talkx/__tests__/talkxWizardRoute.test.ts` → `Test Files 3 failed (3); Tests 8 failed | 29 passed (37)`
- verde depois (correção restaurada): mesmo comando → `Test Files 3 passed (3); Tests 37 passed (37)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (26s)` (cartão só de front, sem migration; banco_local não aplicável)

## O que NÃO fiz e por quê
- Não alterei regra de permissão, visual além do pedido, nem criei dependência: a recusa era procedural, o conteúdo é o mesmo já revisado.
- Não toquei em arquivos fora dos 9 do commit original; o resto vira comentário se aparecer.
