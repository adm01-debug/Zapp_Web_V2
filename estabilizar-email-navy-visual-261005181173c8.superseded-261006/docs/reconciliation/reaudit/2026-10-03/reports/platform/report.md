# Reauditoria de navegação, notificações e utilitários de plataforma

Fonte fixada: `da307ba5626dce892f0b37cb6762463f55d14a96`.

12 contratos confirmados por leitura de código. Onze casos PLAT executam callbacks/módulos exatos com fronteiras sintéticas; PLAT002 usa duas variantes, e PLAT005/009 têm inspeção estática. COM-P10 compartilha o arquivo de resultados e pertence ao relatório de Email. Não houve navegação autenticada, operação no banco, instalação ou edição do produto.

## R2-PLAT-001 · P2 · Avançar no histórico para uma tela repetida seleciona a ocorrência anterior

**Condição:** Histórico interno contém a mesma view antes e depois da posição atual, e o navegador avança para a ocorrência posterior. Exemplo A,B,C,B,D com posição em C.

**Cadeia:** Popstate do navegador → useNavigationHistory.onPopState → índice/breadcrumb → Index e navegação da aplicação.

**Comportamento:** O callback recebe somente viewId, procura correspondência para trás primeiro e retorna antes de procurar à frente. No exemplo, avançar de C para B escolhe índice 1, embora o destino seja índice 3. A view B é correta, mas sua posição no histórico não é.

**Efeito:** A trilha e os próximos comandos de voltar/avançar podem operar sobre a ocorrência errada. Não se afirma que toda navegação de uma etapa falhe.

**Aceite proposto:** Vincular cada entrada a uma identidade de history.state e reconciliar travessia por essa identidade. Provar ida e volta por views repetidas, reload e navegação programática sem duplicar entradas.

**Limites:** Callback exato com estado e destino de navegador sintéticos; não foi montada uma interface nem usado o botão do browser.

**Evidências:** [src/hooks/system/useNavigationHistory.ts:115–139](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNavigationHistory.ts#L115-L139); [src/hooks/system/useNavigationHistory.ts:211–264](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNavigationHistory.ts#L211-L264); [src/pages/Index.tsx:30–42](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/Index.tsx#L30-L42); [src/pages/Index.tsx:107–120](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/Index.tsx#L107-L120).

**Probes:** PLAT-P01.

## R2-PLAT-002 · P2 · Contagem de notificações não lidas diverge da lista após leitura e eventos

**Condição:** Há outra notificação não lida e o operador abre uma já lida; ou o evento UPDATE da leitura chega antes da conclusão HTTP da mutation.

**Cadeia:** NotificationItem.onClick → markAsRead e subscription Realtime → unreadCount → badge do NotificationsPopover.

**Comportamento:** markAsRead decrementa o contador em toda conclusão bem-sucedida, sem conferir a transição anterior. NotificationItem chama essa ação mesmo se a linha já está lida. O UPDATE de Realtime já recalcula o total antes da segunda subtração. INSERT incrementa sem deduplicação/checagem de is_read e DELETE remoto remove a linha sem ajustar a contagem.

**Efeito:** O badge pode marcar zero com uma notificação não lida visível na lista. São variantes do mesmo contrato de reconciliação, não quatro defeitos contados separadamente.

**Aceite proposto:** Derivar o contador do conjunto reconciliado ou aplicar deltas idempotentes por transição de estado. Provar leitura repetida, evento antes/depois do retorno HTTP, INSERT duplicado/lido e DELETE remoto.

**Limites:** Callbacks exatos de mutation e evento com estado sintético; nenhum dado ou subscription real foi alterado. Limite de 100 linhas da query é registrado separadamente como limite de cobertura do total.

**Evidências:** [src/hooks/system/useNotifications.ts:80–104](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotifications.ts#L80-L104); [src/hooks/system/useNotifications.ts:114–130](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotifications.ts#L114-L130); [src/components/notifications/NotificationItem.tsx:93–108](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationItem.tsx#L93-L108); [src/components/notifications/NotificationsPopover.tsx:22–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationsPopover.tsx#L22-L39); [src/components/notifications/NotificationsPopover.tsx:90–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationsPopover.tsx#L90-L95).

**Probes:** PLAT-P02, PLAT-P03.

## R2-PLAT-003 · P2 · Três controles de notificação só alteram cache e voltam ao padrão após recarga

**Condição:** Usuário desativa Novas Mensagens, Menções ou Violação de SLA na seção Tipos de Notificação.

**Cadeia:** NotificationTypeSection → updateSettings → React Query cache → user_settings → mapDbToSettings.

**Comportamento:** Os três booleans newMessageSound, mentionSound e slaBreachSound são aplicados ao cache otimista, mas não são convertidos para nenhum campo de dbUpdates. Uma atualização contendo apenas esses controles não chama o banco. A leitura também não os mapeia e repõe DEFAULT_SETTINGS, todos true. Revisão independente de auth identificou que useRealtimeNotifications também ignora newMessageSound em seus guardas e dependências: o som de mensagem depende da chave global e do horário de silêncio.

**Efeito:** A configuração exibida como desativada não persiste; ao recarregar, volta a habilitada. A chave de Novas Mensagens tampouco bloqueia o som nesse consumidor enquanto a configuração global permanece ativa. Volume, tipos de som e outros campos possuem mapeamento e não foram classificados como igualmente ausentes.

**Aceite proposto:** Definir armazenamento, leitura e consumo dos três booleans, ou retirar controles que não têm contrato persistente. Provar cada alternância, reload e leitura em outra sessão do mesmo usuário, preservando o isolamento entre usuários.

**Limites:** Hook inteiro executado com React, QueryClient, Auth e banco simulados; zero chamadas ao banco durante as três alterações. A omissão no consumidor Realtime é evidência estática adicional, sem reprodução sonora. desktopAlerts não foi contado como quarto controle exposto.

**Evidências:** [src/hooks/system/useNotificationSettings.ts:10–45](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotificationSettings.ts#L10-L45); [src/hooks/system/useNotificationSettings.ts:84–102](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotificationSettings.ts#L84-L102); [src/hooks/system/useNotificationSettings.ts:110–126](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotificationSettings.ts#L110-L126); [src/hooks/system/useNotificationSettings.ts:135–178](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotificationSettings.ts#L135-L178); [src/components/notifications/NotificationTypeCards.tsx:85–104](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationTypeCards.tsx#L85-L104); [src/hooks/realtime/useRealtimeNotifications.ts:25–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/realtime/useRealtimeNotifications.ts#L25-L63).

**Probes:** PLAT-P04.

## R2-PLAT-004 · P2 · Restaurar preferências anuncia sucesso e mantém cache alterado quando o banco rejeita

**Condição:** A escrita de restauração retorna {error} por indisponibilidade, permissão ou validação.

**Cadeia:** NotificationSettingsPanel.handleReset → resetSettings → cache padrão e upsert → aviso de sucesso.

**Comportamento:** A tela chama resetSettings sem aguardar e anuncia restauração imediatamente. O hook muda o cache antes da escrita e ignora o campo error do upsert; seu catch também apenas registra exceções, sem rollback ou rejeição para a tela.

**Efeito:** O usuário recebe confirmação e vê valores padrão que não foram gravados. O probe fez a promise resolver apesar do erro sintético de banco.

**Aceite proposto:** Validar o retorno do upsert, aguardar confirmação e propagar falha para a tela. Recuperar o estado anterior ou recarregar a fonte persistida após falha; provar sucesso e recusa.

**Limites:** Hook exato com retorno de banco simulado. O teste não altera preferências reais; o fluxo normal updateSettings já verifica error e informa falhas.

**Evidências:** [src/components/notifications/NotificationSettingsPanel.tsx:36–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationSettingsPanel.tsx#L36-L39); [src/hooks/system/useNotificationSettings.ts:198–228](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotificationSettings.ts#L198-L228); [src/hooks/system/useNotificationSettings.ts:180–195](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotificationSettings.ts#L180-L195).

**Probes:** PLAT-P05.

## R2-PLAT-005 · P2 · Falha de carregamento de notificações aparece como ausência confirmada

**Condição:** Primeira consulta de notificações está pendente ou falha antes de receber uma lista.

**Cadeia:** fetchNotifications → estado inicial vazio/loading → NotificationsPopover.

**Comportamento:** O hook registra erro apenas no logger, mantém a lista vazia e encerra loading. O Popover não consome loading nem um estado de erro e mostra Tudo em dia/Nenhuma notificação no momento sempre que a lista está vazia.

**Efeito:** A interface comunica inexistência de notificações quando a consulta ainda não confirmou esse estado ou não conseguiu consultá-las.

**Aceite proposto:** Separar carregando, erro, vazio confirmado e lista disponível. Oferecer nova tentativa em erro e conservar dados anteriores com indicação de atualização falhada quando aplicável.

**Limites:** Leitura estática do produtor e consumidor; não há prova dinâmica específica nem medição de incidência. A assinatura Realtime pode trazer novos itens depois, mas não confirma o histórico faltante.

**Evidências:** [src/hooks/system/useNotifications.ts:20–60](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useNotifications.ts#L20-L60); [src/components/notifications/NotificationsPopover.tsx:22–23](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationsPopover.tsx#L22-L23); [src/components/notifications/NotificationsPopover.tsx:80–88](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/NotificationsPopover.tsx#L80-L88).

**Probes:** Leitura estática; sem probe dinâmico..

## R2-PLAT-006 · P2 · Buscas recentes persistem entre usuários no mesmo perfil de navegador

**Condição:** Usuário A pesquisa, sai, e B entra na mesma origem/perfil do navegador sem limpar manualmente o histórico. Termos podem conter dados que A digitou.

**Cadeia:** useGlobalSearchData.addToHistory → localStorage global-search-history → logout → próxima instância de useSearchHistory → GlobalSearch.Buscas recentes.

**Comportamento:** A chave não inclui usuário nem sessão e armazena query, timestamp e resultCount. O hook lê a mesma chave no mount. Os dois caminhos de logout limpam QueryClient, cache offline e rascunhos de Email, mas não essa chave; o serviço de logout somente delega para supabase.auth.signOut.

**Efeito:** B pode ver termos e quantidades de resultados das buscas feitas por A. O achado não demonstra acesso aos resultados remotos nem quebra das políticas de consulta.

**Aceite proposto:** Separar o histórico por identidade e definir retenção/limpeza de saída apropriada. Provar A→logout→B e retorno a A sem exposição de termos alheios, incluindo logout que falha remotamente.

**Limites:** Hook inteiro com localStorage/React simulados. Não houve login/logout real nem leitura de termos pessoais; o probe usa somente texto sintético. O botão Limpar existe, mas não é executado automaticamente na troca de usuário.

**Evidências:** [src/hooks/system/useSearchHistory.ts:3–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useSearchHistory.ts#L3-L39); [src/hooks/system/useSearchHistory.ts:51–54](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useSearchHistory.ts#L51-L54); [src/components/inbox/useGlobalSearchData.ts:223–226](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/useGlobalSearchData.ts#L223-L226); [src/components/inbox/GlobalSearch.tsx:202–225](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/GlobalSearch.tsx#L202-L225); [src/hooks/auth/useAuth.tsx:109–117](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/auth/useAuth.tsx#L109-L117); [src/hooks/auth/useAuth.tsx:162–181](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/auth/useAuth.tsx#L162-L181); [src/services/auth.service.ts:121–123](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/services/auth.service.ts#L121-L123).

**Probes:** PLAT-P06.

## R2-PLAT-007 · P2 · Desfazer no aviso anterior reverte a operação seguinte de arquivamento

**Condição:** Concluir dois arquivamentos em lote com a mesma instância de useUndoableAction dentro da janela de cinco segundos e acionar o Desfazer do primeiro aviso ainda disponível.

**Cadeia:** RealtimeInboxView → useInboxBulkActions.bulkArchive → useUndoableAction.execute → dois toasts → callback do primeiro.

**Comportamento:** Cada execute troca pendingActionRef.current, mas não identifica nem descarta o toast anterior. O callback de cada toast consulta essa ref compartilhada na hora do clique, em vez do undoAction de sua operação. Após A e B, o callback do toast A chama undoAction de B e limpa o estado compartilhado.

**Efeito:** O usuário tenta desfazer A, mas restaura B. A mensagem de confirmação continua sendo a capturada pelo primeiro aviso. O consumidor libera bulkLoading após a mutation, sem aguardar a janela de undo, permitindo a segunda operação.

**Aceite proposto:** Vincular cada toast à identidade/callback de sua operação, ou encerrar explicitamente o undo anterior ao iniciar outra. Provar dois lotes seguidos e clicar cada aviso; nenhuma ação deve operar no lote errado.

**Limites:** Callback execute exato, incluindo o callback de toast que ele produz, com timers não disparados e ações sintéticas. Sonner/React DOM e arquivamento real não foram executados. Não reconta o undo de tarefas da área modules, que usa outro helper.

**Evidências:** [src/hooks/system/useUndoableAction.ts:51–111](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useUndoableAction.ts#L51-L111); [src/hooks/system/useUndoableAction.ts:113–137](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useUndoableAction.ts#L113-L137); [src/hooks/inbox/useInboxBulkActions.ts:97–138](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/inbox/useInboxBulkActions.ts#L97-L138); [src/components/inbox/RealtimeInboxView.tsx:88–98](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/RealtimeInboxView.tsx#L88-L98); [src/components/inbox/ConversationListSidebar.tsx:112–125](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/ConversationListSidebar.tsx#L112-L125).

**Probes:** PLAT-P07.

## R2-PLAT-008 · P2 · Editar atalhos em instâncias separadas perde personalizações e mantém o listener antigo

**Condição:** Configurações de atalhos e listener global estão montados. Personalizar A e, sem remontar as outras linhas, personalizar B.

**Cadeia:** KeyboardShortcutsSettings e cada ShortcutRow → instâncias independentes de useCustomShortcuts → localStorage → useGlobalKeyboardShortcuts.

**Comportamento:** Cada linha e o pai usam um hook com estado próprio, carregado do storage somente no mount. saveShortcuts grava o conjunto completo da instância que está editando, sem reconciliar a gravação da outra. Depois de A salvar, B ainda contém a cópia anterior e salva somente sua alteração, apagando A. O listener global e as props exibidas pelo pai também não recebem atualização dessas instâncias.

**Efeito:** A tela anuncia Atalho atualizado, mas pode continuar mostrando e executando a combinação anterior; uma segunda edição pode apagar a primeira preferencialmente já gravada. Não é alegação de perda de dados do servidor, pois essas preferências são locais.

**Aceite proposto:** Usar uma fonte compartilhada de estado/assinatura de preferências ou transmitir callbacks e bindings do pai para as linhas. Provar duas edições seguidas, atualização da combinação exibida/consumida, reset e remontagem sem perder a primeira mudança.

**Limites:** Callbacks exatos de atualização/persistência com duas entradas sintéticas e instâncias separadas. Não foi executado React DOM nem pressionado teclado real. Remontagem pode recarregar a última gravação; isso não evita a sobrescrita já ocorrida.

**Evidências:** [src/hooks/ui/useCustomShortcuts.ts:41–94](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useCustomShortcuts.ts#L41-L94); [src/components/settings/KeyboardShortcutsSettings.tsx:36–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/KeyboardShortcutsSettings.tsx#L36-L65); [src/components/settings/KeyboardShortcutsSettings.tsx:173–209](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/KeyboardShortcutsSettings.tsx#L173-L209); [src/hooks/ui/useGlobalKeyboardShortcuts.ts:22–25](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useGlobalKeyboardShortcuts.ts#L22-L25); [src/hooks/ui/useGlobalKeyboardShortcuts.ts:108–143](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useGlobalKeyboardShortcuts.ts#L108-L143); [src/components/keyboard/GlobalKeyboardProvider.tsx:65–76](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/keyboard/GlobalKeyboardProvider.tsx#L65-L76).

**Probes:** PLAT-P08.

## R2-PLAT-009 · P2 · Atalho Ir para Dashboard anuncia navegação sem selecionar a view Dashboard

**Condição:** Usuário está no Inbox e aciona Ctrl+2, o binding padrão anunciado para Ir para Dashboard, com foco fora de campo editável.

**Cadeia:** DEFAULT_SHORTCUTS.go-to-dashboard → useGlobalKeyboardShortcuts.defaultActions → navigate('/') → Index/useNavigationHistory.

**Comportamento:** A ação chama navigate somente para / e mostra toast Dashboard. O estado que governa ViewRouter é currentView de useNavigationHistory; o caminho de seleção correto é setCurrentView/navigateTo ou sua URL ?view=. O provider montado no App não fornece override de go-to-dashboard e esse callback não usa o handler de navegação registrado pelo Index.

**Efeito:** O atalho pode permanecer no Inbox enquanto informa Dashboard. O problema se refere ao binding Ctrl+2; Alt+R usa outro hook que efetivamente chama onNavigate(dashboard).

**Aceite proposto:** Encaminhar o binding pelo mesmo contrato de navegação de sidebar/palette, selecionando explicitamente dashboard. Provar o atalho a partir do Inbox e de outra view, conferindo conteúdo, URL e trilha, com paridade ao clique.

**Limites:** Cadeia de produtor/consumidor lida integralmente, sem browser ou React Router montado. Não se atribui esse defeito ao atalho alternativo Alt+R nem a IDs sem binding padrão.

**Evidências:** [src/hooks/shortcuts/defaultShortcuts.ts:24–25](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/shortcuts/defaultShortcuts.ts#L24-L25); [src/hooks/ui/useGlobalKeyboardShortcuts.ts:32–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useGlobalKeyboardShortcuts.ts#L32-L39); [src/hooks/ui/useGlobalKeyboardShortcuts.ts:108–138](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useGlobalKeyboardShortcuts.ts#L108-L138); [src/components/keyboard/GlobalKeyboardProvider.tsx:65–76](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/keyboard/GlobalKeyboardProvider.tsx#L65-L76); [src/App.tsx:121–143](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/App.tsx#L121-L143); [src/pages/Index.tsx:37–51](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/Index.tsx#L37-L51); [src/pages/Index.tsx:69–77](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/Index.tsx#L69-L77); [src/components/layout/AppShell.tsx:147–157](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/layout/AppShell.tsx#L147-L157).

**Probes:** Leitura estática; sem probe dinâmico..

## R2-PLAT-010 · P2 · Botão Buscar do cabeçalho mobile só altera um estado sem consumidor

**Condição:** Aplicação usa AppShell em viewport mobile e o usuário aciona Buscar no MobileHeader.

**Cadeia:** AppShell → MobileShell → MobileHeader.onSearchOpen → setMobileSearchOpen(true).

**Comportamento:** MobileShell declara mobileSearchOpen e fornece o setter ao botão, mas nunca lê o estado nem renderiza ou despacha uma busca. O botão é exposto porque o callback existe.

**Efeito:** O comando não abre busca, campo ou resultado. O probe mudou o flag para true e conservou a mesma composição e os demais painéis fechados.

**Aceite proposto:** Ligar o botão a uma superfície de busca real ou ao comando compartilhado que a abre. Provar abertura, foco, resultado, fechamento e retorno em viewport mobile.

**Limites:** Componente inteiro executado com captura de JSX e hooks sintéticos. Não houve ReactDOM, clique real ou medição de layout; o achado é a ausência de qualquer consumidor do estado.

**Evidências:** [src/components/mobile/MobileShell.tsx:35–56](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/MobileShell.tsx#L35-L56); [src/components/mobile/MobileShell.tsx:64–109](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/MobileShell.tsx#L64-L109); [src/components/mobile/MobileHeader.tsx:111–123](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/MobileHeader.tsx#L111-L123); [src/components/layout/AppShell.tsx:95–106](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/layout/AppShell.tsx#L95-L106).

**Probes:** PLAT-P09.

## R2-PLAT-011 · P2 · Notificações mobile usam lista vazia local e contador fixado em zero

**Condição:** Há notificações do usuário, mas a navegação usa o shell mobile do Index.

**Cadeia:** Index.unreadNotifications=0 → AppShell → MobileShell.notification state vazio → NotificationsPanel.

**Comportamento:** Index passa zero literal. MobileShell cria notifications=[] sem consulta, subscription ou ação que insira dados; a única atualização mapeia essa lista para read=true. O painel abre normalmente e exibe Tudo em dia/Nenhuma notificação com base no array desconectado.

**Efeito:** O usuário mobile não recebe a lista nem o contador real por esse painel. Isso independe de erro de rede e é distinto de PLAT005, que trata erro/loading de uma consulta existente no popover desktop.

**Aceite proposto:** Conectar mobile e desktop à mesma fonte de notificações e às mesmas mutações de leitura. Provar lista não vazia, contador, leitura individual/em lote, loading e erro em viewport mobile.

**Limites:** O probe usa o literal zero extraído do Index e abre o painel do shell inteiro sob hooks/JSX sintéticos. A existência de notificações reais é uma precondição, não um dado consultado na conta do usuário.

**Evidências:** [src/pages/Index.tsx:113–127](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/Index.tsx#L113-L127); [src/components/mobile/MobileShell.tsx:35–49](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/MobileShell.tsx#L35-L49); [src/components/mobile/MobileShell.tsx:53–73](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/MobileShell.tsx#L53-L73); [src/components/mobile/MobileHeader.tsx:125–145](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/MobileHeader.tsx#L125-L145); [src/components/mobile/NotificationsPanel.tsx:110–121](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mobile/NotificationsPanel.tsx#L110-L121).

**Probes:** PLAT-P10.

## R2-PLAT-012 · P2 · Sidebar das rotas de SLA muda a seleção sem abrir o módulo escolhido

**Condição:** Usuário está nas rotas protegidas /sla ou /sla/history e seleciona Inbox ou outro módulo pela Sidebar.

**Cadeia:** AppRoutes → SLADashboardPage/SLAHistory → SidebarNavItem.onClick → setCurrentView local.

**Comportamento:** As duas páginas passam o setter de um estado local para Sidebar, mas sempre renderizam o mesmo corpo de SLA. O item da Sidebar apenas chama esse callback. Não há navegação de rota nem troca condicional de conteúdo nesses consumidores; a integração normal do Index possui outro callback.

**Efeito:** A indicação de módulo selecionado pode mudar enquanto o usuário continua vendo SLA. O probe alterou a seleção para inbox e preservou a composição dos dois corpos. QueuesComparison não usa essa Sidebar e não pertence ao achado.

**Aceite proposto:** Conectar essas entradas ao contrato de navegação compartilhado, preservando autorização, histórico e destino. Provar ida das duas rotas para Inbox/Configurações, retorno e comportamento do botão Voltar.

**Limites:** Páginas completas com JSX/estado sintéticos; wiring da Sidebar e rotas inspecionados. Sem navegação real, browser, conta autenticada ou mudança do produto. O controle de acesso das rotas permanece presente.

**Evidências:** [src/pages/SLADashboard.tsx:5–15](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/SLADashboard.tsx#L5-L15); [src/pages/SLAHistory.tsx:7–21](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/SLAHistory.tsx#L7-L21); [src/components/layout/SidebarNavItem.tsx:27–43](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/layout/SidebarNavItem.tsx#L27-L43); [src/components/layout/Sidebar.tsx:128–137](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/layout/Sidebar.tsx#L128-L137); [src/routes/AppRoutes.tsx:82–97](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/routes/AppRoutes.tsx#L82-L97).

**Probes:** PLAT-P11.

## Observações e falsos positivos evitados

- **useResourcePrefetch vaza dados reais entre usuários** — O cache genérico não inclui identidade automaticamente, mas não foi encontrado consumidor de produção além de exportações. Não há cadeia concreta de dados sensíveis demonstrada.
- **Todos os controles da configuração de notificação são fictícios** — Volume, quiet hours, notificações do browser, sentimento, transcrição e tipos de som têm mapeamento de escrita/leitura. PLAT003 delimita três booleans expostos.
- **SkipLinks do App aponta para o alvo incorreto do pacote a11y** — App importa components/ui/skip-link, não o componente homônimo do diretório a11y. Os exports deste pacote a11y não tinham consumidor concreto encontrado.
- **useSkillBasedAssign/useVersions/useSearch/useInfiniteScroll falham nas telas atuais** — Corpos genéricos lidos, com limitações de chave de cache/paginação/mutation anotadas; apenas barrels e testes encontrados como consumidores. Ausência de uso impede atribuir falha a uma ação atual.
- **Sair de Auth encerra necessariamente toda instância SIP** — AppProviders persiste acima das rotas; Auth logout não chama disconnect SIP e o CallProvider não depende de user. Sem contrato funcional explícito sobre continuidade do ramal, não foi promovido como novo P1 nem como incidente.
- **Contagem limitada a100 notificações é total absoluto confirmado** — fetchNotifications consulta somente100 recentes. Não foram medidos volume nem limite/retensão implantados; PLAT002 prova divergência mesmo com duas linhas, sem depender de truncamento.

## Passagens adicionais de corpos integrais

### UI-01: tema, feedback, atalhos e interação

Corpos integrais lidos. Tema mantém estado compartilhado e listener de preferência do sistema; a preferência global de aparência não foi tratada como dado privado de busca. Volume deduplica teclado nativo/React por defaultPrevented, evita campos editáveis e limpa timer de long-press. Swipe remove listeners/indicador na limpeza; não foi exercitado gesto real. Feedback comum propaga avisos e ações em lote; os helpers withUndo/useConfirmAction passam action ao showFeedback, que apenas concatena o rótulo, mas não foi localizado consumidor atual desses dois helpers e não se atribui bloqueio a uma tela. Atalhos customizados têm estado por instância e leitura de storage só no mount; sincronização entre configuração e listener global confirmada como PLAT008 após leitura dos consumidores.

Arquivos: `src/hooks/ui/useTheme.ts`, `src/hooks/ui/useActionFeedback.ts`, `src/hooks/ui/useCustomShortcuts.ts`, `src/hooks/ui/useVolumeRocker.ts`, `src/hooks/ui/useSwipeNavigation.ts`.

### UI-02: consumidores de atalhos, loading, onboarding e gestos

Corpos integrais lidos, incluindo registro/escopo e caminho de configuração dos atalhos (PLAT008). Registry de tarefas respeita views e campos editáveis; rótulos lazy têm mesclagem determinística. Loading envolve função com tempo mínimo e auto-reset, sem prova de concorrência nos consumidores. Onboarding tem chave por usuário e invalida consulta na limpeza; conclusão remota usa existência de user_settings e erros de persistência só são logados, portanto não foi certificada sincronização entre dispositivos. Checklist usa heurísticas de perfil/configurações/primeira conexão/template, não prova que o usuário cumpriu o tour. Gestos controlam direção/limiar e estados; cenários de touchcancel, mudança de enabled no meio do gesto e interação com gesto nativo não foram executados. Parallax limpa listeners/observer; easing declarado não é aplicado e não foi presumido requisito de tela ativa.

Arquivos: `src/hooks/ui/useGlobalKeyboardShortcuts.ts`, `src/components/settings/KeyboardShortcutsSettings.tsx`, `src/components/keyboard/GlobalKeyboardProvider.tsx`, `src/hooks/shortcuts/defaultShortcuts.ts`, `src/hooks/shortcuts/shortcutLabels.ts`, `src/hooks/shortcuts/taskShortcutLabels.ts`, `src/hooks/ui/useLoadingState.ts`, `src/hooks/ui/useOnboarding.ts`, `src/hooks/ui/useOnboardingChecklist.ts`, `src/hooks/ui/useParallax.ts`, `src/hooks/ui/useSwipeGesture.ts`, `src/hooks/ui/usePullToRefresh.ts`.

### UI-03: shell, acessibilidade, navegação e preferências locais

Corpos integrais lidos. PLAT009 registra Ctrl+2 sem seleção de view; Alt+R usa mapa/callback correto e não é classificado como igualmente quebrado. ZenModeToggle recebe estado e ação do AppShell, portanto não há instância isolada nesse caminho (candidato rejeitado). Sidebar collapse escuta seu evento e remove listener; announcer cria/remove região viva e usa textContent; title restaura valor anterior. Hooks de aparência/gestos não executam escrita de dados de negócio. PrefetchOnHover depende de queryFn já disponível no cache/configuração e não certifica pré-carga de consulta inédita; essa limitação de otimização não foi promovida a falha funcional. DeepLinks é navegação por hash genérica; shell atual usa useNavigationHistory com query, sem confundir as implementações. useKeyboardHeight reage a eventos VisualViewport e não mede zoom/teclado real. Nenhum teste de acessibilidade visual, leitor de tela ou dispositivo móvel foi executado.

Arquivos: `src/pages/Index.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/ZenModeToggle.tsx`, `src/hooks/ui/use-toast.ts`, `src/hooks/ui/useKeyboardShortcuts.ts`, `src/hooks/ui/useKeyboardNavigation.ts`, `src/hooks/ui/useNavShortcuts.ts`, `src/hooks/ui/useAriaAnnouncer.ts`, `src/hooks/ui/useAmbientColor.ts`, `src/hooks/ui/useSidebarFavorites.ts`, `src/hooks/ui/useZenMode.ts`, `src/hooks/ui/useDocumentTitle.ts`, `src/hooks/ui/useKeyboardHeight.ts`, `src/hooks/ui/usePrefetchOnHover.ts`, `src/hooks/ui/useSidebarCollapse.ts`, `src/hooks/ui/useViewTransition.ts`, `src/hooks/ui/use-mobile.tsx`, `src/hooks/ui/useDeepLinks.ts`, `src/hooks/ui/useDensity.ts`.

### UI-04: mobile, notificações, gestos e instalação

Corpos integrais lidos. PLAT010/011 registram busca e notificações desconectadas no shell ativo. Drawer filtra seções e recentes por NavigationService; recents contém IDs de views, não consultas privadas. SwipeableRow/PullToRefresh genérico, SlideOverPanel/PinchZoom/LongPressMenu e FABs genéricos aparecem apenas em exports no rastreio de consumidores; suas limitações de cancelamento/limites não foram convertidas em incidentes de tela ativa. O Inbox usa outro hook usePullToRefresh e um indicador puro. MiniChatPiP ativo não recebe onQuickReply; a chamada Toque para responder apenas expande uma prévia com Abrir conversa completa, limitação explícita sem alegar perda de envio assíncrono inexistente. InAppNotification possui timer com cleanup, mas seu hook não tem consumidor de produção encontrado; não foi alegada perda atual por contexto do provider. MobileFAB encaminha as ações Novo para seleção de view, não dispara formulário diretamente. Install observa o prompt nativo, diferencia iOS e display-mode; não se executou instalação, modo offline, permissões, gestos, teclado móvel nem leitor de tela. O listener appinstalled não é removido no unmount, observação de lifecycle sem impacto produtivo material demonstrado.

Arquivos: `src/components/mobile/SwipeGestures.tsx`, `src/components/mobile/swipeUtils.ts`, `src/components/mobile/MobileSlidePanel.tsx`, `src/components/mobile/MobileDrawerMenu.tsx`, `src/components/mobile/MobileShell.tsx`, `src/components/mobile/BottomSheet.tsx`, `src/components/mobile/MobileNavigation.tsx`, `src/components/mobile/MobilePullToRefresh.tsx`, `src/components/mobile/MiniChatPiP.tsx`, `src/components/mobile/InAppNotificationProvider.tsx`, `src/components/mobile/InAppNotification.tsx`, `src/components/mobile/MobileHeader.tsx`, `src/components/mobile/NotificationsPanel.tsx`, `src/components/mobile/MobileFAB.tsx`, `src/components/mobile/FloatingActionButtons.tsx`, `src/components/mobile/TouchRipple.tsx`, `src/components/mobile/SwipeableMessage.tsx`, `src/components/mobile/index.ts`, `src/pages/Install.tsx`.

