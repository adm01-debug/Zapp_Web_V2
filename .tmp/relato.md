Especialista: senior (iris/telas e componentes)

## Status
Concluído. O refazer reaproveita o trabalho anterior e corrige os 4 pontos da recusa dentro dos arquivos permitidos.

## O que mudou e por quê
- `src/components/inbox/useFileUploadLogic.ts`: `retryQueueFile` agora encerra `uploading` em `finally` e só chama `setUploading(false)` quando `mountedRef.current` ainda está verdadeiro. Isso remove a gravação de estado após desmonte apontada na recusa e evita loading preso se o retry lançar exceção.
- `src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx`: as provas recusadas foram endurecidas: fechamento é verificado pela ausência de `role="dialog"`; os spies de `URL.createObjectURL`/`URL.revokeObjectURL` têm restauração explícita; movimento reduzido cobre lote com erro, botão por item e retry real.
- `src/components/inbox/FileUploader.tsx`: mantido do trabalho anterior para renderizar a fila com estados vivos e retry por item/todos, usando tokens do sistema e `useReducedMotion`.

## Pontos da recusa
- Ponto 1: em `useFileUploadLogic.ts`, `retryQueueFile` não executa mais `setUploading(false)` depois do `await` sem checar montagem. A sequência agora é `try { success = await sendSingleQueueFile(...) } finally { if (mountedRef.current) setUploading(false) }`. O `catch` de `handleSendFile` não foi alterado porque não grava estado, só log/toast.
- Ponto 2: no teste `lote parcial mantém na fila só os que falharam e o retry fecha ao concluir`, a asserção final agora é `screen.queryByRole('dialog')` ausente; não depende mais do título que muda depois que sobra 1 item.
- Ponto 3: no teste `desmonte libera as URLs de prévia ainda vivas`, os métodos de `URL` são instalados com `Object.defineProperty` e restaurados no `afterEach` também com `Object.defineProperty` para não vazar monkey-patch entre testes.
- Ponto 4: o teste de movimento reduzido agora usa fluxo em lote com `mocks.reduceMotion = true`: um PDF falha, o item fica visível em erro, o botão `Tentar de novo: reduzido.pdf` aparece e o retry fecha o diálogo sem novo upload.

## Prova executada
- Vermelho antes na base da dia com os testes finais: `bun run test src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx` depois de resetar para `dia/2026-10-11` e aplicar só o teste final → `Test Files 1 failed (1); 6 tests | 5 failed`.
- Verde depois no commit final: `bun run test src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx` → `Test Files 1 passed (1); Tests 6 passed (6)`.
- Verificação do produto: `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations; VERIFY: VERDE`.
- Juiz local do relato: `jev-juiz pronto .tmp/relato.md` → `nada a apontar no diff (4 arquivos) nem no relato. Pode fechar.`

## Arquivos no diff
```
src/components/inbox/FileUploader.tsx
src/components/inbox/__tests__/FileUploader.retry-envio.test.tsx
src/components/inbox/useFileUploadLogic.ts
.tmp/relato.md
```
