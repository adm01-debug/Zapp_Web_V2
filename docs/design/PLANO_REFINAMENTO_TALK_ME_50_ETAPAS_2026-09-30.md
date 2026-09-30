# TALK ME — Plano de refinamento visual e navegação em 50 etapas

**Data:** 30/09/2026.  
**Status:** planejamento; todas as 50 etapas estão pendentes.  
**Entrega autorizada nesta solicitação:** criar e commitar este documento no repositório.  
**Base consultada:** `main` e `origin/main` em `826fa1486a51d8bfdab285abb5a6e76ce7921426`, conferidas também no remoto.  
**Escopo:** painel opaco, carrossel principal mais alto e faixa inferior sincronizada de atendimentos em preto e branco.

Este commit contém somente planejamento. Implementação, instalação de dependências, alteração de banco e publicação das mudanças de interface são trabalho futuro. A publicação do documento não indica execução ou validação dos cenários descritos abaixo.

## Resultado pretendido

Organizar a experiência TALK ME em um painel escuro que separe visualmente os cartões do Inbox ao fundo. Posicionar o destaque principal aproximadamente 20% mais alto e apresentar, na parte inferior, uma faixa horizontal com todos os atendimentos elegíveis do departamento selecionado, acessíveis por navegação progressiva. Os cartões inferiores terão apresentação em preto e branco, tamanho reduzido e setas nas duas extremidades.

Selecionar um cartão inferior deverá atualizar o contato em destaque. O botão **Aceitar e conversar** continuará sendo a ação explícita para assumir o atendimento. As duas regiões representarão a mesma fila, a mesma busca e a mesma seleção.

## Referências e relação com o trabalho existente

- [Feature Carousel — Ravi Katiyar / 21st.dev](https://21st.dev/@ravikatiyar162/components/feature-carousel): referência para painel delimitado, cartão principal e profundidade dos vizinhos.
- [Galeria enviada pelo usuário](https://21st.dev/community/components/s/gallery?preview=%2F%40ravikatiyar162%2Fcomponents%2Ffeature-carousel): contexto original da referência visual.
- [Linear Carousel — animbits / 21st.dev](https://21st.dev/@animbits/components/specials-linear-carousel): referência para faixa horizontal e navegação. A página descreve loop, arraste e autoplay; esses recursos não são automaticamente requisitos deste produto.
- Prints enviados na conversa: base para avaliar transparência excessiva, altura do destaque e espaço inferior. Não reproduzir dados reais desses prints em fixtures, testes ou relatórios públicos.
- [Plano original do TALK ME](PLANO_TALK_ME_100_ETAPAS_2026-09-30.md) e [relatório original](RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md): histórico da funcionalidade. Este documento especifica o refinamento subsequente; resultados históricos não comprovam validação deste novo layout.

## Requisitos e decisões de planejamento

| Tema | Situação | Diretriz |
|---|---|---|
| Separação do fundo | Solicitado | Painel retangular amplo, escuro, opaco e com cantos arredondados atrás do carrossel. |
| Destaque mais alto | Solicitado | Elevar visualmente o carrossel principal em aproximadamente 20%, respeitando cabeçalho e controles. |
| Faixa inferior | Solicitado | Disponibilizar todos os atendimentos elegíveis do departamento em cartões navegáveis. |
| Preto e branco | Solicitado para a faixa inferior | Fotografias em escala de cinza; superfícies e textos neutros. |
| Cartão principal colorido | Premissa de planejamento | Preservar a foto colorida e a hierarquia do destaque principal. Ainda não houve confirmação individual. |
| Redução de 40% | Solicitado; base dimensional pendente | Planejar inicialmente 60% da largura e da altura do principal, com texto legível e adaptação responsiva. |
| Setas laterais | Solicitado | Uma seta de cada lado da faixa inferior; manter também a navegação do principal. |
| Sentido anti-horário | Solicitado; tradução visual proposta | No avanço, o cartão ativo sai à esquerda e o próximo chega pela direita. Validar essa interpretação visual. |
| Rotação automática | Não confirmada | Base proposta: manter avanço manual. Se autoplay for solicitado na execução, aplicar as condições da etapa 024. |
| Aceite | Comportamento existente a preservar | Selecionar apenas apresenta o contato; atribuir e abrir a conversa exige o botão de aceite e confirmação do servidor. |
| Abrangência da faixa | Interpretação operacional | Todos os resultados da fila e da busca atuais, acessíveis por paginação; não significa todos simultaneamente na largura da tela. |

As três perguntas da revisão anterior não receberam respostas individuais. Este plano registra as premissas para permitir a revisão sem apresentá-las como escolhas aprovadas. Resolver apenas as decisões que afetarem a execução, na etapa 002, considerando qualquer orientação posterior do usuário.

## Evidências do código consultado

| Arquivo | Evidência relevante |
|---|---|
| `src/features/talk-me/TalkMeView.tsx` | Diálogo amplo; fundo com transparência; `TalkMeCard` interno; renderização do ativo e dos vizinhos imediatos; seleção por `contactId` e escopo; setas manuais e CTA separado. |
| `src/features/talk-me/TalkMeView.tsx` | Cartão desktop com largura de 360 px e altura máxima de 490 px; altura real depende do espaço disponível. Movimento usa deslocamento, escala e rotação em Y. |
| `src/features/talk-me/TalkMeView.tsx` | Não há timer para avanço automático dos cartões. O intervalo existente atualiza o texto do tempo de espera. |
| `src/features/talk-me/useTalkMeQueue.ts` | Página de 50 itens; cursor por espera e contato; cancelamento e geração de consultas; busca com debounce; reconciliação por eventos. |
| `src/features/talk-me/useTalkMeQueue.ts` | Atualização da lista sem append substitui os itens carregados. Preservar uma seleção de página posterior exigirá atenção no refinamento. |
| `src/features/talk-me/types.ts` | Identidade estável do contato, foto, empresa, cargo, fila, espera, posição e resumo da última mensagem já fazem parte do modelo. |
| `src/features/talk-me/__tests__/TalkMeView.test.tsx` | Base dos testes da interface e do fluxo de seleção/aceite. |
| `src/features/talk-me/__tests__/useTalkMeQueue.test.tsx` | Base dos testes de busca, consulta, paginação e atualização. |
| `src/components/ui/liquid-metal-button.tsx` | Botão de entrada já refinado para centro preto e borda metálica. Não faz parte da mudança visual planejada aqui. |

Nomes de componentes novos citados abaixo são sugestões, não arquivos existentes. Não há necessidade de migration identificada para o layout; qualquer lacuna real no contrato de dados deverá ser comprovada e delimitada antes de ampliar a implementação.

## Composição proposta

```text
TALK ME                     Departamento | Buscar | Atualizar

┌──────────────── Painel opaco ──────────────────────────────┐
│ Quantidade aguardando                    Posição na fila  │
│                                                          │
│      ‹      [vizinho] [CONTATO ATIVO] [vizinho]      ›      │
│                       foto em cores                      │
│                                                          │
│                    Aceitar e conversar                   │
└──────────────────────────────────────────────────────────┘

Aguardando atendimento
‹    [cartão P&B] [cartão P&B] [cartão P&B] [cartão P&B]    ›
```

O desenho representa hierarquia, não medidas finais. A faixa inferior também terá superfície opaca. “Parte inferior” significa abaixo do destaque na composição; não implica fixação sobre o conteúdo ou sobreposição ao botão.

## Método de execução futura

Cada etapa contém uma ação concreta, uma entrega verificável e um critério de aceite. Registrar execução e evidências em documento separado, relacionando-as aos números abaixo. As etapas só poderão ser marcadas como concluídas após a autorização para implementar e a respectiva verificação.

**Dependências:** executar 001–010 antes da construção do layout; 011–020 antes da integração; 021–028 junto da navegação; 029–038 antes dos testes completos; 039–047 antes da publicação; 048–050 para entrega e encerramento. Decisões pendentes bloqueiam apenas o trabalho que delas depende.

## Bloco A — Escopo, simulações e geometria

### 001 — Revalidar a versão de partida
- **Ação:** consultar a `main` mais recente, instruções aplicáveis, alterações locais e trabalhos concorrentes nos arquivos envolvidos.
- **Entrega:** registro do SHA, situação da árvore e relação dos pontos de integração.
- **Aceite:** usar a versão corrente na execução; preservar mudanças de terceiros e manter a base rastreável.

### 002 — Consolidar as decisões visuais pendentes
- **Ação:** fechar alcance do preto e branco, referência dimensional dos 40%, interpretação do deslocamento de 20% e movimento manual ou automático. Aproveitar respostas já dadas posteriormente, sem repetir perguntas resolvidas.
- **Entrega:** tabela de decisões atualizada com exemplos de dimensão e direção.
- **Aceite:** nenhuma premissa é tratada como aprovação implícita de autoplay ou de alteração do fluxo de aceite.

### 003 — Registrar a aparência de referência
- **Ação:** capturar a tela atual com dados sintéticos em 1920×1080, 1366×768, 1024×768, 390×844, 320×568 e 667×375; anotar altura do cabeçalho, centro do destaque e posição do CTA.
- **Entrega:** capturas e medidas comparáveis antes/depois.
- **Aceite:** o ganho visual pode ser avaliado nas mesmas condições, sem expor contatos reais.

### 004 — Preparar a matriz de cenários
- **Ação:** montar fixtures com 0, 1, 2, 3, 32, 50, 51, 101 e 500 atendimentos, incluindo nomes longos, foto ausente, mensagem de mídia e cadastro incompleto.
- **Entrega:** conjunto sintético reutilizável por protótipo e testes.
- **Aceite:** a matriz cobre limites de página, ausência de vizinhos e filas extensas sem depender da produção.

### 005 — Simular os fluxos antes de construir
- **Ação:** percorrer em storyboard abertura, escolha no rodapé, setas principais, busca, troca de departamento, paginação, saída de contato e aceite concorrente.
- **Entrega:** tabela de estado inicial, evento, contato ativo, faixa visível e resultado esperado.
- **Aceite:** identificar antecipadamente situações em que a imagem e o contato enviado ao aceite poderiam divergir.

### 006 — Definir o orçamento de altura
- **Ação:** distribuir cabeçalho, contadores, painel principal, CTA, faixa inferior e espaçamentos por breakpoint. Simular 490 px de destaque mais 294 px de miniatura e demonstrar onde essa soma não cabe.
- **Entrega:** tabela dimensional para desktop, celular e tela baixa, com rolagem prevista quando necessária.
- **Aceite:** nenhum elemento essencial é cortado para cumprir simultaneamente percentuais incompatíveis com a altura disponível.

### 007 — Especificar o painel opaco
- **Ação:** definir superfície preta/grafite, raio, borda discreta e espaçamento. Remover transparência nas áreas atrás do conteúdo e conferir a interação com o overlay existente.
- **Entrega:** especificação de camadas e tokens de cor; superfície igualmente legível para a faixa inferior.
- **Aceite:** textos, avatares e controles do Inbox não atravessam visualmente o painel; sombras e cartões ficam dentro dos limites corretos.

### 008 — Acomodar cabeçalho e indicadores
- **Ação:** distribuir título, retorno, departamento, busca, atualização e contagens sem colisão com o destaque elevado. Permitir quebra de linhas controlada em telas estreitas.
- **Entrega:** cabeçalho com ordem visual e de teclado definida.
- **Aceite:** todas as ações permanecem utilizáveis com nomes de departamento longos, zoom e pouco espaço horizontal.

### 009 — Definir a elevação de aproximadamente 20%
- **Ação:** usar como referência a área útil abaixo do cabeçalho: alvo inicial do centro igual ao centro anterior menos 20% dessa altura. Limitar o deslocamento pelos espaços mínimos e pela altura do cartão.
- **Entrega:** medidas anteriores, alvo e resultado efetivo por viewport.
- **Aceite:** em desktop há elevação perceptível; ajustes em telas baixas ficam documentados, sem esconder conteúdo por transformação negativa.

### 010 — Posicionar a ação de aceite
- **Ação:** colocar o CTA próximo ao destaque e antes da faixa inferior, com respiro e largura adequada. Preservar identificação do contato durante a leitura e a ação.
- **Entrega:** posição, tamanho e estados ocupado/desabilitado definidos.
- **Aceite:** o botão não cobre cartões, permanece alcançável e corresponde sempre ao atendimento principal visível.

## Bloco B — Cartões e estrutura da interface

### 011 — Refinar o cartão principal
- **Ação:** organizar foto, nome, empresa, cargo, espera e última mensagem no espaço disponível; conservar hierarquia e profundidade dos vizinhos.
- **Entrega:** variante principal responsiva, com altura mínima útil e alternativa para telas baixas.
- **Aceite:** identidade e mensagem permanecem legíveis; o cartão ativo se distingue por tamanho, nitidez e estado acessível.

### 012 — Dimensionar os cartões inferiores
- **Ação:** aplicar a interpretação aprovada da redução. Na premissa de 60% por eixo, partir de cerca de 216×294 px quando o principal medir 360×490 px; definir medidas próprias para breakpoints menores.
- **Entrega:** tabela de medidas e espaçamentos, com tipografia independente da escala geométrica.
- **Aceite:** a redução é mensurável e o texto não se torna ilegível por um `scale` aplicado ao conteúdo inteiro.

### 013 — Definir o acabamento em preto e branco
- **Ação:** aplicar escala de cinza à foto e cores neutras à superfície dos cartões inferiores. Usar borda, espessura ou marcador para a seleção, mantendo o tratamento P&B aprovado.
- **Entrega:** estados normal, selecionado, foco, hover e indisponível.
- **Aceite:** contraste suficiente e distinção de seleção sem depender exclusivamente de cor; tema claro não introduz transparência indesejada.

### 014 — Definir as informações da faixa inferior
- **Ação:** priorizar foto, nome e espera; incluir empresa e trecho de mensagem conforme o espaço. Manter cargo, mensagem mais completa e demais dados no principal.
- **Entrega:** hierarquia compacta e regras explícitas de truncamento.
- **Aceite:** o usuário identifica contatos sem abrir todos os cartões; dados omitidos visualmente ficam disponíveis no destaque após seleção.

### 015 — Tratar conteúdo ausente ou extremo
- **Ação:** prever iniciais, erro de imagem, nomes iguais, campos vazios, textos longos, quebras de linha, emojis e mídia sem legenda. Reservar dimensões da imagem antes do carregamento.
- **Entrega:** variações de conteúdo aplicadas às duas apresentações.
- **Aceite:** nenhum estado quebra a altura, revela identificadores técnicos como rótulo ou inventa informação do contato.

### 016 — Organizar os componentes do refinamento
- **Ação:** avaliar extração de painel, carrossel principal, cartão compacto e faixa inferior; manter o controlador de dados existente. Reutilizar utilitários de nome, espera e resumo.
- **Entrega:** responsabilidades e interfaces de componentes documentadas no PR futuro.
- **Aceite:** evitar duplicar consulta, regra de elegibilidade ou lógica de aceite; dependência externa só entra com necessidade demonstrada.

### 017 — Centralizar a identidade selecionada
- **Ação:** manter uma seleção por `contactId`, vinculada a departamento e busca. Derivar os índices das duas apresentações a partir da mesma identidade.
- **Entrega:** regras de seleção inicial, preservação, remoção e troca de escopo.
- **Aceite:** atualizações de ordem não selecionam outra pessoa por coincidência de índice; as duas áreas nunca possuem seleções independentes.

### 018 — Separar semântica e identificadores das variantes
- **Ação:** criar identificadores DOM distintos para a apresentação principal e a compacta do mesmo contato. Definir nomes e descrições acessíveis sem duplicar regiões vivas.
- **Entrega:** convenção de IDs por variante e estratégia de anúncio da seleção.
- **Aceite:** não há IDs repetidos, referências ARIA ambíguas ou leitura simultânea dos vizinhos decorativos.

### 019 — Montar o destaque na nova composição
- **Ação:** integrar painel, cartão principal, vizinhos e setas com limites de largura/altura e recorte visual apropriado. Considerar início, meio e fim da fila.
- **Entrega:** carrossel principal funcional no espaço elevado.
- **Aceite:** sombras e animações não encobrem o cabeçalho, as setas ficam acessíveis e o foco não é recortado pelo contêiner.

### 020 — Montar a faixa horizontal e suas setas
- **Ação:** criar região inferior com superfície opaca, título contextual, viewport de cartões e setas nas extremidades, reservando espaço para os controles.
- **Entrega:** faixa que mostra quantos cartões couberem e permite alcançar os demais.
- **Aceite:** nenhuma rolagem horizontal da página inteira; um único contato não gera duplicatas visuais para preencher espaço.

## Bloco C — Navegação, movimento e acessibilidade de interação

### 021 — Sincronizar o clique na faixa inferior
- **Ação:** atualizar a seleção compartilhada ao clicar em um cartão compacto e levar esse contato ao destaque principal.
- **Entrega:** fluxo de pré-visualização sincronizado e estado selecionado no rodapé.
- **Aceite:** clicar não assume atendimento nem abre o chat; nome, mensagem, posição e CTA passam a representar a mesma identidade.

### 022 — Diferenciar deslocar a faixa de selecionar contato
- **Ação:** definir as setas inferiores como navegação do viewport, aproximadamente uma largura útil por acionamento com sobreposição visual. O clique no cartão seleciona; as setas principais selecionam anterior/próximo.
- **Entrega:** nomes acessíveis específicos e comportamento documentado dos dois pares de setas.
- **Aceite:** explorar a fila inferior não muda silenciosamente o contato pronto para aceite; navegar no principal mantém seu cartão compacto visível.

### 023 — Preservar a direção visual aprovada
- **Ação:** implementar transições em que avançar traz o próximo pela direita e leva o atual à esquerda, se essa interpretação for confirmada. Definir também a transição para saltos de vários contatos.
- **Entrega:** parâmetros de duração, escala, profundidade e direção coerentes entre navegações.
- **Aceite:** alternar direção rapidamente não deixa cartões sobrepostos ou um contato antigo em primeiro plano; animação não altera a ordem da fila.

### 024 — Fechar a política de movimento automático
- **Ação:** manter navegação manual como base enquanto autoplay não estiver confirmado. Se aprovado, definir cadência, controle visível de pausar/retomar e suspensão ao focar, interagir, ocultar a aba, buscar ou iniciar aceite.
- **Entrega:** decisão e, somente quando aplicável, regras do timer e de retomada explícita após interação.
- **Aceite:** nenhum avanço automático muda o alvo durante o aceite; não há loop infinito presumido nem retorno ao início antes de conhecer o fim real da fila.

### 025 — Implementar toque e arraste com distinção de clique
- **Ação:** definir limiar de movimento, cancelamento e convivência entre arraste horizontal, rolagem vertical e toque para selecionar.
- **Entrega:** gestos funcionais em mouse, touch e ponteiro, sem prender a rolagem do diálogo.
- **Aceite:** terminar um arraste sobre um cartão não o seleciona por acidente; os controles permanecem utilizáveis sem gestos.

### 026 — Definir navegação por teclado e foco
- **Ação:** aplicar foco móvel na faixa, teclas de direção e, quando úteis, Home/End para o conjunto carregado. Limitar atalhos à região correspondente e preservar busca, combobox e CTA.
- **Entrega:** sequência de Tab, seleção por teclado e foco após desaparecimento do item.
- **Aceite:** a pessoa selecionada é anunciada; setas no campo de texto não movimentam o carrossel e a virtualização não desmonta o elemento focado.

### 027 — Respeitar movimento reduzido
- **Ação:** remover rotação, desfoque animado, rolagem suave e autoplay quando houver preferência por movimento reduzido. Manter transição imediata compreensível.
- **Entrega:** comportamento equivalente com animação reduzida e limpeza de timers ao desmontar.
- **Aceite:** toda a navegação e o aceite funcionam sem efeitos; troca da preferência durante a sessão não deixa movimento residual.

### 028 — Preservar abertura, fechamento e retorno
- **Ação:** conferir foco inicial, Escape, botão voltar, reabertura, posição da faixa e política de recuperação da seleção no mesmo escopo. Preservar a conversa e o rascunho existentes atrás do diálogo.
- **Entrega:** contrato de entrada/saída integrado ao Inbox.
- **Aceite:** fechar devolve o foco ao gatilho correto; reabrir revalida disponibilidade e não oferece contato já assumido como se ainda estivesse livre.

## Bloco D — Fila completa, atualização e aceite

### 029 — Integrar a navegação à paginação existente
- **Ação:** carregar a próxima página antes de atingir o fim dos itens disponíveis na faixa ou no destaque, usando cursor e guardas contra chamadas simultâneas.
- **Entrega:** acesso progressivo a toda a fila sem carregar tudo na abertura.
- **Aceite:** os casos com 51, 101 e 500 contatos permitem chegar ao último elegível sem duplicação ou bloqueio no item 50.

### 030 — Tratar avanço enquanto a próxima página carrega
- **Ação:** guardar a intenção de avançar quando o próximo contato ainda não chegou. Ao concluir a consulta, selecionar o próximo apenas se escopo e intenção continuarem válidos.
- **Entrega:** feedback de carregamento e recuperação em falha, com prevenção de cliques repetidos.
- **Aceite:** uma seta aparentemente habilitada não fica sem efeito; mudar fila, voltar ou fechar cancela a intenção antiga.

### 031 — Harmonizar totais, posições e itens carregados
- **Ação:** diferenciar total do departamento, total filtrado, posição na busca e quantidade já carregada. Revalidar a semântica devolvida pelo controlador antes de redigir rótulos.
- **Entrega:** contadores coerentes no cabeçalho, painel e faixa.
- **Aceite:** “todos” não é confundido com os primeiros 50; mudanças de filtro não exibem posições impossíveis ou resultados vazios com ação de aceite ativa.

### 032 — Sincronizar busca e cancelamento
- **Ação:** aplicar a mesma busca nas duas regiões, preservar debounce/cancelamento existentes e bloquear aceite durante resultados pendentes.
- **Entrega:** reset previsível de seleção e posição da faixa ao mudar a consulta.
- **Aceite:** busca rápida seguida de resposta atrasada nunca restaura cartões de um termo anterior; erro e ausência de resultado têm apresentação própria.

### 033 — Sincronizar mudança de departamento
- **Ação:** invalidar seleção, páginas, intenções de navegação e carregamentos vinculados à fila anterior; respeitar departamentos disponíveis ao usuário.
- **Entrega:** transição de escopo sem mistura de dados.
- **Aceite:** a fila A não reaparece depois de selecionar B, mesmo se uma consulta antiga terminar por último; não há cartão antigo aceitando clique na transição.

### 034 — Preservar seleção em páginas posteriores durante atualizações
- **Ação:** simular seleção além do item 50 seguida de refresh. Definir reconciliação paginada até a identidade/posição relevante, cancelável e com trabalho limitado, ou outra solução sustentada pelo contrato existente.
- **Entrega:** estratégia que preserva seleção ainda válida e informa revalidação quando necessária.
- **Aceite:** atualizar não é interpretado automaticamente como remoção só porque o contato ficou fora da primeira página; dados guardados em memória não autorizam aceite sem validação atual.

### 035 — Reconciliar entrada, saída e mudança de ordem
- **Ação:** tratar novos atendimentos, mensagens, aceite por terceiro, transferência e perda de disponibilidade nas duas regiões. Escolher próximo elegível ou anterior no fim, anunciando a mudança quando afetar a seleção.
- **Entrega:** política determinística de remoção e atualização do foco.
- **Aceite:** nenhuma cópia antiga permanece acionável; o último item removido leva ao estado vazio, sem deixar CTA associado ao contato anterior.

### 036 — Proteger ordenação, cursor e fim da fila
- **Ação:** conservar ordem do servidor, deduplicar por identidade, lidar com página vazia após atualização e reconhecer o fim real do conjunto. Testar empates e remoção do último item carregado.
- **Entrega:** regras contra cursor repetido, consultas sem progresso e saltos indevidos.
- **Aceite:** não há laço de carregamento nem reordenação causada apenas pela animação; “anterior/próximo” acompanha a fila atual.

### 037 — Fixar a identidade durante o aceite
- **Ação:** capturar o contato acionado e congelar mudanças de seleção relevantes enquanto a requisição estiver em andamento; desabilitar ações duplicadas e eventual autoplay.
- **Entrega:** fluxo que mantém a identidade explícita até o resultado do servidor.
- **Aceite:** setas, clique, nova mensagem ou timer não mudam quem será assumido; o chat aberto corresponde exatamente ao aceite confirmado.

### 038 — Especificar falhas e recuperação
- **Ação:** tratar erro inicial, erro ao carregar mais, refresh indisponível, conflito de aceite e falha ao abrir o chat após aceite bem-sucedido. Oferecer repetição no contexto correto.
- **Entrega:** mensagens e estados que distinguem ausência de dados, indisponibilidade e confirmação de atribuição.
- **Aceite:** falha ao carregar uma página não apaga silenciosamente toda a faixa; conflito não assume outro contato automaticamente e reentrada não duplica atribuição.

## Bloco E — Validação, publicação futura e encerramento

### 039 — Validar acessibilidade das duas regiões
- **Ação:** verificar nomes, descrições, contraste, foco visível, alvos de toque, anúncios moderados e ausência de IDs repetidos; executar axe e revisão manual por teclado/leitor de tela.
- **Entrega:** evidências nos estados ativo, vazio, carregando e conflito.
- **Aceite:** nenhum bloqueio de navegação ou violação séria atribuível à mudança; as duas representações não produzem anúncios duplicados a cada evento.

### 040 — Validar responsividade e zoom
- **Ação:** usar as dimensões da etapa 003, orientação paisagem, zoom de 200%, teclado virtual e área segura do celular. Conferir fluxo de rolagem do diálogo.
- **Entrega:** capturas e medidas com identidade, CTA e faixa alcançáveis.
- **Aceite:** textos não ficam escondidos sob máscaras; botões não invadem os cartões; adaptações dos percentuais ficam explícitas nos viewports restritos.

### 041 — Validar desempenho com fila extensa
- **Ação:** medir consultas, renderizações, memória e fluidez com 500 contatos sintéticos. Usar carregamento de imagens sob demanda e considerar virtualização se a medição justificar, preservando foco e semântica.
- **Entrega:** comparação com a base nas mesmas condições e orçamento acordado a partir dessa medição.
- **Aceite:** navegar não dispara consulta por cartão; não há crescimento de timers/listeners após abrir e fechar repetidamente nem carregamento antecipado de todas as fotos.

### 042 — Cobrir seleção e navegação em testes de interface
- **Ação:** ampliar os testes existentes para clique inferior, sincronismo com o principal, deslocamento sem seleção, teclado, remoção do selecionado e alvo do CTA durante animação.
- **Entrega:** testes de comportamento observável, sem snapshots extensos de classes CSS.
- **Aceite:** os testes falham se o contato visual e o contato aceito divergirem; mocks de animação não substituem a verificação visual da etapa 045.

### 043 — Cobrir paginação e respostas fora de ordem
- **Ação:** ampliar testes do controlador somente para comportamentos afetados: limites 50/51, navegação pendente, troca de escopo, cancelamento, refresh de página posterior e erro recuperável.
- **Entrega:** cenários determinísticos com respostas atrasadas e eventos concorrentes simulados.
- **Aceite:** nenhuma resposta obsoleta sobrescreve o escopo atual; refresh e carregamento adicional não geram duplicatas ou um ciclo sem progresso.

### 044 — Exercitar o fluxo no navegador
- **Ação:** navegar por ambas as regiões em Chromium, Firefox e WebKit; buscar, trocar departamento e simular saída de contato. Validar aceite com mocks ou dados isolados autorizados.
- **Entrega:** E2E específico do refinamento, incluindo pelo menos uma fronteira de paginação e foco restaurado ao fechar.
- **Aceite:** a sequência selecionar → revisar → aceitar → abrir conversa funciona; clientes reais não são assumidos como teste de layout.

### 045 — Comparar a aparência com as referências
- **Ação:** produzir capturas antes/depois e registro curto de movimento, usando fixtures idênticas. Verificar opacidade, elevação, dimensões inferiores, direção, P&B e espaçamento.
- **Entrega:** quadro visual com medidas realizadas e diferenças deliberadas em relação aos exemplos externos.
- **Aceite:** o Inbox não atravessa o painel; o destaque está mais alto; o rodapé é navegável e a identidade permanece legível durante as transições.

### 046 — Conferir permissões e regressões de integração
- **Ação:** verificar que a faixa usa o controlador autorizado, respeita a feature flag e não amplia acesso a filas. Conferir Inbox, rascunho, retorno do foco, botão TALK ME, modo Zen e ausência de erros de console.
- **Entrega:** verificação proporcional às mudanças; executar contratos de servidor se a implementação tiver efetivamente alterado esse caminho.
- **Aceite:** não há consulta paralela sem autorização, nova exposição de mensagens em logs ou alteração incidental nas abas e na atribuição de atendimento.

### 047 — Executar os checks aplicáveis à implementação
- **Ação:** rodar lint, TypeScript, testes afetados e build; executar os gates exigidos pela CI e inspecionar falhas. Repetir verificações somente após mudança ou evidência que justifique.
- **Entrega:** comandos, resultados, SHA testado e limitações registradas.
- **Aceite:** todos os checks necessários estão concluídos; teste pré-existente com falha é identificado com evidência, sem declarar aprovação global inexistente.

### 048 — Preparar o commit e a revisão da implementação
- **Ação:** revisar o diff completo, remover fixtures temporárias e conferir arquivos, dependências e eventual ampliação de escopo. Abrir PR com problema, comportamento final, decisões e validações.
- **Entrega:** alteração revisável vinculada a este plano e suas etapas.
- **Aceite:** o commit futuro de implementação é distinto deste commit documental; nenhum segredo ou dado real de cliente integra artefatos e evidências.

### 049 — Publicar e verificar a versão online quando autorizado
- **Ação:** após autorização de execução/publicação e checks aplicáveis, integrar o código pelo fluxo do repositório; acompanhar o deploy, identificar o build e fazer revisão autenticada do layout em ambiente autorizado.
- **Entrega:** links de PR, commit e deploy, além de evidências do visual e da navegação publicados.
- **Aceite:** o build servido contém a alteração; uma resposta HTTP bem-sucedida ou `version.json` isolado não é tratado como prova de validação visual/funcional.

### 050 — Consolidar aceite, limitações e reversão
- **Ação:** confrontar os requisitos com evidências de 001–049, registrar decisões finais e preparar reversão restrita ao refinamento visual, sem desfazer atendimentos já aceitos.
- **Entrega:** relatório final com etapas concluídas, exceções justificadas, riscos restantes e commit de retorno identificado.
- **Aceite:** declarar concluído somente após comprovar painel opaco, destaque elevado, faixa P&B reduzida, navegação completa e sincronizada, paginação íntegra e aceite correto.

## Critérios de conclusão do refinamento

| Requisito | Evidência esperada | Etapas principais |
|---|---|---|
| Painel separa carrossel do fundo | Captura com conteúdo do Inbox oculto atrás da superfície opaca | 007, 019, 045 |
| Destaque aproximadamente 20% mais alto | Medidas por viewport e adaptações justificadas | 006, 009, 040 |
| Cartões inferiores menores e P&B | Dimensões registradas, tipografia legível e fotos sem cor | 012–015, 045 |
| Toda a fila é alcançável | Navegação além dos itens 50 e 100, até o fim real | 029–036, 043–044 |
| Duas áreas sincronizadas | Mesma identidade selecionada, com foco e anúncios coerentes | 017–018, 021–026, 039, 042 |
| Aceite corresponde à pessoa exibida | Simulações de mudança de estado durante o acionamento | 005, 035, 037–038, 042–044 |
| Uso confortável em telas menores | Identidade e ações alcançáveis sem sobreposição | 006, 010–012, 040 |
| Publicação comprovada | Build correto e evidência do fluxo publicado | 047–050 |

**Estado deste documento ao ser criado:** 0 de 50 etapas executadas. O plano contém ações futuras e critérios de validação; não apresenta essas validações como já realizadas.
