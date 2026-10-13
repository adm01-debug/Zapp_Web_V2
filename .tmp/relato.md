Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- tests/contracts/_adv_vocabulary-consumers-gaps.test.ts: a entrada do inventário adversarial que pinava o defeito
  "CSAT ausente vira 0 no war room" em src/hooks/business/useWarRoomData.ts saiu da lista DEFEITOS. No lugar entrou um
  bloco novo de ratchet INVERSO: o `|| 0` não pode voltar e o `null` do RPC tem de permanecer
  (`satisfaction: r.satisfaction ?? null`). A entrega empilhada (2e6b475b4) trocou as leituras do War Room pelos RPCs
  `warroom_agent_today`/`warroom_queue_stats` e passou a preservar a ausência de avaliação como `null`; o inventário,
  que só MEDE gaps, ficou desalinhado e por isso o espelho do CI reprovava no empilhamento.

## Prova
- vermelho antes: `bunx vitest run --config vitest.contracts.config.ts tests/contracts/_adv_vocabulary-consumers-gaps.test.ts`
  (com 2e6b475b4 empilhado, sem a correção) -> `Tests 1 failed | 37 passed (38)`, falha em
  `'src/hooks/business/useWarRoomData.ts' :: 'CSAT ausente vira 0 no war room'`.
- o ratchet novo é vermelho sobre o código velho: `git show 96dd72dc5f:src/hooks/business/useWarRoomData.ts | grep -n "customer_satisfaction_score) || 0"`
  -> linha 114 presente (antes da entrega), logo as duas asserções novas falham sobre esse código.
- verde depois: `bunx vitest run --config vitest.contracts.config.ts tests/contracts/_adv_vocabulary-consumers-gaps.test.ts`
  -> `Test Files 1 passed (1); Tests 38 passed (38)`.
- suíte de contratos completa (o item do espelho): `bunx vitest run --config vitest.contracts.config.ts --reporter=dot`
  -> `Test Files 89 passed (89); Tests 1379 passed (1379)`.
- `zapp-verify . --rapido`: rodado pelo fechar deste cartão.

## Pontos do revisor (refazer)
- Ponto 1 (partir do commit da entrega por cherry-pick, não recomeçar): `git cherry-pick -x 2e6b475b4` aplicado sobre a
  ponta (dia/2026-10-13, 96dd72dc5f) — commit e415a95d27. A correção é commit ce50c20b9e; o relato é 90a529e76d.
- Ponto 2 (reproduzir e corrigir a causa sem afrouxar asserção): a causa é o teste que a própria entrega deixou
  desalinhado — a entrada defeituosa do inventário em tests/contracts/_adv_vocabulary-consumers-gaps.test.ts. Não afrouxei:
  troquei uma asserção (bug presente) por duas (bug ausente + comportamento correto presente); a contagem segue 38 e a
  suíte de contratos inteira passa. Prova no bloco acima.
- Ponto 3 (provar o mesmo comando VERDE e `zapp-verify . --rapido` verde, fechando citando o sha): o mesmo passo do
  espelho fica verde acima (89 arquivos / 1379 testes); `zapp-verify . --rapido` rodado pelo fechar. Shas do cartão:
  e415a95d27 (entrega empilhada) + ce50c20b9e (correção).

## O que NÃO fiz e por quê
- Não mexi em src/hooks/business/useWarRoomData.ts: o comportamento novo (null preservado) é o correto da entrega e tem
  teste próprio; o que estava errado era o mapa do inventário adversarial.
- Não rodei `ci_espelho.sh`: o HERMES-GUARD bloqueia executar o script do integrador (`~/arquitetura-v2/integrador/ci_espelho.sh`).
  Rodei direto o mesmo passo que o espelho usa para este item (o vitest de contratos), que é exatamente o item reportado.
- Base: reproduzi sobre a ponta que o `hermes-tarefa-iniciar` me deu (dia/2026-10-13, `96dd72dc5f`), não dia/2026-10-12;
  a falha é idêntica (mesma entrada, mesmo arquivo).
