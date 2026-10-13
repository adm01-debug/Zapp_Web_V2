Especialista: Edgar (area-edge-api)

## Resultado (uma linha)
Correção do pedido JÁ ESTÁ NA PONTA de `dia/2026-10-13` (commit `e7a147763`); entrega sem mudança de código, apenas este relato no commit. Verificação verde nos comandos abaixo.

## Verificação (comando → resultado, rodado agora)
- `npx vitest run --config vitest.contracts.config.ts tests/contracts/multiplix-dispatch-audience-saved.contract.test.ts` → `Test Files 1 passed (1)`; `Tests 11 passed (11)`
- `npx vitest run --config vitest.contracts.config.ts tests/contracts/multiplix-dispatch.contract.test.ts tests/contracts/multiplix-dispatch-domain-api.contract.test.ts tests/contracts/multiplix-audience.contract.test.ts tests/contracts/multiplix-dispatch-write-path.contract.test.ts` → `Test Files 4 passed (4)`; `Tests 20 passed (20)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`

## Sensibilidade
- Área: Edge (`supabase/functions/multiplix-dispatch`). O ponto sensível do pedido é a compensação (um DELETE escopado por `owner_id`) e o 502 nomeado.
- NENHUM diff de código nesta entrega: o único arquivo que o commit desta tarefa toca é este `.tmp/relato.md` (a base `dia/2026-10-13` já traz `.tmp/relato.md` versionado, herdado de um cartão anterior, e o fechar exige a árvore limpa; então o relato entra no commit). Nenhum arquivo em `src/` ou `supabase/` foi tocado — nada de teste, autorização ou proteção foi afrouxado.
- Nenhuma referência a banco/endpoint de produção; tudo rodou local.

## O que fiz e por quê
O cartão manda trazer a ponta atual para o workspace e, ANTES de mexer, conferir no código ATUAL se o defeito do pedido ainda existe. O workspace já nasceu na ponta de dia/2026-10-13 (HEAD `96dd72dc5`). Confirmei que o defeito NÃO existe mais: a própria ponta já contém a correção, integrada pelo commit `e7a147763` ("feat(multiplix-edge): públicos salvos (audience.save/apply)..."), que é exatamente quem introduziu tanto `deleteSavedAudience` quanto o caso de teste da compensação. Como o defeito já está corrigido na ponta, fecho SEM commit de código, conforme o próprio cartão autoriza.

- `supabase/functions/multiplix-dispatch/actions/audience.ts`: `AudienceStore.deleteSavedAudience(audienceId, ownerId)` existe e `handleAudienceSave` o chama no `catch` de `insertSavedMembers` (com o id recém-gravado e o `ownerId`) antes de relançar o erro. O 502 devolve `MULTIPLIX_AUDIENCE_SAVE_FAILED` com message fixa (`'audience.save falhou no servidor'`); o code detalhado vai só para `logServerFailure`.
- `tests/contracts/multiplix-dispatch-audience-saved.contract.test.ts` (o contrato de `audience.save`/`audience.apply` da ponta atual): o caso "falha ao gravar membros: 502 nomeado, compensa o publico gravado e nao ecoa o erro interno" prova os pontos 1–4 da recusa.

## Prova (vermelho→verde, sem alterar o código entregue)
- verde depois (código atual): `npx vitest run --config vitest.contracts.config.ts tests/contracts/multiplix-dispatch-audience-saved.contract.test.ts` → `Test Files 1 passed (1)`; `Tests 11 passed (11)`
- vermelho antes (removi LOCALMENTE a chamada de compensação, rodei e restaurei com `git checkout -- <arquivo>`; nada ficou no diff): mesma linha → `Test Files 1 failed (1)`; `Tests 1 failed | 10 passed (11)`, falhando em `expect(calls.deleted).toEqual([{ id: AUDIENCE, ownerId: PROFILE }])`. Ou seja: o teste FALHA sem a compensação e passa com ela (Critério 1).
- contratos anteriores ainda verdes: `npx vitest run --config vitest.contracts.config.ts tests/contracts/multiplix-dispatch.contract.test.ts tests/contracts/multiplix-dispatch-domain-api.contract.test.ts tests/contracts/multiplix-audience.contract.test.ts tests/contracts/multiplix-dispatch-write-path.contract.test.ts` → `Test Files 4 passed (4)`; `Tests 20 passed (20)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`

## Pontos da recusa e como ficam no código ATUAL
- Ponto 1 (escrita parcial sem compensação): resolvido — `handleAudienceSave` chama `deleteSavedAudience(saved.id, ownerId)` quando `insertSavedMembers` falha, evitando o público órfão/duplicado.
- Ponto 2 (texto interno ecoado no 502): resolvido — o 502 usa `MULTIPLIX_AUDIENCE_SAVE_FAILED` e message fixa; o code extraído do Error vai só para `logServerFailure`. O teste confere que nem `duplicate key`, nem o nome da constraint, nem `detalhe do driver` aparecem no corpo.

## Critério de pronto — ponto por ponto
1. Caso de teste que falha sem a compensação e passa com ela: presente e verde. O contrato de `audience.save`/`audience.apply` foi desmembrado, na ponta, de `tests/contracts/multiplix-dispatch.contract.test.ts` para `tests/contracts/multiplix-dispatch-audience-saved.contract.test.ts`; o caso exigido ("falha ao gravar membros: 502 nomeado, compensa o publico gravado e nao ecoa o erro interno") mora nele. Vermelho→verde provado acima.
2. 502 com code nomeado: `audience.ts:933` devolve `MULTIPLIX_AUDIENCE_SAVE_FAILED`; teste asserta em `...contract.test.ts:227`.
3. `deleteSavedAudience` chamado com id recém-gravado + `ownerId`: `audience.ts:910`; teste asserta `expect(calls.deleted).toEqual([{ id: AUDIENCE, ownerId: PROFILE }])` em `...contract.test.ts:230`.
4. Resposta sem texto interno: message fixa no 502; teste JSON-stringify o corpo e recusa `duplicate key`, nome da constraint e `detalhe do driver` (`...contract.test.ts:231-235`).
5. Contratos anteriores verdes: 4 arquivos / 20 testes, acima.
6. `zapp-verify . --rapido` verde, acima.

Observação: o nome exato do arquivo pedido no cartão (`multiplix-dispatch.contract.test.ts`) mudou na própria ponta antes deste cartão; o conteúdo exigido está no arquivo sucessor e passa. Não renomeei nada.

## O que NÃO fiz e por quê
- Não commitei CÓDIGO: o cartão manda fechar sem commit de código quando o defeito já está corrigido na ponta. O único commit desta tarefa é o próprio `.tmp/relato.md` (exigido para o `hermes-tarefa-fechar`, que recusa árvore suja e exige ao menos 1 commit novo em relação à branch do dia) — zero arquivos de `src/`/`supabase/`.
- Não trouxe por cherry-pick o commit `0bd891680`: ele só acrescenta refinamentos (DELETE fail-closed com `.select('id')` e um code próprio da compensação no log) que NÃO são exigidos pelo CRITÉRIO DE PRONTO e não são necessários para os pontos da recusa; trazê-lo criaria diff além do pedido.
