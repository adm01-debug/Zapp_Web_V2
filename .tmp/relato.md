Especialista: iris

## Resultado: concluído
O arquivo de teste do modal Nova tarefa ficou autossuficiente. Ele importava o harness compartilhado `@/test/mocks/tarefas` (arquivo criado por OUTRO cartão) para registrar mocks que ele NÃO usa: o modal não toca Supabase/useAuth, e o único serviço externo, `useContactsSearch`, já é trocado localmente no próprio arquivo. Quando empilhado sem esse arquivo, o import falhava na resolução e derrubava o arquivo inteiro ANTES de qualquer asserção — era exatamente o vermelho apontado pelo limpador (nenhuma mensagem de asserção, só o caminho do arquivo). Nenhuma asserção foi removida nem afrouxada; o diff é só o import e um comentário explicando o motivo.

## O que mudou e por quê
- src/components/tasks/__tests__/newTaskDialog.test.tsx: removido o `import '@/test/mocks/tarefas'` e registrada em comentário a razão — o teste não consome aquele harness; mantê-lo criava uma dependência entre cartões que só existe empilhado.

## Prova
- vermelho antes (versão antiga, com o harness ausente da árvore): `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → `Test Files 1 failed (1); Tests no tests`
- verde depois (versão corrigida, harness ausente): mesmo comando → `Test Files 1 passed (1); Tests 7 passed (7)`
- verde depois (árvore normal, harness restaurado): `npx vitest run src/components/tasks/__tests__/newTaskDialog.test.tsx` → `Test Files 1 passed (1); Tests 7 passed (7)`
- suíte das tarefas: `npx vitest run src/components/tasks` → `Test Files 29 passed (29); Tests 329 passed | 1 todo (330)`
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (60s)` (db_guard, tipos, lint e migrations OK)

## Ponto do refazer
- Ponto 1 (quebra os TESTES no empilhamento em src/components/tasks/__tests__/newTaskDialog.test.tsx): corrigido — o arquivo não importa mais o harness de outro cartão e prova o mesmo comportamento (7 casos), sem afrouxar asserção.
