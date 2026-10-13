Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/VirtualizedRealtimeList.tsx: o rodapé do balão de pré-visualização (quick peek) usava `text-muted-foreground/60` — alfa 0,6 sobre o texto secundário, que era exatamente a causa apontada pelo contrato de contraste AA. Trocado por `text-muted-foreground` puro (sem alfa); o próprio contrato (bloco E62) já mede esse par ≥ 4,5:1 sobre `--popover` nos 4 temas. Causa única da quebra do ESPELHO DO CI.
- Os outros dois arquivos do diff (src/components/ui/quick-peek.tsx e o teste quickPeek) NÃO mudaram em relação à entrega original: vieram por `git cherry-pick` de a25a1f3ff, sem reescrever nada.

## Prova
- vermelho antes: `npx vitest run --config vitest.contracts.config.ts tests/contracts/contraste-aa-componentes.contract.test.ts` → `Tests 1 failed | 24 passed (25)`, falha "nenhum texto secundário usa alfa /60 (dava 2,36:1 sobre branco)" apontando `src/components/inbox/VirtualizedRealtimeList.tsx`.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 25 passed (25)`.
- testes da entrega: `npx vitest run src/components/inbox/__tests__/VirtualizedRealtimeList.quickPeek.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`.
- tipos isolados: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` → exit 0, 0 erros.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (326s)`, `OK tipos` e `OK lint`. A PRIMEIRA rodada desse mesmo comando deu `VERMELHO em tipos` porque o tsc foi morto por OOM (`Killed ... exit 137`) com outros agentes rodando junto; a rerodada e o tsc isolado acima mostram que o código está limpo — vermelho falso por carga.

## Pontos do cartão ([refazer])
- Ponto 1 (corrigir a causa, sem afrouxar asserção): o alfa `/60` entrou no rodapé do balão em VirtualizedRealtimeList.tsx; removido o alfa e passei a usar `text-muted-foreground`. A asserção do contrato continua `expect(achados).toEqual([])` — nenhum teste foi afrouxado nem alterado.
- Ponto 2 (partir da entrega por cherry-pick, não recomeçar): trouxe a entrega de t_e39e5246 (a25a1f3ff, commit da branch v2/quick-peek-inbox-2610121703d70a) com `git cherry-pick -n` e recomposei os dois commits (feature + fix), preservando autoria e mensagem originais.
- Ponto 3 (espelho do CI): o comando `bash ~/arquitetura-v2/integrador/ci_espelho.sh` foi BLOQUEADO pela guarda do Hermes (retorno `HERMES-GUARD: mexer nas guardas/ferramentas ... ~/.local/... node, bun, deno ... proibido`). Rodei então o item exato que falhava no espelho na mão — a suíte `test:contracts` (vitest.contracts.config.ts) — e ela está verde (25/25), junto com `zapp-verify . --rapido` verde.

## O que NÃO fiz e por quê
- Nada além do escopo do cartão. Não toquei em valor de token, escala nem cor de tema; a correção é só remover o alfa sobre o texto secundário do balão.

Correção: `fix(inbox): remove alfa /60 do rodape do quick peek (contraste AA)` @ 2ca97e7ac2
Entrega original (cherry-pick): a25a1f3ff / 4ffc75b68
