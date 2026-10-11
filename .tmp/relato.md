Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/tasks/useWorkItemDraft.ts (novo): rascunho do painel "Detalhes da tarefa" sobre as mutations que já existem (`update`/`move` de `useMyWorkItems`) — sem tabela, coluna ou query nova. Controle de alterações com base (limpar um campo volta a valer como "sem alteração"); `buildMinimalPatch` manda no `update` só o campo que mudou e deixa o estado fora do patch (quem move é o `move`); aviso "Esta tarefa mudou" quando a versão do cache/realtime muda enquanto há edição pendente, sem descartar o rascunho; `save()` pré-valida a troca de estado com `canTransition` (limite de Fazendo = 3 e motivo obrigatório em Aguardando) ANTES de qualquer escrita — bloqueado, o estado anterior fica intacto e sai toast com a mesma mensagem que o módulo já usa; erro de escrita não avança a base (o rascunho continua sujo e pode ser reenviado, o item volta pelo rollback otimista das mutations). Coerência prazo × lembrete (etapa 162) exposta em `coherence` para a tela avisar (etapa 138), sem bloquear o save.
- Lint do React Compiler (react-hooks/refs, preserve-manual-memoization): a primeira versão escrevia no ref do relógio durante o render; troquei por um `now` estável lido no memo — `npx eslint src/hooks/tasks/useWorkItemDraft.ts` sai sem nenhuma ocorrência.
- src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx (novo): 23 casos — patch mínimo (só o campo alterado), limpar campo = sem alteração, limpar prazo manda `null`, bloqueio por motivo e por limite sem NENHUMA escrita, troca de estado com motivo via `move`, erro devolvendo o rascunho sujo, atualização remota suja x limpa, aceitar/dispensar remoto, a própria escrita não vira "mudou", troca de tarefa e coerência do lembrete.
- useMyWorkItems.ts NÃO precisou de ajuste: o `update` já aceita `Partial<WorkItemInput>` e o patch mínimo passa direto por ele.

## Prova
- vermelho antes: `npx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` com o hook ausente → `Test Files 1 failed (1) / Tests no tests` (falha ao resolver o import de `@/hooks/tasks/useWorkItemDraft`).
- verde depois: `npx vitest run src/hooks/tasks/__tests__/useWorkItemDraft.test.tsx` → `Test Files 1 passed (1); Tests 23 passed (23)`.
- sem regressão na área: `npx vitest run src/hooks/tasks` → `Test Files 11 passed (11); Tests 170 passed (170)`.

## Dependência
- O cartão depende de t_3d9b0963 (`workItemFormat.ts`/`workItemPresets.ts`) que ainda não estava na base local: `git cherry-pick -x 74c5c89f5` no meu workspace (banda vazia de conflito).

## O que NÃO fiz e por quê
- Não criei toast próprio para erro de rede: `update`/`move` já mostram o toast no `onError`; o bloqueio que eu mesmo detecto antes de escrever tem toast aqui para não haver escrita parcial.
- Não alterei telas nem o modal: o cartão é do hook; a tela que usa este hook é de outra trilha.
