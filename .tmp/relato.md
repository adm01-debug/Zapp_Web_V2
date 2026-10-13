Especialista: iris (area-front-componentes)

## O que mudou e por quê
Retomada da entrega parada na fila do integrador (branch `v2/talkx-tela-resultado-ab-2610100854617c-2610101826c555`, commit f04fd3bc49). Ela estava aprovada, mas CONFLITAVA com a ponta do dia. Trouxe-a para a base atual (`dia/2026-10-13`) com `git cherry-pick` e resolvi os 2 conflitos PRESERVANDO o que a ponta já tinha:

- `src/hooks/integrations/useTalkX.ts`: mantive os campos N-102 da ponta (`send_weekdays`, `respect_dnd`) **e** os campos A/B do cartão (`ab_enabled`, `ab_metric`, `ab_min_sample`, `ab_winner_variant_id`, `ab_winner_decided_at`, `ab_winner_decided_by`). Nada removido.
- `src/components/talkx/TalkXCampaignRunning.tsx`: mantive a chamada da ponta para `TabResults` (`sentHistory?.buckets ?? []`) e o `TabLogs` com `segmentName`, acrescentando só `abStats={abStats}`. O restante do arquivo recebeu a tela de A/B (`AbTestResults`: barras por variante + selo "Vencedora" só com amostra suficiente) e a ponte `useEffect` que sincroniza `setSelectedCampaignId` com o seletor da tela.
- Testes ao lado: `src/components/talkx/__tests__/TalkXCampaignRunning.states.test.tsx` (novo) e `src/hooks/integrations/__tests__/useTalkX.abStats.test.ts` (novo); os 6 testes vizinhos ganharam 1 linha cada (mock de `abStats`) para continuarem verdes:
  `src/components/talkx/__tests__/TalkXCampaignActionsCard.test.tsx`,
  `src/components/talkx/__tests__/TalkXCampaignRunning.checklist.test.tsx`,
  `src/components/talkx/__tests__/TalkXCampaignRunning.janela-historico.test.tsx`,
  `src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx`,
  `src/components/talkx/__tests__/TalkXCampaignRunning.remote-completion.test.tsx`,
  `src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx`.

Confirmei no código ATUAL (base `dia/2026-10-13`) que o defeito ainda existia antes de trazer: `git grep -n "ab_min_sample" HEAD -- src/hooks/integrations/useTalkX.ts` não retornou nada. O commit `dea933dab` (docs) da branch antiga é VAZIO (nenhum arquivo alterado), por isso não há o que trazer dele.

## Prova
- vermelho antes (componente): `npx vitest run src/components/talkx/__tests__/TalkXCampaignRunning.states.test.tsx` contra o componente da base → `Tests 3 failed | 9 passed (12)`
- vermelho antes (hook): `npx vitest run src/hooks/integrations/__tests__/useTalkX.abStats.test.ts` contra o hook da base → `Tests 4 failed (4)`
- verde depois: `npx vitest run ...states.test.tsx ...abStats.test.ts` → `Test Files 2 passed (2); Tests 16 passed (16)`
- vizinhos: `npx vitest run` dos 6 testes do módulo de talkx tocados → `Test Files 6 passed (6); Tests 63 passed (63)`
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`

## O que NÃO fiz e por quê
- `supabase/functions/talkx-scheduler/index.ts` (ARQUIVO ESPERADO no pedido original): NÃO entrou. A entrega aprovada que estou retomando nunca tocou esse arquivo — a decisão de vencedor no servidor é de outro escopo. Trazê-lo seria alterar/commit de outro cartão (recusa certa (a)).
- O diff vs base tem 35.178 caracteres, acima dos 25 mil do critério 3: o excedente são os dois arquivos de teste que provam os critérios 1 e 2; cortá-los derrubaria a prova e o cartão proíbe cortar teste. Mantive o conjunto completo.
