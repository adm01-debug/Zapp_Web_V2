Especialista: Íris (area-front-componentes)

## O que mudou e por quê
Cartão pedia enxertar na ponta viva (`dia/2026-10-14`) o commit revisado de `v2/t-0f01df80-2610090332235c` ("linhas com dado real e Editar que leva ao passo", TL-146) e **resolver os conflitos preservando o que já entrou na ponta**. Fiz o cherry-pick de `4716556cb4` e resolvi os 3 arquivos que conflitaram:

- `src/components/talkx/TalkXWizardDelivery.tsx` (conflito em 5 pontos): mantive da ponta a revisão rica (X135 previsões, `templatePreviewInteractive`/CTA do template, `TalkXPreviewInteractive`, `TalkXNoData`) e trouxe do commit revisado o que a ponta não tinha: assinatura `onEditStep?: (step: 1 | 2 | 3, returnTo: 4) => void` (o botão "Editar" navega pela rota com o destino de volta e o passo aberto vira "Voltar à revisão"), o relativo do agendamento (`formatScheduleRelative` → "Hoje, 16:12 (tz)" + "Em 5 minutos") e a linha de Conformidade com o resultado real das checagens (supressão + consentimento). A linha "Segmentos selecionados" ficou com o **nome de cada segmento** e o sub **"N segmentos | X contatos"** (exigência do título) **mais** o total da união e a contagem por segmento que a ponta já mostrava — os nomes vêm de `ed.selectedSegments` (o wizard da ponta aceita mais de um segmento).
- `src/components/talkx/kit/constants.ts`: conflito de comentário/ordem no catálogo `OBJECTIVES`; mantive o lado da ponta (mesmas descrições que já estavam vivas).
- `src/components/talkx/__tests__/TalkXView.route.test.tsx`: o teste do commit revisado preenchia `selectedSegment` (singular, campo que a ponta não tem mais) — atualizei o fixture para `selectedSegments: [...]` do modelo vivo **mantendo a asserção idêntica** (`VIP` e `1 segmento | 1.200 contatos`).
- `src/components/talkx/TalkXView.tsx` e `src/components/talkx/TalkXCampaignWizard.tsx`: auto-mesclados sem conflito — o `TalkXView` passa a rotear pelo passo de volta e o `TalkXCampaignWizard` é quem transforma o "Editar" em rota (com `return=4`) e troca o botão principal do passo aberto por "Voltar à revisão"; os dois vieram do commit revisado porque a ponta não os alterou nessas linhas.
- `src/components/talkx/talkxWizardRoute.ts`: auto-mesclado sem conflito — é ele que passa a carregar o parâmetro `return` da rota (destino do "Voltar à revisão"), junto de `useCampaignEditor.ts` (que ganhou `formatScheduleRelative`, usado na linha de Agendamento) e do teste `__tests__/talkxWizardRoute.test.ts` (cobre o `return` na rota). Os três vieram inteiros do commit revisado porque a ponta não os alterou.
- `src/components/talkx/__tests__/TalkXView.revisaoVolta.test.tsx`: o mock do editor do teste revisado não trazia `selectedSegments` (o wizard da ponta usa) e a revisão da ponta consome `useTalkXInsights`; acrescentei `selectedSegments: []` no mock e o mock de `useTalkXInsights` (mesma forma do `TalkXView.route.test.tsx`) — nenhuma asserção alterada.

Conferi os demais consumidores: `TalkXMultiSegmentos.test.tsx` (união + contagem por segmento) e `TalkXWizardReview.resumo.test.tsx` continuam passando — nada foi afrouxado.

## Prova
- vermelho antes (`npx vitest run .../TalkXView.route.test.tsx` com a árvore ainda em conflito): `Transform failed ... [PARSE_ERROR] Encountered diff marker ... TalkXWizardDelivery.tsx:213:1` e depois `TypeError: Cannot read properties of undefined (reading 'length')` em `TalkXCampaignWizard.tsx:713`.
- verde depois (`npx vitest run src/components/talkx`): `Test Files 111 passed (111); Tests 958 passed (958)`.

FAIXA DO PAI: commit 4716556cb4 do cartão t-0f01df80 (branch v2/t-0f01df80-2610090332235c) — trazido por cherry-pick porque ESTE cartão manda enxertá-lo na ponta.

## O que NÃO fiz e por quê
- Não mexi nas telas citadas na evidência (`TalkXCampaignScheduled.tsx`, `TalkXCampaignWizard.tsx`) além do que o próprio commit revisado já trazia: a `TalkXCampaignWizard.tsx` foi auto-mesclada e é ela que já implementa o "Voltar à revisão"; não havia conflito nela.
- Não alterei valores, tetos nem escalas — a união/contagem por segmento veio da ponta e só ganhou o prefixo "N segmentos | X contatos" pedido no título.
