# Bloco 15 do Plano IA 200 Etapas — estado REAL das etapas IA-141 a IA-150

> Fonte: [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md)
> §"Bloco 15 — Experiência de uso e acessibilidade (141–150)".
> Item do inventário: `docs/plans/SEGUNDA_LEVA_CARTOES_2026-10-08.tsv` linha `SL-216`
> (`Outros`, `NAO_IMPLEMENTADA`, P3, esforço M, evidência: "sem entrega das etapas 141-150").
> Cartão: `SL-216`.
>
> **Ponta medida:** branch `dia/2026-10-08`, commit `e3349b70c`.
> **O que este documento é:** a revisão de evidência que o próprio bloco exige —
> *"Checkpoint do bloco: evidências dos dez critérios de aceite revisadas; itens não comprovados permanecem pendentes."*
> Cada etapa recebe um estado medido no código de hoje, com o caminho da prova ou a razão
> declarada de não existir.
> **O que este documento NÃO é — e o que ele é.** Este documento não é implementação do bloco: ele
> registra estado e prova. O Bloco 15 não é um defeito de uma camada: são **dez etapas** com dez
> critérios de aceite próprios, espalhadas por superfícies
> distintas (pontos de entrada do assistente, selo de origem da informação, visualizador de
> evidências, semântica de modal × painel, teclado, estados visuais, legibilidade, proteção de
> rascunho, separação administração × operação e preferências por usuário). Uma delas — a IA-149 —
> exige que a separação seja imposta **no servidor** (a rota/o endpoint não pode contornar a
> interface), o que toca autorização de função e rota, fora da área de telas e vedado pelas regras
> deste cartão. Fechar o bloco num único cartão `worker` significaria entregar um pedaço e chamar o
> bloco de pronto. O contrário também não vale: nenhuma etapa entra aqui como entregue por
> intenção, projeto ou pela existência de superfície vizinha.

## Vocabulário de estado

- **IMPLEMENTADA** — o critério de aceite da etapa está atendido no código de hoje, com prova.
- **PARCIAL** — existe uma parte real e verificável no repositório, mas o critério de aceite
  **não** está fechado.
- **NÃO IMPLEMENTADA** — não há caminho no repositório que atenda o critério, ou o critério depende
  de execução/guarda que não existe hoje.

## Índice por etapa

| Etapa | Estado |
|---|---|
| IA-141 — Unificar a experiência de assistência | PARCIAL |
| IA-142 — Identificar a origem de cada informação | NÃO IMPLEMENTADA |
| IA-143 — Abrir evidências sem perder a conversa | NÃO IMPLEMENTADA |
| IA-144 — Escolher painel ou modal conscientemente | PARCIAL |
| IA-145 — Corrigir interação por teclado | PARCIAL |
| IA-146 — Padronizar estados visuais | PARCIAL |
| IA-147 — Corrigir legibilidade e responsividade | PARCIAL |
| IA-148 — Proteger o rascunho durante geração | PARCIAL |
| IA-149 — Separar administração e operação | PARCIAL |
| IA-150 — Personalizar formato de assistência | NÃO IMPLEMENTADA |

## Estado por etapa

- **IA-141 — Unificar a experiência de assistência — PARCIAL.** O critério proíbe que
  funcionalidades equivalentes tenham nomes e comportamentos contraditórios em telas diferentes. A
  base real existe: a aba IA e os painéis de ferramenta **reutilizam os MESMOS componentes** —
  `src/components/inbox/ConversationSummary.tsx` e `src/components/inbox/ObjectionDetector.tsx` são
  renderizados tanto por `src/components/inbox/tabs/AiTab.tsx` quanto por
  `src/components/inbox/chat/ChatToolPanels.tsx`. **O que falta:** os pontos de entrada continuam
  duplicados e com nomes divergentes para a mesma capacidade — "Monitoramento de Objeções" em
  `src/components/inbox/chat/ChatHeaderToolbar.tsx` e `src/components/inbox/AIToolsPopover.tsx`
  contra "Objeções detectadas" na aba; "Resumo da Conversa" no painel contra "Resumo da conversa" na
  aba. Reutilizar componente não é unificar ponto de entrada, e o critério fala de nomes e estados,
  não só de código compartilhado.

- **IA-142 — Identificar a origem de cada informação — NÃO IMPLEMENTADA.** O critério exige exibir
  se o resultado foi gerado, calculado, informado manualmente ou importado, com data, cobertura e
  condição de atualização. Não há esse selo em nenhuma superfície do assistente: a aba IA
  (`src/components/inbox/tabs/AiTab.tsx`) mostra a análise mais recente apenas como carimbo de hora
  ("Análise atualizada às HH:mm") e o risco como "Risk score N"; a sugestão de resposta
  (`src/components/inbox/AISuggestions.tsx`) não declara a natureza do texto. O vocabulário existe
  **apenas em documento** — `docs/ia/IA-006-natureza-e-verificacao-dos-achados.md` classifica
  generativo × determinístico × manual × importado —, e documento não é selo na tela. O aceite ("um
  selo de IA não transforma score manual ou regra simples em previsão validada") segue sem
  mecanismo.

- **IA-143 — Abrir evidências sem perder a conversa — NÃO IMPLEMENTADA.** O critério pede
  visualização de fontes, trechos e comparação de versões ao lado do atendimento, com navegação até
  a mensagem ou documento. Não existe esse visualizador: a busca na conversa destaca e rola até a
  mensagem (`src/components/inbox/ChatPanel.tsx`), mas não apresenta fontes nem trechos de uma
  conclusão. As ferramentas do assistente são apresentadas por painel modal sobreposto —
  `src/components/inbox/ai-tools/ToolPanel.tsx`, consumido por
  `src/components/inbox/chat/ChatToolPanels.tsx` —, não por consulta lateral de evidência, e nada
  compara versões de uma análise.

- **IA-144 — Escolher painel ou modal conscientemente — PARCIAL.** O critério prioriza painel
  lateral para trabalho contínuo e, quando modal for necessário, exige semântica, bloqueio de
  interação externa e gestão de foco apropriadas. Existe o comportamento modal:
  `src/components/inbox/ai-tools/ToolPanel.tsx` desenha um fundo que bloqueia a interação externa e
  fecha ao clique, com cabeçalho titulado, e é o MESMO painel usado para Visão, Objeções,
  Universitários e Resumo (`src/components/inbox/chat/ChatToolPanels.tsx`). **O que falta:** nenhuma
  dessas ferramentas tem painel lateral — todas são modal centralizado — e o modal não se anuncia
  como diálogo nem gere foco: não há papel de diálogo, marcação de modal, laço de foco nem
  fechamento por Escape no componente. Sem isso, o anunciado não corresponde à interação real.

- **IA-145 — Corrigir interação por teclado — PARCIAL.** O critério exige nome acessível em ícones
  e abas, gestão de foco, Escape e retorno ao acionador. Existe parte real: o seletor de tom rotula
  o grupo e as opções (`src/components/inbox/ai-tools/ToneSelector.tsx`), o filtro de período rotula
  a remoção de filtro (`src/components/inbox/ai-tools/PeriodFilterSelector.tsx`) e os controles de
  áudio do resumo e dos pontos-chave têm rótulo (`src/components/inbox/ai-tools/SummaryTab.tsx`).
  **O que falta:** as abas de análise são só ícone, sem nome acessível, e o botão de fechar do painel
  também é só ícone, sem rótulo — em `src/components/inbox/ai-tools/AnalysisTabs.tsx` e
  `src/components/inbox/ai-tools/ToolPanel.tsx`; o painel não responde a Escape nem devolve o foco
  ao acionador. O critério só fecha quando o fluxo inteiro funciona por teclado e leitor de tela,
  não em parte dos controles.

- **IA-146 — Padronizar estados visuais — PARCIAL.** O critério exige distinguir carregando,
  aguardando aprovação, cancelado, parcial, desatualizado, vazio e erro, com a ação de recuperação
  pertinente. Existe parte real: a aba IA mostra carregamento e vazio explícitos — as seções
  "Próxima melhor ação" e "Produtos recomendados" têm marca de carregamento (`animate-pulse`) e vazio
  honesto ("Sem ações sugeridas" e o `EmptyState` "Nenhum produto cadastrado") em
  `src/components/inbox/tabs/AiTab.tsx`, travados por
  `src/components/inbox/tabs/__tests__/AiTab.test.tsx` —, e o histórico da análise mostra o giro de
  carregamento (`Loader2`) e o vazio "Nenhuma análise anterior" em
  `src/components/inbox/ai-tools/HistoryTab.tsx`. **O que falta:** as abas de análise não têm estado
  de erro, de resultado parcial, de cancelado nem de desatualizado — o envelope da IA já carrega
  `status?: 'ok' | 'partial' | 'error'` em `src/components/inbox/ai-tools/analysisConfigs.ts`, mas a
  falha da análise vira mensagem passageira (`toast`) em
  `src/components/inbox/AIConversationAssistant.tsx`, não estado ao lado do resultado, e nada marca
  uma análise como desatualizada. O usuário ainda depende de onde a resposta cai.

- **IA-147 — Corrigir legibilidade e responsividade — PARCIAL.** O critério pede remover redução
  artificial por escala, revisar fontes muito pequenas, contraste, alvos de toque e espaçamento em
  desktop e mobile. Existe parte real e verificável: o contraste da caixa de entrada e dos balões é
  travado por contrato (`tests/contracts/axe-inbox.contract.test.ts` e
  `tests/contracts/a11y-contraste-gate.contract.test.ts`) e a escala mínima de texto do sistema está
  declarada no tema (`tailwind.config.ts`, a "2xs" de 11px). **O que falta:** essa escala de 11px
  continua em uso no assistente — subtítulo do painel, rótulos do período e do tom, em
  `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` e `src/components/inbox/ai-tools/ToneSelector.tsx`
  —, e não há tratamento de zoom, viewport reduzido nem alvo de toque medido nas telas do bloco.

- **IA-148 — Proteger o rascunho durante geração — PARCIAL.** O critério exige que uma resposta
  atrasada não substitua silenciosamente o trabalho recente do atendente. Existe proteção real e
  provada em um caminho: `src/components/inbox/chat/AIEnhanceButton.tsx` guarda o texto do momento
  do clique e **descarta** a resposta quando o rascunho mudou depois do disparo, e o desfazer também
  é descartado quando não corresponde ao texto aplicado; o rascunho por conversa é persistido em
  `src/components/inbox/chat/useChatInputLogic.ts`. **O que falta:** a mesma garantia não está
  demonstrada nos demais caminhos de geração — inserir a sugestão da aba IA
  (`src/components/inbox/AISuggestions.tsx`) e aplicar um resumo —, onde nada impede que um retorno
  atrasado sobrescreva a edição recente.

- **IA-149 — Separar administração e operação — PARCIAL.** O critério exige restringir endpoints,
  segredos e configuração de modelos aos perfis autorizados, deixar ao atendente só as capacidades
  permitidas e o estado de disponibilidade, e que o acesso direto à rota ou à API **não contorne** a
  separação da interface. Existe parte real na interface: a aba de provedores de IA só é montada
  para quem tem papel autorizado — `src/components/settings/SettingsView.tsx` condiciona o conteúdo
  a `isAdmin`/`isSupervisor` vindos de `src/hooks/system/useUserRole.ts` —, e o componente é
  `src/components/settings/AIProvidersManager.tsx`. **O que falta:** a separação **no servidor**,
  que é justamente o que o aceite exige como o que protege a operação, não é provada por este
  documento nem cabe neste cartão: toca autorização de função e rota, fora da área de telas. Guarda
  na tela não é guarda no acesso.

- **IA-150 — Personalizar formato de assistência — NÃO IMPLEMENTADA.** O critério pede preferências
  por usuário para profundidade, formato, acessibilidade e reprodução de áudio, sem alterar política
  central nem compartilhar preferência entre contas. Não existe preferência por usuário para o
  assistente: não há armazenamento nem tela de escolha de profundidade, formato ou acessibilidade da
  resposta — a leitura em voz alta é disparada por controle da própria aba
  (`src/components/inbox/ai-tools/SummaryTab.tsx`), não por preferência salva. O mais próximo são
  preferências de notificação e som, de outra capacidade, que não configuram a assistência.

## Consequência para o plano

O Bloco 15 permanece **pendente como trabalho de tela**, etapa por etapa. Há superfície **real** do
assistente no repositório — a aba IA, o painel único de ferramenta, a proteção de rascunho do
componente de melhoria de texto e a guarda de papel da aba de provedores —, e é isso que as sete
etapas PARCIAIS registram. O que **não** existe é o selo de origem (IA-142), o visualizador de
evidências (IA-143) e as preferências por usuário (IA-150), e o que **não** está fechado são os
critérios que exigem o fluxo completo (teclado, estados, semântica de modal) ou guarda no servidor
(IA-149). Cada ponto é um cartão próprio: nenhum deles é presumido a partir deste documento, e
alterar um estado aqui exige rever a evidência no código, não só o rótulo.
