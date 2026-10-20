# Revisão de UI, efeitos e hooks de performance

Fonte fixa `da307ba5626dce892f0b37cb6762463f55d14a96`. Todos os87 arquivos primários foram lidos integralmente:78 em UI,5 em effects e4 hooks de performance, somando10.095 linhas. O inventário com apoios tem101 caminhos, com91 leituras integrais e10 dirigidas. Nenhum arquivo de produto foi alterado.

## Resultado delimitado

| ID | Prioridade | Contrato |
|---|---|---|
| R2-INF-032 | P2 | Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta |
| R2-INF-033 | P2 | Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo |
| R2-INF-034 | P3 | Acesso rápido inicial fica fora da navegação por setas e Enter da paleta |
| R2-INF-035 | P3 | Progress aplica value à barra visual e o descarta antes do Root semântico |

Quatro casos de prova confirmam esses quatro registros; não são quatro defeitos adicionais. A ordem de resolução, a filtragem e os handlers vêm do texto de fonte fixado. SHA256 dos sete arquivos do probe e do compilador é validado antes da importação do compilador. O pacote de produto, SDK, rede e banco não são fornecidos à VM.

## Probes e controles

| Probe | Execução delimitada | Controle |
|---|---|---|
| INF-UI-P01 | Debounce real e callbacks de busca/agrupamento, A e B iniciadas, B resolve antes de A | Timers ainda pendentes coalescem; a falha depende de pedidos já iniciados |
| INF-UI-P02 | Dados padrão, filtro e executor reais | nav-, action explícita e disabled mantêm seus efeitos esperados |
| INF-UI-P03 | Coleção e handler de teclado reais | Um item consultado entra em allItems e Enter o executa |
| INF-UI-P04 | Módulo Progress completo com captura inerte de JSX | max e aria-label chegam ao Root; value não chega |

Primeira execução do P01 usou await Promise.resolve() insuficiente para Promise entre VM/host e parou por TypeError antes de gravar resultado. Harness corrigido para aguardar a Promise exata do callback capturada na fronteira; quatro casos então passaram. Nenhuma falha desse harness virou achado.

## R2-INF-032 — Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta

A paleta dispara um callback com debounce, mas toda resolução grava searchResults sem comparar a consulta ou geração corrente. O debounce só cancela timers ainda pendentes. Depois que A e B iniciaram, B pode terminar primeiro e ser substituída por A. O agrupamento concatena searchResults ao filtro da consulta atual sem refiltrar o resultado remoto.

**Precondições:** Paleta aberta e duas consultas de pelo menos dois caracteres já iniciadas após o debounce. A consulta antiga resolve depois da atual, com conjunto diferente de produtos.

**Efeito e alcance:** A entrada pode dizer vermelho e a seção Resultados mostrar produto azul da consulta anterior. O link preserva o ID do resultado antigo e abre o fluxo do catálogo para esse item se selecionado. Não há envio automático de mensagem. Um finally antigo também pode encerrar o indicador enquanto outra busca continua.

**Evidência:**

- `src/components/ui/command-palette.tsx:40–68` — Filtro local, concatenação de resultados e await sem geração. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:70–94` — Mudança de consulta, executor e limpeza sem invalidar requisição em voo. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/hooks/system/useDebounce.ts:7–20` — Cancela apenas timeout; callback iniciado não é abortado. SHA256 `e1a8716e995f6732963fd06d57df463dde9325aa55a96bfa29a2e9c7a24daba4`.
- `src/components/keyboard/CommandPaletteHost.tsx:16–27` — Consumidor injeta busca real do catálogo. SHA256 `34609b36fb8616345b10f2b49f26bfeafaf03f70cb5090eb99b3b44cf3f30f97`.
- `src/hooks/integrations/useCatalogQuickSearch.ts:9–31` — Query no endpoint e retorno de href por produto, sem geração. SHA256 `6e015b754e5e3f4d12867f3f7f864b37a2bd4447c29c8499805ba8a4942b2dc7`.
- `src/components/keyboard/GlobalKeyboardProvider.tsx:58–63` — Host permanece montado após primeira abertura. SHA256 `16dcf2e44b55d936320e7da0d4677482b952e0d952840483632274d735feb020`.
- `src/components/keyboard/GlobalKeyboardProvider.tsx:146–154` — Montagem da paleta atual. SHA256 `16dcf2e44b55d936320e7da0d4677482b952e0d952840483632274d735feb020`.
- `src/App.tsx:124–143` — Provider atual envolve AppRoutes. SHA256 `3e05e3ea5f9c194799d123aa46a8dc80967dc8ef846f8efe7e97e8d96f659220`.

**Critérios de aceite:**

- Invalidar respostas anteriores a cada mudança de consulta, limpeza e fechamento; só a geração atual pode alterar resultados/loading.
- Preservar debounce e usar cancelamento quando suportado, sem depender dele como única proteção contra resposta já resolvida.
- Verificar A→B com resolução B→A, erro tardio de A, consulta vazia/curta e fechamento; uma resposta antiga não deve substituir nem apagar B.
- Exercitar o callback consumidor e a seleção do produto, mantendo o ID associado à consulta atual.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Fixture usa dois resultados sintéticos e o debounce real com avanço manual de timers. Não invoca promogifts-catalog nem presume falha de RLS. A prova é a troca de consulta dentro da paleta; não se afirma vazamento entre contas ou envio involuntário.

## R2-INF-033 — Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo

Nova conversa, Respostas rápidas e Atalhos de teclado são CommandItems de categoria action sem action nem href. executeCommand só trata callback, href ou id nav- e depois fecha incondicionalmente. O Host injeta itens Talk X e busca, mas não conecta handlers às três entradas padrão.

**Precondições:** Usuário abre a paleta atual e busca um dos três títulos. Seleciona a entrada padrão habilitada, pelo clique ou pela lista consultada.

**Efeito e alcance:** A operação anunciada não começa: não abre conversa, templates nem ajuda de atalhos. O fechamento aparenta ter aceitado o comando. Navegações nav- e itens com action explícita continuam funcionando no controle do probe.

**Evidência:**

- `src/components/ui/command-palette-data.tsx:39–43` — Três action-* sem action/href. SHA256 `5abe68e6324949e730211977509079358132b9c97bc31982c1e94984dcbc8cf5`.
- `src/components/ui/command-palette.tsx:40–48` — Itens padrão entram na filtragem. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:72–78` — Executor não despacha IDs action-* e fecha. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:168–186` — Itens habilitados chamam executor. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/keyboard/CommandPaletteHost.tsx:16–27` — Host não fornece handlers para defaults. SHA256 `34609b36fb8616345b10f2b49f26bfeafaf03f70cb5090eb99b3b44cf3f30f97`.
- `src/components/keyboard/GlobalKeyboardProvider.tsx:146–154` — Consumer atual montado. SHA256 `16dcf2e44b55d936320e7da0d4677482b952e0d952840483632274d735feb020`.

**Critérios de aceite:**

- Conectar cada ação anunciada ao mecanismo real existente, com contexto/permissão necessários, ou removê-la/desabilitá-la com explicação quando não disponível.
- Selecionar cada entrada deve abrir o fluxo indicado e produzir o efeito observável correspondente.
- Manter controles para nav-, href, action explícita e disabled; não considerar o simples fechamento como sucesso de execução.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Não duplica a paleta antiga src/components/CommandPalette.tsx, governança de tags ou configuração global de atalhos. Nenhuma ação de negócio real foi executada pelo probe.

## R2-INF-034 — Acesso rápido inicial fica fora da navegação por setas e Enter da paleta

Com query vazia, groupedCommands é vazio e allItems também. Mesmo assim o JSX mostra cinco destinos de acesso rápido e destaca o índice0. O listener de teclado usa exclusivamente allItems: setas ficam no índice0 e Enter não executa item. A UI anuncia as duas teclas como navegação/seleção.

**Precondições:** Paleta aberta, busca ainda vazia e foco no input de pesquisa. Usuário segue as dicas visíveis de setas e Enter.

**Efeito e alcance:** O acesso rápido não funciona pelo caminho de teclado anunciado até que haja uma consulta. O clique e a navegação nativa por Tab permanecem alternativas; não se afirma bloqueio de toda operação por teclado.

**Evidência:**

- `src/components/ui/command-palette.tsx:50–62` — Lista de teclado vazia quando query vazia. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:80–89` — Listener usa apenas allItems. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:91–94` — Abertura dirige foco para o input. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:115–119` — Dicas de setas e Enter. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:143–155` — Cinco atalhos visíveis usam outra lista. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.

**Critérios de aceite:**

- Construir uma coleção de itens visíveis usada pelo destaque, teclado e clique, incluindo acesso rápido quando query vazia.
- Setas devem percorrer os itens exibidos e Enter deve executar o item destacado a partir do foco na busca.
- Cobrir estados zero/um/vários resultados e manter comportamento de itens desabilitados; não depender de Tab/click para cumprir as dicas anunciadas.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Probe chama apenas agrupamento/lista e handler reais com evento sintético; não simula ativação nativa de botões ou ordem DOM. A falha é distinta das ações sem executor: aqui o destino nav-inbox tem executor, mas não entra na coleção do listener.

## R2-INF-035 — Progress aplica value à barra visual e o descarta antes do Root semântico

O wrapper remove value na desestruturação e o usa no transform do Indicator, mas não passa value para ProgressPrimitive.Root. O Root recebe os demais props. A API oficial usa Root.value para fornecer a medida do progresso; nos consumidores lidos nenhum aria-valuenow alternativo compensa a omissão.

**Precondições:** Um consumidor monta Progress com value determinado. Consumidor não injeta manualmente o valor semântico por atributo alternativo; os caminhos inspecionados não o fazem.

**Efeito e alcance:** O controle deixa de transmitir a medida pelo contrato semântico do Radix, embora a largura visual represente25% ou100%. O probe confirma a prop omitida. Textos percentuais adjacentes continuam existentes nos exemplos; não se afirma ausência total de informação para leitor de tela nem falha de envio.

**Evidência:**

- `src/components/ui/progress.tsx:6–19` — value sai dos props de Root e só alimenta transform. SHA256 `bdc4847f05de3aea1276966e0df9b4a293297f0ca7d7b430a1cb16cf5626728f`.
- `src/components/catalog/CatalogBulkSendDialog.tsx:213–228` — Uso determinado com texto percentual adjacente. SHA256 `aa84d2e5e54f2667f870c1a91358fc79b0ed064b548e6ec0c8c9ea9e78a7fc14`.
- `src/components/catalog/ExternalProductCatalog.tsx:709–721` — Montagem real do diálogo em massa. SHA256 `5658830363331ff54f5ec01121ce2eef2bfc9ed1aea8071ee51c4b5e4ac965e5`.
- `src/components/inbox/FileUploader.tsx:178–185` — Upload passa value sem alternativa aria-valuenow. SHA256 `b3dee842e813c8c8b8c192f945dd096e6daba2de41163208fb26ff7a65acb0f9`.
- `src/components/inbox/FileUploader.tsx:207–211` — Progresso da fila também usa wrapper. SHA256 `b3dee842e813c8c8b8c192f945dd096e6daba2de41163208fb26ff7a65acb0f9`.
- `src/components/inbox/chat/ChatInputArea.tsx:210–216` — FileUploader no composer. SHA256 `2afe2fca8725cc54161998a384a3eb332cc2488e4535d97121f97a80fcbaf70c`.
- `package.json:52–52` — Dependência Progress declarada. SHA256 `1f8a4113677be5d92b90ba65c6e98b7e807a3a9b499ada8ec35f6349220debcb`.
- `bun.lock:382–382` — Versão1.1.16 fixada. SHA256 `81a17a8b7cc56ef4a9aa584cc341de640c0fe8d59fca3fc7b399431db10a695f`.

**Critérios de aceite:**

- Encaminhar value ao Root e manter medida visual/semântica coerentes, incluindo zero,100 e indeterminado.
- Verificar o DOM gerado com a dependência fixada: role e valor/estado acessível devem refletir a medida recebida.
- Manter texto contextual e nome acessível adequados no consumidor; a correção de props não é prova de aceitação completa por tecnologia assistiva.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Documentação primária consultada em04/10/2026. Não foi baixado/importado o pacote Radix1.1.16; duas tentativas de consultar o código GitHub foram bloqueadas pelo provedor de pesquisa. Probe captura o JSX produzido pelo wrapper com tipos inertes; não simula o algoritmo interno do Radix nem relata aria-valuenow observado em browser. P3 delimitado pela existência de textos de progresso adjacentes e ausência de efeito sobre a operação de upload/envio.

**Contrato primário:** [Progress — Radix](https://www.radix-ui.com/primitives/docs/components/progress), consultado em04/10/2026. A API/exemplo fornece a medida em Root.value. Esta é documentação geral, não captura de execução da versão1.1.16.

## Adjudicação de planos

- P010/56 DONE_VERIFIED certifica remoção de nav-tags; continua preservado e não é reaberto pelos novos defeitos de busca/execução.
- P015/E38 do catálogo e P043/E26 são SUPERSEDED; a relação histórica com a paleta não reativa planos substituídos.
- P046/X054 PARTIAL trata integração específica de Talk X; este lote não altera esse status nem certifica todos os itens Talk X.
- Nenhuma tarefa genérica DONE_VERIFIED foi reaberta por associação temática. Os defeitos atuais têm seu próprio subcontrato executável e aceite.

## Controles e candidatos não promovidos

- OfflineIndicator: HTTP404/500 ainda comprova transporte/conectividade; o rótulo não promete saúde de API e SW/PWA foi deliberadamente desativado. Rejeitado como defeito.
- ReactionPicker: falta de preventDefault sozinha não prova duplo evento. Wrapper TeamMessageItem antigo não está no Panel ativo e fechamento é síncrono; sem novo ID.
- Prefetch/observers/counters/QuickPeek e vários efeitos exportados têm riscos latentes sem consumidor ativo confirmado; não foram convertidos em incidentes de produto.
- useTimingHooks tem consumidor real do debounce de valor em useTalkMeQueue; a nota inicial de ausência genérica foi corrigida após busca transversal de imports. Esse debounce limpa timer e não é o callback debounce da paleta.
- ChartContainer foi rastreado até config CSS literal em AIStatsWidget; dados de série remotos não demonstram injeção no CSS.
- Easter eggs, partículas e skeletons são apresentação deliberada; animação ou placeholders não provam regressão de performance ou conclusão falsa de negócio.
- useAnnounce ignora politeness e tem timer sem cleanup, mas só sua definição foi localizada; LiveRegion ativo é componente distinto.

## Cobertura por arquivo

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `bun.lock` | targeted | 27–27, 382–382 | Pin versionado de Progress1.1.16 identificado no lock; leitura dirigida da dependência, sem baixar/importar pacote. |
| `package.json` | targeted | 52–52 | Dependência de Progress identificada em contrato; leitura dirigida da linha52 apenas, sem executar install/scripts. |
| `src/App.tsx` | targeted | 1–75, 118–147 | Imports/DeferredProviders e retorno principal lidos por faixas: confirma EasterEggs lazy e montagem, GlobalKeyboardProvider ao redor de AppRoutes, Toaster/Sonner e LiveRegion. Restante não é declarado integral. |
| `src/components/catalog/CatalogBulkSendDialog.tsx` | targeted | 1–60, 205–234 | Imports e ramo sending confirmam Progress com valor conhecido e texto percentual adjacente. Caminho real faz envio por serviço, mas não foi executado; revisão desta fronteira é apenas do controle visual/acessível. |
| `src/components/catalog/ExternalProductCatalog.tsx` | targeted | 35–45, 706–729 | Lazy import e montagem condicionada bulkSendOpen confirmam alcance do diálogo em massa. Nenhum envio/chamada de produto realizado. |
| `src/components/dashboard/AIStatsWidget.tsx` | targeted | 50–65, 185–212 | Verificação dirigida do consumidor de ChartContainer: chartConfig em 57–61 usa cores literais confiáveis e passagem em 192 não inclui id externo; valores de série não entram na string CSS. Caminho de CSS não confiável não demonstrado. Restante deste widget pertence à revisão de módulos. |
| `src/components/dashboard/GoalsDashboard.tsx` | targeted | 1–52 | Faixa de imports/estado/cálculo/primeiro JSX confirma uso real de CelebrationOverlay com callback inline para limpar showCelebration; não executa nem comprova conclusão de meta. |
| `src/components/effects/AuroraBorealis.tsx` | semantic | 1–151 | Camadas decorativas/partículas e variantes de intensidade lidas integralmente. Pointer-events-none mantém camada fora da interação; loops visuais não comprovam regressão de desempenho sem medição. |
| `src/components/effects/Confetti.tsx` | semantic | 1–296 | Partículas, temporizador, CelebrationOverlay e useCelebration completos. Cleanup ao trocar active interrompe timer; saídas cosméticas de cancelamento não promovidas sem consumidor afetado. Overlay recebe callbacks e a composição é responsabilidade do consumidor; não pressupõe persistência de conquista. |
| `src/components/effects/EasterEggs.tsx` | semantic | 1–250 | Provider/atalhos completos: Konami e sequências ativam party/matrix/disco; listeners e timers removidos, CSS removido. Evento global não filtra campos de texto, mas efeito cosmético deliberado, sem efeito de negócio demonstrado. Texto de XP e estado celebrating não provam integração de gamificação; não promovidos. |
| `src/components/effects/ParallaxContainer.tsx` | semantic | 1–268 | Parallax, imagem/texto, reveal, progress bar e float completos; transforms e variants são apresentação. Nenhum import produtivo fora dos próprios exports localizado; não inventada falha de desempenho ou alcance. |
| `src/components/effects/ScrollEffects.tsx` | semantic | 1–309 | Todos exports lidos: magnetic, reveals, counter/spring, gradient, perspective, ripple DOM e blur. Counter/blur obtêm valores de motion via get durante render; risco latente sem consumidor produtivo localizado. Ripple cria/remove elemento cosmético com timeout. Nenhum efeito de dados ou rede. |
| `src/components/inbox/FileUploader.tsx` | targeted | 1–20, 156–187, 198–216 | Import e ramos de upload simples/múltiplo confirmam Progress com value e textos adjacentes. Não afirmar ausência total de informação a leitor de tela; perda é no contrato numérico do controle. Upload real não executado. |
| `src/components/inbox/chat/ChatInputArea.tsx` | targeted | 202–221 | Montagem dirigida de FileUploader no composer ativo; passa contato e callbacks. Revisão completa do composer fica com inbox/root. |
| `src/components/keyboard/CommandPaletteHost.tsx` | semantic | 1–30 | Host ativo liga open/onNavigate a UI palette, onSearch do catálogo e comandos TalkX. Leitura integral para comprovar alcançabilidade da busca e actions default. |
| `src/components/keyboard/GlobalKeyboardProvider.tsx` | semantic | 1–157 | Corpo integral lido como suporte: listener global/custom event, lazy Host e paletteMounted que persiste após primeira abertura; navegação via ref e cleanup listeners. Comprova consumer atual. Gates/atalhos duplicados da plataforma são propriedade do root. |
| `src/components/ui/EmptyState.tsx` | semantic | 1–197 | Variantes, defaults, ícone, descrição, ações e classes lidos. Botões só aparecem com texto e callback correspondentes; estado puramente apresentado por props, sem leitura de negócio ou rede. |
| `src/components/ui/GenericEmptyState.tsx` | semantic | 1–84 | JSX integral e guardas dos botões lidos. Comentário chama wrapper/reexport, porém implementação é própria; inconsistência documental sem defeito funcional comprovado. Sem efeito externo. |
| `src/components/ui/SkeletonList.tsx` | semantic | 1–150 | Ramos list/card/table e composição com StaggerList lidos, contagens e placeholders apenas visuais. Nenhum acesso a dados. |
| `src/components/ui/VolumeSliderPopoverContent.tsx` | semantic | 1–88 | Slider vertical controlado, array de valores, bounds/step, callback, mute label/aria/disabled e footer completos. Usa botão type=button; efeito de mídia é delegado ao consumidor. |
| `src/components/ui/VolumeTriggerButton.tsx` | semantic | 1–64 | Botão type=button, foco/long-press/cancel/click/teclas via rocker, aria e indicador completos. ariaDisabled é informativo; política interativa depende do hook useVolumeRocker (root), sem duplicação presumida. |
| `src/components/ui/accessible-toast.tsx` | semantic | 1–200 | Provider add/update/remove, timeout, ToastContainer live region e progresso completos. Loading atualizado não agenda auto-removal e duration0 difere no progress, mas nenhum useAccessibleToast fora da definição localizado. Provider montado não significa toast ativo. |
| `src/components/ui/accordion.tsx` | semantic | 1–52 | Root/Item/Trigger/Content e composição de heading completos; forwarded refs e props preservam estado/eventos do Radix. Chevron/expansão são apresentação, sem efeito de negócio. |
| `src/components/ui/alert-dialog.tsx` | semantic | 1–104 | Todos primitives e wrappers de portal, overlay, content, title, description, action e cancel lidos. Ações/fechamento e foco são delegados ao Radix e callbacks do consumidor; não há confirmação ou mutação interna. |
| `src/components/ui/alert.tsx` | semantic | 1–43 | Variants default/destructive, role alert, título/descrição e ref/props completos; apenas apresentação de conteúdo fornecido. |
| `src/components/ui/avatar.tsx` | semantic | 1–201 | Radix root/image/fallback, indicador de status, posições/tamanhos e grupo com overflow lidos; status vem de props, não é inferido de saúde/backend. Imagem mantém contrato do Radix. |
| `src/components/ui/badge.tsx` | semantic | 1–35 | Todas variantes semânticas visuais e ref/props lidos; não calcula status nem valida resultado de negócio. |
| `src/components/ui/breadcrumb.tsx` | semantic | 1–90 | Nav/ordered list/Slot links, página atual/separadores/ellipsis lidos; sem efeitos. Props/aria encaminhadas, foco dos links controlado pelo elemento renderizado. |
| `src/components/ui/button.tsx` | semantic | 1–113 | Button/MotionButton, variants, Slot, isLoading/disabled e passagem de props completos. Loading desabilita botão nativo; asChild depende de semântica do filho. Tipo default permanece nativo; não alegada submissão acidental sem form consumidor concreto. |
| `src/components/ui/calendar.tsx` | semantic | 1–54 | DayPicker com classes default/overrides, ícones e props lido; seleção, modo, disabled/datas encaminhados ao DayPicker. Wrapper não converte timezone nem produz dados. |
| `src/components/ui/card.tsx` | semantic | 1–104 | Variants/ref/props, motion hover e seções/títulos completos; elementos são wrappers de apresentação sem mutações. |
| `src/components/ui/chart.tsx` | semantic | 1–305 | Context/ResponsiveContainer, CSS por tema, tooltip/legend e helper payload completos. CSS bruto exige config confiável; único importador localizado AIStatsWidget, a ser checado para origem de config. Zero no JSX item.value&& resulta nó0, não prova de sumiço; sem finding falso de contagem. Consumidor AIStatsWidget 57–61/192 usa config CSS literal; dados remotos da série não atravessam dangerouslySetInnerHTML. |
| `src/components/ui/checkbox.tsx` | semantic | 1–26 | Root e Indicator completos; checked/disabled/name/eventos continuam em props e são encaminhados ao primitive. Aparência de check não introduz mutação própria. |
| `src/components/ui/command-palette-data.tsx` | semantic | 1–71 | Tipos, default navigation/action commands, fuzzy matching e highlight com JSX escapado. Três action-* são só metadados sem action/href; correlacionado com executor. Nenhum HTML bruto produzido. |
| `src/components/ui/command-palette.tsx` | semantic | 1–211 | Busca/debounce async, merge/fuzzy/group, teclas, executar ação/href/nav, abrir/fechar, recentes e JSX completos. Rastreadas buscas fora de ordem, actions sem callback e allItems vazio no acesso rápido sem query. Candidatos pendentes de deduplicação/probe. |
| `src/components/ui/command.tsx` | semantic | 1–135 | Wrappers cmdk e CommandDialog completos, incluindo title sr-only e aria-describedby undefined deliberado; Item preserva onSelect e disabled. Não confundir com CommandPalette própria que implementa outra busca/teclado. |
| `src/components/ui/context-menu.tsx` | semantic | 1–178 | Todos exports lidos: submenus, portal principal, checkbox/radio/labels/separadores. checked e handlers encaminhados, disabled/focus delegado; strings de shortcuts não registram atalhos globais. |
| `src/components/ui/dialog.tsx` | semantic | 1–122 | Portal/overlay/content/close/header/footer/title/description e sizes lidos; max-height e overflow-y-auto presentes na base. Foco/modalidade do Radix mantidos, botão de fechar opcional explícito; altura do consumidor não presumida defeituosa. |
| `src/components/ui/drawer.tsx` | semantic | 1–107 | Vaul Root/portal/overlay/content, headers/footers/títulos e gesto delegado completos. shouldScaleBackground false deliberado sem wrapper marcado. Alça aria-hidden decorativa, ref/props preservados. |
| `src/components/ui/dropdown-menu.tsx` | semantic | 1–179 | Todos exports e submenus lidos; portal principal, checked, ref e callbacks preservados. Nenhuma autorização/mutação de itens está no wrapper; consumidores devem prover handlers e gates. |
| `src/components/ui/emoji-picker.tsx` | semantic | 1–331 | Banco/busca/categorias/recentes/storage, seleção, quick picker e animação completos. JSON local recente só catch parse sem shape e gravação pode lançar; somente referências internas neste arquivo, sem consumidor produtivo de exports identificado. |
| `src/components/ui/empty-state-illustrations.tsx` | semantic | 1–176 | Todas ilustrações SVG e Record de presets lidos; faixa inicial foi relida após truncamento para assegurar corpo integral. Sem conteúdo HTML externo, dados ou rede. |
| `src/components/ui/empty-state.tsx` | semantic | 1–143 | Ícone, tamanho, ilustração e botões primário/secundário lidos; ações exigem label e handler. Apenas apresentação controlada pelo consumidor. |
| `src/components/ui/empty-states.tsx` | semantic | 1–191 | Contextos e presets inbox/contacts/dashboard/search/notifications/tags/calls/transcriptions lidos; ilustração e mensagens têm fallback. CTA depende de action. Preset legado não prova feature montada. |
| `src/components/ui/empty-states/ContextualEmptyState.tsx` | semantic | 1–86 | Context lookup e fallback messages, query, CTAs condicionais e ajuda lidos integralmente. Valores de config importada são conteúdo; callbacks vêm do consumidor. Não infere resultado de operação. |
| `src/components/ui/empty-states/ConvenienceExports.tsx` | semantic | 1–37 | Nove wrappers de presets/ações lidos e mapeamento de contexto conferido; nenhum efeito adicional oculto. |
| `src/components/ui/error-boundary-retry.tsx` | semantic | 1–140 | Boundary completo: captura, callback, limite2/retry exponential, timer cleanup, manual reset e fallback. Render de mensagem de erro via JSX escapado; nenhum HTML bruto. Retry não prova que causa do erro foi resolvida. |
| `src/components/ui/form.tsx` | semantic | 1–129 | Contextos Field/Item, Controller/FormProvider, ids/aria, errors e refs completos. Exige árvore de providers; guarda do contexto{} não protege uso incorreto, mas sem consumidor inválido demonstrado. Textos de erro são JSX, não HTML. |
| `src/components/ui/hover-card.tsx` | semantic | 1–27 | Root/trigger/content e props de alinhamento lidos. Content não usa Portal próprio, mas clipping só seria defeito com contêiner consumidor demonstrado; nenhum import produtivo encontrado no levantamento transversal. |
| `src/components/ui/icon-button.tsx` | semantic | 1–151 | Props/ref/Slot, aria-label exigido, tooltip opcional e versão motion completos. Nenhuma lógica remota. Trecho truncado foi reaberto integralmente antes desta promoção. |
| `src/components/ui/input.tsx` | semantic | 1–83 | Ref/type/props, variants, ícones, addons e estados de erro/sucesso lidos. Elementos laterais são apresentação; interatividade de addons não é pressuposta sem consumidor específico. |
| `src/components/ui/label.tsx` | semantic | 1–17 | Radix label com ref/class/props lido; htmlFor/associação continuam contrato do consumidor. |
| `src/components/ui/liquid-metal-button.tsx` | semantic | 1–130 | Import lazy de shader, capability/reduced-motion gate, cancel flag, dispose e estados/contagem/handlers completos. Tipo button e disabled/loading aplicados após props; fallback estático. Sem montagem de WebGL ou alegação de ganho medido. |
| `src/components/ui/menubar.tsx` | semantic | 1–207 | Root/menu/trigger/submenus/itens checkbox-radio/labels/portal e separadores lidos integralmente; forwarded props preservam contratos do Radix. displayname minúsculo é metadado de depuração, não promovido como falha de produto. |
| `src/components/ui/message-reactions.tsx` | semantic | 1–184 | ReactionBadge, picker por grid/ref/teclas, bar/popover e quick strip completos. Teclas Enter/Space chamam onSelect antes de default nativo; requer provar consumidor/unmount antes de alegar dupla mutação. Backend/toggle pertence a Inbox. |
| `src/components/ui/micro-interactions/buttons.tsx` | semantic | 1–284 | Ripple, icon, bounce, magnetic, glow e press feedback completos. Disabled impede callback nos controles pertinentes, props/types variam; não há rede ou escrita de dados. Timers/hover/semântica do div registrados como contrato de componentes genéricos, sem assumir consumidor ativo. |
| `src/components/ui/micro-interactions/feedback.tsx` | semantic | 1–83 | MicroFeedback, LoadingDots/Spinner e FeedbackAnimation completos. Tipo/show controlam apresentação; não são prova de sucesso de ação remota por si. |
| `src/components/ui/micro-interactions/skeletons.tsx` | semantic | 1–106 | SkeletonPulse e cinco ramos de ContentSkeleton completos. Apenas repetição/estilos/placeholders; count vem do chamador e não foi presumido input não confiável. |
| `src/components/ui/mobile-components.tsx` | semantic | 1–263 | MobileDrawer gesto/body overflow, BottomNavigation ativo/vibração/badge, PullToRefresh await e TouchFeedback completos. BottomNavigation é consumidor real; Drawer/PullToRefresh genéricos não aparecem montados e seus riscos latentes não viraram findings. |
| `src/components/ui/motion/components.tsx` | semantic | 1–127 | PageTransition, neon/card/buttons, stagger/fade/slide/scale, interactive e shimmer completos. PageTransition respeita useReducedMotion; outros wrappers delegam motion ao contexto/props, sem alegar falha a11y sem conferir consumidor/Config global. |
| `src/components/ui/motion/effects.tsx` | semantic | 1–94 | AnimatedCounter/progress/presence/stagger/slide/list/typewriter completos, com RAF/interval cleanup. prevRef é objeto recriado e value0 retorna sem reset no contador; falta consumidor real para promover. Não alegada corrupção de métrica apenas pelo export. |
| `src/components/ui/motion/variants.ts` | semantic | 1–83 | Todos os variants declarativos e factory talkxStagger lidos; nenhum efeito/IO ou cálculo de dado de produto. Escala/duração são apresentação. |
| `src/components/ui/offline-indicator.tsx` | semantic | 1–131 | Eventos navigator.onLine, retry HEAD favicon, toast restaurado e timers completos. Root confirmou SW/PWA desabilitado por configuração. Candidato response.ok rejeitado: HTTP404/500 ainda comprova transporte de rede e rótulo não promete saúde de API. |
| `src/components/ui/pagination.tsx` | semantic | 1–81 | Nav/list/link, aria-current, links previous/next e ellipsis lidos; href/onClick são contrato do consumidor, não há paginação de dados implícita. |
| `src/components/ui/popover.tsx` | semantic | 1–31 | Root/trigger/anchor/content e portal completos, align/offset overridable. Foco/dismissal e open vêm do primitive; nenhum efeito externo. |
| `src/components/ui/progress.tsx` | semantic | 1–23 | Corpo integral lido: value é consumido no transform visual e omitido das props de Root. Candidato de contrato acessível separado, com consumidores/probe a verificar; max segue encaminhado, enquanto cálculo visual assume escala100. |
| `src/components/ui/quick-peek.tsx` | semantic | 1–73 | Hover enter/leave/timer, preview/enabled e JSX completos. Timer não tem cleanup no unmount/alteração enabled, mas nenhum efeito de dados; consumidor terá de definir impacto antes de promover achado. |
| `src/components/ui/radio-group.tsx` | semantic | 1–36 | Root/Item/Indicator lidos integralmente, ref/props preservados. Checked/value/keyboard/input permanecem no primitive. |
| `src/components/ui/resizable.tsx` | semantic | 1–37 | PanelGroup, Panel e handle completo; direção e callbacks da lib preservados e pega visual opcional. Não persiste layout por conta própria. |
| `src/components/ui/route-loading-bar.tsx` | semantic | 1–74 | Loading determina visibilidade, percentuais visuais temporizados e término; todos timers cancelados na troca/unmount. Progresso indeterminado simulado não é declarado como bytes medidos ou resultado de negócio. |
| `src/components/ui/scroll-area.tsx` | semantic | 1–38 | Root/Viewport/Scrollbar/Corner e dois eixos lidos; props/ref de Root não representam ref do viewport. Nenhum uso incorreto de consumidor é inferido pelo wrapper isolado. |
| `src/components/ui/scroll-to-top.tsx` | semantic | 1–57 | Ref de container, listener scroll com cleanup, limiar e ação smooth completos. Não inicializa visibilidade pelo scroll atual até primeiro evento; impacto condicionado a consumidor, sem mutação de produto. |
| `src/components/ui/section-error-boundary.tsx` | semantic | 1–71 | Boundary por seção completo: log/reportClientError, captura com stack truncada, retry local e fallback. Egress e sanitização do reporter pertencem ao lote lib/root; não inferidos pela chamada. |
| `src/components/ui/separator.tsx` | semantic | 1–20 | Orientação/decorative e ref/props completos; default decorativo deliberado, classes correspondem aos dois eixos. |
| `src/components/ui/sheet.tsx` | semantic | 1–107 | Lados top/bottom/left/right, overlay/portal, content e close, header/footer/título/descrição lidos. Foco do Radix e close encaminhados. Falta de overflow interno só afetaria consumidor alto comprovado, não promovida genericamente. |
| `src/components/ui/sidebar/sidebar-context.tsx` | semantic | 1–111 | Provider controlado/não controlado, callback toggle, mobile, cookie booleano7dias, Ctrl+B com cleanup e dimensões/context completos. Cookie é preferência não credencial; não promove acesso ou risco de segurança. |
| `src/components/ui/sidebar/sidebar-menu.tsx` | semantic | 1–192 | Botões/Slot ativos, tooltip colapsado, actions/badge/submenu e skeleton completo. Preferências vêm do contexto e não são ACL. Sem consumidor produtivo importando esse sidebar no scan. |
| `src/components/ui/sidebar/sidebar-primitives.tsx` | semantic | 1–242 | Sidebar desktop/mobile/none, Sheet controlado, trigger/rail/inset/header/footer/group/input completos. Callbacks/props/roles inspecionados; sem importador produtivo do sidebar genérico localizado no scan, não confundir com Sidebar aplicativo. |
| `src/components/ui/skeleton.tsx` | semantic | 1–139 | Variants, delay, role/status/label e composição Card/List/Text/Avatar/Button lidos; placeholders dependem de props e não representam sucesso real de operação. |
| `src/components/ui/skip-link.tsx` | semantic | 1–141 | Links condicionados à existência do target, foco/scroll, detector1500ms e indicador de Tab completos. Cleanup de listener/interval; foco efetivo depende do target focusable, não presumido defeito sem consumidor. |
| `src/components/ui/slider.tsx` | semantic | 1–56 | Wrapper Radix completo com número de thumbs derivado do value/defaultValue, labels por índice, orientação vertical/horizontal e props. Corrige número de thumbs; nenhum valor fictício de mídia. |
| `src/components/ui/sonner.tsx` | semantic | 1–38 | Integração com resolvedTheme, opções/duração e classes lida; props finais permitem override. Componente apenas hospeda toast, não cria mensagem de sucesso nem altera operação. |
| `src/components/ui/sparkline.tsx` | semantic | 1–53 | Normalização min/max, largura/altura, pontos e área SVG completos; <2amostras retorna null e série constante usa range1. Entrada finita é contrato do chamador; nenhuma medição ou acesso remoto. |
| `src/components/ui/step-progress.tsx` | semantic | 1–79 | Passos derivados por índice, estado atual/concluído, rótulos e conexões completos. Só apresentação; ausência de aria-current anotada como contrato, sem nova certificação a11y ou finding genérico. |
| `src/components/ui/switch.tsx` | semantic | 1–27 | Root/thumb lidos; checked/disabled/eventos/ref encaminhados ao Radix, sem estado paralelo ou persistência. |
| `src/components/ui/table.tsx` | semantic | 1–72 | Table/head/body/footer/row/cell/caption lidos, elementos nativos e props/ref preservados; overflow wrapper permite rolagem. Ordenação/paginação/seleção são do consumidor. |
| `src/components/ui/tabs.tsx` | semantic | 1–53 | Root/list/trigger/content completos; state/value/disabled/focus seguem primitive, sem reset de dados externo ou efeito de negócio no wrapper. |
| `src/components/ui/textarea.tsx` | semantic | 1–21 | Forward ref e HTML props lidos; valor/eventos/disabled encaminhados, sem estado interno ou sanitização presuntiva. |
| `src/components/ui/toast.tsx` | semantic | 1–111 | Provider/viewport/root/action/close/title/description e variants lidos. Root recebe duration/open/handlers, foco/swipe delegados à lib. Mensagem e confirmação de operação são contrato do chamador. |
| `src/components/ui/toaster.tsx` | semantic | 1–24 | Map de toasts do hook encaminha props/id/title/description/action e close; não consome promessa de operação. Vida útil dos itens é gerida por use-toast, lido pelo root. |
| `src/components/ui/toggle-group.tsx` | semantic | 1–49 | Contexto de variants/size e Root/Item lidos; grupo precede estilo local, props/eventos/refs preservados. Estado do toggle permanece na lib. |
| `src/components/ui/toggle.tsx` | semantic | 1–37 | Variants e Root completos, value/pressed/handlers continuam em props; nenhuma mutação externa. |
| `src/components/ui/tooltip.tsx` | semantic | 1–139 | Wrappers Radix, portais em content/enhanced, offsets/variants e wrapper simplificado lidos. Portal evita clipping conhecido; foco e dismissal delegados ao primitive. Nenhum handler de negócio. |
| `src/components/ui/visually-hidden.tsx` | semantic | 1–77 | VisuallyHidden, useAnnounce e LiveRegion completos. Hook ignora politeness e usa timer sem cleanup, mas sem consumidor localizado fora da definição; não promovido como ramo ativo. LiveRegion é montado no App e mantém aria-live polite/status. |
| `src/features/talk-me/useTalkMeQueue.ts` | targeted | 1–8, 70–120 | Correção de alcance: importa useDebounce do módulo performance e o usa para pesquisa normalizada; guarda searchPending e refs de geração aparecem nesta faixa. Debounce de valor tem cleanup, distinto do debounce de callback da paleta. Restante do hook não é declarado lido aqui. |
| `src/hooks/integrations/useCatalogQuickSearch.ts` | semantic | 1–34 | Busca promogifts-catalog compact limit8; erro retorna[]; produtos mapeados para CommandItem search e href /?view=catalog&product=...&send=1. Sem guard de geração próprio; retorno async controlado pelo chamador. |
| `src/hooks/performance/useDataOptimization.ts` | semantic | 1–116 | Paginação acumulada/reset, hover prefetch e preload resources completos. Prefetch não limpa timer no unmount nem reinicia cache ao mudar fetcher; nenhum consumidor produtivo desses exports localizado, só reexports. Preload remove links no cleanup. |
| `src/hooks/performance/useMonitoring.ts` | semantic | 1–105 | Contagem de renders, memória dev-only, FPS via RAF e medição entre dois effects. Medição de slow render cobre intervalo pós-commit, não corpo de render; exports sem consumidor produtivo localizado, portanto limite latente sem finding. |
| `src/hooks/performance/useObservers.ts` | semantic | 1–72 | Intersection/lazy/load flags e event listener passivo completos. RemoveEventListener omite capture usado por options, mas não há consumidor ativo identificado: risco latente, sem ID. Observer exige API; cleanup unobserve. |
| `src/hooks/performance/useTimingHooks.ts` | semantic | 1–103 | Todos hooks lidos: debounce de valor e throttle limpam timers, RAF cancela request, stable callback usa ref atualizada e idle tem fallback/cleanup. Consumidor real confirmado: useTalkMeQueue93 usa o debounce de valor corretamente; outros exports têm somente reexports/chamada interna de useFPS localizados. Não confundir com useDebounce de callback em hooks/system. |
| `src/hooks/system/useDebounce.ts` | semantic | 1–21 | Callback debounce integral: cancela timer pendente, não cancela promessa já iniciada, não existe fence de geração/consulta. Usado pela CommandPalette; temporizador não tem cleanup no unmount. Sem executar timer real. |

## Lacunas remanescentes

- Sem browser/assistive technology, medições de FPS/memória ou regressão visual; leitura integral não é teste de renderização.
- Dependências Radix/cmdk/vaul são fronteiras não executadas. Eventos/foco/scroll internos não foram reimplementados em mocks como se fossem comprovação do pacote.
- Probes cobrem quatro riscos concretos; não são suíte completa, typecheck, build nem aceite final de acessibilidade.
- A auditoria global continua IN_PROGRESS; conclusão se refere somente aos87 arquivos primários deste lote.
