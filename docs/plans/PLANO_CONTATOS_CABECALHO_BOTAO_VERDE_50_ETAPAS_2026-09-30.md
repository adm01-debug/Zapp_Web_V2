# Plano em 50 etapas para simplificar o topo de Contatos e adicionar o botão verde pulsante

**Data:** 30/09/2026

**Status:** plano elaborado; todas as 50 etapas de implementação permanecem pendentes.

**Autorização atual:** criar e commitar este documento no repositório Zapp Web V2.

**Base Zapp consultada:** `main`, commit `1e9d8cc9af0992e752391883b5e65f30f32688ff`.

**Referência PromoGifts consultada:** `main` de `adm01-debug/Promo_Gifts_V4`, commit
`92690bd8491d787140d7a61153a4f86506d548cc`, página de Carrinhos.

## Resultado esperado e escopo confirmado

A tela de Contatos começará pelos quatro indicadores existentes. O cabeçalho visual com
“Contatos”, o subtítulo “Base de clientes e leads…” e as ações “Sincronizar” e “Novo Contato”
será retirado. A ação de cadastrar será oferecida por um botão circular verde com o símbolo
“+”, brilho e halo pulsante, fixo no canto inferior direito, acima do microfone azul.

O usuário confirmou expressamente a manutenção dos quatro indicadores, das categorias,
da busca, dos filtros e das visualizações. Também confirmou que o microfone permanece e
que o novo botão verde deve ficar acima dele. Essas decisões já estão resolvidas.

| Elemento | Resultado contratado |
| --- | --- |
| Título visual “Contatos” no cabeçalho do módulo | Remover. |
| Subtítulo “Base de clientes e leads…” | Remover, incluindo a contagem dentro desse subtítulo. |
| Faixa ocupada pelo cabeçalho | Recolher, permitindo que os indicadores subam. |
| Botão “Sincronizar” do cabeçalho | Remover da interface de Contatos. |
| Botão retangular “+ Novo Contato” do cabeçalho | Substituir pelo novo botão circular flutuante. |
| Novo botão | Verde, símbolo “+”, brilho, halo pulsante e tooltip “Novo contato”. |
| Posição em desktop | Canto inferior direito, alinhado e acima do microfone. |
| Microfone azul | Preservar aparência, posição e ação existentes. |
| Clique no novo “+” | Abrir o formulário atual de cadastro de contato. |
| Indicadores | Manter Total de Contatos, Novos (30 dias), Empresas e Fornecedores. |
| Categorias, busca e controles | Manter comportamento, contagens, filtros, ordenação e visualizações. |
| Conteúdo da base | Manter cards, listas, tabela, demais modos, paginação e ações de contato. |

A palavra “Contatos” continuará identificando o módulo na navegação, e o título do formulário
continuará descrevendo o cadastro. A remoção solicitada se aplica ao cabeçalho visual do módulo.
As contagens dos indicadores, categorias e resumo de resultados também permanecem.

## Evidências do código atual

As referências estão fixadas nos commits analisados. A consulta foi feita sobre referências
remotas atualizadas. O grafo local do PromoGifts serviu para localizar a página; seus detalhes
foram conferidos diretamente no código da `main`, pois o grafo registra uma base mais antiga.

| Fonte | Comportamento verificado e impacto |
| --- | --- |
| [ContactsView.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/contacts/ContactsView.tsx) | Renderiza `PageHeader`, ações do topo, indicadores, categorias, toolbar, resultados e conteúdo. `ContactDialogs` está dentro de `PageHeader.actions`; precisa continuar montado após a retirada do cabeçalho. |
| [ContactDialogs.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/contacts/ContactDialogs.tsx) | Contém o gatilho “Novo Contato” e os diálogos de adicionar, editar, sucesso e excluir. Atualmente o gatilho envolve um `motion.div` e um botão. |
| [useContactsCRUD.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/contacts/useContactsCRUD.ts) | Mantém estado dos formulários e callbacks. Após criar, fecha cadastro, abre sucesso, atualiza lista e invalida indicadores. Cancelar fecha o formulário sem limpar explicitamente `newContact`. |
| [ContactStatsCards.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/contacts/ContactStatsCards.tsx) | Os quatro indicadores são um componente separado do cabeçalho, com estado de carregamento próprio. |
| [ContactToolbar.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/contacts/ContactToolbar.tsx) | Reúne busca, ordenação, filtros, presets, ações de seleção e alternância de visualização. Deve continuar funcional. |
| [VoiceCopilotFAB.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/layout/VoiceCopilotFAB.tsx) e [AppShell.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/layout/AppShell.tsx) | O microfone usa `bottom-6 right-6`, 56 × 56 px e `z-50`. O shell o monta apenas fora do modo mobile. |
| [scroll-to-top.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/ui/scroll-to-top.tsx) | “Voltar ao topo” aparece após 400 px de rolagem, mede 40 × 40 px e aceita `className`. Sua posição padrão coincide com a do microfone. |
| [ViewRouter.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/pages/ViewRouter.tsx) e [ViewContainer.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/layout/ViewContainer.tsx) | Há um contêiner de rolagem e um ancestral animado com deslocamento vertical na troca de módulo. A posição fixa do novo botão precisa ser independente dessas transformações. |
| [MobileShell.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/mobile/MobileShell.tsx) e [MobileFAB.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/mobile/MobileFAB.tsx) | No celular já existe um menu flutuante de ações em `bottom-[76px] right-4`, além da navegação inferior. Abrir esse menu acrescenta ações e um backdrop. |
| [ActiveCallBar.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/calls/ActiveCallBar.tsx) | A barra de chamada aparece em `bottom-24 right-4`, exatamente na faixa prevista para o novo botão. A coexistência exige ajuste localizado no contexto de Contatos. |
| [button.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/ui/button.tsx) e [tooltip.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1e9d8cc9af0992e752391883b5e65f30f32688ff/src/components/ui/tooltip.tsx) | Existe variante `success`. O botão possui `overflow-hidden` por padrão; isso pode cortar o halo. O tooltip já usa portal e permite posicionamento à esquerda. |
| [CartsListPage.tsx no PromoGifts](https://github.com/adm01-debug/Promo_Gifts_V4/blob/92690bd8491d787140d7a61153a4f86506d548cc/src/pages/products/CartsListPage.tsx#L482) | O botão `carts-list-new` mede 44 × 44 px, é circular, tem gradiente, sombra, `Plus`, tooltip à esquerda e halo `ping` com ciclo de 3 segundos. Também possui escala e rotação no hover. |

### Detalhes que precisam ser preservados

- `ContactDialogs` terá uma única instância, independentemente do carregamento ou do número
  de contatos. Retirar o cabeçalho sem realocar esse componente eliminaria outros diálogos.
- O botão “Sincronizar” atual executa `refetch` e invalida `contacts-kpi` e
  `contacts-type-counts`. Sua remoção não autoriza retirar as atualizações usadas pelo CRUD.
- Existe uma ação condicional “CRM 360°” no cabeçalho, controlada por
  `crmIntegrationEnabled`. Quando habilitada, seu acesso será acomodado na toolbar existente,
  com a mesma condição e o mesmo diálogo, sem reconstruir uma faixa superior.
- Os estados vazios possuem seus próprios convites para criar contato. Eles continuarão
  abrindo o mesmo formulário. A substituição trata do botão principal do cabeçalho.
- O caminho funcional de cancelamento preserva o rascunho atual. A mudança visual não deve
  introduzir limpeza de campos ou descarte de dados digitados.

## Especificação proposta para a execução

As medidas abaixo são decisões técnicas propostas para concretizar o posicionamento
confirmado. Devem ser conferidas no navegador durante a implementação.

### Aparência e interação

| Propriedade | Definição |
| --- | --- |
| Formato | Círculo de 56 × 56 px, coerente com o microfone existente. |
| Cor | Token `success` já usado no cadastro atual; verde também no hover e no foco. |
| Ícone | `Plus`, centralizado; partir de 24 px e conferir o tamanho computado, pois `Button` aplica regras aos SVGs. |
| Brilho | Sombra verde moderada, usando o mesmo token; sem alterar cores globais do produto. |
| Halo | Camada decorativa separada, ciclo de 3 s, escala e opacidade; referência do PromoGifts adaptada ao espaço disponível. |
| Envelope do halo | Proposta: círculo interno de 40 px expandindo até 80 px, centralizado no botão de 56 px. Isso limita a expansão externa a 12 px por lado. |
| Hover e pressionamento | Realce discreto, com área clicável estável; pulsação pausada durante interação se necessário para legibilidade. |
| Movimento reduzido | Halo e transformações decorativas desativados; botão continua visível e utilizável. |
| Tooltip | “Novo contato”, preferencialmente à esquerda, com afastamento inicial de 8 px. |
| Nome acessível | `aria-label="Novo contato"`; ícone e halo decorativos com `aria-hidden`. |
| Identificador proposto | `data-testid="contact-create-fab"`. |
| Clique e teclado | Abrir o diálogo existente por clique, toque, Enter ou Espaço; sem criar contato diretamente. |

O `MotionConfig` da tela governa animações do Framer Motion. A animação CSS do halo também
precisa respeitar movimento reduzido por suas próprias classes ou regras. Não assumir que
envolver a tela em `MotionConfig` desativa automaticamente um `ping` de CSS.

### Posição e convivência com controles existentes

| Situação | Proposta de posição e comportamento |
| --- | --- |
| Desktop, microfone | Manter `right: 24px`, `bottom: 24px`, 56 × 56 px. |
| Desktop, novo “+” | `right: 24px`, `bottom: 96px`, 56 × 56 px. A distância entre as áreas clicáveis será 16 px. |
| Desktop, voltar ao topo | Ajustar apenas o uso em Contatos para `bottom: 168px`, `right: 32px`, 40 × 40 px, alinhando o centro com os outros botões. |
| Celular | Preservar o comportamento atual que não monta o microfone de desktop. Não criar outro microfone. |
| Celular, novo “+” | Acima da navegação e do FAB móvel atual; proposta inicial `right: 16px`, `bottom: calc(156px + env(safe-area-inset-bottom, 0px))`. |
| Celular, voltar ao topo | Proposta inicial `right: 24px`, `bottom: calc(228px + env(safe-area-inset-bottom, 0px))`. |
| Menu móvel aberto | O backdrop e as ações do menu têm prioridade; evitar clique ou foco acidental no “+” que estiver encoberto. |
| Chamada ativa em Contatos | Posicionar sua barra acima da pilha local: referência inicial de 224 px em desktop e 284 px mais área segura em mobile. Conferir altura útil e estados de chamada. |
| Formulário, detalhes ou assistente de voz aberto | Sobreposição ativa tem prioridade; “+” não pode furar backdrop, disputar foco ou pulsar sobre campos do formulário. |

Com as medidas de desktop, o topo do microfone está a 80 px da base da janela, e a base do
novo botão está a 96 px. O halo proposto se estende 12 px além do botão, deixando uma folga
de 4 px até a área do microfone, antes de qualquer transformação de hover. Validar o envelope
completo da animação e reduzir o realce se essa folga for consumida.

Para o novo botão, começar com camada inferior aos overlays existentes, por exemplo `z-30`,
e validar o resultado com os contextos reais de empilhamento. Aumentar `z-index` até superar
um modal não é solução de posicionamento. Usar portal local para o gatilho quando necessário
para ancorá-lo na viewport; preservar o contexto React do diálogo e a limpeza ao sair do módulo.

### Arquivos previstos para alteração posterior

| Arquivo | Mudança prevista |
| --- | --- |
| `src/components/contacts/ContactsView.tsx` | Retirar cabeçalho, realocar diálogos, preservar estrutura de dados, ajustar uso local de voltar ao topo e passar ações necessárias. |
| `src/components/contacts/ContactDialogs.tsx` | Trocar o gatilho retangular pelo “+” verde com tooltip, halo, posicionamento e composição acessível. Preservar os quatro diálogos. |
| `src/components/contacts/ContactToolbar.tsx` | Receber o acesso condicional ao CRM que hoje está no cabeçalho, conservando a condição de exibição. |
| `src/components/calls/ActiveCallBar.tsx` | Ajustar posição somente quando a view for Contatos, para acomodar a pilha confirmada. Preservar controles e posições dos demais módulos. |
| `src/components/mobile/MobileShell.tsx` e `MobileFAB.tsx` | Alteração condicionada à necessidade demonstrada de coordenar abertura do menu com foco/visibilidade do novo botão. Evitar mudanças nos demais módulos. |
| Testes existentes afetados | Ajustar seletores ou expectativas que dependam do cabeçalho antigo, conservando a cobertura funcional. |

Componentes globais de botão, tooltip, diálogo, cabeçalho e microfone são referências de
reutilização. A implementação deve priorizar props e composição local. Um componente auxiliar
de apresentação só será necessário se a composição do gatilho perder clareza; não é requisito
criar uma infraestrutura global de botões flutuantes.

## Execução futura em 50 etapas

Cada etapa contém ação, detalhe, critério de aceite e dependência. Todas estão pendentes.
As fases organizam as mesmas 50 etapas, sem acrescentar etapas de implementação ao total.

## Fase A — Confirmar a base e os contratos existentes

### Etapa 01 — Atualizar a referência da implementação

- **Ação:** consultar novamente `origin/main`, registrar o SHA e comparar os arquivos mapeados
  com a base deste documento antes de iniciar qualquer alteração da interface.
- **Detalhe:** preservar mudanças locais ou de outras sessões; confirmar também as instruções
  do repositório e os scripts de validação da versão que será implementada.
- **Aceite:** versão atual identificada e diferenças que afetem o plano resolvidas na análise.
- **Dependência:** autorização futura para implementar.

### Etapa 02 — Registrar a tela anterior à mudança

- **Ação:** abrir Contatos pela navegação atual ou `?view=contacts` e registrar a composição
  em desktop e celular usando dados de validação.
- **Detalhe:** identificar cabeçalho, indicadores, categorias, toolbar, resultados, conteúdo
  e controles flutuantes; capturar a primeira dobra e uma posição após rolagem.
- **Aceite:** referência visual anterior disponível, com dimensões da janela e estado do módulo.
- **Dependência:** etapa 01.

### Etapa 03 — Fixar a fronteira da remoção

- **Ação:** marcar o `PageHeader` de Contatos como a faixa visual a retirar.
- **Detalhe:** distinguir seu título e subtítulo dos textos da sidebar, indicadores, formulário
  e resultados. Os quatro indicadores e os controles confirmados permanecem no conteúdo.
- **Aceite:** lista de elementos a remover e preservar corresponde integralmente ao escopo
  confirmado pelo usuário, sem apagar ocorrências globais da palavra “Contatos”.
- **Dependência:** etapa 02.

### Etapa 04 — Mapear montagem e estado dos diálogos

- **Ação:** rastrear a única instância de `ContactDialogs`, as props que recebe e seus quatro
  fluxos: adicionar, editar, sucesso e excluir.
- **Detalhe:** identificar quem controla `isAddDialogOpen`, `isEditDialogOpen`, `showSuccess`
  e `deleteTarget`. Conferir também as aberturas vindas de cards, tabela, detalhes e estado vazio.
- **Aceite:** realocação planejada sem perder instância, estado ou callback de qualquer diálogo.
- **Dependência:** etapa 03.

### Etapa 05 — Separar a remoção de Sincronizar das atualizações de dados

- **Ação:** identificar o botão, `handleSync` e os imports/variáveis usados exclusivamente nele.
- **Detalhe:** mapear os demais usos de `refetch` e das invalidações executadas após cadastro,
  edição, exclusão, tags, mesclagem e ações em lote. A solicitação retira a ação manual do topo.
- **Aceite:** a limpeza futura tem limite claro e preserva as atualizações acionadas pelas operações.
- **Dependência:** etapa 04.

### Etapa 06 — Conferir a referência de Carrinhos no PromoGifts

- **Ação:** conferir o botão `carts-list-new` em `CartsListPage.tsx` na referência remota atualizada.
- **Detalhe:** registrar círculo, ícone, brilho, halo de 3 s, tooltip e hover. Adaptar a linguagem
  visual ao verde de Contatos e ao uso flutuante acima do microfone, mantendo o projeto de origem intacto.
- **Aceite:** referência rastreável por arquivo e SHA, sem depender apenas de inferir animação
  a partir de uma captura estática.
- **Dependência:** etapa 01.

### Etapa 07 — Inventariar controles que disputam o canto direito

- **Ação:** conferir microfone, voltar ao topo, barra de chamada, detalhes do contato, menu móvel,
  navegação inferior, toasts e overlays que podem aparecer em Contatos.
- **Detalhe:** registrar tamanho, afastamento, camada e condições de montagem. Incluir rolagem
  acima de 400 px e chamadas nos estados de discagem, toque e conversa ativa.
- **Aceite:** conflitos conhecidos têm tratamento previsto antes de adicionar outro elemento fixo.
- **Dependência:** etapas 02 e 04.

### Etapa 08 — Preservar ações condicionais do cabeçalho

- **Ação:** verificar o acesso “CRM 360°” governado por `crmIntegrationEnabled`.
- **Detalhe:** preparar sua acomodação na toolbar existente, junto aos controles auxiliares,
  com a mesma condição de exibição e o mesmo callback `setIsCRMSearchOpen(true)`.
  Não habilitar a integração nem alterar sua condição como parte deste trabalho.
- **Aceite:** remover o cabeçalho não elimina uma funcionalidade disponível em outros perfis/configurações.
- **Dependência:** etapas 03 e 04.

## Fase B — Definir apresentação e comportamento do novo botão

### Etapa 09 — Definir o círculo e os tokens visuais

- **Ação:** especificar botão de 56 px, ícone centralizado e variante verde `success`.
- **Detalhe:** conferir estados normal, hover, foco e pressionado; usar sombra verde local e
  validar contraste do símbolo. Evitar herdar o brilho azul da variante padrão de `Button`.
- **Aceite:** visual coerente com o cadastro atual e com a referência, sem alterações globais de tema.
- **Dependência:** etapa 06.

### Etapa 10 — Calcular a posição acima do microfone

- **Ação:** adotar como referência desktop `right: 24px` e `bottom: 96px` para o novo botão.
- **Detalhe:** manter o microfone de 56 px a 24 px da base; verificar os 16 px livres entre as
  áreas clicáveis. Conferir a posição após recolher a sidebar, ampliar a janela e rolar o conteúdo.
- **Aceite:** “+” alinhado verticalmente acima do microfone, com ambos disponíveis e separados.
- **Dependência:** etapas 07 e 09.

### Etapa 11 — Dimensionar o halo pulsante

- **Ação:** definir camada decorativa independente com período de 3 s, baseada no `ping` da referência.
- **Detalhe:** limitar a expansão para caber na folga disponível; começar com halo de 40 px que
  cresce até 80 px. Aplicar `pointer-events: none` e `aria-hidden`; o halo não amplia a área de clique.
- **Aceite:** pulsação percebida sem invadir o microfone, cortar na janela ou bloquear conteúdo.
- **Dependência:** etapas 09 e 10.

### Etapa 12 — Definir tooltip e nome acessível

- **Ação:** usar “Novo contato” como tooltip e nome acessível do botão.
- **Detalhe:** exibir a dica à esquerda, com afastamento inicial de 8 px, em hover e foco.
  Preservar o nome acessível mesmo quando a dica estiver fechada; no toque, abrir o formulário
  diretamente, sem exigir primeiro toque apenas para tooltip.
- **Aceite:** o propósito fica claro para mouse, teclado e leitor de tela; o “+” sozinho não é o nome.
- **Dependência:** etapa 09.

### Etapa 13 — Definir foco e acionamento do diálogo

- **Ação:** planejar um único elemento HTML `button`, com `type="button"`, como gatilho real.
- **Detalhe:** compor `DialogTrigger` e `TooltipTrigger` com `asChild`, encaminhando props e ref
  ao botão. Prever foco no formulário ao abrir e retorno ao gatilho ao fechar, inclusive no fluxo de sucesso.
- **Aceite:** nenhum `div` clicável ou botão aninhado substitui a semântica do controle.
- **Dependência:** etapas 04 e 12.

### Etapa 14 — Definir movimento reduzido

- **Ação:** desativar halo e transformações decorativas quando a preferência de movimento reduzido estiver ativa.
- **Detalhe:** tratar CSS e Framer Motion explicitamente; conferir também a classe `.reduced-motion`
  disponível no produto. Preservar borda, cor, símbolo, foco e tooltip sem depender de animação.
- **Aceite:** o botão estático mantém a função completa e não executa pulsação residual.
- **Dependência:** etapas 11 a 13.

### Etapa 15 — Definir ancoragem e camadas

- **Ação:** preparar o gatilho para ancoragem à viewport, independente do scroller e da transição do módulo.
- **Detalhe:** priorizar um portal local que preserve o contexto do diálogo; começar com camada
  abaixo dos overlays. Conferir `overflow-hidden` do botão, transformações ancestrais e
  remoção do portal ao sair de Contatos. Manter a referência do gatilho estável.
- **Aceite:** posição fixa real, sem recorte do halo e sem controle persistente em outro módulo.
- **Dependência:** etapas 07, 10 e 13.

### Etapa 16 — Definir a adaptação para celular

- **Ação:** manter o novo botão acessível acima da navegação inferior e do FAB móvel existente.
- **Detalhe:** usar a proposta de afastamento de 156 px mais área segura, conferir o breakpoint
  de 768 px e preservar a ausência atual do microfone de desktop no mobile. Prever teclado
  virtual e menu de ações aberto, com prioridade para a interação já em andamento.
- **Aceite:** cadastro acessível em tela estreita, sem botão sobre navegação, teclado ou menu expandido.
- **Dependência:** etapas 07 e 10 a 15.

## Fase C — Executar a alteração localizada quando houver autorização

### Etapa 17 — Preparar a branch e a referência de validação

- **Ação:** abrir branch de implementação a partir da base atualizada e registrar o resultado
  das verificações existentes relevantes antes de editar.
- **Detalhe:** sugestão de nome `fix/contatos-cabecalho-fab-verde`; preservar lockfile, dependências
  e trabalho de outras sessões. Limitar os arquivos ao mapa deste documento e às necessidades demonstradas.
- **Aceite:** alteração isolada, base conhecida e eventuais falhas anteriores registradas.
- **Dependência:** etapas 01 a 16.

### Etapa 18 — Realocar ContactDialogs antes de retirar o cabeçalho

- **Ação:** mover a instância existente de `ContactDialogs` para uma posição estável da árvore de Contatos.
- **Detalhe:** conservar todas as props e o estado no mesmo dono. Colocá-la fora da faixa visual
  que será removida e fora de condições de lista vazia/carregamento. Considerar a ordem dos
  elementos reais no DOM para que não sobrem margens produzidas por `space-y-*`.
- **Aceite:** os quatro diálogos continuam montados uma única vez e acessíveis pelos callbacks existentes.
- **Dependência:** etapas 04 e 17.

### Etapa 19 — Retirar o cabeçalho visual

- **Ação:** remover a instância de `PageHeader` de Contatos após preservar diálogos e ação condicional de CRM.
- **Detalhe:** retirar título, subtítulo, botão Sincronizar e posição antiga de Novo Contato,
  incluindo a faixa local de breadcrumbs que faria parte desse cabeçalho em mobile ou modo zen.
  Preservar a navegação geral da aplicação.
- **Aceite:** a faixa superior indicada nas imagens deixa de aparecer, sem remover os indicadores.
- **Dependência:** etapas 08 e 18; realizar em conjunto com a etapa 22.

### Etapa 20 — Ajustar espaçamento e identificação semântica

- **Ação:** posicionar `ContactStatsCards` como primeiro bloco visual útil, respeitando o gutter do shell.
- **Detalhe:** retirar wrappers vazios, alturas mínimas e espaçamentos exclusivos do cabeçalho.
  Manter uma identificação semântica discreta, como `h1` com `sr-only`, fora de estruturas que
  gerem lacuna visual; conservar o título de documento gerenciado pela navegação.
- **Aceite:** conteúdo sobe sem faixa vazia, corte dos indicadores ou perda da identificação acessível da página.
- **Dependência:** etapa 19.

### Etapa 21 — Limpar código exclusivo de Sincronizar

- **Ação:** remover `handleSync` e somente os imports/variáveis que ficarem sem uso por sua remoção.
- **Detalhe:** reavaliar `RefreshCw`, `useQueryClient` e sua instância local. Manter `loading`,
  `refetch` e os callbacks que continuam sendo usados na lista, resultados, CRUD e ações em lote.
  Não substituir o botão removido por outro atalho de sincronização.
- **Aceite:** ação manual retirada sem quebrar atualizações normais ou introduzir variáveis órfãs.
- **Dependência:** etapas 05 e 19.

### Etapa 22 — Acomodar o acesso condicional ao CRM na toolbar

- **Ação:** adicionar à toolbar apenas as props necessárias para receber a condição e a ação de CRM.
- **Detalhe:** manter o controle agrupado com ações auxiliares, sem deslocar indicadores para baixo
  por uma nova faixa de título. Conferir a toolbar com integração ligada e desligada e em quebra de linha.
- **Aceite:** acesso e condição atuais preservados; busca, filtros, presets e alternância de visualização continuam disponíveis.
- **Dependência:** etapas 08 e 18; completar junto com a etapa 19.

### Etapa 23 — Substituir o gatilho retangular pelo círculo verde

- **Ação:** trocar somente o gatilho principal de criação em `ContactDialogs` pelo novo botão.
- **Detalhe:** manter o `Dialog` controlado e o `ContactForm` existente; aplicar tamanho, cor,
  símbolo, nome acessível, `type`, identificador estável e tooltip definidos. Compor os gatilhos
  sobre o botão real, retirando o wrapper que recebia o clique no cabeçalho.
- **Aceite:** uma ação principal “+” abre o mesmo formulário e o botão retangular do topo desaparece.
- **Dependência:** etapas 09, 12, 13 e 18.

### Etapa 24 — Aplicar halo, brilho e estados de interação

- **Ação:** adicionar a camada de pulsação e o realce verde previstos.
- **Detalhe:** neutralizar localmente o recorte por `overflow-hidden`, conferir a regra de tamanho
  dos SVGs e evitar sombras azuis herdadas. A pulsação usa escala/opacidade; sem timers React
  atualizando a árvore inteira. Aplicar as regras de movimento reduzido já definidas.
- **Aceite:** halo visível e suave, ícone estável, verde consistente e nenhuma interferência na área clicável.
- **Dependência:** etapas 11, 14 e 23.

### Etapa 25 — Preservar estado, callbacks e ciclo de vida

- **Ação:** revisar props e identidade dos diálogos após realocação e substituição do gatilho.
- **Detalhe:** conservar `handleAddContact`, `handleCancelForm`, `isSubmitting`, callbacks de edição
  e exclusão e os dados do sucesso. Remover `tapAnimation` somente se deixar de ter consumidor;
  manter `MotionConfig` quando necessário para os descendentes.
- **Aceite:** apresentação alterada sem nova implementação de cadastro, limpeza inesperada de rascunho ou perda de fluxo.
- **Dependência:** etapas 18 e 23 a 24.

### Etapa 26 — Fixar o botão à viewport somente em Contatos

- **Ação:** montar o gatilho na posição calculada, usando portal local quando necessário para
  escapar do ancestral animado e dos limites do scroller.
- **Detalhe:** manter a árvore React ligada ao diálogo e ao módulo. Conferir entrada, saída,
  troca de view, redimensionamento e rolagem. Um wrapper de posicionamento deve envolver
  apenas o controle, sem ocupar toda a tela ou interceptar cliques fora do círculo.
- **Aceite:** botão estacionário no canto aprovado, com desmontagem ao sair de Contatos.
- **Dependência:** etapas 10, 15 e 23.

### Etapa 27 — Acomodar Voltar ao topo acima do novo botão

- **Ação:** ajustar apenas a instância de `ScrollToTopButton` usada por Contatos, aproveitando `className`.
- **Detalhe:** usar as medidas propostas para desktop e mobile, preservar o limite de 400 px,
  o `layoutScrollRef` e a ação de rolagem. Conferir ancoragem durante a transição do módulo;
  se necessário, usar o mesmo tratamento local de portal, preservando o contexto de rolagem.
- **Aceite:** microfone, “+” e voltar ao topo possuem áreas próprias, sem alterar outras telas.
- **Dependência:** etapas 07, 10, 16 e 26.

### Etapa 28 — Evitar conflito com controles de chamada

- **Ação:** ajustar a posição da `ActiveCallBar` especificamente quando a view atual for Contatos.
- **Detalhe:** usar como ponto inicial a faixa acima da pilha, a 224 px da base em desktop
  e 284 px mais área segura em mobile. Conferir o painel real nos estados disponíveis;
  manter seus handlers, informações, camada e posicionamento dos demais módulos.
  Não iniciar chamadas reais para validar geometria; utilizar estado simulado apropriado.
- **Aceite:** atender, silenciar e encerrar permanecem acessíveis sem cobrir o novo “+” ou voltar ao topo.
- **Dependência:** etapas 07, 26 e 27.

### Etapa 29 — Coordenar o botão com os controles do celular

- **Ação:** aplicar a posição mobile e conferir a coexistência com `MobileFAB` e a navegação inferior.
- **Detalhe:** preservar o menu de ações existente. Quando ele estiver aberto ou o teclado
  ocupar a região inferior, suspender a pulsação e impedir interação acidental com o botão
  encoberto. Se o estado necessário não estiver disponível, expor um sinal mínimo de abertura
  no shell/menu, limitado ao contexto de Contatos; não criar um segundo estado divergente.
- **Aceite:** sem sobreposição entre alvos; menu, cadastro e navegação continuam acessíveis por toque e teclado.
- **Dependência:** etapas 16 e 26 a 28.

### Etapa 30 — Preservar prioridade de diálogos e painéis

- **Ação:** validar o novo gatilho com cadastro, edição, sucesso, exclusão, detalhes, CRM,
  mesclagem, comparação, tags e assistente de voz abertos.
- **Detalhe:** manter botão e tooltip abaixo dos overlays; suspender pulsação/interatividade
  quando encobertos. Evitar desmontar o gatilho do próprio diálogo durante sua abertura,
  pois ele participa do retorno de foco. Verificar que clicar fora respeita o comportamento do modal.
- **Aceite:** nenhuma ação atravessa backdrop; foco e conteúdo da sobreposição ativa têm prioridade.
- **Dependência:** etapas 13, 15 e 25 a 29.

## Fase D — Conferir os fluxos e o conteúdo preservado

### Etapa 31 — Validar abertura por clique e toque

- **Ação:** acionar o novo “+” a partir do topo, do meio e do final da listagem.
- **Detalhe:** conferir abertura de um único diálogo “Adicionar Contato”, com o formulário
  existente e campos corretos. Repetir por toque e após trocar a visualização; clicar no
  botão deve somente abrir o formulário, sem disparar gravação automática.
- **Aceite:** cadastro acessível a partir da nova posição, sem instâncias duplicadas ou destino incorreto.
- **Dependência:** etapas 23 a 30.

### Etapa 32 — Validar cancelamento e retorno de foco

- **Ação:** digitar dados de teste sem enviar e fechar por Cancelar, Escape e botão de fechar.
- **Detalhe:** comparar o rascunho reaberto com o comportamento inicial; o callback atual
  fecha o diálogo sem zerar `newContact`. Conferir foco retornando ao gatilho apropriado,
  inclusive quando o formulário foi aberto por uma ação de estado vazio.
- **Aceite:** cancelamento não salva nem passa a descartar dados por causa da mudança de apresentação.
- **Dependência:** etapas 13, 25 e 31.

### Etapa 33 — Validar cadastro bem-sucedido

- **Ação:** no ambiente próprio de validação, cadastrar um contato de teste usando o formulário aberto pelo “+”.
- **Detalhe:** conferir estado de envio, término do cadastro, diálogo de sucesso, protocolo,
  ação Continuar e atualização normal da lista e indicadores. Considerar filtros ativos:
  um contato que não corresponde ao filtro pode ser criado sem aparecer naquela seleção.
- **Aceite:** fluxo anterior preservado e evidência obtida com dados controlados, sem cadastrar contatos reais por engano.
- **Dependência:** etapas 25 e 31 a 32.

### Etapa 34 — Validar campos inválidos e falhas de envio

- **Ação:** exercitar campos obrigatórios, avisos de telefone/e-mail duplicado e uma falha simulada de cadastro.
- **Detalhe:** conferir mensagens, preservação dos campos, bloqueio de envio durante a operação
  e possibilidade de correção/tentativa posterior conforme o comportamento já existente.
  O novo botão não deve contornar validação, inserir diretamente ou abrir formulários concorrentes.
- **Aceite:** novo ponto de entrada conserva as validações e o tratamento de erro do formulário atual.
- **Dependência:** etapas 25 e 31.

### Etapa 35 — Validar edição após a realocação dos diálogos

- **Ação:** abrir edição pelos caminhos existentes em card, lista, tabela e detalhes.
- **Detalhe:** conferir preenchimento, identificação do contato, cancelamento, estado de envio
  e retorno à tela. Validar o fluxo de endereço com a cobertura já existente; não alterar
  o carregamento ou o tratamento de campos que não vieram na consulta.
- **Aceite:** o diálogo de edição continua disponível e recebe os dados corretos após a retirada do cabeçalho.
- **Dependência:** etapas 18, 25 e 30.

### Etapa 36 — Validar exclusão e permissões existentes

- **Ação:** conferir a abertura da confirmação de exclusão e cancelar em cada entrada disponível.
- **Detalhe:** usar a suíte existente para os casos com `can_delete` verdadeiro, falso e
  não informado, além da seleção em páginas diferentes. Uma exclusão efetiva, quando necessária
  para validação, deve usar exclusivamente fixture de teste no ambiente apropriado.
- **Aceite:** confirmação permanece montada; regras e callbacks existentes de exclusão são preservados.
- **Dependência:** etapas 18, 25 e 30.

### Etapa 37 — Validar carregamento, ausência de contatos e resultados vazios

- **Ação:** conferir tela carregando, base sem contatos, pesquisa sem resultados e filtro vazio.
- **Detalhe:** manter o novo gatilho montado independentemente da lista. Preservar os convites
  de criação dos estados vazios, conectados ao mesmo diálogo, e as ações de limpar busca/filtros.
  Evitar que loading da listagem seja confundido com envio do formulário.
- **Aceite:** tela vazia ou em carregamento não perde o acesso ao cadastro nem duplica seu estado.
- **Dependência:** etapas 18, 23 e 31.

### Etapa 38 — Conferir os quatro indicadores

- **Ação:** comparar Total de Contatos, Novos (30 dias), Empresas e Fornecedores antes e depois.
- **Detalhe:** preservar fontes, rótulos, valores, variações, gráficos, loading e distribuição
  responsiva. A posição mais alta deve vir da retirada do cabeçalho, sem alteração dos cálculos.
  Validar consistência após operação de teste pelo fluxo de atualização atual.
- **Aceite:** mesmos quatro indicadores e comportamento; apenas a posição vertical decorrente da remoção muda.
- **Dependência:** etapas 20, 21 e 33.

### Etapa 39 — Conferir categorias e contagens

- **Ação:** percorrer Todos, Cliente, Fornecedor, Transportadora, Colaborador, Prestador de Serviço
  e Parceiro, conforme as categorias existentes na base de implementação.
- **Detalhe:** conferir seleção, contagens, atualização dos resultados e espaço disponível em
  telas estreitas. A remoção do subtítulo não deve remover o total das categorias ou do resumo.
- **Aceite:** categorias mantêm ordem, seleção e contagem anteriores, sem vínculo acidental ao antigo cabeçalho.
- **Dependência:** etapas 20 e 38.

### Etapa 40 — Conferir busca e toolbar

- **Ação:** validar pesquisa, limpeza da busca, ordenação, filtros avançados e filtros salvos.
- **Detalhe:** testar a toolbar com filtros ativos e ação CRM habilitada/desabilitada. Conferir
  aplicação de presets, contagem dos filtros, quebra de linha e acesso às ações de seleção.
  Manter os estados atuais ao abrir e fechar cadastro.
- **Aceite:** controles confirmados pelo usuário continuam funcionais e legíveis após a acomodação do CRM.
- **Dependência:** etapas 22 e 39.

### Etapa 41 — Conferir modos de visualização

- **Ação:** alternar Cards, Lista, Tabela e as opções existentes em “Mais”, incluindo ajustes de colunas.
- **Detalhe:** verificar que o “+” permanece na viewport, que sua posição não depende da
  quantidade de cards e que o último contato pode ser acessado. Preservar agrupamento por
  empresa e preferências atuais de visualização; conferir também modos com superfícies próprias de interação.
- **Aceite:** visualizações e preferências preservadas, com acesso ao conteúdo próximo ao canto flutuante.
- **Dependência:** etapas 26 a 30 e 40.

### Etapa 42 — Conferir resumo, paginação e ações em lote

- **Ação:** validar resumo de resultados, seleção total/parcial, avançar/voltar páginas e ações em lote.
- **Detalhe:** conferir a barra inferior de seleção junto com microfone, “+”, voltar ao topo
  e, quando aplicável, chamada ativa. Preservar seleção entre páginas e callbacks de tags,
  comparação e mesclagem. Se faltar área de rolagem para alcançar o último item, ajustar
  apenas o respiro inferior local necessário, sem recriar a faixa superior removida.
- **Aceite:** nenhum controle essencial ou ação de contato fica permanentemente coberto pelos elementos fixos.
- **Dependência:** etapas 27 a 30 e 39 a 41.

## Fase E — Verificar apresentação, regressões e entrega

### Etapa 43 — Conferir desktop e rolagem real

- **Ação:** validar 1920 × 1080, 1440 × 900 e 1366 × 768, com sidebar aberta/recolhida quando disponível.
- **Detalhe:** conferir topo da página, rolagem acima de 400 px e final da lista; medir retângulos
  de microfone, “+”, voltar ao topo e barra de chamada. Observar o halo durante um ciclo completo
  e a entrada/saída animada do módulo, incluindo resize e zoom de 200%.
- **Aceite:** geometria e acesso aos controles atendem ao contrato, sem salto de posição ou lacuna no topo.
- **Dependência:** etapas 26 a 30 e 38 a 42.

### Etapa 44 — Conferir celular, área segura e teclado

- **Ação:** validar 390 × 844, 360 × 800, orientação horizontal e larguras de 767 e 768 px.
- **Detalhe:** conferir área segura inferior, menu de ações aberto, navegação inferior e
  teclado ao pesquisar ou preencher o formulário. Testar texto ampliado e a altura útil
  com uma chamada simulada; considerar a mudança de layout ao cruzar o breakpoint.
- **Aceite:** novo botão e controles existentes continuam alcançáveis, sem cobrir campos, navegação ou ações ativas.
- **Dependência:** etapas 16, 29, 30 e 42.

### Etapa 45 — Conferir temas e contraste

- **Ação:** revisar o círculo, símbolo, sombra, halo, tooltip e foco em temas claro e escuro.
- **Detalhe:** confirmar que `success` continua verde em cada tema. Medir contraste do símbolo
  e do indicador de foco; se o par atual não for suficiente, corrigir a apresentação local
  mantendo a família verde. Conferir também o modo de alto contraste disponível na aplicação.
- **Aceite:** botão identificável e legível em seus estados, sem alterar a paleta dos indicadores ou do microfone.
- **Dependência:** etapas 09, 24 e 43 a 44.

### Etapa 46 — Conferir teclado, leitor de tela e animação

- **Ação:** percorrer o módulo com Tab/Shift+Tab, acionar o “+” com Enter/Espaço e validar Escape e retorno de foco.
- **Detalhe:** conferir nome “Novo contato”, tooltip no foco, título semântico da página e
  leitura dos diálogos. Testar movimento reduzido do sistema e do produto. Verificar que
  o halo não produz anúncios repetidos, cliques extras ou renders periódicos da tela.
- **Aceite:** cadastro utilizável sem mouse e sem animação; nenhuma disputa de foco com overlays ou menu móvel.
- **Dependência:** etapas 12 a 15, 30 a 32 e 45.

### Etapa 47 — Executar a cobertura existente pertinente

- **Ação:** rodar os testes atuais de indicadores, validação, CRUD, endereço e permissões que
  cobrem os fluxos preservados. Executar os testes da barra de chamada se sua posição for alterada.
- **Detalhe:** manter seletores por papel/nome compatíveis; “Novo contato” conserva o nome
  usado pelo E2E existente. Ajustar apenas seletores/expectativas afetados pelo novo layout;
  em estado vazio, usar escopo ou o identificador do FAB para distinguir ações de mesmo nome.
  A geometria e a pulsação exigem navegador, pois testes de DOM não demonstram apresentação visual.
- **Aceite:** cobertura existente relevante aprovada e evidências manuais complementares registradas.
- **Dependência:** etapas 31 a 46.

### Etapa 48 — Validar tipos, lint, build e alcance do diff

- **Ação:** executar os verificadores adotados pela CI, build e conferência de whitespace/diff.
- **Detalhe:** registrar SHA, comando e resultado. Revisar imports sem uso, props novas,
  encaminhamento de refs e classes realmente geradas. Preservar os registros de dívida de
  lint/tipos; identificar falhas anteriores sem mascarar problemas introduzidos.
- **Aceite:** build concluído, nenhuma nova falha nos verificadores e arquivos modificados coerentes com o plano.
- **Dependência:** etapa 47.

### Etapa 49 — Revisar a entrega da implementação

- **Ação:** reunir imagens e resultados, conferir a matriz de aceite e preparar commit e descrição de revisão.
- **Detalhe:** evidenciar retirada do cabeçalho, manutenção dos indicadores e “+” verde acima
  do microfone, além dos estados estreitos e de sobreposição. Sugestão de mensagem:
  `feat(contatos): substitui cabeçalho por botão verde de cadastro`.
  Imagens devem mostrar dados de validação, sem informações pessoais desnecessárias.
- **Aceite:** implementação revisável, limitações descritas e evidências referentes ao mesmo SHA.
- **Dependência:** etapas 43 a 48.

### Etapa 50 — Planejar publicação e reversão da implementação

- **Ação:** após autorização de implementação e dentro do fluxo vigente, acompanhar revisão,
  checks e publicação, conferindo o resultado na versão publicada.
- **Detalhe:** revalidar cabeçalho ausente, indicadores presentes, “+” funcional e microfone
  preservado. Se houver regressão de cadastro, foco ou sobreposição, reverter somente os
  commits desta implementação pelo fluxo normal, incluindo os ajustes locais de toolbar e
  barra de chamada; preservar commits alheios. Não há migração de dados a desfazer.
- **Aceite:** resultado publicado rastreável quando autorizado e procedimento de reversão disponível.
- **Dependência:** etapa 49 e autorização vigente para entrega/publicação.

## Matriz de aceite da implementação futura

| Critério | Evidência esperada | Etapas | Estado |
| --- | --- | --- | --- |
| Cabeçalho visual removido | Captura da primeira dobra sem título/subtítulo/faixa antiga | 19–20, 43 | Pendente |
| Botão Sincronizar retirado | Inspeção da tela e revisão dos usos restantes de atualização | 05, 21 | Pendente |
| Quatro indicadores preservados | Capturas e testes existentes dos indicadores | 38, 47 | Pendente |
| Categorias, filtros e visualizações preservados | Navegação, filtros, presets e troca de modo | 39–42 | Pendente |
| Referência PromoGifts aplicada em verde | Vídeo curto de um ciclo do halo e captura dos estados | 06, 09–14, 24 | Pendente |
| “+” acima do microfone | Medidas e captura da pilha no desktop | 10, 26–28, 43 | Pendente |
| Microfone preservado | Abertura do assistente e comparação de posição/cor | 30, 43 | Pendente |
| Tooltip e nome “Novo contato” | Hover, foco e inspeção acessível | 12–13, 46 | Pendente |
| Formulário e sucesso preservados | Abertura, cancelamento, cadastro de fixture e protocolo | 25, 31–34 | Pendente |
| Edição e exclusão preservadas | Diálogos acessíveis e cobertura existente aprovada | 35–36, 47 | Pendente |
| CRM condicional preservado | Verificação com integração habilitada e desabilitada | 08, 22, 40 | Pendente |
| Controles flutuantes sem conflito | Scroll, menu mobile e chamada simulada | 27–30, 42–44 | Pendente |
| Teclado e movimento reduzido atendidos | Percurso de foco e animação desativada | 14, 32, 46 | Pendente |
| Tipos, lint e build verificados | Logs resumidos e SHA correspondente | 48 | Pendente |
| Entrega e reversão documentadas | Descrição de revisão e identificação dos commits | 49–50 | Pendente |

## Comandos de referência para quando a execução for autorizada

Estes comandos são parte do plano e devem ser conferidos contra os scripts vigentes na
data da execução. Eles não foram executados como implementação durante a criação deste documento.

```bash
# Componentes e fluxos já cobertos
bun run test src/components/contacts/__tests__/ContactStatsCards.test.tsx src/components/contacts/__tests__/useContactsCRUD.test.tsx src/components/contacts/__tests__/useContactFormValidation.test.ts
bun run test src/components/contacts/__tests__/ContactFormEndereco.test.tsx src/components/contacts/__tests__/ContactDeletePermission.test.tsx src/components/contacts/__tests__/ContactDeleteEntryPoints.test.tsx

# Executar se o posicionamento da barra de chamada for alterado
bun run test src/components/calls/__tests__/ActiveCallBar.test.tsx

# Verificadores usados no fluxo de qualidade do projeto
node scripts/ci/lint-ratchet.mjs
node scripts/ci/typecheck-ratchet.mjs
bun run build

# Revisão da alteração
git diff --check
git diff --stat
```

O cenário existente `e2e/contact-form-email-duplicate.spec.ts` pode complementar a validação
no projeto `chromium-authenticated` do Playwright. Ele depende de autenticação e prepara
dados de fixture; conferir o ambiente e esses efeitos antes de executá-lo. O nome acessível
“Novo contato” foi escolhido para conservar compatibilidade com sua navegação. Não é necessário
executar esse cenário para salvar ou commitar o presente plano.

## Riscos concretos e tratamento

| Risco observado na estrutura atual | Tratamento planejado |
| --- | --- |
| Retirar `PageHeader` e perder todos os diálogos | Realocar a instância de `ContactDialogs` antes da remoção e preservar todas as props. |
| Retirar Sincronizar e interromper atualização após operações | Limpar somente código exclusivo do botão; conferir CRUD e callbacks restantes. |
| Perder acesso ao CRM quando sua condição estiver habilitada | Acomodar a ação na toolbar, conservando flag, callback e diálogo. |
| Copiar o halo e vê-lo cortado pelo botão base | Tratar `overflow-hidden` localmente e conferir o envelope completo da animação. |
| Fazer o botão acompanhar o scroller ou a transformação do módulo | Usar ancoragem à viewport e portal local com contexto/ref preservados. |
| Cobrir o microfone ou a barra de chamada | Aplicar geometria da pilha e ajuste da barra restrito à view Contatos. |
| Criar conflito com o menu móvel ou o teclado | Respeitar área segura, menu expandido e estado do teclado; coordenar interação quando necessário. |
| Perder foco ao fechar formulário após mover o gatilho | Manter botão semântico, ref estável, montagem durante o diálogo e testar todos os fechamentos. |
| Deixar um botão ativo por cima de detalhes ou modal | Conferir camada, foco e interatividade; overlays têm prioridade. |
| Remover o título e deixar uma lacuna visível | Retirar wrappers e espaçamento exclusivos, conservando identificação semântica fora do fluxo visual. |
| Confundir referências locais antigas com a versão atual | Fixar SHAs da análise e comparar novamente com a `main` antes de implementar. |

## Limites e encerramento desta entrega

Este plano trata da apresentação e dos pontos de entrada do módulo Contatos. Não inclui
redesenho dos indicadores, mudanças nos campos do cadastro, novas regras de negócio,
alterações de permissões, banco, integrações, dependências ou infraestrutura. O projeto
PromoGifts é referência visual e de código; sua interface não será alterada por esta tarefa.

Nesta entrega, somente este documento deve ser adicionado ao commit. A contagem das etapas,
as referências e o diff documental serão conferidos antes da publicação na branch de documentação.
Testes da aplicação, alterações de interface e publicação funcional permanecem para a execução
futura autorizada. O commit do plano não significa que qualquer uma das 50 etapas foi executada.
