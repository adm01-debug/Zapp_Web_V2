Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- [retomar] da entrega TL-107 (parada na fila do integrador). Confirmei primeiro que o defeito ainda existia na base do dia: `git show 81cb6a7b0:src/components/talkx/kit/dialogs.tsx` mostra `disabled={!allChecked || loading}` e nenhum estado `pending` — o botão de confirma seguia clicável durante o `await`.
- Trouxe o trabalho anterior por cherry-pick dos 3 commits da branch `v2/tl-107-modal-unico-kit-refazer2-26101012550814` (`837f95cec`, `9f85a4482`, `82f8b44bc`): `TalkXDialogShell` + presets + a trava do confirmar e o foco destrutivo. Só ajustei o buraco que derrubou a verificação anterior.
- `src/components/talkx/kit/dialogs.tsx`: o `onConfirm` passa a devolver `unknown`. Consumidores reais devolvem o próprio objeto do `mutate` (`TalkXSuppression.tsx:811` → `() => removing && removeMutation.mutate(...)` devolve `MutationResult | null`), que não é assignable a `void | Promise<unknown>` — era a quebra do ESPELHO DO CI no empilhamento (TS2322). O shell continua reconhecendo só um thenable para esperar; qualquer outro retorno cai no fluxo legado.
- `src/components/talkx/kit/__tests__/dialogPresets.test.tsx`: teste novo provando que um retorno não-thenable (objeto) é tratado como legado — uma chamada, sem fechamento por conta do shell.

## Critério de pronto
1. Trava do confirmar: `dialogPresets.test.tsx:209` ("a ação pende, o botão fica desabilitado e um 2º clique não dispara outra chamada") — `pending`+`busy` no `disabled` e ref `awaiting` contra cliques no mesmo turno. ✔
2. Foco destrutivo: `dialogPresets.test.tsx:228` (tone danger abre no Cancelar via `initialFocusRef`). ✔
3. Legado `() => void`: `dialogPresets.test.tsx:233`; e nenhum teste de TalkXOverview/TalkXSegments quebrado — suíte completa verde. ✔
4. O teste cobre async concluída (`:177`, fecha por `onClose`), rejeitada (`:195`, mostra a mensagem e mantém aberto), trava com pending (`:209`), foco destrutivo (`:228`), barra de título + grid details (`:100`, `:150`). ✔
5. `zapp-verify . --rapido` verde e suíte completa verde (sem regressão QueuedChatPanel.CrashFallback). ✔

## Prova
- vermelho antes: `bun run typecheck` → `src/components/talkx/TalkXSuppression.tsx(811,26): error TS2322: Type 'void | null' is not assignable to type 'void | Promise<unknown>'.`
- verde depois: `bun run typecheck` → exit 0
- verde depois: `npx vitest run src/components/talkx/kit/__tests__/dialogPresets.test.tsx` → `Test Files 1 passed (1) / Tests 17 passed (17)`
- verde depois: `npx vitest run` → `Test Files 1159 passed (1159) / Tests 10686 passed | 25 expected fail | 14 todo (10725)`
- verde depois: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (51s)`

## O que NÃO fiz e por quê
- Não toquei `src/components/talkx/TalkXSuppression.tsx` (fora da lista de ARQUIVOS QUE PODE TOCAR). A correção dele existe na branch do cartão t_b91be5a1 (`b06cd4f9e`); o ajuste de contrato em `dialogs.tsx` já o aceita sem tocar no consumidor — registrado em comentário no cartão.
