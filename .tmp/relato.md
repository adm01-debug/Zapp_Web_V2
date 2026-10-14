Especialista: senior (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/ChatPanel.tsx: registra o escritor do rascunho na ponte `composerInsert` ao montar (anexa o trecho ao rascunho atual com linha em branco, sem substituir nem enviar, e foca o input; ao desmontar solta o registro). Sem isso nenhum compositor escutava o pedido do painel — era o elo que faltava para o trecho chegar ao rascunho. Arquivo fora da lista do cartão, tocado porque o ponto 1 da recusa exige o caminho até o rascunho (o cartão permite outro arquivo com explicação — esta).
- src/components/inbox/contact-details/KnowledgeBaseSearchPanel.tsx: Esc tratado na raiz do painel (fecha a leitura de qualquer ponto, sem depender de foco inicial); ao fechar (Esc, Voltar, Fechar ou inserir com sucesso) o foco volta ao botão "Ler" que abriu, via ref do botão (a busca remonta após a saída — foco imediato no clique não funcionaria); leitura vira diálogo não-modal rotulado (`role=dialog`, `aria-modal=false`, `aria-labelledby` no título, `aria-keyshortcuts=Escape`). O limpar-do-Esc no campo de busca continua valendo (com `stopPropagation`, não fecha a leitura).
- Testes: src/components/inbox/__tests__/ChatPanel.kb-composer.test.tsx (novo, ChatPanel real + `composerInsert` real, input dublado por textarea que observa o `inputValue` verdadeiro); 3 testes novos em src/components/inbox/contact-details/__tests__/KnowledgeBaseSearchPanel.test.tsx (Esc+retorno de foco, semântica do diálogo, Esc-limpa-sem-fechar).

## Prova
- Vermelho antes (ChatPanel sem registro, arquivo revertido a HEAD): `npx vitest run src/components/inbox/__tests__/ChatPanel.kb-composer.test.tsx` → `Test Files 1 failed (1); Tests 2 failed | 1 passed (3)`.
- Vermelho antes (painel sem correção, arquivo revertido a HEAD): testes novos "devolve o foco" e "não-modal" → `Tests 1 failed | 10 skipped (11)` em cada um.
- Verde depois: `npx vitest run` nos 5 arquivos do caminho (KnowledgeBaseSearchPanel, movimento-reduzido, ContactSidebarSections.knowledge, composerInsert, ChatPanel.kb-composer) → `Test Files 5 passed (5); Tests 22 passed (22)`, zero falhas e zero pulados.
- Regressão ao lado: 6 suítes que renderizam o ChatPanel real (ligar, transferência, mídia agendada, presença de digitação, atalhos de busca, arquivos) → `Test Files 6 passed (6); Tests 30 passed (30)`.
- `npx tsc --noEmit` → saída vazia, exit 0. `npx eslint` nos 4 arquivos → 0 erros (2 warnings preexistentes no ChatPanel, linhas 3 e 244, não meus).

## Pontos do revisor
- Ponto 1 (wiring/inserção): procede no fundo — conferi que `ContactSidebarSections.tsx:68` passa `onInsertText={requestComposerInsert}` e que `ContactSidebarSections.knowledge.test.tsx` ("Insere no texto entrega o artigo ao compositor registrado") já renderiza a seção real e prova a entrega com o `composerInsert` real; mas nenhum compositor se registrava em produção (`registerComposerInsert` sem chamador fora de testes), então o pedido sempre caía no aviso. Resolvido registrando o escritor no ChatPanel (dono do rascunho, irmão do painel em `RealtimeInboxView`), que anexa sem substituir. Prova: `ChatPanel.kb-composer.test.tsx` — trecho chega ao rascunho, nada é enviado (`onSendMessage` não chamado), desmontar solta o registro (vermelho/sem correção × verde/com correção acima).
- Ponto 2 (Escape/foco): procede em parte — o foco ia para o painel ao abrir, mas o Esc morava no contêiner da leitura e o foco não voltava ao "Ler". Resolvido com Esc na raiz + retorno de foco ao "Ler" que abriu + `role=dialog` não-modal rotulado com atalho anunciado. Prova: testes novos "Esc em qualquer ponto da leitura fecha e devolve o foco ao Ler que abriu" (Esc disparado do botão Voltar) e "diálogo não-modal rotulado" (vermelhos sem a correção, verdes com ela); "Esc no campo de busca limpa sem fechar nada" documenta a convivência dos dois Esc.
- Ponto 3 (ponte sem cobertura): não procede como escrito — `composerInsert.test.ts` testa o módulo real (sem mock) e `ContactSidebarSections.knowledge.test.tsx` exercita o fio inteiro (seção real → painel real → `composerInsert` real → escritor), inclusive o contrato "corpo exato, uma chamada, sem enviar". Mantidos e verdes; o novo `ChatPanel.kb-composer.test.tsx` reforça o fio pela outra ponta (ChatPanel real + ponte real). Nenhum teste existente foi removido, pulado ou afrouxado.

## O que NÃO fiz e por quê
- Não registrei escritor em `ChatPopup`/`OmnichannelChatPanel` (outros montadores do ChatPanel): cada um monta um ChatPanel por janela/contexto, então o registro do ChatPanel visível é o que vale; inserir vai para o rascunho aberto. Mesma semântica do barramento de favoritos/adiamentos.
- Não toquei no hook `useKnowledgeBaseSearch` (estado de erro da busca): fora dos pontos da recusa; continua valendo o "O que NÃO fiz" da entrega anterior.

## Arquivos deste refazer (diff do meu commit contra a entrega anterior)
- src/components/inbox/ChatPanel.tsx (modificado, +13/-0)
- src/components/inbox/contact-details/KnowledgeBaseSearchPanel.tsx (modificado)
- src/components/inbox/contact-details/__tests__/KnowledgeBaseSearchPanel.test.tsx (modificado, +3 testes)
- src/components/inbox/__tests__/ChatPanel.kb-composer.test.tsx (novo, 3 testes)
- .tmp/relato.md (este relato)
