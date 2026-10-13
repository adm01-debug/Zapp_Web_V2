Especialista: senior (area-front-hooks)

CONCLUÍDO. Motivo da retomada — "a branch da tarefa andou depois do fechar" — resolvido: o commit aprovado 1f0f0f5c9662 já está absorvido por inteiro na ponta ATUAL da branch do dia (dia/2026-10-13 @ 96dd72dc5f), preservando o que os outros cartões puseram ali. Não há patch a reaplicar nem rebase a fazer; o comportamento aprovado (erro recuperável nos detalhes da fila) já está no código atual. O cartão fecha sem diff de produto.

## O que mudou e por quê
- Nenhum arquivo de código — o pedido manda fechar sem commit de código quando o defeito já está absorvido.
- `.tmp/relato.md`: só este relato.

## Prova
- verde: `TC_VAGAS=1 zapp-verify . --rapido` → `OK db_guard 0s · OK tipos 53s · OK lint 0s · OK migrations 1s` e `VERIFY: VERDE SEM BANCO (54s)`.
- verde (teste do cartão): `npx vitest run src/hooks/queues/__tests__/useQueueDetails.test.tsx src/pages/queue-details/__tests__/QueueDetails.configurar.test.tsx src/pages/queue-details/__tests__/QueueDetails.consultas.test.tsx src/pages/queue-details/__tests__/QueueDetails.erro.test.tsx src/pages/queue-details/__tests__/QueueDetails.totais.test.tsx` → `Test Files 5 passed (5); Tests 16 passed (16)`.
- absorvido: `git diff 1f0f0f5c9662 -- <os 7 arquivos do commit aprovado>` → 0 linhas. Sanidade desse comando: `git diff 1f0f0f5c9662^ -- src/hooks/queues/useQueueDetails.ts` → 240 linhas; contra a árvore atual → 0 linhas.
- base: `git rev-parse HEAD` = 96dd72dc5f5db919bdbb4ffdc269510addca6165 = `git rev-parse dia/2026-10-13`; `git status --short` limpo → a correção veio na própria base.

## zapp-verify full . (fato medido)
- `TC_VAGAS=1 NODE_OPTIONS=--max-old-space-size=2560 zapp-verify full .` → `OK db_guard 0s · OK tipos 364s · OK lint 138s · OK migrations 0s`; etapa `testes`: `Test Files 1 failed | 1314 passed (1315)` e `Tests 1 failed | 11901 passed | 25 expected fail | 14 todo (11941)`.
- Os 2 vermelhos são de arquivos alheios ao cartão e são pré-existentes na base: `src/components/talkx/__tests__/RuleValueInput.test.tsx` (`Unable to find role="button" and name "Novo segmento"`; isolado: `Tests 1 failed | 4 passed (5)`) e `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` (exceção não capturada do undici `TypeError: The "event" argument must be an instance of Event`, ERR_INVALID_ARG_TYPE; isolado: `Tests 3 passed (3); Errors 1`, exit 1).
- `jev-juiz falha /home/joaquim_ataides/.local/state/zapp-verify/36f632820785/testes.log` → `pre_existing (certeza 0.98)`.

## O que NÃO fiz e por quê
- Não toquei em código nem nos 2 testes que falham: são de outro assunto (talkx/inbox) e o juiz os classificou `pre_existing` fora do escopo.
- Não corrijo o vermelho da suíte cheia na base 96dd72dc5f: ele precede qualquer trabalho meu (diff de produto vazio, provado acima).
