Especialista: senior (area-front-hooks)

MOTIVO DESTA RETOMADA — "a branch da tarefa andou depois do fechar". Resolvido assim: o commit aprovado 1f0f0f5c9662 já está absorvido por inteiro na ponta ATUAL da branch do dia (dia/2026-10-13 @ 96dd72dc5f). Não há patch a reaplicar nem rebase a fazer: o comportamento aprovado (erro recuperável nos detalhes da fila) já está no código atual, preservando o que outros cartões puseram na branch. O cartão fecha sem diff de produto.

## O que mudou e por quê
- Nenhum arquivo de código — o pedido manda fechar sem commit de código quando o defeito já está absorvido.
- `.tmp/relato.md`: só este relato.

## Prova de que já está absorvido (ponta atual = versão aprovada)
- `git diff 1f0f0f5c9662 -- src/hooks/queues/useQueueDetails.ts src/hooks/queues/__tests__/useQueueDetails.test.tsx src/pages/QueueDetails.tsx src/pages/queue-details/__tests__/QueueDetails.configurar.test.tsx src/pages/queue-details/__tests__/QueueDetails.consultas.test.tsx src/pages/queue-details/__tests__/QueueDetails.erro.test.tsx src/pages/queue-details/__tests__/QueueDetails.totais.test.tsx` → 0 linhas.
- Sanidade do comando acima (para provar que ele detectaria diferença): `git diff 1f0f0f5c9662^ -- src/hooks/queues/useQueueDetails.ts` → 240 linhas; contra a árvore atual → 0 linhas.
- `git rev-parse HEAD` = 96dd72dc5f5db919bdbb4ffdc269510addca6165 = `git rev-parse dia/2026-10-13`; `git status --short` limpo → a correção veio na própria base, sem commit meu.
- Comportamento vivo: os testes do próprio commit aprovado passam na árvore atual.

## Prova
- verde (teste do cartão): `npx vitest run <os 5 arquivos do refazer>` → `Test Files 5 passed (5); Tests 16 passed (16)`.
- `TC_VAGAS=1 NODE_OPTIONS=--max-old-space-size=2560 zapp-verify full .` → `OK db_guard 0s · OK tipos 364s · OK lint 138s · OK migrations 0s`; `FALHOU testes 960s`.

## Critério 2 (zapp-verify full .) — o que a etapa `testes` mostra
`Test Files 1 failed | 1314 passed (1315)`; `Tests 1 failed | 11901 passed | 25 expected fail | 14 todo (11941)`. As falhas são alheias ao cartão e já existem na base (meu diff é vazio):
- `src/components/talkx/__tests__/RuleValueInput.test.tsx` → `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"`. Reproduz ISOLADO: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Tests 1 failed | 4 passed (5)` — não é carga, é a base.
- `src/components/inbox/__tests__/RealtimeInboxView.selectedMessagesError.test.tsx` → exceção não capturada do undici `TypeError: The "event" argument must be an instance of Event` (ERR_INVALID_ARG_TYPE); o arquivo sai com exit 1 mesmo isolado (`Tests 3 passed (3); Errors 1`). Defeito de ambiente undici×Node.
- `jev-juiz falha /home/joaquim_ataides/.local/state/zapp-verify/36f632820785/testes.log` → `pre_existing (certeza 0.98; rodar de novo ajuda: 0.39) ... não conserte fora do escopo`.

## O que NÃO fiz e por quê
- Não toquei em nenhum arquivo de código nem nos 2 testes que falham: são de outro assunto (talkx/inbox), o cartão manda fechar sem commit de código, e o juiz classificou a falha como `pre_existing` fora do escopo.
- Não corrijo o vermelho da suíte cheia nesta base 96dd72dc5f: ele precede qualquer trabalho meu (diff de produto vazio, provado acima).
