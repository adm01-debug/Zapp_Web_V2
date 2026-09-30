# Plano em 20 etapas para reorganizar as abas superiores da conversa

**Data:** 30/09/2026

**Status:** planejamento concluído; execução das 20 etapas pendente.

**Entrega autorizada neste momento:** criação e commit deste documento.

**Base técnica:** `main` do repositório `adm01-debug/Zapp_Web_V2`, consultada no commit
`1c30e5bf5fef42054271e18454afab661d41852f`.

## Objetivo e resultado esperado

Reorganizar a barra de abas acima da conversa no Inbox, conforme as imagens fornecidas,
para apresentar esta sequência da esquerda para a direita:

**Chat → Arquivos → IA → CRM 360° → Pedidos → Histórico → Tarefas → Notas.**

O termo “banner superior” identifica, neste plano, a barra `Seções da conversa`, renderizada
por `ConversationTabs`. A grafia “HISTPORICO” da solicitação corresponde ao rótulo existente
**Histórico**. O rótulo **CRM 360°** conserva o símbolo já utilizado na interface.

Todas as etapas abaixo descrevem trabalho futuro. O commit deste plano contém apenas
documentação; não aplica a nova ordem, não altera testes e não executa publicação da interface.

## Contrato da ordem

| Posição final | Rótulo exibido | Identificador estável | Posição atual | Ícone existente | Contador existente |
| --- | --- | --- | --- | --- | --- |
| 1 | Chat | `chat` | 1 | `MessageSquare` | Sem contador |
| 2 | Arquivos | `files` | 7 | `Paperclip` | `counts.filesTotal` |
| 3 | IA | `ia` | 2 | `Sparkles` | Sem contador |
| 4 | CRM 360° | `crm` | 3 | `Compass` | Sem contador |
| 5 | Pedidos | `orders` | 4 | `ShoppingBag` | `extraCounts.orders` |
| 6 | Histórico | `history` | 8 | `History` | Sem contador |
| 7 | Tarefas | `tasks` | 5 | `CheckSquare` | `counts.tasksOpen` |
| 8 | Notas | `notes` | 6 | `FileText` | `counts.notesTotal` |

A implementação deve conter exatamente oito abas, com identificadores únicos. A versão
atual já removeu Lembretes dessa barra, e o teste existente registra sua incorporação em
Tarefas. Este plano parte desse estado atual.

## Evidências verificadas na base atual

Os links abaixo estão fixados no commit analisado, para permitir conferência mesmo que
a `main` avance durante o planejamento ou antes da execução.

| Fonte | Constatação e consequência para o plano |
| --- | --- |
| [ConversationTabs.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/src/components/inbox/chat/ConversationTabs.tsx) | O array local `TABS` define a sequência. `TABS.map` cria os botões nessa mesma ordem. Alterar a posição dos objetos completos resolve a mudança visual e a ordem no DOM. |
| [ConversationTabs.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/src/components/inbox/chat/__tests__/ConversationTabs.test.tsx) | A suíte verifica presença das oito abas, ausência de Lembretes, seleção, callback e contadores. A verificação de presença usa `forEach` e não garante a ordem renderizada. |
| [RealtimeInboxView.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/src/components/inbox/RealtimeInboxView.tsx) | A aba ativa usa identificadores e está associada ao contato. Quando o contato selecionado difere do registrado em `tabState`, o valor derivado é `chat`. O pai também fornece o contador de Pedidos e o fluxo “Usar resposta” da IA. |
| [ConversationTabContent.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/src/components/inbox/chat/ConversationTabContent.tsx) | O conteúdo é escolhido por `activeTab`. Chat permanece montado e fica oculto nas demais abas; os outros painéis são carregados sob demanda. A ordem dessas condições não determina a ordem da barra. |
| [Crm360Tab.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/src/components/inbox/tabs/Crm360Tab.tsx) | Consome `ConversationTab` e `onTabChange`; a estabilidade dos identificadores preserva as ações que navegam entre painéis. |
| [useConversationTabCounts.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/src/hooks/chat/useConversationTabCounts.ts) | Expõe os valores dos contadores. Reordenar os objetos da barra não exige alterar a obtenção dos dados nem seus contratos. |
| [package.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/package.json), [Vitest](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/vitest.config.ts) e [CI](https://github.com/adm01-debug/Zapp_Web_V2/blob/1c30e5bf5fef42054271e18454afab661d41852f/.github/workflows/ci.yml) | O projeto já possui testes de componentes e verificações de lint, tipos e build. A execução deve aproveitar essa infraestrutura. |

### Decisão de implementação

A mudança funcional prevista é mover objetos completos dentro de `TABS`, mantendo seus
`id`, `label`, `icon` e `count`. A sequência resultante de identificadores será:

```text
chat, files, ia, crm, orders, history, tasks, notes
```

A ordem visual, a ordem dos elementos no DOM e o percurso sequencial de foco devem concordar.
Aplicar `order` de CSS deixaria o DOM na ordem anterior; por isso a edição deve ocorrer no array.
Não é necessário extrair uma configuração compartilhada, criar preferências persistidas,
adicionar arrastar e soltar ou instalar dependências.

### Arquivos previstos

| Arquivo | Tratamento previsto na execução |
| --- | --- |
| `src/components/inbox/chat/ConversationTabs.tsx` | Reordenar os oito objetos de `TABS`. |
| `src/components/inbox/chat/__tests__/ConversationTabs.test.tsx` | Ajustar a verificação existente das oito abas para conferir a sequência efetiva no DOM. |
| `RealtimeInboxView.tsx`, `ConversationTabContent.tsx` e painéis de cada aba | Inspecionar e validar a integração. A reordenação não exige edição nesses arquivos. |
| Este documento | Registrar resultados quando a execução for autorizada e realizada. |

O escopo da interface é a barra central da conversa. Sidebar, cabeçalho do contato, banners
internos dos painéis, layout geral, dados, permissões, APIs e infraestrutura permanecem fora
da alteração. Eventuais problemas anteriores devem ser registrados com evidência e impacto.

## As 20 etapas de execução futura

### Etapa 01 — Sincronizar a base antes de iniciar

- **Ação:** consultar novamente `origin/main`, registrar seu SHA e conferir o estado da árvore
  de trabalho. Comparar os arquivos mapeados com o commit de referência deste plano.
- **Detalhe:** verificar principalmente `TABS`, o tipo `ConversationTab`, os testes e os
  consumidores, porque outras mudanças podem chegar à `main` até a autorização da execução.
  Preservar qualquer trabalho local de outra sessão.
- **Aceite:** base atual identificada; diferenças relevantes incorporadas à leitura técnica;
  confirmação de que a barra ainda possui as oito abas descritas.
- **Dependência:** autorização posterior para executar o plano.

### Etapa 02 — Confirmar a superfície mostrada nas imagens

- **Ação:** abrir o Inbox pela raiz com `?view=inbox`, selecionar uma conversa de validação e
  localizar a barra `data-testid="conversation-tabs"` acima do conteúdo central.
- **Detalhe:** registrar a ordem anterior, a largura da janela e a presença dos painéis
  laterais. Capturar a barra usando dados de teste, sem expor contatos ou mensagens reais.
  Registrar também o estado sem conversa selecionada, no qual a barra depende da existência
  de `legacyConversation`.
- **Aceite:** referência visual e componente correspondente identificados sem ambiguidade.
- **Dependência:** etapa 01.

### Etapa 03 — Fixar o contrato das oito posições

- **Ação:** usar a tabela deste documento como critério funcional de aceite.
- **Detalhe:** confirmar oito identificadores distintos; Arquivos imediatamente após Chat;
  Histórico imediatamente após Pedidos; Tarefas e Notas nas duas últimas posições.
  Preservar os rótulos existentes, incluindo acento de Histórico e símbolo de CRM 360°.
- **Aceite:** sequência acordada representada pelos identificadores
  `chat, files, ia, crm, orders, history, tasks, notes`, sem reintroduzir Lembretes.
- **Dependência:** etapas 01 e 02.

### Etapa 04 — Mapear navegação e ciclo de vida dos painéis

- **Ação:** revisar `RealtimeInboxView`, `ConversationTabContent` e os usos de `onTabChange`.
- **Detalhe:** confirmar que a seleção depende de `tab.id`, e que os painéis são escolhidos
  por comparação de identificadores. Conferir a associação entre aba e contato, o retorno
  da IA ao Chat e a manutenção do Chat montado durante a navegação.
- **Aceite:** consumidores identificados; nenhuma referência por posição numérica exige
  ajuste; caso surja uma na versão atualizada, registrar seu impacto antes da edição.
- **Dependência:** etapa 03.

### Etapa 05 — Registrar os vínculos dos contadores

- **Ação:** conferir no componente os vínculos Arquivos → `filesTotal`, Tarefas → `tasksOpen`,
  Notas → `notesTotal` e Pedidos → `extraCounts.orders`.
- **Detalhe:** o componente exibe um contador somente quando seu valor é maior que zero.
  Pedidos possui tratamento próprio pelo identificador `orders`. O número 118 da imagem é
  um exemplo de dado exibido, e deve continuar sendo calculado a partir dos dados da conversa.
- **Aceite:** critérios de exibição e origem de cada contador documentados para comparação
  após a mudança; nenhum valor fixo introduzido.
- **Dependência:** etapa 04.

### Etapa 06 — Verificar a cobertura existente e o estado inicial

- **Ação:** executar a suíte focada de `ConversationTabs` na base escolhida e registrar o resultado.
- **Detalhe:** conferir os casos existentes de presença das oito abas, ausência de Lembretes,
  seleção, callback e contadores. Identificar que o caso com `forEach` apenas verifica presença,
  permitindo que uma ordem incorreta passe. Registrar eventuais falhas anteriores separadamente.
- **Aceite:** resultado inicial conhecido e ajuste necessário restrito à verificação da ordem
  efetivamente renderizada, aproveitando a suíte existente.
- **Dependência:** etapas 04 e 05.

### Etapa 07 — Preparar a alteração isolada

- **Ação:** criar uma branch de implementação a partir da base atualizada, com escopo limitado
  aos arquivos previstos; sugestão de nome: `fix/ordem-abas-conversa`.
- **Detalhe:** conferir se o nome já existe e escolher outro identificador caso necessário.
  Usar as dependências e o lockfile do projeto. Evitar reformatação global do componente,
  extração de abstrações ou limpeza de código sem relação com a ordem.
- **Aceite:** árvore inicial registrada e alteração planejada rastreável, sem misturar trabalhos
  de outras sessões ou mudanças de infraestrutura.
- **Dependência:** etapa 06.

### Etapa 08 — Reordenar os objetos no array TABS

- **Ação:** mover o objeto completo de Arquivos para a segunda posição e o objeto de Histórico
  para depois de Pedidos, obtendo a sequência final das oito abas.
- **Detalhe:** preservar os objetos e suas funções de contador; manter `TABS.map` como fonte
  da renderização, `key={tab.id}` e os componentes de animação existentes. Manter a sintaxe
  e a formatação local legíveis ao fechar o array.
- **Aceite:** `TABS` contém exatamente a sequência contratada; a alteração funcional consiste
  exclusivamente na posição dos objetos.
- **Dependência:** etapa 07.

### Etapa 09 — Conferir a identidade de cada botão

- **Ação:** comparar cada objeto após a mudança com sua versão anterior.
- **Detalhe:** verificar `id`, texto, ícone, função `count`, `data-testid`, `aria-selected` e
  callback de clique. O identificador `conversation-tab-files`, por exemplo, deve acompanhar
  Arquivos em sua nova posição. A união de tipos `ConversationTab` não controla a ordem visual.
- **Aceite:** nenhum botão duplicado, removido ou renomeado; cada botão conserva seu destino
  funcional e seu identificador estável.
- **Dependência:** etapa 08.

### Etapa 10 — Validar os oito destinos pela barra

- **Ação:** clicar nas abas na nova ordem e conferir o conteúdo correspondente ao contato
  selecionado: Chat, Arquivos, IA, CRM 360°, Pedidos, Histórico, Tarefas e Notas.
- **Detalhe:** verificar que somente a aba selecionada recebe destaque e `aria-selected=true`.
  Conferir também os estados de carregamento, ausência de registros e falha que estiverem
  disponíveis no ambiente de validação, sem alterar as regras dos painéis.
- **Aceite:** cada clique abre o destino correto, sem conteúdo trocado ou exceção nova no console.
- **Dependência:** etapa 09.

### Etapa 11 — Validar a continuidade do Chat e a troca de contato

- **Ação:** escrever um rascunho sem enviar, rolar a conversa, abrir Arquivos e voltar ao Chat.
  Depois selecionar outro contato e conferir a aba derivada de `tabState`.
- **Detalhe:** conferir que a reordenação preserva rascunho e posição de rolagem conforme o
  comportamento inicial, mantém Chat montado e não muda a lógica de seleção por contato.
  Quando houver sugestão de IA disponível, verificar “Usar resposta”, sem enviar a mensagem.
- **Aceite:** ausência de regressão nos estados do Chat, na troca de contato e no retorno da IA.
- **Dependência:** etapa 10.

### Etapa 12 — Validar contadores nas novas posições

- **Ação:** conferir contadores zerados e positivos em Arquivos, Pedidos, Tarefas e Notas,
  aproveitando os casos existentes e dados de teste disponíveis.
- **Detalhe:** verificar um exemplo de três dígitos em Arquivos, como 118, para avaliar largura.
  Selecionar uma aba com contador e conferir seu destaque. Verificar que Chat, IA, CRM 360°
  e Histórico continuam sem contador. Conferir que os valores correspondem ao contato selecionado.
- **Aceite:** valores e condições de exibição preservados; contador junto ao botão correto,
  sem sobreposição visual nem substituição por números fixos.
- **Dependência:** etapas 05 e 10.

### Etapa 13 — Conferir a apresentação em desktop

- **Ação:** comparar a barra antes e depois em uma janela semelhante à imagem fornecida e em
  uma janela de 1920 × 1080, com os painéis laterais abertos e fechados quando disponíveis.
- **Detalhe:** conferir altura de 53 px, alinhamento, espaçamento, ícones, contadores, borda,
  fundo e destaque da aba ativa. Avaliar a largura útil do painel central, que varia com os
  painéis laterais mesmo quando a largura total da janela permanece igual.
- **Aceite:** nova sequência legível; as diferenças visuais esperadas decorrem da posição
  dos itens; demais elementos da tela preservam o comportamento inicial.
- **Dependência:** etapas 10 a 12.

### Etapa 14 — Conferir responsividade e rolagem horizontal

- **Ação:** validar janelas de 1366 × 768, 768 × 1024 e 390 × 844, além de larguras imediatamente
  abaixo e acima do breakpoint efetivo de `2xl` e zoom de 200%.
- **Detalhe:** os textos usam `hidden 2xl:inline`; abaixo desse breakpoint a interface atual
  privilegia ícones. Confirmar o breakpoint nas regras geradas, distinguindo a configuração de
  `container.screens` das variantes responsivas. Conferir `overflow-x-auto`, `shrink-0` e o
  acesso até Notas por rolagem, teclado e toque, sem alterar o desenho responsivo nesta tarefa.
- **Aceite:** ordem preservada em todas as larguras; nenhuma aba fica inacessível por uma
  regressão introduzida; a barra não provoca nova rolagem horizontal da página inteira.
- **Dependência:** etapa 13.

### Etapa 15 — Conferir foco e semântica acessível

- **Ação:** percorrer a barra com Tab e Shift+Tab e ativar os botões com Enter e Espaço.
- **Detalhe:** confirmar que foco e leitura seguem a mesma ordem visual, que o foco é visível,
  que `role="tablist"`, `role="tab"` e `aria-selected` mantêm seu comportamento. Inspecionar
  nomes acessíveis com os rótulos ocultos em telas menores. O componente atual não implementa
  navegação por setas, `aria-controls` nem gestão de `tabIndex`; esses recursos não devem ser
  declarados como existentes. Registrar limitações anteriores fora da reordenação.
- **Aceite:** mudança de posição coerente entre DOM, tela e foco; nenhuma regressão de
  teclado ou semântica atribuível à alteração.
- **Dependência:** etapa 14.

### Etapa 16 — Ajustar a verificação existente da ordem

- **Ação:** atualizar o caso “renderiza as 8 abas do painel central” na suíte existente para
  obter os botões pelo papel `tab`, dentro da barra, e comparar seus identificadores em ordem.
- **Detalhe:** usar uma lista esperada explícita com os oito valores de `data-testid`, derivada
  do requisito. Comparar a lista completa para detectar inversão, duplicação e abas extras.
  Apenas mudar a lista usada pelo `forEach` atual continuaria sem verificar a ordem do DOM.
  Preservar os demais casos existentes, inclusive a ausência de Lembretes.
- **Aceite:** a verificação falha com a sequência anterior e passa com a nova sequência;
  nenhuma exportação de `TABS` ou nova infraestrutura de testes é necessária.
- **Dependência:** etapas 08 e 09; pode ser realizada antes das verificações manuais.

### Etapa 17 — Conferir temas e movimento reduzido

- **Ação:** verificar a seleção de Chat, Arquivos, Histórico e Notas nos temas claro e escuro,
  além do modo de movimento reduzido do sistema ou das ferramentas do navegador.
- **Detalhe:** conferir `LayoutGroup`, `layoutId="conversation-tab-pill"` e o caminho estático
  de `useReducedMotion`. Observar transições entre posições próximas e distantes, foco e
  contraste dos contadores. Utilizar os tokens e classes já presentes no componente.
- **Aceite:** indicador ativo acompanha a aba correta; movimento reduzido mantém o destaque
  estático previsto; a mudança não introduz cores ou estilos específicos de um tema.
- **Dependência:** etapas 13 a 15.

### Etapa 18 — Executar as verificações técnicas aplicáveis

- **Ação:** rodar a suíte focada após o ajuste e as verificações de lint, tipos e build usadas
  pelo projeto, conforme os comandos de referência abaixo e a versão atual da CI.
- **Detalhe:** registrar comandos, códigos de saída e SHA testado. Os verificadores de lint e
  tipos comparam o resultado com a dívida já registrada no repositório; não alterar esses
  registros para acomodar falhas novas. Aproveitar a CI para as verificações obrigatórias
  mais amplas. Repetir testes quando houver correção posterior ou evidência de regressão.
- **Aceite:** suíte focada aprovada, build concluído e nenhuma falha nova nos verificadores;
  limitações de ambiente ou falhas anteriores identificadas de forma explícita.
- **Dependência:** etapas 16 e 17.

### Etapa 19 — Revisar o diff e reunir evidências de aceite

- **Ação:** revisar o diff final e preencher a matriz de aceite deste documento com evidências
  obtidas durante a execução.
- **Detalhe:** conferir a sequência literal, os oito destinos, seleção, contadores, foco,
  responsividade e estado do Chat. Anexar imagens da barra em desktop e janela estreita com
  dados de teste. Confirmar que cada arquivo modificado tem relação direta com a mudança e
  que dados de usuários e credenciais não aparecem nas evidências.
- **Aceite:** alteração pequena e revisável; diferenças justificadas; evidências vinculadas
  ao SHA efetivamente validado, com qualquer pendência material descrita.
- **Dependência:** etapas 10 a 18.

### Etapa 20 — Entregar a implementação e preparar a reversão

- **Ação:** quando a execução estiver autorizada e validada, commitar a implementação com
  mensagem como `fix(inbox): reorganiza abas superiores da conversa` e submetê-la pelo fluxo
  vigente do repositório. Descrever a ordem anterior, a nova ordem e a validação realizada.
- **Detalhe:** acompanhar os checks exigidos e respeitar as proteções da branch. Publicação
  e merge devem seguir a autorização vigente nessa etapa; este documento não os executa.
  Após uma publicação autorizada, conferir a sequência e Arquivos no segundo lugar no
  ambiente publicado, identificando a versão carregada.
- **Reversão:** se a mudança causar regressão de navegação, estado ou acesso às abas, preparar
  a reversão apenas do commit de implementação pelo fluxo normal, restaurando a ordem
  anterior e a expectativa correspondente do teste. Preservar commits de outras alterações.
- **Aceite:** entrega rastreável, resultado de publicação registrado quando aplicável e
  procedimento de reversão definido. Nenhuma alteração de dados é necessária para reverter.
- **Dependência:** etapa 19 e autorização vigente para as ações de entrega.

## Comandos de referência para a execução futura

Estes comandos fazem parte do plano. A elaboração deste documento não implica sua execução.
Conferir scripts e runtime na base atualizada antes de utilizá-los. O repositório utiliza Bun
e `bun.lock`; os scripts de verificação também usam Node.

```bash
# Suíte do componente já existente
bun run test src/components/inbox/chat/__tests__/ConversationTabs.test.tsx

# Verificadores usados pela CI para impedir novos problemas de lint e tipos
node scripts/ci/lint-ratchet.mjs
node scripts/ci/typecheck-ratchet.mjs

# Build da interface
bun run build

# Conferência do diff da implementação
git diff --check
git diff --stat
git diff -- src/components/inbox/chat/ConversationTabs.tsx src/components/inbox/chat/__tests__/ConversationTabs.test.tsx
```

A suíte E2E atual de conversas cobre outros fluxos e depende de autenticação e preparação
de dados. Sua execução, se exigida pelo fluxo vigente, deve ocorrer no ambiente próprio de
testes. Ela não substitui a conferência da ordem e não é necessária para salvar este plano.

## Matriz de aceite para preencher durante a execução

| Critério | Evidência esperada | Estado neste documento |
| --- | --- | --- |
| Oito abas na ordem contratada | Lista dos botões no DOM e imagem da barra | Pendente |
| Identificadores e destinos preservados | Revisão do diff e navegação nas oito abas | Pendente |
| Arquivos em segundo com contador dinâmico | Caso existente da suíte e inspeção visual | Pendente |
| Histórico em sexto; Tarefas e Notas ao final | Comparação da sequência integral | Pendente |
| Lembretes permanece fora da barra | Caso existente da suíte | Pendente |
| Seleção e estado do Chat preservados | Navegação, rascunho, rolagem e troca de contato | Pendente |
| Barra utilizável em larguras diferentes | Inspeção das larguras e rolagem previstas | Pendente |
| Foco acompanha a nova ordem | Percurso manual de teclado | Pendente |
| Temas e movimento reduzido preservados | Verificação visual dos estados previstos | Pendente |
| Verificações técnicas concluídas | Resultados dos comandos e checks do SHA final | Pendente |

## Riscos e tratamento

| Risco | Tratamento planejado |
| --- | --- |
| Planejar ou implementar sobre código antigo | Conferir `origin/main` e registrar o SHA antes de editar; usar as oito abas da base atual. |
| Trocar apenas a ordem visual e manter o foco antigo | Reordenar `TABS`, que determina o DOM, mantendo CSS e renderização existentes. |
| Mover o rótulo e deixar contador ou destino em outra aba | Mover cada objeto completo e conferir suas propriedades estáveis. |
| Aceitar um teste que verifica presença, mas ignora sequência | Ajustar a comparação do caso existente para usar a lista completa em ordem de DOM. |
| Interpretar rótulos ocultos como abas removidas | Validar o breakpoint efetivo, os ícones, o foco e a rolagem horizontal. |
| Perder trabalho simultâneo ou incluir mudanças alheias | Atualizar a leitura da base, isolar a implementação e revisar os arquivos do commit. |

## Condição de encerramento

A mudança estará concluída após a execução autorizada das etapas aplicáveis, com a ordem
**Chat → Arquivos → IA → CRM 360° → Pedidos → Histórico → Tarefas → Notas** verificada e os
resultados registrados. Neste momento, a entrega se encerra no commit deste plano; a interface
continua com a ordem anterior.
