Especialista: senior (area-front-hooks)

Ponto 1 — patch mínimo precisava comparar contra a base local, não contra o item remoto atual.
O que mudei: em `src/hooks/tasks/useWorkItemDraft.ts`, `buildMinimalPatch` passou a receber `WorkItemDraftFields` da base e `changedFields/save` usam `base`; quando o remoto muda enquanto há rascunho sujo, salvar manda só os campos realmente editados e preserva o campo remoto não editado. Também ajustei a base pós-save para mesclar o `item` atual com o patch salvo, sem transformar alteração remota em gravação local.
Teste que prova: `src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` — `salvar com aviso remoto não reverte campo remoto não editado`.
Vermelho antes da correção: `bunx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx -t "salvar com aviso remoto|se update gravou|Aguardando COM motivo"` falhou nesse teste porque o resultado vinha com `moved: true` e `move` era chamado.
Verde depois: o mesmo comando passou com `3 passed | 22 skipped`.

Ponto 2 — quando `update` grava e `move` falha depois, a base não podia continuar totalmente antiga nem esconder o parcial.
O que mudei: em `src/hooks/tasks/useWorkItemDraft.ts`, `DraftSaveOutcome` ganhou `partialSaved`; se `update` concluiu e `move` rejeitou, o hook avança a base só com os campos gravados pelo update e mantém o status sujo para reenvio, expondo `partialSaved: true` no retorno.
Teste que prova: `src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` — `se update gravou e move falhou, avança só a base dos campos salvos`.
Vermelho antes da correção: o mesmo comando vermelho acima falhou porque o retorno não tinha `partialSaved: true` e a base ainda incluía o título como alteração pendente.
Verde depois: `bunx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx -t "salvar com aviso remoto|se update gravou|Aguardando COM motivo"` passou (`3 passed | 22 skipped`).

Ponto 3 — `waitingReason` precisava ser normalizado antes de validar e de chamar `move`.
O que mudei: em `src/hooks/tasks/useWorkItemDraft.ts`, `save` calcula `waitingReason = normNullableText(draft.waitingReason)` uma vez e usa esse valor tanto no `canTransition` quanto no `move`. Isso evita enviar motivo com espaços extras e mantém motivo em branco como bloqueio.
Teste que prova: `src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` — `mover para Aguardando COM motivo leva o motivo normalizado no move`.
Vermelho antes da correção: o comando vermelho falhou mostrando `waitingReason: "  Retorno da transportadora  "` recebido pelo `move`.
Verde depois: o mesmo teste passou e confirmou `waitingReason: "Retorno da transportadora"`.

Ponto 4 — relato anterior dizia mais do que o diff provava sobre mensagens iguais.
O que mudei: corrigi este relato: não afirmo que extraí uma fonte compartilhada de mensagens. O diff mantém `DRAFT_BLOCK_MESSAGES` com o mesmo texto usado pelo módulo existente e os testes verificam os textos pelo contrato do hook; não fiz refatoração compartilhada para não ampliar escopo.
Teste que prova: `bunx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` passou com `1 file / 25 tests`.

Escopo/diff: reverti do diff final os helpers `workItemFormat`/`workItemPresets` que vinham do cherry-pick do pai e não estavam nos arquivos permitidos deste cartão. A coerência de lembrete usada pelo rascunho ficou local em `useWorkItemDraft.ts` para não manter arquivo extra fora do escopo.

Arquivos alterados (`git diff --name-only dia/2026-10-11...HEAD`):
.tmp/relato.md
src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx
src/hooks/tasks/useWorkItemDraft.ts

Diff final: `git diff dia/2026-10-11...HEAD | wc -c` = 41250 bytes (< 90000).

Verificações executadas:
- Vermelho antes da correção: `bunx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx -t "salvar com aviso remoto|se update gravou|Aguardando COM motivo"` com o código anterior falhou em 3 testes: patch remoto gerava `moved: true`, parcial não expunha `partialSaved: true`, e `waitingReason` chegava com espaços.
- Verde focado: `bunx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx -t "salvar com aviso remoto|se update gravou|Aguardando COM motivo"` — `1 file passed; 3 passed | 22 skipped`.
- Verde do hook: `bunx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` — `1 file passed; 25 tests passed`.
- Typecheck: `bun run typecheck` — `tsc -b --force`, exit 0.
- Lint focado: `bunx eslint src/hooks/tasks/useWorkItemDraft.ts src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` — exit 0.
