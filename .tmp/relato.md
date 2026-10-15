Especialista: iris
## O que mudou e por quê
- `src/components/inbox/TemplatesWithVariables.tsx`: o `TemplateEditorDialog` agora é montado só com `editorOpen` verdadeiro e com `key` com contador de aberturas (`id:seq`); fechar zera `editingTemplate`. Cada abertura remonta o formulário do zero, sem herdar digitação descartada do mesmo template nem do 'Novo' anterior.
- `src/components/inbox/templates/TemplateEditorDialog.tsx`: só comentário explicando que o reinício vem da remontagem pelo pai (sem mudança de comportamento).
- `src/components/inbox/__tests__/TemplatesWithVariables.grava.test.tsx`: 3 testes novos no bloco "editor reinicia a cada abertura (refazer 1)".
## Prova
- vermelho antes (só os testes novos, sem a correção): `npx vitest run src/components/inbox/__tests__/TemplatesWithVariables.grava.test.tsx` → `Test Files 1 failed (1); Tests 2 failed | 9 passed (11)`
- verde depois: `npx vitest run src/components/inbox/__tests__/TemplatesWithVariables.grava.test.tsx` → `Test Files 1 passed (1); Tests 11 passed (11)`
- `npx eslint` nos 3 arquivos → `0 errors` (1 warning `react-refresh/only-export-components` pré-existente)
## Pontos do revisor
- Ponto 1: reabrir o mesmo template após Cancelar mostra os valores gravados e 'Novo' após criar/editar abre vazio — remontagem por abertura (`TemplatesWithVariables.tsx`: `editorSeq`, montagem condicional, `handleEditorOpenChange` zerando a seleção).
- Ponto 2: testes que provam o item 1 — `reabrir o mesmo template depois de Cancelar mostra os valores gravados`, `'Novo' depois de criar um template abre com o formulário vazio`, `'Novo' depois de editar um existente abre com o formulário vazio`.
- Ponto 3: primeira linha deste relato é exatamente `Especialista: iris`.
## O que NÃO fiz e por quê
- Não mexi em `useMessageTemplates.ts`, gravação, exclusão, preview nem atalho: a recusa confirmou que estão corretos e testados.
