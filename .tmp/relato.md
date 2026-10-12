Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/contact-details/KnowledgeBaseSearchPanel.tsx (novo): seção "Base de Conhecimento" nos detalhes do contato, com paridade na V3. Busca pelo hook existente `useKnowledgeBaseSearch` (espera, mínimo de 2 letras e filtro de publicados continuam no hook — nada reimplementado), título e trecho com realce pelo `HighlightedText` do chat, botões "Ler" e "Inserir no texto".
- src/components/inbox/contact-details/KnowledgeBaseSearchPanel.tsx: leitura do artigo em painel deslizante (`zappPanelVariants`), com o conteúdo completo, fechando no Esc e no botão; o foco vai para o painel ao abrir; com movimento reduzido os variants viram só opacidade.
- src/components/inbox/contact-details/knowledgeBaseText.ts (novo): `KB_SECTION_VALUE`, `articleInsertText` e `articleSnippet` fora do arquivo de componente — exportar helper de um `.tsx` quebra o fast refresh (`react-refresh/only-export-components`).
- src/components/inbox/contact-details/composerInsert.ts (novo): ponte painel → compositor (registrar/pedir; nada de listener global nem event em `window`) para o trecho ir ao RASCUNHO sem enviar.
- src/components/inbox/contact-details/sidebar/ContactSidebarSections.tsx e sidebarSections.ts: a seção entra como 4ª (`knowledge`), sem mexer nas 3 antigas nem no accordion já aberto por padrão.
- src/components/inbox/contact-details/sidebar/SidebarSection.tsx: tom `yellow` reaproveitando o token `kpi-tile-yellow` que já existe no tema (nenhuma cor nova).
- Testes novos: KnowledgeBaseSearchPanel.test.tsx, KnowledgeBaseSearchPanel.movimento-reduzido.test.tsx, ContactSidebarSections.knowledge.test.tsx e composerInsert.test.ts — o painel é renderizado de verdade, mockando só o cliente Supabase (a RPC `search_knowledge_base`), como manda a guarda de rede da suíte.

## Prova
- vermelho antes: o componente não existe na base — `git cat-file -e <base>:src/components/inbox/contact-details/KnowledgeBaseSearchPanel.tsx` → erro (sem o arquivo, os testes novos não têm o que importar).
- verde depois: `npx vitest run src/components/inbox/contact-details` → todos os arquivos de teste passando, zero falhas e zero pulados (linha de resumo no bloco FATOS MEDIDOS).
- lint: `npx eslint` nos arquivos novos e alterados → zero problemas.
- critério, item por item: (1) achar e usar o artigo — teste que digita o termo, prova a chamada `search_knowledge_base` e o realce na tela; (2) só publicados — o filtro `is_published` está na RPC que o hook chama e não há no diff nenhum caminho alternativo de leitura; (3) inserir no texto sem enviar — testes da ponte e da seção montada entregando o corpo do artigo ao compositor registrado; (4) cada interação com teste próprio; (5) movimento reduzido com teste que liga e desliga a preferência.

## O que NÃO fiz e por quê
- Registro no compositor: falta o registro do escritor do rascunho no `ChatPanel` (uma linha chamando `registerComposerInsert` com o `setInputValue` do painel de chat). O `ChatPanel` não está nos arquivos que este cartão autoriza tocar, então não toquei: a ponte está pronta e testada (`composerInsert.ts` + `composerInsert.test.ts`) e o painel avisa em vez de fingir quando não há compositor escutando. Registrei o pedido em comentário no cartão.
- Estado de erro da busca: o hook `useKnowledgeBaseSearch` expõe só `articles` e `isLoading` (não expõe `isError` nem o termo consultado), então um erro da RPC aparece como "Nenhum artigo publicado..." e o painel não consegue distinguir a espera do debounce de uma busca sem resultado. Reimplementar a espera está proibido pelo cartão; pedido de `isError`/`isDebouncing` ao worker (hooks) em comentário no cartão.
