# Testes — revisão transversal do root

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Estado: COMPLETED_REVIEW_PASS; 77/77 arquivos.

O registro distingue o contrato que cada teste exercita de seus limites. Leitura e existência de assertivas não equivalem a execução aprovada.

## [src/components/admin/__tests__/adminDownloadPermission.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/admin/__tests__/adminDownloadPermission.test.ts#L1-L148)

Os dois testes de handleSaveUser montam o hook real e conferem envio de can_download true/false em objectContaining, com banco/Storage/admin/Edge simulados; não verificam gravação final, combinação de campos ou autorização no servidor. Os casos de interface constroem literais já válidos e só testam sua propriedade/tipo. O título sobre não aceitar null em runtime não demonstra rejeição de null: nenhum valor inválido é entregue a um validador. Limite de evidência de teste, sem novo defeito do produto inferido.

## [src/components/ai/__tests__/AutoTicketClassifier.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/ai/__tests__/AutoTicketClassifier.test.tsx#L1-L194)

Smoke de render usa seis tags fixas e consulta simulada sempre bem-sucedida; confirma título/controles/categorias. ClassifyTag, derivePriority, CATEGORIES, PRIORITY_MAP e agrupamento são reimplementações/literais locais ao teste, sem vínculo de execução com a lógica real do componente. O caso de lista vazia configura um vi.fn recém-criado que não é usado pelo mock de Supabase; permanece a fixture de seis tags e só se verifica o título. O caso de confiança zero valida a expressão local que converte zero em70, sem afirmar correção do domínio. Nenhum teste dispara classificar em lote com retorno {error}, portanto não refuta R2-AUTH-048.

## [src/components/groups/__tests__/GroupsView.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/groups/__tests__/GroupsView.test.tsx#L1-L124)

Monta GroupsView real sob mock de motion/Auth/feedback/Supabase. Cobre lista vazia, linhas, filtro, nome da conexão, admin, erro de fetch, sync com instanceName/getParticipants e erro por falta de conexão; isso é evidência útil de apresentação e montagem dos argumentos. Não aciona o menu Enviar mensagem nem o envio broadcast com falha. O feedback simulado captura exceções e chama onSuccess só no sucesso; os contratos de seleção/draft de R2-API-061/062 precisam provas próprias, não são cobertos pelo simples rótulo Selecionar todos.

## [src/components/mfa/__tests__/MFABackupCodes.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/mfa/__tests__/MFABackupCodes.test.tsx#L1-L219)

Monta MFABackupCodes real: verifica dez códigos/formato/unicidade da amostra, props, cópia, Blob/text/plain/revogação, confirmação e callbacks. O teste de ícone usa fake timers com act e restauração em finally, controle de agendamento válido. Esses casos não persistem códigos nem os apresentam a um verificador MFA. Formato e cópia não demonstram recuperação da conta, uso único ou vínculo ao usuário; unicidade numa amostra não é prova criptográfica.

## [src/components/notifications/__tests__/SoundVolumeControl.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/__tests__/SoundVolumeControl.test.tsx#L1-L173)

Monta SoundVolumeControl real e dispara roda, teclado, clique e press longo; cobre passos de5, limites10–100, mudo sem alterar volume, nome acessível, slider aos400ms, dedup do click subsequente e indicação de volume baixo. useNotificationSettings é substituído por settings mutável e spy. Os testes conferem payload/estado de apresentação, sem provar armazenamento, emissão sonora física, preferência após recarga ou sincronização de múltiplos controles.

## [src/components/onboarding/__tests__/OnboardingTour.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/onboarding/__tests__/OnboardingTour.test.tsx#L1-L310)

TourProvider real é exercitado para iniciar/finalizar, índice, limites, callback, contexto obrigatório e teclas. WelcomeModal real cobre render fechado/aberto, iniciar/pular, Escape e nome/papel modal; são controles de comportamento concretos. O teste de seletor CSS exige apenas que querySelector não lance; resultado null passa, portanto não valida existência dos alvos INF038. aria-modal=true não prova foco inicial, contenção/retorno de foco ou inert, limites de INF039; nenhum achado adicional foi contado.

## [src/hooks/__tests__/helpers/alertBehaviorTestKit.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/helpers/alertBehaviorTestKit.ts#L1-L123)

Kit de fronteiras dos alertas lido integralmente: coleta callbacks de Realtime, parametriza tipos/volume/quietHours e dedupe, retorna contactRow e consultas/mutações sintéticas. O getter de quietHours é avaliado por chamada, permitindo testes de mudança após mount. Não executa dedupe real, canal remoto, RLS ou persistência; claimNotificationEvent retorna somente um boolean configurado. resetAlertKit não restaura todas as propriedades/coleções de spies, e os testes consumidores devem configurar o que usam; isso ficou limite do harness, sem incidente de produto inferido.

## [src/hooks/__tests__/sentimentAlerts.behavior.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/sentimentAlerts.behavior.test.ts#L1-L153)

Importa os dois hooks reais e entrega payload.new ou retorno Edge simulado. Prova chamada de playNotificationSound com tipo/volume e caminhos silenciosos por desativação, tipo diferente, dedupe negado, alerted=false, notifyCaller=false e erro de invoke. A decisão real de dedupe, armazenamento do volume, emissão de áudio e navegação das ações do toast não são exercitadas. O título com persistidos significa dados fornecidos pelo mock do painel; não comprova gravação no banco nem refuta INB064.

## [src/hooks/__tests__/useApplicableSLA.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useApplicableSLA.test.ts#L1-L276)

Todos os cenários de hierarquia/escopo/fallback executam resolveApplicableSLA definido dentro do próprio teste44–94, com tipos/factories locais e apenas import de vitest. Confirmam a intenção dessa cópia, incluindo precedência e default, mas não o hook produtivo. Não há execução da consulta/ordenação nem do indicador/trigger consumidor; o teste entrega regras já ordenadas. Não refuta SLA003 (configuração não governa o caminho efetivo). Caso integrante da família de testes sem vínculo ao código de produto, sem contar cada assertiva como funcionalidade.

## [src/hooks/__tests__/useAutoCloseConversations.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useAutoCloseConversations.test.tsx#L1-L123)

Monta useAutoCloseConversations com QueryClient novo e retryfalse. Cobre configuração retornada, loading pendente, erro→undefined e preservação do valor0, explicitamente atribuindo validação à UI. Nenhum caso atualiza configuração ou fecha uma conversa, aciona cron ou verifica mensagem de encerramento. O nome validates inactivity_hours bounds acompanha uma asserção de leitura de0, não rejeição do valor; registrar leitura não implica validação executada pelo hook.

## [src/hooks/__tests__/useBulkActions.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useBulkActions.test.tsx#L1-L179)

Monta useBulkActions real e exercita seleção, alternância, deselect/selectall, contagem, seleção parcial, projeção de itens e isExecuting inicial. As duas alterações em um act também exercitam atualização funcional do estado. Os métodos de delete/update são simulados e não são acionados por esses testes. Não há cenário de execução em lote, falha parcial, mudança de página/dados ou associação da seleção a usuário/tenant; os testes de seleção não certificam mutations.

## [src/hooks/__tests__/useCRUD.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useCRUD.test.tsx#L1-L169)

Monta useCRUD real com QueryClient e mocks para select/insert/update/delete. Verifica presença de métodos/flags, aceita configurações sem lançamento e aciona create/bulkDelete. Os casos de configuração apenas exigem result definido; create e bulkDelete só conferem from('test_table'), sem exigir IDs/payload, efeito persistido ou tratamento de erro. Esse alcance de smoke não foi transformado em aprovação do contrato de CRUD/ACL/paginação.

## [src/hooks/__tests__/useChatSearch.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useChatSearch.test.ts#L1-L260)

Monta useChatSearch real com oito mensagens e relógio simulado: verifica debounce, exclusão lógica, normalização de acentos, filtros de mídia/link, combinação de filtros, navegação circular, destaque, callback, limpeza e ausência de resultados. Esses controles positivos verificam o hook sobre a coleção recebida. Não consultam histórico paginado no banco nem montam a rolagem e os consumidores de navegação do chat.

## [src/hooks/__tests__/useGlobalKeyboardShortcuts.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useGlobalKeyboardShortcuts.test.tsx#L1-L134)

Monta useGlobalKeyboardShortcuts real, verifica o registro de sete comandos escopados a tarefas e despacha eventos de teclado para tarefas/pipeline, outra view, foco em input, modificador Ctrl e ajuda. Os controles negativos de escopo e foco são relevantes. A simulação não executa as ações de negócio do módulo de tarefas, nem navegação global Ctrl+2 ou persistência de preferências.

## [src/hooks/__tests__/useNotificationSettings.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useNotificationSettings.test.tsx#L1-L367)

Monta useNotificationSettings real com QueryClient, usuário e Supabase simulados. Verifica carregamento, defaults, campos, seleção e gravação de sound_volume, limites, atualização otimista, erro de upsert com aviso, reset de volume, vocabulário de som, limitação de toasts e fronteiras de quiet hours inclusive intervalos noturnos. Há assertivas substanciais sobre o hook real; elas não demonstram persistência dos três booleans de sons por categoria nem falha do upsert no reset. Não afastam PLAT003/PLAT004, e não constituem execução contra banco ou áudio real.

## [src/hooks/__tests__/useOfflineCache.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useOfflineCache.test.ts#L1-L125)

Monta useOfflineCache real com navigator e localStorage simulados: cobre identidade online, gravação e timestamp, limites de 50 conversas/20 mensagens, bloqueio durante loading, limpeza, expiração em 31 minutos e eventos online/offline. O teste não monta logout ou alternância de usuário, nem trata quotas e JSON corrompido. A ausência desses cenários não é um novo vazamento: a integração de limpeza em Auth foi examinada separadamente.

## [src/hooks/__tests__/useOnboarding.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useOnboarding.test.tsx#L1-L150)

Monta useOnboarding real e verifica usuário ausente, flag local por usuário, existência ou ausência de user_settings, erro de leitura que assume conclusão, API de conclusão e upsert com onConflict=user_id/ignoreDuplicates=true. O caso final exige que a conclusão local sobreviva à rejeição da persistência remota, comportamento local explicitamente pretendido no teste. O arquivo não demonstra conclusão durável em outro navegador, foco/inert do modal nem presença dos alvos do tour.

## [src/hooks/__tests__/useOnboardingChecklist.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useOnboardingChecklist.test.tsx#L1-L135)

Monta useOnboardingChecklist real com tabelas simuladas. Verifica nome de perfil suficiente/curto, funções e campos expostos, ausência de usuário sem exceção e progresso no intervalo 0–100. Alguns títulos são mais fortes que a assertiva: all false somente exige status definido, e dismissal só verifica estado inicial e funções. O teste não monta OnboardingChecklistCard com tema indefinido e não afasta INF036; tampouco verifica operações de dismiss e erros de persistência.

## [src/hooks/__tests__/useQueues.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useQueues.test.tsx#L1-L122)

Monta useQueues real e exige duas filas, vínculo de membro ao nome correto, estado inicial de loading e waiting_count igual a zero. O comentário registra que a contagem foi movida à camada de serviço; o teste não prova a contagem operacional de espera. O mock oferece insert de fila e operações de membros, mas nenhum caso os aciona. Não cobre salvar/excluir fila, erro de inclusão de membro ou os componentes de comparação e período relacionados a QUE007–QUE010.

## [src/hooks/__tests__/useQueuesComparison.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useQueuesComparison.test.tsx#L1-L122)

Importa e monta useQueuesComparison real, mas o cenário intitulado fetches and compares queues somente aguarda loading=false. O cenário de erro faz a mesma assertiva; apenas o cenário de filas vazias exige queuesPerformance=[]. O mock de mensagens encerra a cadeia em in() com uma Promise e não oferece gte/lte requeridos pela produção; o catch do hook termina loading mesmo assim. Nenhuma assertiva exige as métricas das fixtures, portanto o cenário não demonstra comparação correta, filtragem temporal ou proteção contra retorno fora de ordem de QUE010.

## [src/hooks/__tests__/useRateLimitLogs.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useRateLimitLogs.test.tsx#L1-L156)

Monta useRateLimitLogs real com Promise que oferece abortSignal. Verifica três logs, soma 280, contagem de linhas bloqueadas, IPs únicos e identificação do IP bloqueado, vazio, refresh de 30 segundos, atualização conjunta de estatísticas, limpeza ao desmontar e ausência de consulta sem permissão. Os controles de polling e autorização do hook são concretos. O cenário de erro só aguarda fim do loading; não verifica mensagem de erro do dashboard nem ações de bloqueio/desbloqueio. blockedRequests=1 é a contagem de linhas da fixture, não prova do volume de requisições bloqueadas no servidor.

## [src/hooks/__tests__/useResourcePrefetch.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useResourcePrefetch.test.ts#L1-L370)

Importa os hooks e helpers reais de prefetch. Além da API exposta, cobre cache, deduplicação, erro, líder/seguidor desmontados, rejeição compartilhada, cancelamento de rota no fallback, idle callback, interrupção de escrita ao desmontar e IntersectionObserver antes/depois da desmontagem. Os controles positivos e negativos são preservados: existe observação de dados e chamadas reais do módulo sob fetchers simulados. ImagePrefetch só tem verificações de funções expostas; nenhum cenário demonstra download HTTP de imagens ou benefício de desempenho em navegação real.

## [src/hooks/__tests__/useSLACalculation.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useSLACalculation.test.ts#L1-L172)

O único import é Vitest. calculateStatus, formatTimeRemaining e deriveWorstStatus são definidos dentro do próprio teste e todas as assertivas exercitam essas cópias, incluindo fronteiras de warning/deadline, conclusão e formatação. As expectativas documentam intenção, mas uma alteração divergente no hook de produção não é observada por esse arquivo. É outro locus da família de testes sem vínculo com o código produtivo, relacionado a TC-011; não equivale a defeito adicional no cálculo de SLA.

## [src/hooks/__tests__/useSLAHistory.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useSLAHistory.test.tsx#L1-L124)

Monta useSLAHistory real com React Query e verifica loading, períodos, estrutura de dias/trends, vazio e duas violações de primeira resposta, preservando a regra comentada de ignorar resolução. O caso de erro retornado exige data=null. Os testes de 30/90 dias apenas aguardam loading; não conferem datas enviadas ou conteúdo dos buckets. A estrutura e a regra de primeira resposta têm controles positivos, mas fuso horário, navegação do dashboard e ordenação assíncrona não são demonstrados por este arquivo.

## [src/hooks/__tests__/useSavedFilters.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useSavedFilters.test.tsx#L1-L127)

Monta useSavedFilters real sob React Query e mocks de autenticação/consulta: exige duas entradas, identifica o filtro default, retorna vazio sem usuário e verifica estado inicial e funções expostas. Salvar, atualizar, apagar e trocar default nunca são acionados; o cenário de erro apenas aguarda fim do loading. Portanto o arquivo não demonstra persistência, isolamento de usuário nas mutações nem recuperação de falhas desses comandos.

## [src/hooks/__tests__/useSearchHistory.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useSearchHistory.test.ts#L1-L163)

Monta useSearchHistory real e verifica adição, tamanho mínimo, deduplicação sem distinguir maiúsculas, limite de dez itens, remoção, limpeza, persistência/restauração, JSON inválido, recência e trim. As assertivas exercitam estado e localStorage de fato, com controles positivos e negativos. Não montam a pesquisa remota ou seu vínculo com resultados nem demonstram isolamento entre contas e tratamento de quota; esses limites não geram achado por si sós.

## [src/hooks/__tests__/useSentimentAlerts.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useSentimentAlerts.test.ts#L1-L260)

Monta useSentimentAlerts real, usa notificationDedupe real e simula Edge Function, preferências, som e consultas. Cobre delegação à política do destinatário mesmo com preferência local desativada, retorno de erro, alerta, deduplicação com Realtime, notifyCaller=false, leitura recente e som condicionado à preferência de menção. Os controles de decisão local são concretos; resposta alerted/emailSent do mock não comprova envio/persistência no servidor. Não aciona a navegação do toast, portanto não afasta INB064.

## [src/hooks/__tests__/useTeamChatNotifications.behavior.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useTeamChatNotifications.behavior.test.ts#L1-L186)

Importa o hook ativo de chat e usa grafo WebAudio falso, canal cujo callback é capturado e consulta de membership simulada. Exige os ganhos para volumes 60/100 e ausência de som para autor, não membro, conversa muda, preferência desligada, quiet hours e conversa atual. É evidência vinculada ao caminho produtivo de som, com vários controles negativos; preserva a distinção expressa em comentário sobre o antigo hook sem consumidor. Não demonstra áudio físico, permissão de notificações push ou transporte Realtime real.

## [src/hooks/__tests__/useUserRole.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useUserRole.test.tsx#L1-L208)

Monta useUserRole real com QueryClient e auth/Supabase simulados. Verifica usuário ausente, composição de papéis, hasRole e a permissão multiplix.dispatch.create por RPC user_has_permission com argumentos exatos, tanto concedida a agente quanto negada a supervisor. Os controles de permissão nominal são substanciais. A resposta da RPC é simulada, sem executar SECURITY DEFINER/RLS ou a navegação ProtectedRoute; não constitui prova de autorização no banco.

## [src/hooks/__tests__/useVisiblePolling.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useVisiblePolling.test.tsx#L1-L136)

Monta useVisiblePolling real com timers, visibilidade e conectividade controlados. Cobre leitura inicial, intervalo após conclusão, pausa oculta/offline, retomada, coalescência de refresh, rejeição, abort/cleanup, StrictMode, substituição de callback e remoção de autorização. Os casos verificam chamadas, sinais AbortSignal e ausência de timers, com fronteiras positivas e negativas. Isso demonstra o contrato do agendador sob simulação; a tarefa fornecida e os servidores reais permanecem fora do teste.

## [src/hooks/chat/__tests__/useConversationActions.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/__tests__/useConversationActions.test.ts#L1-L355)

Monta useConversationActions real; o fake de favoritos replica inserts/deletes para que o refetch pelo bus não mascare o estado. Verifica arquivamento e undo com assigned_to original, erro sem undo, transferência por agente/fila, rejeição por conexão, durações de snooze, estado de pin/favorite e filtros exatos contact_id+pinned_by no unpin. Há observação de payloads, filtros e erros reais do hook sob banco simulado. Não reproduz transferência concorrente, autorização RLS, falhas de leitura do assigned_to nem todos os erros de pin/snooze; a assertiva de 9h usa fuso do runtime, sem certificar regra operacional de fuso.

## [src/hooks/chat/__tests__/useFilesContainerColumns.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/__tests__/useFilesContainerColumns.test.tsx#L1-L140)

Importa helpers e hook reais de colunas e verifica limites, tabela de larguras, capacidade 7 reduzida à opção 6, prioridade da preferência, primeira medida e redimensionamento. O contêiner fornece getBoundingClientRect fixo e o ResizeObserver é falso, explicitamente declarado no teste. Portanto os cálculos e a reação do hook têm evidência; medidas e encaixe visual no navegador real não são demonstrados.

## [src/hooks/chat/__tests__/useFilesViewState.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/__tests__/useFilesViewState.test.tsx#L1-L163)

Monta useFilesViewState real, verifica JSON/versão/domínio inválidos, sanitização campo a campo, persistência de viewMode/columns sem tocar chaves do catálogo, sessão em memória para filtro/busca/ordem, remontagem e separação entre usuário/contato. Há controles positivos de isolamento entre usuários, SIGNED_OUT e troca de contato com hook montado. O cenário de não persistência de sessão condiciona as assertivas ao storage existir, mas confere o estado em memória; nenhum desses testes demonstra a UI completa ou o servidor.

## [src/hooks/chat/__tests__/useForwardMedia.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/__tests__/useForwardMedia.test.ts#L1-L229)

Importa forwardMediaMessages e createForwardRunState reais; observa quatro cópias/envios por dois arquivos e dois destinos, URLs derivadas de cada path copiado, bucket de áudio, recusa de origem externa/grupo, limpeza condicionada à reconciliação e conservação do objeto quando a consulta falha. Os testes exercitam retry de sete pares com duas falhas e reaproveitamento do objeto existente, com controles de chamadas e progresso. Storage, outbound e reconciliação são simulados; não demonstram RLS, entrega externa ou idempotência durável entre processos.

## [src/hooks/chat/__tests__/useNewConversation.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/__tests__/useNewConversation.test.tsx#L1-L139)

Monta useNewConversation real e observa telefone normalizado na consulta e insert, payload de mensagem, invalidação dos dois agregados, callbacks e fechamento. O caso duplicado exige ausência de insert, invalidação e envio, com toast de erro específico. A fronteira positiva/duplicidade é concreta. O mock resolve sendOutboundMessage com undefined e não simula erros/estados retornados, concorrência de criação ou troca de conexão; não certifica entrega pelo gateway.

## [src/hooks/ui/__tests__/useVolumeRocker.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/__tests__/useVolumeRocker.test.tsx#L1-L179)

Monta um host DOM mínimo com useVolumeRocker real. Testa enabled/wheelEnabled, defaultPrevented, passos ±5, mute, fronteira de 399/400ms, dedupe do click longo, cancelamento ao soltar, Enter e ausência de captura global. Os eventos/timers são simulados mas atravessam os handlers reais do hook. Não demonstram persistência de volume, reprodução física nem toda a integração dos dois componentes consumidores.

## [src/lib/__tests__/groupsAutoSync.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/groupsAutoSync.test.ts#L1-L247)

Só importa Vitest; extractGroupData e normalizeApiResponse são cópias locais. Todos os casos, inclusive o bloco denominado Integration: Full Group Sync Flow, exercitam essas funções internas e fixtures Evolution/GO. As assertivas documentam uma normalização pretendida, mas não importam actions.ts nem o sincronizador produtivo e não verificam seu vínculo textual. É um locus concreto da extensão da família TC-011, sem inferir defeito adicional de grupos a partir da cópia.

## [src/lib/__tests__/mapboxGeocode.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/mapboxGeocode.test.ts#L1-L415)

Importa as funções reais de mapboxGeocode e simula fetch. Verifica coordenadas/URL codificada, deduplicação/cache limitado, não cachear falha, timeout/abort, coordenada não finita, forward com fallback v5/relevância, sugestão por sessão, distinção entre vazio legítimo e shape inválido e retrieve lng/lat. São controles de contrato HTTP e fronteiras úteis, incluindo sinais abortados e ausência de chamada. As fixtures não comprovam disponibilidade, cobrança ou resposta atual do Mapbox; o comentário de limit=1 em um título não supera a assertiva explícita de limit=5.

## [src/lib/__tests__/mapboxSession.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/mapboxSession.test.ts#L1-L158)

Importa mapboxSession real e simula logAudit e relógio. Verifica reaproveitamento e expiração por inatividade, encerramento por retrieve/explícito, rotação depois de 51 chamadas suggest e evento de auditoria somente no primeiro uso, com source/default corretos. Também verifica chamada sem sessão em DEV e PROD e ausência de sessão fantasma. O caso de teto não discrimina exatamente o instante 50 versus 51; logAudit é mock e não comprova cobrança ou agregação mensal no banco.

## [src/lib/__tests__/mapboxToken.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/mapboxToken.test.ts#L1-L132)

Importa mapboxToken real; verifica cache, deduplicação simultânea, force, timeout com abort, classes de HTTP/SDK/rede, token ausente, não cachear falha, classificação arbitrária e encaminhamento da telemetria com source/kind. As assertivas observam o contrato local e seus argumentos de erro. O servidor get-mapbox-token e o serviço de mapas são simulados; validade operacional do token e entrega real da telemetria não são inferidas.

## [src/lib/__tests__/mediaVolumeElement.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/mediaVolumeElement.test.ts#L1-L210)

Importa módulos reais de volume com singletons limpos. Verifica volume nativo, falta de suporte sem AudioContext, criação de GainNode somente após play, reutilização de source, store/loadedmetadata, detach/recriação do elemento e sinais de presença de faixa de áudio. O próprio arquivo explicita a limitação jsdom: volume read-only e APIs WebAudio/decodificação são simulados. Os controles de estado e ciclo de vida são preservados, sem afirmar áudio em iOS físico ou decodificação real.

## [src/lib/__tests__/mediaVolumeStore.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/mediaVolumeStore.test.ts#L1-L219)

Importa mediaVolumeStore real a cada cenário. Verifica defaults, identidade do snapshot, curva quadrática com controle não linear, sanitização e clamp, storage indisponível, persistência/reload, mute preservando volume, subscribers e sincronização por FakeBroadcastChannel/evento storage. Há casos de erro e fronteiras úteis e separação entre escrita e leitura inválida. A sincronização é simulada em módulos no mesmo processo e não comprova comportamento em abas reais; o teste de payload inválido usa acesso opcional ao peer, limite registrado sem desqualificar os demais controles.

## [src/lib/__tests__/rateLimiter.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/rateLimiter.test.ts#L1-L195)

O único import é Vitest. RateLimiter, limites e todas as operações são definidos dentro do teste; os casos de 300/301, janelas, isolamento e cleanup exercitam exclusivamente essa classe local. As fronteiras documentam intenção mas não importam nem verificam o rate limiter produtivo do webhook. Trata-se de outro locus de teste desconectado na família TC-011; não é prova de limitação em Edge Functions distribuídas.

## [src/lib/__tests__/runGuard-simulation.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/runGuard-simulation.test.ts#L1-L314)

Importa createRunGuard real e usa promises controladas e seeds determinísticas. Verifica última execução, invalidate, sequência equivalente a double invoke e IDs crescentes, com controles negativos sem guarda e sem gate de chave ativa. O objeto sob teste é real, mas state, loader, activeKey e o gate da segunda família são um modelo local. Os muitos cenários finitos não montam painéis consumidores nem provam que cada painel usa essas proteções; portanto não afastam corridas como QUE010 em outro hook.

## [src/lib/__tests__/scenario-simulation.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/scenario-simulation.test.ts#L1-L316)

Importa funções produtivas de churn, classificação de tickets, thresholds, formatação WhatsApp e cn, exercitando amostras determinísticas e fronteiras explícitas. Preserva controles úteis de faixa/monotonicidade, formas inválidas, confidence null/zero e percentual, além de escape de payloads e formatação positiva. O vínculo é real: em especial confidence=0 deve permanecer zero, ao contrário da cópia local em AutoTicketClassifier.test.tsx. Os checks de XSS inspecionam strings e um conjunto finito de payloads; não demonstram execução de DOM em navegador nem segurança universal de todos os renderizadores.

## [src/lib/__tests__/serverLogin.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/__tests__/serverLogin.test.ts#L1-L135)

Importa serverLogin real e verifica URL/região, headers e body, tokens, locks 401/423, respostas indisponíveis e timeout com sinal de abort. O teto de 60 segundos é uma expectativa independente da constante produtiva, e o controle de sucesso verifica limpeza do timer. Esses controles são mais fortes que apenas avançar a própria constante. Auth-login, GoTrue e banco são simulados; os números de latência em comentário são históricos e não medidos neste passe. O fallback do chamador não é executado aqui.

## [src/services/__tests__/navigation.service.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/services/__tests__/navigation.service.test.ts#L1-L138)

Importa NavigationService real e verifica grupos de maturidade, IDs únicos, layout full, lista primária, recusa de IDs desconhecidos, papéis e permissão nominal de Multiplix com controles positivos e negativos. O teste valida metadados e funções de decisão, sem montar Sidebar/ViewRouter/rotas. Não demonstra a navegação efetiva nas páginas SLA de PLAT012; a ausência de integrações incompletas nos grupos maduros não certifica todos os itens como implementados.

## [src/test/mocks/tarefas.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/test/mocks/tarefas.ts#L1-L133)

Harness de tarefas fornece spies compartilhados de auth, leitura, escrita, canal, toast/undo e QueryClient sem retry/cache persistente. Usa o createQueryBuilder compartilhado e expõe última leitura para que os consumidores verifiquem filtros; separa resultados de leitura/escrita e permite falhas de mutation. makeTaskRow é fixture com campos e override, não consulta ao esquema. Este arquivo habilita observação nos consumidores, sem afirmar por si só que filtros, rollback ou autorização são efetivamente assertados em todos eles.

## [src/test/setup.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/test/setup.ts#L1-L127)

Setup registra matchers DOM/axe, matchMedia falso e observers vazios, e instala fetch que rejeita hosts supabase.co/in preservando o transporte original para outros destinos. A exceção explícita de WebSocket e os limites do regex/override são mantidos na leitura. O histórico de requisições em comentário não foi reexecutado nem adotado como medição atual. O setup não contém reset global de fake timers; os arquivos com casos dependentes devem cuidar da restauração ou do isolamento configurado. Nenhuma suíte foi iniciada neste passe.

## [tests/contracts/_adv_edge_legacy_producers.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/_adv_edge_legacy_producers.test.ts#L1-L256)

Ratchet lê recursivamente arquivos TS de Edge Functions e fixa contagem 213, três ocorrências e mapa de produtores legados. Outros casos leem fontes e exigem presença de dívida conhecida ou ausência de padrões já corrigidos, incluindo migração para parseJsonObject. É uma medição textual deliberada de dívida, não teste de execução ou alegação de produto aprovado. O stripper por regex e os padrões finitos não constituem parsing semântico completo; passar as assertivas que preservam defeitos não demonstra correção desses defeitos.

## [tests/contracts/_adv_vocabulary-consumers-gaps.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/_adv_vocabulary-consumers-gaps.test.ts#L1-L217)

Artefato adversarial explicitamente mede defeitos/gaps com padrões de fonte e SQL: compara mapas de vocabulário, defaults e consumidores fora do guard, distinguindo migrations históricas e função posterior, com ratchets inversos para correções. A leitura confirma que estes testes foram concebidos como inventário de trabalho, não testes que certificam funcionalidades. As descrições precisam ser confrontadas com consumidores e estado SQL vigente; regex presente sozinho não prova execução ou alcance de todo caso listado.

## [tests/contracts/ai-capabilities.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-capabilities.contract.test.ts#L1-L684)

Importa lazily ai-capabilities real e verifica cinco tipos, base desconhecida, estreitamento de features, ampliação declarada de modalidades e igualdade exata dos conjuntos permitidos. Cobre limites válidos/parciais/inválidos, configurações de forma errada, dados JSON com __proto__/chaves herdadas, e quatro códigos de erro com fronteiras de limites. Os controles positivos e negativos são substanciais e vinculados ao módulo real. Os tipos e fixtures locais expressam o contrato esperado, não cópias da implementação. Declarar capacidade não é executar o adaptador/provedor, nem comprovar que todo chamador fornece necessidade e limites adequados.

## [tests/contracts/ai-central-routing-ratchet.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-central-routing-ratchet.contract.test.ts#L1-L315)

Ratchet lê TS de produção, protege literais antes de remover comentários e verifica import/chamada textual de generateWithRouting, ausência de credenciais/modelo fixos e allowlist explícita de dívida de voz/áudio. Nos dois classificadores de visão exige modalidade e pelo menos duas ocorrências de categoria outros. Os controles de fonte são úteis e preservam dívida declarada. chamadas/blocoParenteses são análise textual, não AST nem execução; contar ocorrências não prova que os catches ou todos os ramos usam a degradação correta. A exclusão de testes considera apenas o sufixo .test.ts.

## [tests/contracts/ai-conversation-analysis-contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-conversation-analysis-contract.test.ts#L1-L134)

Lê o source de ai-conversation-analysis e exige ausência de defaults inventados, normalizadores, validação/envelope, RPC de persistência, campos, tratamento de persistError e ordem textual de revalidação/cancelamento/requestId. É um contrato de origem com padrões concretos, sem importar o handler. Proximidade e ordem textual não provam atomicidade SQL, ausência de efeitos em todos os ramos ou recência sob concorrência; as conclusões operacionais dependem da revisão do handler/RPC.

## [tests/contracts/ai-conversation-summary-contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-conversation-summary-contract.test.ts#L1-L200)

Lê ai-conversation-summary e verifica defaults removidos, ordem dos normalizadores, shape/escala, envelope, conteúdo do payload da RPC e tratamento de erro/cancelamento. O cabeçalho declara que examina a forma do código e não executa o handler Deno. Preserva valor dos ratchets e seu limite: slices/indexOf/regex não são prova de controle de fluxo nem transação executada. Alguns recortes usam delimitadores sem conferir existência individual, exigindo confronto com fonte vigente antes de interpretar resultado como aceite funcional.

## [tests/contracts/ai-fallback-and-test.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-fallback-and-test.contract.test.ts#L1-L403)

Lê ai-proxy/ai-providers e ancora autorização de fallback na conjunção inteira sem disjunção, modo test antes do fallback, destino configurado, corpo de runProviderTest com um dispatch e sem retry, metadados e códigos/status. Há controles textuais mais precisos que mera presença de símbolo. Ainda usa remoção de comentários, balanceamento e janelas por regex, inclusive proximidade de status; não executa pedidos nem comprova compatibilidade, credenciais ou disponibilidade do provedor testado.

## [tests/contracts/ai-generate.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-generate.contract.test.ts#L1-L661)

Combina leitura textual de ai-generate para interface/imports/chamadas/guards/filtros/timeout/logs com import real de ai-routing e ai-capabilities no bloco final. Este último verifica resolução por finalidade, capacidade tools, filtros reservados, política system sem mutação e substituição de modelo. A contagem logs>=retornos e as janelas estruturais não estabelecem cobertura de todos os caminhos de execução nem entrega de registros. O conjunto de quatro provedores é fixture histórica declarada; não é inventário atual do banco. Os testes puros são controles positivos reais, distintos desses limites de análise textual.

## [tests/contracts/ai-image-input.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-image-input.contract.test.ts#L1-L372)

Importa toInlineImage real, injeta Deno.env/fetch e verifica data URL byte a byte, URL autenticada e headers de serviço, encoding de segmentos, MIME, limite por header/corpo/header mentiroso/data URL e maxBytes menor. Cobre 403/404, não imagem/vazio, origem e bucket recusados, travessia, ausência de credencial e erro serializado. As assertivas de ausência de fetch e fronteiras são concretas. Os bytes de fixture não constituem imagem decodificada, e Storage/RLS/pertencimento ao contato ou usuário do chamador não são exercitados por esse helper isolado.

## [tests/contracts/ai-jobs-estados-e-durabilidade.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-jobs-estados-e-durabilidade.contract.test.ts#L1-L786)

Importa módulos reais de estados no front e worker com cliente Supabase falso; verifica sete estados, quatro terminais, todos os 49 pares de transição, rótulos e partial não concluído com controle succeeded. O caso enqueue aciona o wrapper e exige rejeição após tentativa de acesso à infra simulada. As seis funções SQL, UNIQUE, SKIP LOCKED, colunas e rollback são verificados apenas no texto de uma migration; isso não executa locks, leases, expiração nem durabilidade. O caso de enqueue tenta assinaturas plausíveis e não exige identidade do erro lançado. Preserva o mérito da máquina de estados sem estendê-lo à fila inteira.

## [tests/contracts/ai-rate-limit-e-orcamento.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-rate-limit-e-orcamento.contract.test.ts#L1-L825)

Importa guards, budget e despacho reais com Supabase/Deno/fetch simulados. Verifica limite inclusivo, chave por janela, negação 429, falha aberta identificada, reserva permitida/negada/inválida, distinção [] versus null, argumentos settle/release/reconcile, estimativa/chave canônica e integração reserva→despacho→liquidação/liberação. Os controles de chamada e ausência de envio com orçamento negado são concretos. A idempotência da reserva é implementada pelo Map do mock e comprova reenvio estável da chave, sem provar atomicidade SQL ou concorrência; tampouco valida custo faturado externamente ou recuperação de falhas reais do banco.

## [tests/contracts/ai-resilience-prazos-retry.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-resilience-prazos-retry.contract.test.ts#L1-L631)

Importa classifyFailure/withRetry e adaptadores reais; cobre classes de erro, tentativas transitórias/permanentes, teto de chamadas, variação de jitter e abort/ausência de timer. O despacho real é carregado com adaptadores simulados para observar timeout padrão e precedência do chamador. O sinal state_unknown é aceito em qualquer uma de várias formas e não prova sinalização por todos os consumidores. O último caso chama budgetMs=30.000 com callbacks instantâneos e apenas exige tempo<60.000; não demonstra o teto total de 30 segundos com tentativa lenta. Os controles de retry existentes continuam válidos dentro desse alcance.

## [tests/contracts/ai-response-contracts.behavior.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-response-contracts.behavior.contract.test.ts#L1-L178)

Importa schemas/parseModelOutput/envelope e normalizadores reais, verificando saída válida, opcionais ausentes, tipos/faixas/enums inválidos, caminho exato de erro, zero preservado e normalização de legado com controle bruto recusado. Cobre também resumo, três sugestões e confidence de tags. São testes de contrato de dados efetivo, sem duplicar a implementação. O envelope com texto nada foi gravado não verifica efeitos de persistência do handler; banco, renderização e contexto completo de produção não são exercitados aqui.

## [tests/contracts/ai-routing.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-routing.contract.test.ts#L1-L668)

Importa ai-routing real para resolver provedor/modelo, mensagens e filtros, com cenários de ausência/ambiguidade/inativo/finalidade, ordem das linhas, allowlists e listas de segurança pinadas independentemente. O restante lê ai-proxy/ai-providers com regex de fronteira e status. Os controles puros observam o módulo produtivo; regras de modelo como default gpt-4o para google_gemini são a expectativa codificada, sem comprovar compatibilidade externa. Manter política no índice zero não demonstra obediência do modelo. A guarda deliberadamente impossível dentro da interseção allowlist/reservadas é uma falha intencional de sanidade, não tautologia que passe.

## [tests/contracts/ai-vision-classifiers-mock.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-vision-classifiers-mock.contract.test.ts#L1-L814)

Carrega handlers reais de classify-emoji/sticker via Deno.serve capturado, toInlineImage e generateWithRouting reais; simula identidade, banco, fetch duplo de imagem/provedor e logAiUsage. Verifica data URL e multipart, destino/modelo de visão versus texto, falhas de imagem/HTTP/rede, categoria outros e chamadas de auditoria nos cenários enumerados. O encadeamento entre consumidores reais é um controle positivo forte dentro do harness. Auth foi substituída, logAiUsage é spy e Storage/provedor são dublês: não comprova autorização, linha persistida em ai_usage_logs, imagem decodificada nem entrega externa; a cobertura de cenários enumerados não equivale a todos os caminhos possíveis.

## [tests/contracts/ai-vision-modality.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-vision-modality.contract.test.ts#L1-L326)

Importa generateWithRouting real com banco/ambiente/fetch/log simulados. Verifica texto no default, visão sem exigir default, ausência/ambiguidade/inativo com nenhuma chamada, multipart preservado, propósito inválido e chamadas de log nos três desfechos enumerados. O encadeamento de seleção e payload é real dentro do harness, com controles de ausência de envio. Não executa autenticação dos endpoints, imagem/Storage ou inserção do log; a fixture de modelos não é declaração de disponibilidade comercial atual.

## [tests/contracts/ai-vocabulary-consumers.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-vocabulary-consumers.contract.test.ts#L1-L198)

Lê cinco consumidores pinados de vocabulário e verifica imports, ausência de comparações cruas e opções canônicas; os próprios detectores recebem regressões conhecidas e código correto como controles positivos/negativos. Também importa normalizadores reais para legado, canônico e desconhecido. O escopo é a lista explícita de cinco caminhos, não todos os consumidores. As regex de import/comparação não provam renderização ou fluxo de dados completo; a revisão adversarial _adv_vocabulary-consumers-gaps enumera outros consumidores fora desse guard.

## [tests/contracts/ai-vocabulary-parity.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-vocabulary-parity.contract.test.ts#L1-L234)

Importa portas front e canônica e exige identidade de referência para sete exports e igualdade do conjunto de símbolos, impedindo reintrodução de cópia local mesmo com comportamento igual. Arrays e quatro mapas são comparados a especificação literal independente extraída do source. Comparar resultados das duas referências já idênticas é redundante para semântica, mas o objetivo de identidade está corretamente verificado. Os mapas e casos adicionais complementam a prova; não demonstram conformidade de todos os consumidores ou do esquema SQL.

## [tests/contracts/ai-vocabulary.behavior.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ai-vocabulary.behavior.contract.test.ts#L1-L130)

Importa o vocabulário real por front e Edge e executa tabelas independentes de esperado/known para sentimento, urgência e prioridade, incluindo ausência, tipos inválidos, aliases e conversão de urgência em prioridade. As duas entradas são o mesmo módulo por reexport, fato explicitado no teste. Os controles verificam semântica e rejeição de valores inventados; o título conjunto que está no banco compara constante local, sem consultar CHECKs ou o estado do banco.

## [tests/contracts/axe-contatos.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/axe-contatos.contract.test.ts#L1-L28)

Lê ContactCard.tsx e exige um bloco Checkbox e a construção aria-label={. O cabeçalho referencia uma varredura histórica de axe e lista contrastes ainda não corrigidos. Este arquivo não executa axe nem calcula o nome acessível, não verificando o conteúdo interpolado do label ou contraste. É uma trava textual específica, sem demonstrar acessibilidade integral da tela.

## [tests/contracts/contraste-aa-componentes.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/contraste-aa-componentes.contract.test.ts#L1-L290)

Lê tokens.css/accessibility.css e fontes reais, calcula razões com medidor local de luminância e testa parser em fixtures de múltiplos blocos/comentários/aninhamento. Confere warning e texto secundário em claro/escuro, remove padrões de alfa/hardcoded e mede combobox em quatro temas com vínculo textual aos componentes. O próprio contrato preserva a decisão de não alterar a skin e declara o par destructive ainda abaixo de AA; isso não é aprovação global de contraste. As razões derivam de tokens/composição esperada, sem computed style ou navegador real. O parser exato foi introduzido para distinguir .high-contrast de .dark.high-contrast.

## [tests/contracts/contraste-balao-midia.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/contraste-balao-midia.contract.test.ts#L1-L144)

Lê tokens, acessibilidade, AudioMessagePlayer e slider; calcula contraste esperado de texto, ícones, waveform e trilha, com exigências textuais das classes. O limiar 4.4 no alto contraste está explicitamente documentado como exceção autorizada da skin, sem alegar AA pleno. Não há renderização/computed style. O parser usa indexOf do seletor e .high-contrast também encontra .dark.high-contrast, podendo sobrepor a simulação do tema claro com tokens escuros; encaminhado a Infra para confrontar consequência/deduplicação. A exceção autorizada de limiar não foi promovida a defeito.

## [tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ia047-idempotencia-de-efeitos.contract.test.ts#L1-L273)

Lê uma migration, useMyWorkItems, Crm360Tab e talkx-send; exige colunas/índices parciais exatos, adição/rollback, chave no insert, 23505, memória de chaves e claim antes de evoFetch. Esses ratchets fixam construções do contrato, sem executar SQL, concorrência, duplo submit ou efeito do provedor. if not exists não basta para demonstrar replay integral de todas as instruções, e a ordem da primeira ocorrência textual do claim não prova todos os caminhos de envio.

## [tests/contracts/ia051-correlacao-no-caminho-sincrono.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ia051-correlacao-no-caminho-sincrono.test.ts#L1-L126)

Lê chamadas de três componentes, duas do detector de objeções, quatro repasses no servidor e logs do proxy para preservar requestId e recusar os padrões explícitos de identificador derivado de contato. O cabeçalho distingue guarda de origem de comportamento. As fatias por marcadores e verificação de palavras não demonstram correlação persistida em todas as execuções, unicidade do requestId ou ausência de outras formas de dado pessoal; o registrador é revisado separadamente.

## [tests/contracts/ia052-rota-efetiva.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ia052-rota-efetiva.test.ts#L1-L147)

Lê generate, ai-proxy, dois classificadores visuais e usage para preservar campos da rota efetiva, modalidade e fallback. Conta ocorrências e fatia blocos por marcadores; verifica que a declaração de rota antecede registrador, que dois logs awaited do proxy escolhem o provedor efetivo e que os três logs awaited de cada classificador indicam visão. São guardas de origem, sem execução do registrador, persistência ou prova de todos os caminhos. O contador do proxy considera especificamente chamadas awaited e não certifica o fluxo de streaming. Os testes comportamentais reais do roteador fornecem evidência complementar dentro de seus mocks, sem transformar este contrato textual em execução de produção.

## [tests/contracts/ia056-agregacao-no-servidor.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/ia056-agregacao-no-servidor.test.ts#L1-L138)

Lê hook, tabela, painel e uma migration para preservar paginação com range/count, totais vindos do resumo, rótulos de cobertura e agregação SQL com janela semiaberta. Exige grants/revokes específicos e ausência textual de SECURITY DEFINER e de um limite numérico no fim da linha. As assertivas detectam regressões nas construções nomeadas; não consultam uma base com mais de mil linhas, não executam RLS, agregação ou navegação entre páginas. A presença do contrato textual não demonstra todos os limites possíveis da consulta nem durabilidade do dado, e a revisão não inventa defeito apenas por essa fronteira de prova.

## [tests/contracts/messaging-adapter.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/messaging-adapter.contract.test.ts#L1-L253)

Exercita o adapter send e os classificadores/planos reais com fetch controlado: presença antes do envio, endpoint, identificador retornado, 429/503, códigos permanentes, backoff e tetos de tentativas. Cobre respostas GO de destinatário inexistente, sinal de abort encaminhado à chamada e propagação de AbortError. Os casos de política de retentativa incluem resultados calculados diretamente, sem executar agendador, fila durável ou dead letter. O helper devolve a última Response quando esgota as respostas previstas; o contexto é uma fronteira de IO simulada, sem envio real, compatibilidade universal do provedor ou relógio operacional.

## [tests/contracts/notification-sound-persistence.contract.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/tests/contracts/notification-sound-persistence.contract.test.ts#L1-L125)

Lê fontes reais para preservar a remoção de soundType legado, leitura/gravação das cinco colunas de tipo, tipo correto para SLA/meta e preview do painel. Confere a remoção da util sem volume e os imports/chamadas com tipo persistido e soundVolume em uma lista explícita de consumidores. São guardas textuais e de existência, sem renderização, gravação no banco, reload ou reprodução de áudio. A última assertiva percorre linhas de seis arquivos conhecidos; o título todos os caminhos não é inventário dinâmico de qualquer consumidor futuro, e não cobre por si só persistência dos três booleanos de categorias identificados em PLAT003.

