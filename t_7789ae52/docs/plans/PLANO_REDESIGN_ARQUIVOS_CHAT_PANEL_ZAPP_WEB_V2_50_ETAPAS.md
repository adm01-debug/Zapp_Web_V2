# Plano de 50 etapas — Arquivos do Chat Panel

**A mudança central deve ser transformar a aba Arquivos em um explorador de mídias com Grid, Lista e Tabela, seleção múltipla e controle de colunas, reproduzindo o padrão do Promo Gifts V4 sem transportar para o chat as regras comerciais do catálogo.**

Isso exige mais do que acrescentar um botão “Layout”: os três modos precisam compartilhar os mesmos arquivos, filtros, ordenação, seleção e ações, respeitando a largura efetivamente disponível no painel central.

Analisei os componentes pertinentes nos dois repositórios, nas versões `92690bd8` do Promo Gifts V4 e `826fa148` do ZAPP Web V2. A referência de implementação está no código do catálogo do Promo Gifts, especialmente em `LayoutPopover`, `ColumnSelector`, `CatalogContent` e `useCatalogSelection`. Fontes: [versão do Promo Gifts V4][pg-version], [versão do ZAPP Web V2][zapp-version], [CatalogContent.tsx][pg-content] e [useCatalogSelection.ts][pg-selection].

A rota publicada não carregou na ferramenta de navegação. Portanto, o diagnóstico visual utiliza suas capturas, enquanto as observações funcionais abaixo vêm da leitura do código. Não houve teste interativo da aplicação nem alteração de código ou dados.

## Diagnóstico que orienta o plano

Nas capturas, a área de arquivos é dominada por cartões grandes, nomes técnicos truncados e metadados distribuídos em várias linhas. No filtro de vídeos, dois cartões ocupam uma área considerável, mas suas prévias oferecem pouca informação para distinguir os arquivos.

A comparação do código revelou pontos que precisam orientar o redesenho:

| Ponto | Situação encontrada e consequência para o projeto |
|---|---|
| **Visualizações disponíveis** | `FilesTab.tsx` renderiza somente um grid com `grid-cols-2 2xl:grid-cols-3`. Não existe, nessa implementação, alternância entre Grid, Lista e Tabela. Fonte: [FilesTab.tsx][zapp-files]. |
| **Padrão exato da referência** | O Promo Gifts possui `LayoutPopover` com **Grid, Lista e Tabela**; a seção **Colunas** aparece apenas no Grid. As opções implementadas são **3, 4, 5, 6 e 8 colunas**. Fontes: [LayoutPopover.tsx][pg-layout] e [ColumnSelector.tsx][pg-columns]. |
| **Responsividade da referência** | O seletor do Promo Gifts utiliza `window.innerWidth`. Copiar esse comportamento literalmente não considera a largura consumida pelas laterais do ZAPP. Além disso, há regras de limitação de colunas tanto no seletor quanto em `useCatalogState`, com limites diferentes. Fontes: [ColumnSelector.tsx][pg-columns] e [useCatalogState.ts][pg-state]. |
| **Cartões e detalhes** | `FileCard` usa imagens com `object-cover`, podendo cortar partes da prévia. `FileDetailPanel` acrescenta uma área fixa de 260 px ao lado dos arquivos, reduzindo ainda mais a largura do grid. Fontes: [FileCard.tsx][zapp-card] e [FileDetailPanel.tsx][zapp-details]. |
| **Abrangência dos arquivos** | `useContactMedia` consulta por `contact_id`, limita o resultado a **200 mensagens com mídia** e calcula as contagens sobre esse resultado. Isso não equivale, necessariamente, a todo o histórico nem a uma única sessão de atendimento. Fonte: [useContactMedia.ts][zapp-media]. |
| **Download** | A ação está explicitamente bloqueada por `notifyDownloadBlocked`. O redesenho não deve apresentar download individual ou em lote como capacidade liberada. Fonte: [mediaUtils.ts][zapp-media-utils]. |
| **Encaminhamento** | `FilesTab` passa `onForward={() => {}}` ao diálogo. O hook do diálogo chama esse callback e pode apresentar “Mensagem encaminhada” sem que essa ligação da aba execute um envio. É uma correção funcional necessária antes de ampliar essa ação. Fontes: [FilesTab.tsx][zapp-files] e [useForwardMessage.ts][zapp-forward]. |
| **Persistência da interface** | A aba Arquivos é desmontada ao sair; o Chat permanece montado para preservar seu estado. Preferências e contexto de navegação dos arquivos precisam ser tratados sem alterar essa proteção do Chat. Fonte: [ConversationTabContent.tsx][zapp-tab-content]. |

**Direção proposta:** manter a identidade escura e azul das telas enviadas; substituir a galeria rígida por uma área de trabalho compacta; reproduzir o mecanismo de visualização do Promo Gifts; preservar as permissões e corrigir as ações que hoje não estão efetivamente conectadas.

---

## Fase 1 — Delimitação e arquitetura compartilhada

### 01. Registrar a linha de base do módulo

Documentar as telas atuais, os estados dos filtros e o comportamento de cada ação: abrir detalhes, visualizar, encaminhar, copiar link, solicitar download e excluir mensagem. Relacionar cada interação ao componente e ao handler correspondente.

Separar o que está implementado, o que está bloqueado e o que possui interface sem execução efetiva. **Aceite:** existir uma matriz de preservação funcional para comparar a implementação nova com a atual.

### 02. Restringir o redesenho à área de arquivos

Manter intactos o menu principal, a lista de conversas, as demais abas do chat e o conteúdo cadastral do painel direito. Alterações no componente pai devem se limitar ao necessário para acomodar largura, rolagem e persistência da aba Arquivos.

Não incluir pastas, upload, favoritos, classificação por IA, OCR, versionamento ou recursos comerciais do catálogo. **Aceite:** cada mudança estar vinculada à visualização, seleção ou operação já pertinente aos arquivos.

### 03. Transpor a arquitetura, não copiar o catálogo inteiro

Manter `FilesTab.tsx` como ponto de entrada e propor uma organização específica em `src/components/inbox/files/`, com componentes como `FilesToolbar`, `FilesLayoutPopover`, `FilesColumnSelector`, `FilesGridView`, `FilesListView` e `FilesTableView`.

Adaptar a separação entre controles, conteúdo e seleção do Promo Gifts. Não importar seus estados de produtos, preços, cores, carrinho ou orçamento. **Aceite:** os componentes novos não dependerem do domínio comercial do catálogo.

### 04. Estabelecer um contrato único para os arquivos

Usar `ContactMediaItem` como base comum dos três modos. Padronizar o tratamento de identificador, nome original, tipo, tamanho, data, legenda, remetente e referência da mídia.

Preservar campos desconhecidos como desconhecidos: tamanho ausente não deve virar “0 KB”; duração ausente não deve virar “00:00”. Não adicionar campos fictícios para preencher o layout. **Aceite:** Grid, Lista e Tabela apresentarem os mesmos valores para o mesmo arquivo.

### 05. Separar visualização, inspeção e seleção múltipla

Definir estados independentes para modo de exibição, colunas preferidas, colunas efetivas, filtros, ordenação, arquivo em detalhes, arquivo em prévia e conjunto de IDs selecionados.

O arquivo aberto no painel de detalhes não deve automaticamente significar “selecionado para uma ação em lote”. Propor hooks específicos, como `useFilesViewState`, `useFilesSelection` e `useFilesActions`. **Aceite:** abrir uma prévia não alterar a seleção múltipla.

## Fase 2 — Hierarquia visual e barra de ferramentas

### 06. Reduzir o peso do cabeçalho

Manter “Arquivos compartilhados” como título, mas diminuir o espaço vertical ocupado pela apresentação. Substituir o subtítulo longo por uma indicação contextual curta, coerente com o escopo confirmado dos dados.

A quantidade pode acompanhar o título discretamente, sem criar um cartão de indicador separado. **Aceite:** o cabeçalho orientar o usuário sem competir com as miniaturas nem exigir uma grande faixa vazia acima delas.

### 07. Criar uma barra de ferramentas operacional

Organizar a faixa principal nesta ordem: **busca flexível → ordenação → Selecionar → Layout**. Preservar “Selecionar” e “Layout” como um grupo visual adjacente, conforme a referência enviada.

Propor controles com aproximadamente 36 px de altura, respeitando os tokens existentes. Em larguras menores, permitir reorganização controlada, sem comprimir o campo de busca até ficar inutilizável. **Aceite:** todos os controles permanecerem acessíveis sem rolagem horizontal da página.

### 08. Manter categorias separadas dos modos de exibição

Preservar **Todos, Imagens, Vídeos, Áudios e Docs**, com contagens, numa faixa compacta abaixo das ferramentas. Esses controles definem quais arquivos aparecem; Grid, Lista e Tabela definem como eles aparecem.

Não misturar ambos os conceitos no mesmo grupo de botões. Uma categoria sem arquivos deve continuar compreensível, sem parecer uma falha do sistema. **Aceite:** trocar o layout não modificar o filtro de tipo.

### 09. Unificar a ordenação

Manter uma única fonte de ordenação para os três modos. Preservar “Mais recentes”, “Mais antigos” e “Maiores”, tratando tamanho desconhecido explicitamente, em vez de equipará-lo silenciosamente a zero.

Definir desempate estável por data e identificador. Na Tabela, só tornar um cabeçalho ordenável quando ele estiver conectado a um critério realmente implementado. **Aceite:** o mesmo filtro produzir a mesma sequência de IDs nos três modos.

### 10. Tornar o resultado da busca compreensível

Mostrar a diferença entre total disponível, itens carregados e resultados do filtro quando houver carregamento parcial. Disponibilizar limpeza simples da busca e dos filtros ativos.

Não anunciar “nenhum arquivo” quando apenas uma pesquisa não encontrou correspondência. Não exibir uma contagem parcial como total definitivo. **Aceite:** o usuário identificar se precisa limpar um filtro, carregar mais registros ou tentar novamente após um erro.

## Fase 3 — Popover Layout e controle de colunas

### 11. Reproduzir a composição do popover da referência

Adaptar o `LayoutPopover` com o mesmo modelo: botão com ícone e texto, painel alinhado à direita, título “Visualização”, seletor segmentado e seção “Colunas” condicionada ao Grid.

Usar aproximadamente 240 px como largura inicial de projeto, ajustável ao conteúdo e à área disponível. Preservar bordas e sombras discretas do ZAPP. **Aceite:** reconhecer visualmente o padrão do Promo Gifts sem introduzir outra identidade visual. Fonte: [LayoutPopover.tsx][pg-layout].

### 12. Implementar os três modos como opções controladas

As opções **Grid, Lista e Tabela** devem alterar um único estado compartilhado. O popover não deve possuir uma escolha interna diferente daquela usada para renderizar os arquivos.

Manter indicação clara do modo ativo por preenchimento, texto e semântica acessível. Trocar de modo não deve refazer uma consulta apenas porque mudou a apresentação. **Aceite:** a seleção visual do controle sempre corresponder ao conteúdo exibido.

### 13. Preservar as opções de colunas do Promo Gifts

Disponibilizar **3, 4, 5, 6 e 8 colunas** no modo Grid. Associar cada ícone ao seu número e a um nome acessível, como “6 colunas”, evitando que uma miniatura geométrica seja a única explicação.

Não apresentar esse seletor na Lista ou na Tabela: “colunas do grid” não são os campos da tabela. **Aceite:** as cinco preferências existirem, com disponibilidade compatível com o espaço real. Fonte: [ColumnSelector.tsx][pg-columns].

### 14. Calcular a capacidade pela largura do painel

Medir o contêiner dos arquivos, e não apenas `window.innerWidth`. Usar uma regra única de dimensionamento, com consultas de contêiner para apresentação e observação de tamanho quando necessária ao estado dos controles.

Como hipótese inicial para o protótipo, considerar cartões com largura mínima próxima de 176 px e espaçamento de 12 px; validar esses valores visualmente. **Aceite:** abrir ou recolher laterais atualizar a capacidade sem esmagar cartões. Referência: [MDN — CSS container queries][mdn-container].

### 15. Diferenciar preferência de capacidade momentânea

Guardar separadamente “colunas escolhidas” e “colunas que cabem agora”. Se o usuário preferir seis, mas o painel suportar quatro, reduzir a apresentação sem apagar a preferência.

Ao recuperar espaço, restaurar a densidade escolhida. Em áreas muito estreitas, permitir uma ou duas colunas como adaptação automática, sem inventar novos botões na referência. **Aceite:** o redimensionamento não sobrescrever permanentemente a escolha do usuário.

## Fase 4 — Redesenho do Grid e dos cartões

### 16. Padronizar a estrutura dimensional dos cartões

Definir três áreas consistentes: prévia, identificação e ações. Manter uma proporção previsível para a prévia, como 16:10, e limitar a altura dedicada aos metadados.

A altura não deve depender das dimensões originais da imagem. Evitar tanto cartões gigantes quanto miniaturas pequenas acompanhadas de rodapés excessivos. **Aceite:** arquivos de formatos diferentes comporem linhas visualmente regulares e permitirem maior aproveitamento da área disponível.

### 17. Evitar cortes que prejudiquem a identificação

Adotar enquadramento que preserve a imagem inteira nas miniaturas, especialmente porque os exemplos incluem capturas de tabelas e informações textuais.

Não tentar identificar automaticamente “foto” versus “documento fotografado” sem suporte real. O padrão seguro deve preservar o conteúdo; eventual recorte alternativo exige uma regra explícita. **Aceite:** bordas, totais e partes importantes das imagens continuarem visíveis, sem deformação.

### 18. Melhorar a leitura dos nomes técnicos

Priorizar `media_filename` quando ele existir. Para nomes pouco informativos derivados de armazenamento, prever uma identificação de apresentação, como tipo e data, mantendo o nome original disponível nos detalhes.

Isso não significa renomear o arquivo armazenado. Nos nomes truncados, preservar a extensão quando conhecida e permitir acesso ao texto completo. **Aceite:** identificar um arquivo não exigir interpretar uma longa sequência de caracteres técnicos.

### 19. Reorganizar a hierarquia dos metadados

Dar prioridade ao nome; em seguida, tipo e tamanho; depois, data e autoria. Combinar informações relacionadas em linhas compactas, sem repetir quatro blocos igualmente destacados.

Distinguir remetente conhecido de autoria não identificada. Não chamar automaticamente qualquer mensagem de agente de “Você” sem comprovação de autoria individual. **Aceite:** o cartão ser legível rapidamente, sem remover informações necessárias para distinguir arquivos semelhantes.

### 20. Simplificar ações e eliminar cliques ambíguos

Dar uma ação clara de visualização à miniatura e uma entrada explícita para detalhes. Reunir ações secundárias em “Mais ações”, mantendo nomes acessíveis e indicação dos bloqueios aplicáveis.

Separar fisicamente a seleção por checkbox das ações de abrir, encaminhar e inspecionar. Evitar cartões inteiros implementados como áreas clicáveis ambíguas com botões internos conflitantes. **Aceite:** cada clique executar somente a ação indicada pelo elemento acionado.

## Fase 5 — Lista e Tabela com funções distintas

### 21. Criar uma Lista realmente compacta

Projetar linhas horizontais, não cartões grandes reorganizados verticalmente. Como ponto de partida, usar miniatura de 48–56 px e altura de linha próxima de 64–72 px, sujeitas à validação tipográfica.

Exibir nome, identificação secundária e ações com alinhamento consistente. **Aceite:** a Lista apresentar mais arquivos por área vertical do que o Grid, sem depender de texto excessivamente pequeno.

### 22. Definir prioridades responsivas da Lista

Em áreas largas, mostrar nome, tipo, tamanho, data e remetente. Quando a largura diminuir, reorganizar informações secundárias numa segunda linha, preservando nome e ações essenciais.

Não reduzir indefinidamente todas as colunas nem ocultar informações sem deixá-las disponíveis nos detalhes. **Aceite:** nomes longos, remetentes extensos e metadados ausentes não desalinharem as linhas vizinhas.

### 23. Criar uma Tabela operacional

Definir os campos iniciais: seleção, arquivo com miniatura ou ícone, tipo, tamanho, data, remetente e ações. A coluna de seleção aparece conforme o modo de seleção.

Usar cabeçalhos claros e estrutura de tabela acessível. Datas e tamanhos devem seguir o mesmo formato dos demais modos. **Aceite:** comparar arquivos por seus metadados sem abrir cada cartão individualmente.

### 24. Adaptar a Tabela ao espaço do chat

Estabelecer prioridades de largura para preservar **Arquivo, Tipo, Data e Ações**. Em áreas menores, informações secundárias podem migrar para os detalhes, sem desaparecer do acesso do usuário.

Não permitir que a tabela expanda a largura de todo o ZAPP. Não trocar silenciosamente a preferência “Tabela” por “Lista”. **Aceite:** a visualização permanecer utilizável com as laterais abertas, sem provocar rolagem horizontal global.

### 25. Garantir paridade entre as três apresentações

Fazer os três renderizadores receberem a mesma coleção já filtrada e ordenada, o mesmo conjunto de seleção e os mesmos handlers.

Evitar versões separadas da lógica de encaminhamento, exclusão ou formatação dentro de cada visualização. Essa centralização acompanha o princípio usado no conteúdo do catálogo de referência. **Aceite:** uma ação disponível num modo ter o mesmo comportamento e a mesma restrição nos demais. Fonte: [CatalogContent.tsx][pg-content].

## Fase 6 — Tratamento de imagens, vídeos, áudios e documentos

### 26. Diferenciar miniaturas e seus estados

Criar um componente compartilhado de prévia para os três modos, com tratamento explícito de carregamento, imagem disponível, tipo sem miniatura e falha de carregamento.

Para vídeos, usar um pôster somente quando houver uma referência válida disponível; caso contrário, apresentar tipo, identificação e reprodução de maneira organizada. **Aceite:** um vídeo sem pôster não ser visualmente confundido com uma imagem quebrada.

### 27. Dar aos áudios uma apresentação adequada

Usar identificação visual de áudio e uma entrada clara para reprodução, sem reservar um grande retângulo vazio que imite uma fotografia.

Reutilizar o player e a integração de volume existentes no visualizador. Mostrar duração apenas quando disponível e não desenhar ondas sonoras fictícias. **Aceite:** o áudio ser distinguível, reproduzível e compacto, sem acrescentar transcrição ou funcionalidades inexistentes. Fonte: [MediaPreviewDialog.tsx][zapp-preview].

### 28. Tratar documentos sem simular prévias

Apresentar ícone de formato, nome, extensão conhecida e tamanho. Quando não houver miniatura de documento, usar um estado de documento reconhecível em vez de um espaço de mídia genérico.

Não prometer visualização nativa de PDF, planilhas ou apresentações sem um renderizador efetivamente disponível. **Aceite:** o usuário distinguir identificação do documento de uma prévia real de seu conteúdo.

### 29. Reutilizar e ajustar o visualizador existente

Manter um único `MediaPreviewDialog` para abrir arquivos vindos do Grid, da Lista ou da Tabela. Ajustar título, limites de altura e largura, carregamento e mensagem de erro.

Preservar os controles reais de imagem, áudio e vídeo, observando as políticas das ações externas. Ao fechar, devolver foco ao elemento que iniciou a visualização. **Aceite:** não surgirem três visualizadores divergentes conforme o modo escolhido.

### 30. Redesenhar os detalhes sem criar outra coluna permanente

Evitar que abrir detalhes transforme a interface numa sequência de painéis estreitos. Propor um painel sobreposto à área de arquivos ou um drawer, usando apresentação lado a lado somente quando houver largura suficiente.

Manter nome completo, data, remetente, legenda e ações pertinentes. Não substituir o painel cadastral do contato por detalhes do arquivo. **Aceite:** inspecionar uma mídia não tornar o restante da galeria ilegível.

## Fase 7 — Seleção múltipla e ações contextuais

### 31. Reproduzir o comportamento Selecionar/Cancelar

O botão “Selecionar” deve ativar checkboxes e mudar para “Cancelar”. A quantidade selecionada precisa ficar visível, usando destaque coerente com seleção, sem parecer um alerta de erro.

Reproduzir o modelo de interação da referência, mas dispensar animações e ornamentos que não ajudem a operação. **Aceite:** o usuário perceber imediatamente quando entrou ou saiu do modo de seleção. Fonte: [CatalogToolbar.tsx][pg-toolbar].

### 32. Selecionar por identificador estável

Manter a seleção como conjunto de IDs, não como índices das posições na tela. Renderização, ordenação e carregamento não podem trocar o significado de uma seleção.

Checkbox, cartão e linha devem compartilhar a mesma fonte de estado. Garantir que um clique não alterne o item duas vezes por propagação de eventos. **Aceite:** um arquivo continuar selecionado quando mudar de posição ou de modo de exibição.

### 33. Definir o ciclo de vida da seleção

Preservar a seleção ao trocar Grid, Lista e Tabela, ordenar e rolar. Ao mudar filtros, indicar quantos selecionados ficaram fora do resultado visível.

Limpar a seleção ao cancelar, trocar de contato ou sair da aba, sem persistir os IDs em armazenamento permanente. Não apagar a seleção após uma operação que falhou. **Aceite:** não ocorrerem ações acidentais sobre arquivos de outro contato ou contexto.

### 34. Dar significado preciso a “Selecionar todos”

A seleção geral deve indicar seu alcance: **todos os arquivos carregados que correspondem ao filtro atual**. Não incluir arquivos ainda não consultados nem transformar a ação em seleção de todo o histórico sem suporte específico.

Implementar corretamente o estado parcial do checkbox geral. **Aceite:** o número anunciado coincidir com o conjunto de arquivos efetivamente selecionado, inclusive após alteração de filtros.

### 35. Introduzir uma barra contextual de seleção

Mostrar contador, limpeza e cancelamento numa faixa compacta dentro da área de arquivos. A ação candidata para o conjunto é encaminhar os arquivos selecionados, reutilizando o fluxo real do chat, após a correção da etapa 41.

Não acrescentar download em ZIP, exclusão em massa ou outros comandos sem suporte e autorização correspondentes. **Aceite:** nenhuma ação coletiva ser apenas decorativa ou apresentar sucesso sem processamento confirmado.

## Fase 8 — Preferências, integração e navegação

### 36. Persistir preferências com identificação própria

Criar armazenamento versionado e específico para a visualização de arquivos, separado de `catalog-view-mode` e `product-grid-columns`.

Identificar a preferência por usuário e, quando esse contexto já existir no sistema, por organização. Tratar indisponibilidade do armazenamento sem derrubar a interface. **Aceite:** a preferência de um operador não ser aplicada indevidamente a outro no mesmo navegador.

### 37. Definir defaults próprios para Arquivos

Propor Grid como modo inicial e quatro colunas como preferência inicial de projeto, sempre limitada pela largura disponível. A escolha final deve passar pela aprovação visual.

Não copiar o reset diário do catálogo que força Grid, seis colunas e ordenação de novidades: essa é uma regra específica encontrada no Promo Gifts, não uma exigência da área de arquivos. **Aceite:** preferências válidas não serem sobrescritas diariamente. Fonte: [useCatalogState.ts][pg-state].

### 38. Restaurar o contexto sem persistir conteúdo sensível

Guardar temporariamente, por contato, busca, filtro, ordenação e referência de posição na navegação, permitindo sair para o Chat e voltar aos Arquivos.

Persistir de forma durável somente preferências de apresentação necessárias. Não salvar URLs assinadas, conteúdo de mensagens ou nomes de arquivos para sustentar esse comportamento. **Aceite:** retornar à aba restaurar a navegação pertinente, sem recuperar a seleção operacional já encerrada.

### 39. Preservar o funcionamento do Chat durante a integração

Manter a estratégia de Chat montado utilizada por `ConversationTabContent`. Não desmontar a conversa para acomodar a nova estrutura da aba Arquivos.

Qualquer ajuste de contêiner deve preservar rascunho, posição das mensagens, gravação e comportamento das demais abas. **Aceite:** alternar entre Chat e Arquivos não causar perda de estado nem introduzir uma regressão fora do escopo. Fonte: [ConversationTabContent.tsx][zapp-tab-content].

### 40. Consolidar rolagem e sobreposições

Definir uma área principal de rolagem para os arquivos. Fixar as ferramentas quando necessário, sem criar uma sequência de rolagens aninhadas em painel, grid e tabela.

Popover, menus, barra de seleção e detalhes devem respeitar a hierarquia das sobreposições do ZAPP, inclusive os controles flutuantes presentes nas capturas. **Aceite:** ferramentas não serem cortadas e o último arquivo permanecer totalmente alcançável.

## Fase 9 — Dados e ações confiáveis

### 41. Corrigir o encaminhamento antes de ampliá-lo

Substituir a ligação vazia da aba por uma operação real, reaproveitando o serviço de envio já usado pelo chat. Transportar a referência correta da mídia e seus metadados necessários.

Aguardar o resultado assíncrono antes de comunicar sucesso. Para vários arquivos ou destinatários, informar falhas parciais e impedir repetição acidental dos envios concluídos. **Aceite:** só apresentar confirmação após resultado efetivo, não após fechar o diálogo. Fontes: [FilesTab.tsx][zapp-files] e [useForwardMessage.ts][zapp-forward].

### 42. Aplicar uma política coerente às ações de mídia

Preservar o bloqueio de download identificado no código. Ajustar a apresentação para informar a restrição antes de induzir uma tentativa frustrada.

Revisar conjuntamente baixar, copiar link e abrir externamente, sem considerar a simples remoção de um botão como validação da proteção do arquivo. Reutilizar a resolução de URLs privadas e não apresentar URLs temporárias como permanentes. **Aceite:** as três visualizações respeitarem a mesma política. Fontes: [mediaUtils.ts][zapp-media-utils] e [useResolvedStorageUrl.ts][zapp-storage].

### 43. Esclarecer a semântica da exclusão

O código atual confirma “Apagar esta mensagem para você?”, mas executa um `update` em `messages`, alterando `is_deleted` e `content`. Antes de preservar esse texto, confirmar o alcance real da operação e suas permissões.

Centralizar a ação, harmonizar consulta e contagens com a regra de exclusão e retirar o item da seleção quando apropriado. **Aceite:** texto, efeito persistido e visibilidade posterior descreverem a mesma operação. Fonte: [FileCard.tsx][zapp-card].

### 44. Corrigir abrangência, paginação e contagens

Confirmar o escopo por contato atualmente usado e ajustar os textos para não prometer outro recorte. Planejar paginação efetiva para ultrapassar o limite de 200, sem apenas substituí-lo por um número maior.

Busca, ordenação e contagens devem abranger o conjunto anunciado, não apenas uma página arbitrária. Conferir a compatibilidade com `get_conversation_tab_counts`. Mudanças necessárias em contratos de banco devem ser explicitadas separadamente. **Aceite:** o arquivo 201 ser localizável e os totais terem significado correto. Fontes: [useContactMedia.ts][zapp-media] e [useConversationTabCounts.ts][zapp-counts].

### 45. Separar carregamento, vazio, erro e atualização

Implementar estados distintos para carregamento inicial, ausência real de arquivos, filtro sem resultados, falha de consulta, carregamento adicional e falha de miniatura.

Usar skeletons correspondentes ao modo ativo, sem apagar resultados válidos durante uma atualização. Corrigir o ciclo de erro das imagens para permitir recuperação após renovação da URL. **Aceite:** uma indisponibilidade não aparecer como “Nenhum arquivo encontrado” e uma falha parcial não inutilizar a galeria.

## Fase 10 — Desempenho, acessibilidade e homologação

### 46. Controlar o custo de renderização

Carregar miniaturas conforme sua proximidade da área visível e evitar resolver desnecessariamente todas as mídias de um histórico extenso. Avaliar virtualização com o contêiner de rolagem do chat, não com a janela inteira.

Manter seleção e posição estáveis durante carregamento progressivo. Utilizar coleções de teste com 56, 200, 201 e 1.000 arquivos. **Aceite:** abrir a aba não exigir baixar todos os arquivos nem montar simultaneamente todos os players.

### 47. Completar a operação por teclado

Garantir acesso a busca, filtros, Layout, seleção e ações sem mouse. Nos grupos de opção única, implementar foco e navegação por setas coerentes com o padrão escolhido.

`Esc` deve fechar a sobreposição ativa, devolvendo foco corretamente; não deve disparar efeitos destrutivos. Não atribuir semântica de grid interativo a uma galeria sem implementar seu comportamento correspondente. **Aceite:** concluir o fluxo de localizar, selecionar e inspecionar um arquivo apenas pelo teclado. Referência: [W3C — Radio Group Pattern][w3c-radio].

### 48. Validar contraste, alvos e foco

Verificar contraste mínimo de 4,5:1 para textos normais, observadas as exceções pertinentes, e não depender apenas de cor para indicar seleção.

Projetar ações compactas com áreas confortáveis, preferencialmente de 32–36 px, verificando o critério mínimo de alvos e suas exceções. Garantir que barras fixas não ocultem o elemento focado e respeitar redução de movimento. **Aceite:** densidade visual não comprometer leitura ou operação. Referência: [W3C — Understanding Contrast (Minimum)][w3c-contrast].

### 49. Ampliar os testes de regressão

Preservar e expandir a suíte existente de `FilesTab`, que cobre contagens, renderização, filtro, busca, vazio e abertura de detalhes.

Acrescentar testes dos três modos, preferências inválidas, limites de largura, seleção entre modos, troca de contato, erros de mídia, arquivo 201 e encaminhamento assíncrono. Conferir permissões e invariantes de IDs e ordenação. **Aceite:** os testes verificarem comportamentos, não apenas a existência dos novos botões. Fonte: [FilesTab.test.tsx][zapp-tests].

### 50. Homologar visualmente e preparar entrega reversível

Comparar o resultado dentro do ZAPP completo, especialmente em **1920 × 1080**, além de resoluções menores e diferentes níveis de zoom. Avaliar laterais abertas e recolhidas, os três modos, colunas compatíveis, seleção, detalhes e estados de erro.

Organizar entregas revisáveis de estrutura, visualizações e integração das ações. Exigir aprovação visual e funcional antes da liberação, com reversão definida. **Aceite:** a nova experiência estar validada no contexto real do chat, não apenas numa tela isolada.

---

## Resultado esperado

O usuário encontrará **a mesma lógica de operação do Promo Gifts V4**: botão Layout, alternância entre Grid/Lista/Tabela, preferência de colunas e modo Selecionar. Entretanto, tudo será dimensionado para o painel central do ZAPP e alimentado pelos arquivos do contato, sem dependências comerciais.

O **Grid** será orientado ao reconhecimento visual; a **Lista**, à consulta compacta; e a **Tabela**, à comparação de metadados. Abrir detalhes não deverá comprimir indevidamente a galeria, trocar de visualização não deverá perder filtros ou seleção, e nenhuma ação deverá anunciar um resultado que não ocorreu.

**O critério final não é somente “ficou parecido com o Promo Gifts”: é reproduzir seu padrão de interação, adaptado ao chat, com dados consistentes, ações verificáveis e sem regressões no atendimento.**

[pg-version]: https://github.com/adm01-debug/Promo_Gifts_V4/commit/92690bd8491d787140d7a61153a4f86506d548cc
[zapp-version]: https://github.com/adm01-debug/Zapp_Web_V2/commit/826fa1486a51d8bfdab285abb5a6e76ce7921426
[pg-content]: https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/components/catalog/CatalogContent.tsx
[pg-selection]: https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/components/catalog/useCatalogSelection.ts
[pg-layout]: https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/components/products/LayoutPopover.tsx
[pg-columns]: https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/components/products/ColumnSelector.tsx
[pg-state]: https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/hooks/products/useCatalogState.ts
[pg-toolbar]: https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/components/catalog/CatalogToolbar.tsx
[zapp-files]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/tabs/FilesTab.tsx
[zapp-card]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/tabs/FileCard.tsx
[zapp-details]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/tabs/FileDetailPanel.tsx
[zapp-media]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/hooks/chat/useContactMedia.ts
[zapp-media-utils]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/media-gallery/mediaUtils.ts
[zapp-forward]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/hooks/chat/useForwardMessage.ts
[zapp-tab-content]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/chat/ConversationTabContent.tsx
[zapp-preview]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/media-gallery/MediaPreviewDialog.tsx
[zapp-storage]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/hooks/storage/useResolvedStorageUrl.ts
[zapp-counts]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/hooks/chat/useConversationTabCounts.ts
[zapp-tests]: https://github.com/adm01-debug/Zapp_Web_V2/blob/826fa1486a51d8bfdab285abb5a6e76ce7921426/src/components/inbox/tabs/__tests__/FilesTab.test.tsx
[mdn-container]: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
[w3c-radio]: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
[w3c-contrast]: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
