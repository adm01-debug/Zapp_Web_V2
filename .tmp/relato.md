Especialista: iris

## O que mudou e por quê
- src/components/knowledge/KnowledgeBaseView.tsx: o clique em Excluir arquivo passou a abrir um AlertDialog do projeto (`AlertDialog` de `@/components/ui/alert-dialog`), em pt-BR, com o nome do arquivo no texto e os botões Cancelar/Excluir; a exclusão só sai na confirmação, o foco volta ao botão de origem ao fechar (via `onCloseAutoFocus`) e a trava por id (`deletingRef`) continua valendo na confirmação. Motivo: exclusão destrutiva e sem volta não pode sair num clique único na lista.
- src/components/knowledge/KnowledgeBaseView.tsx: a linha com `processing_status === 'failed'` mostra o motivo legível em pt-BR num `<p role="status">` dentro do próprio bloco da linha (texto fixo `MOTIVO_FALHA`, sem expor o conteúdo do arquivo). Motivo: o selo "failed" sozinho não diz o que houve nem o que fazer.
- src/components/knowledge/KnowledgeBaseView.tsx: mantidos `aria-busy` e a reabilitação da linha nas duas ações; quando `deleteFile`/`reprocessFile` devolvem `false` o `finally` limpa a trava e o botão volta a habilitado.
- src/components/knowledge/__tests__/KnowledgeBaseView.fileActions.test.tsx: reescrito para o novo fluxo — abre o diálogo, confirma, cancela, mede `aria-busy`, cobre Enter/Espaço/Esc e o motivo da falha.

## Prova
- vermelho antes (componente sem a correção, `git checkout HEAD -- KnowledgeBaseView.tsx`): `npx vitest run src/components/knowledge/__tests__/KnowledgeBaseView.fileActions.test.tsx` → `Test Files 1 failed (1); Tests 6 failed | 5 passed (11)` — falham os 6 que exigem diálogo, teclado e motivo da falha; depois restaurei o arquivo corrigido.
- verde depois (mesmo comando, componente corrigido): `Test Files 1 passed (1); Tests 11 passed (11)`
- verde depois (arquivos da área + hooks do cherry-pick): `npx vitest run src/components/knowledge src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx` → `Test Files 4 passed (4); Tests 30 passed (30)`
- a fixture usa os arquivos reais do componente (id, nome e status de cada linha) e o espião só registra a chamada; o esperado vem da linha, não de literal solto. O teste de teclado registra no próprio comentário por que simula `keydown` + `click` (o `<button>` nativo dispara o clique no Enter/Espaço e o jsdom não emite esse clique; `@testing-library/user-event` não está instalado).

## Pontos do revisor (refazer)
- Ponto 1: confirmação em diálogo feita. `AlertDialog` do projeto, título "Excluir arquivo da base?", nome do arquivo no texto, botões Cancelar/Excluir em pt-BR; clique na linha só abre; trava por id na confirmação. Prova: "Excluir abre o diálogo de confirmação e só chama a ação depois de confirmar" e "Excluir confirma uma única vez…" (o segundo clique no mesmo tick não duplica). O foco volta ao botão de origem ao cancelar — "Cancelar fecha o diálogo sem excluir e devolve o foco ao botão de origem".
- Ponto 2: motivo legível na linha com `failed`. `<p role="status">Falha no processamento: não foi possível extrair o texto deste arquivo. Reprocesse ou exclua o arquivo.</p>` no bloco da própria linha. Prova: "a linha com processing_status failed mostra o motivo legível em pt-BR" (um único `role="status"` e ele pertence ao bloco da `planilha.xlsx`).
- Ponto 3: teclado e espera/erro. Abrir por Enter e por Espaço, confirmar por Enter, fechar por Esc sem excluir (teste "abre o diálogo pelo teclado…"); `aria-busy` no Reprocessar enquanto corre e reabilitação quando devolve `false` (teste "Reprocessar marca aria-busy…"); o mesmo para Excluir ("Excluir confirma uma única vez, marca aria-busy e reabilita a linha quando devolve false").
- Ponto 4: captura não feita. Não existe projeto Playwright que cubra a Base de Conhecimento — os projetos visuais do `playwright.config` cobrem contatos, tarefas, talkx, email-navy, mapa, multiplix, telefonia; a rota de conhecimento não tem sessão sintética nem projeto. Produzir a captura exigiria criar projeto/sessão nova, o que é outro cartão (um cartão = um defeito). Esta entrega é de comportamento/estrutura (diálogo, teclado, foco) e está provada por teste; a skill `design-system-zapp` registra que o revisor não vê imagem no diff.
- Ponto 5: relato corrigido. Primeira linha exatamente `Especialista: iris`; removida a frase falsa sobre a captura (ela não foi feita e está justificada acima no Ponto 4); os números vêm do bloco FATOS MEDIDOS e dos comandos citados.

## O que NÃO fiz e por quê
- Não mexi no hook nem nos testes do hook (`useKnowledgeBase.ts`, `useKnowledgeBase.fileActions.test.tsx`, `useKnowledgeBase.uploadIngest.test.tsx`) nem no `KnowledgeBaseView.a11y.test.tsx`: eles vêm do cherry-pick do pai e da tela, como o cartão manda, e não são a correção deste cartão.
- Não versionei captura nem arquivo gerado; nenhuma proveniência de imagem afirmada.
- Não usei cor, token ou biblioteca nova: só o `destructive`/`text-destructive` que o projeto já define.
