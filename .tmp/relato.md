Especialista: iris (Íris — area-front-componentes, telas e componentes)

## O que mudou e por quê
- src/components/inbox/useFileUploadLogic.ts: `handleSendFile` deixou de chamar `handleClose()` ANTES do envio e passa a fechar SÓ depois do sucesso — em falha, arquivo e legenda continuam na tela e o cache de uploads pendentes (`pendingUploadsRef`, R2-INB-006) deixa de ficar órfão: "Enviar" de novo reusa o MESMO objeto e o MESMO `client_message_id`, sem novo upload. No lote, saiu o `setTimeout(handleClose, 1000)`: fecha apenas quando nenhum item falhou; se algum falhou, mantém na fila SÓ os itens em estado `error` (update funcional, para preservar o status gravado durante a rodada) e expõe `retryQueueFile(id)` para o retry por item. Adicionados `mountedRef` e `timersRef`: os temporizadores do lote são registrados e o cleanup de desmonte cancela os timers e revoga as URLs de prévia ainda vivas.
- src/components/inbox/FileUploader.tsx: item da fila com estado vivo (spinner `Loader2` com `motion-safe:animate-spin motion-reduce:animate-none`, check de enviado, alerta "Erro" com tremor curto de 0.24 s) e botão "Tentar de novo" por item que entra com mola (`spring`, 0.20 s, bounce 0.28); botão "Tentar de novo (N)" para todos os que falharam; `AnimatePresence` com `key` estável em volta dos itens; alvo do botão "Remover" passou a 40 px. Só tokens do sistema (destructive/success/primary/muted/border), nenhuma cor literal; movimento apenas em transform/opacity e `useReducedMotion` respeitado (com movimento reduzido, nada se desloca — só opacidade e cor).
- src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx: prova por comportamento, renderizando o componente REAL e clicando no que o usuário clica (6 casos).

## Prova
- vermelho antes: `git show 81cb6a7b0:src/components/inbox/{useFileUploadLogic.ts,FileUploader.tsx}` (base da branch) + `npx vitest run src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx` → `Test Files 1 failed (1)` / `Tests 5 failed | 1 passed (6)` (só o "sucesso total" já passava na base)
- verde depois: `npx vitest run src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx` → `Test Files 1 passed (1)` / `Tests 6 passed (6)`
- vizinhos que usam os mesmos arquivos: `npx vitest run .../FileUploader.r2-inb-011.test.tsx .../useFileUploadLogic.test.tsx .../FileUploader.sl202-refs.test.tsx` → `Test Files 4 passed (4)` / `Tests 17 passed (17)`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (tipos OK, lint OK, migrations OK, db_guard OK)`; o banco não foi verificado porque o cartão não tem migration.

## Cobertura dos itens do cartão
- falha única mantém diálogo + arquivo e o retry reusa objeto/id → teste "falha única mantém o diálogo e o retry reusa o mesmo objeto e id lógico" (afere `upload` chamado 1 vez e mesmo `clientMessageId`/`mediaUrl` nas 2 chamadas).
- lote parcial mantém só os que falharam, com selo "Erro" e retry por item → teste "lote parcial mantém na fila só os que falharam e o retry fecha ao concluir".
- "Tentar de novo" para todos → teste ""Tentar de novo" para todos reenvia só os que falharam e fecha ao concluir" (fila com os 2 em erro, 4 envios, 2 uploads).
- sucesso total fecha → teste "sucesso total fecha o diálogo sem deixar pendências".
- desmonte libera as prévias → teste "desmonte libera as URLs de prévia ainda vivas" (`revokeObjectURL` chamado com a URL criada).
- movimento reduzido → teste "com movimento reduzido o comportamento é o mesmo" (`useReducedMotion` → true: falha mantém o diálogo, arquivo à vista e botão habilitado).

## O que NÃO fiz e por quê
- Progresso da barra por byte enviado: a barra já reflete o estado REAL do item (0 enquanto envia, 100 ao concluir) e continua refletindo; progresso por byte exigiria um `onUploadProgress` em `src/lib/storage_object_upload.ts`, arquivo que NÃO está em ARQUIVOS QUE PODE TOCAR.
- Kit de microinterações `src/components/inbox/chat/motion/`: não existe nesta base; usei `zappMotion`/`zappTransition` de `src/lib/motion.ts` (e `framer-motion` já instalado).
