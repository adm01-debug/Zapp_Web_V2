# Revisão de layout, transições e onboarding

Fonte fixa `da307ba5626dce892f0b37cb6762463f55d14a96`. Os 25 arquivos primários foram lidos integralmente, somando 2.136 linhas. Com apoios, o inventário tem 47 caminhos: 37 leituras integrais e 10 dirigidas. Nenhum arquivo de produto foi alterado.

## Resultado delimitado

| ID | Prioridade | Contrato |
|---|---|---|
| R2-INF-036 | P3 | Checklist marca tema como concluído quando a consulta não devolve configuração |
| R2-INF-037 | P2 | Controle de movimento reduzido e transições de rota usam preferências desconectadas |
| R2-INF-038 | P2 | Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los |
| R2-INF-039 | P2 | Modais próprios anunciam modalidade sem implementar o contrato de foco |

Há três casos offline para os três primeiros registros e análise estática para o quarto. Os dois modais são loci de um único mecanismo, sem aumentar a contagem. O harness valida SHA256 de 11 fontes e do compilador antes de importá-lo; as fronteiras de SDK, timers e hooks são sintéticas.

## Probes e controles

| Caso | Execução delimitada | Controle |
|---|---|---|
| INF-LO-P01 | Módulo checklistSteps completo e callback checkAllSteps real | data ausente/erro concluem tema; system não conclui e dark conclui |
| INF-LO-P02 | Efeito global, leitor/hook de preferência e decisão de variante de rota | Chave privada de rota ou preferência do sistema produz none |
| INF-LO-P03 | Etapas padrão e callbacks de retry, avanço e conclusão | Apenas getters de navegação lidos são usados para verificar IDs; nenhuma query de produto |

Os três casos passaram na execução delimitada registrada. Não se repetiram suítes anteriores nem se simulou o motor de movimento ou um navegador.

## R2-INF-036 — Checklist marca tema como concluído quando a consulta não devolve configuração

A condição de tema compara data?.theme com null e system. Quando data é null, o valor é undefined e ambas as comparações são verdadeiras. O error resolvido pelo SDK também é ignorado. O callback real do card incorpora esse true ao conjunto de etapas concluídas.

**Precondições:** Usuário autenticado e card ainda visível no dashboard. A consulta de user_settings resolve sem registro ou com error e data null.

**Efeito e alcance:** A interface afirma que o usuário escolheu tema claro ou escuro sem evidência dessa configuração e remove a ação pendente dessa etapa. A prova mantém as outras cinco etapas falsas; não afirma que o onboarding inteiro é concluído nessa situação.

**Evidência:**

- `src/components/onboarding/checklistSteps.ts:103–119` — Promessa da etapa e condição undefined diferente de null/system. SHA256 `554a022f5172c80cfc1ddb9c6c4dafddf89d7d799c1f9b36ddf5ef0dfd219813`.
- `src/components/onboarding/OnboardingChecklist.tsx:33–47` — Callback inclui a etapa verdadeira e não vê error resolvido. SHA256 `69a62b48b1d515ebf301e6538a1418dfb9075649a0933d56aeb7292e002bdb5b`.
- `src/components/onboarding/OnboardingChecklist.tsx:94–123` — Contagem, estado visual e ação condicionados a completedSteps. SHA256 `69a62b48b1d515ebf301e6538a1418dfb9075649a0933d56aeb7292e002bdb5b`.
- `src/pages/Index.tsx:87–87` — Card limitado ao dashboard. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.
- `src/components/layout/AppShell.tsx:141–145` — Consumidor atual monta card. SHA256 `30552c0b530b0b14122f4dc09e06c62bcf61e5a1e3ac28d536153e84f350185e`.
- `src/hooks/ui/useOnboardingChecklist.ts:58–68` — Hook vizinho exige settings existente; não compensa condição do card. SHA256 `4c12ac595f89c390c24038f72552acea564c9f0e6f37db4f62a14b994741453d`.

**Critérios de aceite:**

- Validar presença e valor permitido de theme antes de concluir a etapa; ausência ou erro não deve virar conclusão.
- Manter a regra do card coerente com o hook de estado de onboarding, preservando distinção entre pendente e falha de leitura.
- Cobrir data null, error resolvido, theme system, theme dark/light e valor malformado no callback consumidor; a contagem deve refletir apenas estados comprovados.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. P3 delimitado ao estado de orientação; não há concessão de permissão, perda de dados ou gravação no probe. O card desmonta fora do dashboard e remonta ao voltar; a hipótese anterior de falta de atualização ao retornar foi rejeitada.

## R2-INF-037 — Controle de movimento reduzido e transições de rota usam preferências desconectadas

O controle global de acessibilidade grava reducedMotion=true/false e aplica a classe reduced-motion. O hook das transições lê zapp:reduce-motion=1/0 e o media query do sistema; ele não lê o contexto global, sua chave ou sua classe. Com a opção global ligada e o sistema sem redução, RouteTransition continua escolhendo slide/zoom/fade em vez de none.

**Precondições:** Usuário liga Reduzir Movimento pela interface global. Sistema operacional não pede redução e zapp:reduce-motion não está em 1. Usuário navega entre rotas abrangidas pelo PageTransitionProvider.

**Efeito e alcance:** A preferência anunciada como desativação das animações não chega à decisão de variante das rotas. O controle CSS global reduz duração de animações e transições CSS e continua válido; o probe comprova a divergência da configuração JavaScript, sem medir a duração visual do Framer Motion.

**Evidência:**

- `src/components/theme/HighContrastToggle.tsx:49–51` — Estado inicial usa reducedMotion. SHA256 `7b52b8272d32b9d5538c285bd98cafb4c5c7f37970562eb6539a43f209a2f9a9`.
- `src/components/theme/HighContrastToggle.tsx:107–114` — Efeito escreve chave/classe globais. SHA256 `7b52b8272d32b9d5538c285bd98cafb4c5c7f37970562eb6539a43f209a2f9a9`.
- `src/components/theme/HighContrastToggle.tsx:240–254` — Controle e promessa apresentados ao usuário. SHA256 `7b52b8272d32b9d5538c285bd98cafb4c5c7f37970562eb6539a43f209a2f9a9`.
- `src/components/layout/Sidebar.tsx:251–252` — Controle acessível na Sidebar. SHA256 `445291acd74493e9ec82e7622176ad269f9b1d3f100ff8ee6eeb79b596a38e9e`.
- `src/components/transitions/transitionConfig.ts:29–44` — Chave e codificação diferentes nas rotas. SHA256 `856077f41ff388e078b4b67bfe1491045b808d2a0d1a212998e47c32e337cafc`.
- `src/components/transitions/useTransitionPreferences.ts:11–30` — Preferências de sistema e chave privada, sem contexto global. SHA256 `52c1d2762bdb214e6070424b05bf735386bdca313d32e36d593d673702660f10`.
- `src/components/transitions/RouteTransition.tsx:12–30` — Flag decide none versus transição animada. SHA256 `9a8a5b1dce73e8c1290f9ff71af7b73e00e9ae4cc7d4f1405d2d28145b0ba1d9`.
- `src/routes/AppRoutes.tsx:44–84` — Provider e rotas reais que usam slide/zoom. SHA256 `30c6f9981e0f9b86c37154eba2f87e24e2e2f7720259e95da1899c49fbf11da3`.
- `src/styles/accessibility.css:57–70` — Controle CSS existe e não é negado pelo achado. SHA256 `ab0c400cb831f529da67e359a0b7c7dd61b45cd78eab905206d09c09fd863c67`.

**Critérios de aceite:**

- Usar uma fonte de preferência de usuário para a interface global e as transições, combinada com a preferência do sistema.
- Garantir atualização da variante após ligar ou desligar a opção sem exigir outra chave escondida ou recarga.
- Cobrir UI ligada/desligada e sistema ligado/desligado; verificar none no ramo esperado e depois validar em browser a animação efetiva.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. O probe executa efeito, leitura e decisão de configuração de fonte com fronteiras inertes; não importa Framer Motion nem reimplementa seu motor. Não se afirma que toda animação CSS continua ativa ou que houve sintomas observados em usuário. O efeito demonstrado é a escolha incorreta de variante.

## R2-INF-038 — Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los

As duas últimas etapas padrão procuram data-tour=notifications e data-tour=theme. A produção de data-tour vem de SidebarNavItem com IDs de navegação; nenhum dos getters ativos fornece esses dois IDs. Os controles reais de notificações e tema da Sidebar não têm esses atributos. Após dez tentativas, TourOverlay chama nextStep; na última etapa isso chama endTour/onComplete.

**Precondições:** Usuário inicia o tour padrão e chega às duas últimas etapas. Layout usa os componentes da fonte atual; não há plugin externo inserindo os atributos ausentes.

**Efeito e alcance:** As explicações de notificações e personalização não recebem alvo visível no fluxo atual e o callback de conclusão pode ser chamado mesmo sem essas etapas terem sido mostradas. O salto de uma etapa indisponível por permissão pode ser deliberado; aqui os dois seletores não são produzidos sequer para o layout desktop completo lido.

**Evidência:**

- `src/components/onboarding/defaultTourSteps.ts:32–45` — Dois seletores ausentes do layout. SHA256 `b7570face27ff498e26ea801e2bd09aaa3dfc752f03a94231258b51e825324c0`.
- `src/components/layout/SidebarNavItem.tsx:33–44` — Único produtor dinâmico de data-tour em UI de produto. SHA256 `be8efae696b82ddc7896f6601b536909e0d7a1f4570cf259afa576b12cd68776`.
- `src/services/navigation.service.ts:1–155` — Getters de navegação não fornecem os dois IDs. SHA256 `8e128c5cc1aa208f96570c68295d6e4836ca1febed4d7d1e603f648d4c294d48`.
- `src/components/layout/Sidebar.tsx:92–124` — Controles de notificações não têm o atributo esperado. SHA256 `445291acd74493e9ec82e7622176ad269f9b1d3f100ff8ee6eeb79b596a38e9e`.
- `src/components/layout/Sidebar.tsx:236–252` — Controles de tema/acessibilidade não têm data-tour=theme. SHA256 `445291acd74493e9ec82e7622176ad269f9b1d3f100ff8ee6eeb79b596a38e9e`.
- `src/components/onboarding/TourOverlay.tsx:16–39` — Retries e salto automático por ausência/medida zero. SHA256 `e96f75433ceab7f93324a25573d89e614682935f8594e516d64a82f6096ef6f5`.
- `src/components/onboarding/OnboardingTour.tsx:50–63` — Último nextStep chama endTour e onComplete. SHA256 `066e3caa337f58ae0f87adad74073c1e64c68466aa47f8e5f1a25f75b2c1649b`.
- `src/pages/Index.tsx:135–142` — Início real do tour padrão. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.
- `src/pages/Index.tsx:183–192` — Callback de conclusão conectado ao estado de onboarding. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.

**Critérios de aceite:**

- Conectar seletores aos controles reais ou corrigir as etapas para os alvos realmente renderizados, respeitando layout e permissões.
- Validar os seletores no layout composto, não apenas sua sintaxe em um document vazio.
- Distinguir salto deliberado de ausência inesperada e evitar registrar conclusão de etapa obrigatória que não foi apresentada.
- Cobrir caminho desktop, mobile e usuário sem uma seção permitida, com política de passos disponíveis explícita.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. Três getters de navegação e callbacks reais foram analisados/executados em fronteiras sintéticas; nenhum DOM de aplicação foi montado. O probe usa a ausência estática dos IDs e querySelector sintético null; não mede posicionamento, scroll ou visibilidade em browser. O teste existente que só verifica seletor válido/consulta sem throw não prova que o alvo exista. Não foi reexecutado.

## R2-INF-039 — Modais próprios anunciam modalidade sem implementar o contrato de foco

WelcomeModal e MobileDrawerMenu renderizam motion.div com role=dialog e aria-modal=true, mas não gerenciam foco inicial, contenção de Tab, inércia do conteúdo externo ou retorno do foco. Seus consumidores mantêm a aplicação e seus controles montados. WelcomeModal já implementa Escape corretamente; o drawer não possui handler de Escape no componente ou em MobileShell.

**Precondições:** Um dos dois overlays está aberto e há controles focáveis da aplicação ao fundo. Usuário depende de teclado ou do contrato de modalidade comunicado à tecnologia assistiva.

**Efeito e alcance:** A semântica declara que a interação está restrita ao diálogo, enquanto a implementação não estabelece essa restrição nem transfere/restaura o foco. Isso cria um caminho de interação incompatível com o contrato modal. O achado é de fonte e contrato primário; nenhuma sequência DOM/AT foi executada ou apresentada como observação de produção.

**Evidência:**

- `src/components/onboarding/WelcomeModal.tsx:13–47` — Comentário reconhece ausência de trap; único efeito trata Escape; modal sem primitive de foco. SHA256 `b4b1d9fa2fb5a4ff1a7e736595eb9414f614b567df89632120ba95a1f8a5ef9c`.
- `src/components/onboarding/WelcomeModal.tsx:56–62` — Botão de fechar rotulado preservado. SHA256 `b4b1d9fa2fb5a4ff1a7e736595eb9414f614b567df89632120ba95a1f8a5ef9c`.
- `src/pages/Index.tsx:110–143` — AppShell permanece montado como irmão do modal. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.
- `src/components/mobile/MobileDrawerMenu.tsx:133–164` — Drawer próprio com aria-modal, backdrop e drag, sem foco. SHA256 `9df67cc307562d9464297b710086bb26602719a2abb44cd2a54348d1c88d556c`.
- `src/components/mobile/MobileDrawerMenu.tsx:184–220` — Controles internos e busca sem autofoco/gerenciamento modal. SHA256 `9df67cc307562d9464297b710086bb26602719a2abb44cd2a54348d1c88d556c`.
- `src/components/mobile/MobileShell.tsx:33–105` — Consumidor mantém Header/bottom navigation e não adiciona foco/Escape. SHA256 `bd36c452c890fae93dedb2e1da1a0f79568eca6fd3cff7036f146c342ae923d4`.
- `src/providers/AppProviders.tsx:61–90` — Providers globais não oferecem um escopo de foco para estes overlays. SHA256 `7105ef85cebbef40787859cfa9e50ec541efbe86cdd0ca0c2e6e8d230a218d1f`.

**Critérios de aceite:**

- Usar o Dialog/Sheet acessível já existente ou implementar integralmente foco inicial apropriado, contenção de Tab/Shift+Tab, conteúdo externo inerte e retorno ao acionador ou destino lógico.
- Preservar Escape no WelcomeModal e fornecer fechamento por Escape no drawer sem quebrar botão, backdrop ou drag.
- Testar cada modal com um controle focável externo: abertura, ciclo de Tab/Shift+Tab, Escape, fechamento e retorno. Complementar com tecnologia assistiva em browser.
- Não considerar role/aria-modal ou uma regra isolada de axe como prova suficiente do ciclo de foco.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. Dois loci foram agrupados em um único mecanismo; MobileDrawerMenu foi revisto também pelo root. WelcomeModal já tem nome acessível, um único role de diálogo e Escape. Essas correções anteriores são preservadas. Não há probe adicional para este registro. Foco nativo, ordem DOM e comportamento de tecnologia assistiva continuam pendentes de execução controlada.

**Contrato primário:** [WAI-ARIA APG — Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), consultado em 04/10/2026. O documento fornece o contrato de foco; não representa uma observação da aplicação.

## Adjudicação e controles

- Nenhuma tarefa DONE_VERIFIED foi reaberta por associação temática; os quatro achados especificam novos subcontratos de produto.
- P055/090 já está PARTIAL e trata onboarding/ambiente local do projeto, não certifica este tour visual. O status é preservado.
- P015/E97 está SUPERSEDED e trata onboarding do catálogo. Não é reativado pelo defeito no tour global.
- Tarefas de movimento reduzido de Contatos, Tarefas e Telefonia mantêm seus estados próprios. O defeito 037 é a preferência global versus roteador, não rejeição genérica dos controles por módulo.
- Root PLAT010/011 cobrem busca e notificações mobile; a navegação filtrada por permissões permanece um controle válido. Esses mecanismos não foram recontados.
- Atualização do checklist ao voltar ao dashboard: rejeitada, pois o card é desmontado fora da view e remonta no retorno.
- PageTemplate/scroll: sem prova do DOM e dos estilos computados, não foi promovida a hipótese de dois donos de scroll.
- Posicionamento do tour durante scroll e passos ocultos por permissão são limites adicionais; não recebem IDs sem cenário composto comprovado.
- Heurísticas de perfil/conexão/notificações foram lidas. Um indicador de orientação simplificado não foi automaticamente tratado como requisito novo de negócio.
- WelcomeModal Escape, nome acessível e diálogo único são correções presentes. O registro 039 cobre somente o contrato restante de foco e o drawer correspondente.
- A redução CSS existente e o media query do sistema são controles reais; o achado 037 não os descreve como ausentes.

## Cobertura por arquivo

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `src/components/layout/A11yBoilerplate.tsx` | semantic | 1–29 | Skip-link e live regions polite/assertive completos; não é focus trap de modal e não altera tab-order global. |
| `src/components/layout/AppShell.tsx` | targeted | 110–163 | Suporte dirigido: Sidebar fora de Zen/mobile, main focusable, card só dashboard e ViewRouter. Root é dono da leitura integral. |
| `src/components/layout/MediaVolumeToggle.tsx` | semantic | 1–11 | Wrapper inteiro encaminha variant sidebar ao controle de mídia, preservando diferença em relação aos alertas; operações do MediaVolumeControl pertencem à revisão Inbox. |
| `src/components/layout/PageHeader.tsx` | semantic | 1–169 | Todos ramos de título/ações/breadcrumb/back completos. hidePageBreadcrumbs contextual é decisão preservada; Início explícito evita duplicar rótulo. Callbacks interceptam href quando fornecidos; retorno sem callback usa navigate(-1). Não reintroduzir breadcrumb desktop por diagnóstico antigo. |
| `src/components/layout/PageTemplate.tsx` | semantic | 1–133 | Props e ramos header/actions/filters/content, padding/fullBleed/constrained e variants completos. Consumidor real SettingsView; CSS/layout visual não foi medido. Fonte não tem scroller próprio apesar de comentário do ViewContainer; rastreamento dirigido deve avaliar alcance, não prometer captura visual. |
| `src/components/layout/ProfileMenuContent.tsx` | semantic | 1–54 | Conteúdo completo: status chama callback opcional+fecha, settings navega e logout opcional. Nenhum SDK ou persistência própria; papel/heartbeat não derivado no menu. |
| `src/components/layout/RoleBadge.tsx` | semantic | 1–24 | Mapas de labels/variants completos e papel vindo do consumidor. Badge não concede autorização e não compara precedência de papéis. |
| `src/components/layout/Sidebar.tsx` | semantic | 1–258 | Corpo completo: filtra navegação por NavigationService/roles/permissões, filtra favoritos por canAccess e retira duplicados da primária; scroll único, modos recolhido/expandido e controles do rodapé. Busca dispara open-global-search da paleta antiga, fronteira de GOV001 do root, sem novo ID. Notificações/tema não recebem data-tour neste JSX. |
| `src/components/layout/SidebarBackButton.tsx` | semantic | 1–46 | Guarda canGoBack+callback e placeholder do modo recolhido completos; preserva altura e foco/label no botão presente. onGoBack é do dono do histórico, não histórico implementado aqui. |
| `src/components/layout/SidebarNavGroup.tsx` | semantic | 1–137 | Leitura/escrita local de grupos, default/persistência/active override, trigger, AnimatePresence e mapa de itens completos. Armazenamento indisponível é capturado; hasActiveItem mantém grupo aberto deliberadamente. Payload JSON fora do contrato é limite de robustez local, não incidente alegado. |
| `src/components/layout/SidebarNavItem.tsx` | semantic | 1–139 | Ref/ícone/active/badge, prefetch e dois modos completos. data-tour vem do id da navegação. Favorito chama stopPropagation; botão aninhado no botão principal em modo expandido documentado como estrutura a validar por browser/AT, sem inferir duplo clique ou quebrar navegação automaticamente. Badge texto genérico não certifica não lidas de toda entidade. |
| `src/components/layout/SidebarUserPill.tsx` | semantic | 1–80 | Avatar/nome/role, estado de presença e popover completos; passa setMyPresenceStatus ao menu e fecha após ações. Presença é valor do hook, não heartbeat comprovado. API031 do providers continua dono do contrato de presença. |
| `src/components/layout/ViewContainer.tsx` | semantic | 1–55 | Reset de scroll por viewId, ramos fullScreen/ownScroll e wrapper scroll compartilhado lidos. ownScroll=settings conforme ViewRouter; contexto ref apenas no ramo padrão. Não amplia LT-LAYOUT001 antigo nem julga viewport sem medição. |
| `src/components/layout/ViewLoadingFallback.tsx` | semantic | 1–44 | Skeletons, role status/aria-busy e padding opcional completos. Loading é estado de apresentação, não sucesso de query. |
| `src/components/layout/VoiceCopilotFAB.tsx` | semantic | 1–25 | Botão flutuante+tooltip completos; onClick vem do consumidor, nenhum acesso ao microfone/rede acontece neste wrapper. |
| `src/components/layout/sidebarNavConfig.ts` | semantic | 1–14 | Exports e aliases inteiros, derivados de NavigationService. Ordem dos seis grupos é pressuposto atual; não modifica dados. |
| `src/components/mobile/MobileDrawerMenu.tsx` | semantic | 1–320 | Leitura integral por extensão do contrato modal: navegação e recentes filtram canAccessView; busca local funciona. Wrapper motion declara dialog/aria-modal, fecha por backdrop, botão e drag; não implementa foco inicial, contenção, retorno, inert ou Escape. Storage de recentes e interação foram lidos, sem browser ou mutação. Root mantém PLAT010/011 nos estados de busca/notificações; não recontados. |
| `src/components/mobile/MobileShell.tsx` | semantic | 1–109 | Leitura integral como consumidor do drawer: controla isOpen por Header/BottomNavigation e onClose; não oferece gerenciamento de foco ou Escape ao drawer. Busca e notificações locais são achados PLAT010/011 do root e ficam fora desta contagem. |
| `src/components/onboarding/OnboardingChecklist.tsx` | semantic | 1–137 | Timers, checkAllSteps sequencial, dismiss por usuário, progress e dois layouts completos. Efeito[user] remonta ao voltar ao dashboard; hipótese stale por navegar a Settings foi rejeitada após consumer. Exibe tema marcado quando checkCondition recebe data ausente; fechamento/progresso não escreve configuração. |
| `src/components/onboarding/OnboardingTour.tsx` | semantic | 1–86 | Contexto, guarda de uso, start/end/next/prev/goTo e onComplete completos. End é usado tanto no término quanto no fechamento/skip; não promete tour inteiramente assistido. Overlay sempre montado no Provider. |
| `src/components/onboarding/TourOverlay.tsx` | semantic | 1–217 | Posicionamento, retry10, skip de alvo ausente/zerado, listeners+cleanup, SVG/callout/controles completos. Falta reset de targetRect durante alvo faltante; mede antes de scrollIntoView e só escuta resize (limite geométrico a validar). Ausência de alvos padrão rastreada; não inferido duplo Enter nativo sem DOM. |
| `src/components/onboarding/WelcomeModal.tsx` | semantic | 1–177 | Todo modal lido: guarda open, listener Escape e cleanup, conteúdo/ações e aria-modal. Não põe foco inicial, trap de Tab, restauração ou inert no fundo; fluxo Index mantém AppShell irmão montado. Tests só labels/landmark/Escape não provam ciclo de foco. |
| `src/components/onboarding/__tests__/OnboardingTour.test.tsx` | semantic | 1–310 | Teste inteiro310 lido, não executado: estado/transições do Provider, formato de seletores, callback de ações e Escape/aria do Welcome. querySelector não lançar não prova alvo existente; não há tour real contra Sidebar nem scroll/focus fixture. |
| `src/components/onboarding/__tests__/WelcomeModal.a11y.test.tsx` | semantic | 1–53 | Teste inteiro lido, não executado: verifica um dialog, aria-modal+label, axe region e fechado. Não exercita foco inicial/Tab/inert/restauração; manter a prova positiva de landmark. |
| `src/components/onboarding/checklistSteps.ts` | semantic | 1–121 | Seis checks integralmente lidos e comparados aos rótulos. Queries SDK ignoram error; tema compara undefined contra null/system e devolve true, ao contrário do hook agregado que guarda settings. Perfil usa nome (foto descrita mas não exigida pelo check), conexão depende visibilidade/RLS; não inventada obrigação global nova. |
| `src/components/onboarding/defaultTourSteps.ts` | semantic | 1–46 | Seis passos/seletores completos. notifications/theme não correspondem a produtores data-tour atuais; parte do contrato atual do tour, não apenas formato CSS. |
| `src/components/settings/AppearanceSettings.tsx` | targeted | 1–86 | Controle real de tema oferece dark/light/system e chama updateSettings; campos adjacentes de perfil e densidade. Não certifica toda persistência por trecho. |
| `src/components/settings/SettingsView.tsx` | targeted | 40–75, 211–236 | Suporte dirigido ao PageTemplate: header/ações e conteúdo da aba de aparência. Possível owner de scroll não promovido: comportamento CSS overflow-y depende do DOM e não foi medido. |
| `src/components/theme/HighContrastToggle.tsx` | semantic | 1–298 | Corpo completo298: preferências de contraste e sistema, reaplicação de preset, multiplicador, reducedMotion/classe+Storage, largeText e diálogo de configurações. UI reduz movimento escreve reducedMotion=true, rota lê outra chave. Storage getters/setters não guardados no provider; não testado browser privado. Esta leitura encerra saldo298 que root pediu depois. |
| `src/components/transitions/PageTransitionProvider.tsx` | semantic | 1–14 | Wrapper integral delega RouteTransition e declara respeito à preferência do usuário; consumidor AppRoutes confirmado por faixa. |
| `src/components/transitions/RouteTransition.tsx` | semantic | 1–37 | Config memo, variant reduzida, AnimatePresence por pathname e filho completos. Chave pathname é da rota, não troca de view interna no Index. Contrato de preferência própria rastreado; não reimplementar o motor Framer em prova. |
| `src/components/transitions/index.ts` | semantic | 1–17 | Reexports integrais; não instala handlers nem publica setter de preferência por conta própria. |
| `src/components/transitions/transitionConfig.ts` | semantic | 1–45 | Lookup por prefixo mais longo e store zapp:reduce-motion completos; guards de Storage preservados. Chave/formato distintos do controle de acessibilidade ativo, rastreados no consumidor. |
| `src/components/transitions/transitionVariants.ts` | semantic | 1–93 | Todos ramos none/fade/slide/zoom/flip/parallax completos; duração limitada0.05–0.4 e defaults. none ainda faz fade80ms, reduz movimento geométrico; não equivale a provar que toda animação foi desativada. |
| `src/components/transitions/useTransitionPreferences.ts` | semantic | 1–33 | Estado local, leitura inicial, media query/change cleanup e setter persistente completos. reducedMotion = sistema OU chave própria; não consome contexto HighContrast nem classe reduced-motion. Divergência de preferência confirmada, sem render medido. |
| `src/contexts/LayoutContext.tsx` | semantic | 1–17 | Contexto/provider/hook completos, default hidePageBreadcrumbs false e estado Zen opcional. Ocultar trilha no desktop é decisão preservada do AppShell. |
| `src/contexts/LayoutScrollContext.tsx` | semantic | 1–9 | Contexto/ref/hook completos; default current null, provider do ViewContainer no ramo scroll. Ausência do contexto nos ramos sem scroller é deliberada. |
| `src/hooks/system/useUserSettings.ts` | targeted | 151–202 | Persistência dirigida inclui theme no upsert e valida error. Confirma que SDK data ausente não é prova de tema selecionado; fonte não executada. |
| `src/hooks/ui/useOnboardingChecklist.ts` | semantic | 1–137 | Hook completo comparado ao card: guarda if(settings) antes de theme, enabled muda ao dashboard, estado/dismiss/reset e queries. Não duplica achado de scope global sem RLS; ausência de dados e freshness devem ser explicitadas. |
| `src/hooks/ui/useTheme.ts` | targeted | 1–185 | Suporte dirigido à preferência visual de tema: sincroniza estado/store/localStorage theme e classes. Isso não transforma data ausente do SDK em confirmação de tema persistido; restante do hook não foi integralmente lido neste lote. |
| `src/index.css` | targeted | 35–56 | Regra nativa de View Transitions tem media query do sistema. Não vincula o toggle interno nem corrige preferência do hook por si só. |
| `src/pages/Index.tsx` | semantic | 1–196 | Corpo integral lido como suporte: auth guard, navegação, checklist habilitado só dashboard, AppShell persistente mas card condicional, Welcome e TourProvider. Antiga CommandPalette/Gmail/audit são fronteiras do root; não duplicadas. |
| `src/pages/ViewRouter.tsx` | targeted | 1–47, 88–124, 150–183 | Suporte dirigido: metadata de layouts/ownScroll=settings e ViewContainer; view interna tem AnimatePresence/OS reduced motion, não usa a preferência do HighContrast. |
| `src/providers/AppProviders.tsx` | semantic | 1–90 | Corpo completo: ErrorBoundary/retry3 e fallbacks, Query/Auth/HighContrast/toast/tooltip/ThemeSync e providers. Não existe gestão global de foco para Welcome. Limpar Cache chama localStorage.clear, observado sem execução; classificar recuperação depende do consumidor de ErrorBoundary. |
| `src/routes/AppRoutes.tsx` | targeted | 40–119 | Montagem do PageTransitionProvider ao redor de rotas, incluindo /queues/rotas de auth nos mapas; acesso depende de ProtectedRoute onde aplicável. |
| `src/services/navigation.service.ts` | targeted | 1–160 | Getters completos de navegação primária/grupos/avançado conferidos; seus IDs não incluem notifications ou theme singular. Restante da autorização canAccess não lido nesta ampliação e pertence ao root. |
| `src/styles/accessibility.css` | targeted | 50–76 | Regra reduced-motion reduz CSS animation/transition durations e scroll behavior; não é consumo da flag no hook de transição. Não se relata duração observada de Framer. |

## Lacunas remanescentes

- Não houve browser, axe, tecnologia assistiva, medição visual ou chamada de produto. Leitura integral não é aceite de interação.
- Três casos offline sustentam 036–038. O registro 039 é uma análise estática do contrato modal, sem quarto teste executado.
- A cobertura primária fecha somente estes 25 arquivos e suas 2.136 linhas; a reauditoria global continua em andamento.
