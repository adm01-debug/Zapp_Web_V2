Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/VirtualizedRealtimeList.tsx: o rodapé do balão de pré-visualização (quick peek) usava `text-muted-foreground/60` — alfa 0,6 sobre o texto secundário, exatamente a causa reprovada pelo contrato de contraste AA. Trocado por `text-muted-foreground` puro (sem alfa); o próprio contrato (bloco E62) mede esse par ≥ 4,5:1 sobre `--popover` nos 4 temas. Causa única da quebra do ESPELHO DO CI.
- Os outros dois arquivos do diff (src/components/ui/quick-peek.tsx e o teste quickPeek) não mudaram em relação à entrega original: vieram por cherry-pick de a25a1f3ff, sem reescrever nada.

## Prova
- vermelho antes: `npx vitest run --config vitest.contracts.config.ts tests/contracts/contraste-aa-componentes.contract.test.ts` → `Tests 1 failed | 24 passed (25)` — falha "nenhum texto secundário usa alfa /60 (dava 2,36:1 sobre branco)" apontando src/components/inbox/VirtualizedRealtimeList.tsx.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 25 passed (25); Tests 25 passed (25)`.
- testes da entrega: `npx vitest run src/components/inbox/__tests__/VirtualizedRealtimeList.quickPeek.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- tipos: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` → exit 0, 0 erros.
- verificação oficial: `zapp-verify . --rapido` → `OK tipos`, `OK lint`, `VERIFY: VERDE SEM BANCO`.
- sha da correção: 2ca97e7ac2 (`fix(inbox): remove alfa /60 do rodape do quick peek (contraste AA)`); entrega original cherry-pickada: a25a1f3ff / 4ffc75b68.

## Pontos do cartão ([refazer])
- Ponto 1 — corrigir a causa, sem afrouxar asserção: a alfa `/60` entrou no rodapé do balão em src/components/inbox/VirtualizedRealtimeList.tsx; removi a alfa e passei a `text-muted-foreground`. A asserção do contrato segue `expect(achados).toEqual([])` — nenhum teste foi alterado ou afrouxado. Prova no "verde depois" acima.
- Ponto 2 — partir da entrega por cherry-pick: trouxe a entrega de t_e39e5246 (a25a1f3ff / 4ffc75b68 da branch v2/quick-peek-inbox-2610121703d70a) com `git cherry-pick -n` e recompus os commits preservando autoria e mensagem. O teste quickPeek da entrega roda e passa: `Tests 7 passed (7)`.
- Ponto 3 — espelho do CI (`test:contracts`): o comando `bash ~/arquitetura-v2/integrador/ci_espelho.sh` foi bloqueado pela guarda do Hermes; rodei o item exato que falhava no espelho — a suíte `npx vitest run --config vitest.contracts.config.ts` — e está verde (25/25), com `zapp-verify . --rapido` verde.

## O que NÃO fiz e por quê
- Nada além do escopo. Não toquei em valor de token, escala ou cor de tema; a correção é só remover a alfa sobre o texto secundário do balão. Nenhum cartão novo é necessário.
