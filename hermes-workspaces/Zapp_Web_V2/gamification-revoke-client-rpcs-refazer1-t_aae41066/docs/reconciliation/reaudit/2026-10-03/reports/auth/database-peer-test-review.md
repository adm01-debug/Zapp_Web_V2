# Revisão semântica peer — testes reservados da frente Database

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. Estado: **COMPLETE**. Atualizado em 2026-10-04T06:22:10.187423+00:00.

Alocação: 52 arquivos / 4169 linhas. Leitura integral concluída: 52; parcial: 0; pendente: 0. Linhas realmente lidas: 4169.

Esta é revisão do código dos testes, não execução ou declaração de que a suíte passa. Assertions e mocks só sustentam o contrato que efetivamente exercitam. Ausência de teste genérico não gera um achado novo por arquivo.

## 1. `src/components/ui/__tests__/slider.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 44]]; total: 44 linhas; blob: `19f94021cc290eea09bfeb57b2ee273db085c75c`.

**Contrato exercitado:** Slider real renderiza um thumb por valor, fallback de um sem valores e labels string/array por thumb.

**Fixtures e substituições:** ResizeObserver vazio apenas quando ausente; props arrays e DOM de teste.

**Controles positivos:** Range de dois valores é pareado aos dois casos single-thumb; labels distintos conferidos.

**Limites e lacunas concretas:** Não arrasta/aciona teclado nem verifica callback, limites, ordenação ou medição/layout real.

## 2. `src/hooks/__tests__/playTeamChatSound.behavior.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 79]]; total: 79 linhas; blob: `d2fda7f4e1060072bd1fce954f2be9d0464e13e8`.

**Contrato exercitado:** Função produtiva playTeamChatSound escala ganhos de três tons por volume100/40/default70.

**Fixtures e substituições:** AudioContext falso captura rampas, hooks dependentes mock e fake timers para tom atrasado.

**Controles positivos:** Volume40 exige0.08/0.06 e exclui ganhos fixos0.2/0.15; default70 tem valores próprios.

**Limites e lacunas concretas:** Não mede som audível, mute/quiet-hours/browser autoplay ou consumidor passando volume atualizado. Contexto sempre running; ausência/suspensão/falha da API não testadas.

Relacionados, sem nova contagem: R2-AUTH-047, R2-PLAT-003.

## 3. `src/hooks/__tests__/strictModeAlcance.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 118]]; total: 118 linhas; blob: `b27750c2b6071fde324010074f32d5abcbcf6232`.

**Contrato exercitado:** Monta useSupabaseRealtime e useVisiblePolling reais sob React.StrictMode e coleta console.error; realtime exige que channel tenha sido chamado. Controle negativo cria intervalo sem cleanup e espera erro do React.

**Fixtures e substituições:** Client Supabase real com fetch[]/FakeWS, sem rede; timers reais de40ms no helper; console.error coletado temporariamente e intervalos do controle negativo limpos em finally.

**Controles positivos:** Spy channel evita caso realtime totalmente inerte; controle negativo92–115 existe e exige ao menos um erro, sem inferir seu resultado nesta leitura.

**Limites e lacunas concretas:** Ausência de console.error não mede recursos vivos/cleanup; polling69–78 não observa callback/timer específico. Nota76–77 menciona caso enabled=false, mas nenhum caso assim existe no restante deste arquivo. 80–90 explicitamente documenta limitação do medidor e só assert89 expect(true).toBe(true). Não é medição nem prova positiva de StrictMode. O teste negativo depende da emissão de console.error pelo React, não contagem de recurso vazado; nenhuma suíte foi executada.

**Adjudicação:** Locus informado ao root para não tratar comentários de medição como validação realizada nesta auditoria.

## 4. `src/hooks/__tests__/useActionFeedback.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 113]]; total: 113 linhas; blob: `8de4374b8276a8b67ec1718e7f864d332dc6242f`.

**Contrato exercitado:** Hook real expõe funções, chama toast em success/error e usa destructive no erro; título customizado e texto de ação na descrição são conferidos.

**Fixtures e substituições:** useToast falso devolve toast spy com dismiss/update spies; onClick da ação nunca disparado.

**Controles positivos:** 57–66 confere variante de erro e69–82 título explicitamente enviado.

**Limites e lacunas concretas:** Existência de withFeedback em109–112 não exercita promise/erro/loading.85–98 exige label Desfazer na descrição, não botão acionável ou callback; não prova desfazer. Sucesso só verifica toast chamado, sem conteúdo ou resultado da operação.

## 5. `src/hooks/__tests__/useAgentGamification.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 114]]; total: 114 linhas; blob: `623d0b4f20d25a2bad4f23684763e7f955cdbf6b`.

**Contrato exercitado:** Hook real termina loading com fixtures e expõe achievements/addXp; constantes de seis conquistas têm valores esperados e unicidade.

**Fixtures e substituições:** React Query isolado, Auth usuário fixo/ausente e Supabase por tabela com XP500/level3 e uma conquista; writes sempre sucesso.

**Controles positivos:** 94–112 importa constantes produtivas e compara seis valores e ausência de duplicatas.

**Limites e lacunas concretas:** Caso 'returns null stats when no user'82–86 só espera isLoading=false, sem assertion stats=null. Lista de conquistas só toBeDefined; addXp só typeof. Não credita XP, verifica perfil/filtros/RLS ou idempotência/recompensas reais.

Relacionados, sem nova contagem: R2-AUTH-042, R2-AUTH-043.

## 6. `src/hooks/__tests__/useBusinessHours.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 73]]; total: 73 linhas; blob: `e00f7b4962e292abeb8f9c3d30bd9819f9050606`.

**Contrato exercitado:** useBusinessHours real recebe dados, cria sete defaults com lista vazia e mantém domingo fechado da fixture.

**Fixtures e substituições:** React Query real, Supabase select/eq/order/upsert e log/toast falsos; duas linhas wc1.

**Controles positivos:** Vazio exige sete dias; domingo da fixture is_open=false é conferido.

**Limites e lacunas concretas:** Não confere eq connectionId, dias duplicados/mudança de conexão, erro, save/upsert ou execução de mensagens por horário. Defaults não provam automação operacional.

Relacionados, sem nova contagem: R2-AUTH-049.

## 7. `src/hooks/__tests__/useChatKeyboardNavigation.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 117]]; total: 117 linhas; blob: `e9c9df6e6167da282b052bb72ca57def8b86ad6e`.

**Contrato exercitado:** Hook real seleciona primeira/última mensagem por setas/j/k/Home/End, entra/sai do modo por Escape, respeita enabled:false e remove listener no unmount; catálogo de sete shortcuts tem texto.

**Fixtures e substituições:** KeyboardEvent diretamente no window com messagesCount10, sem UI de mensagens ou elementos editáveis.

**Controles positivos:** Disabled não seleciona; Escape zera seleção e modo; cleanup tem spy específico de keydown.

**Limites e lacunas concretas:** 91–97 intitula não ficar abaixo de0, mas assert96 só exige <=9 (aceitaria negativo). Não cobre clamp inferior real/nenhuma mensagem, mudança de conversa/lista, foco editável ou callback de ações. Listeners no window não provam escopo visual.

## 8. `src/hooks/__tests__/useConversationAnalyses.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 121]]; total: 121 linhas; blob: `023b1837902ce3a0db1af6ee9e6cefdb17c66d4c`.

**Contrato exercitado:** Hook real carrega duas análises, fica vazio com contato null, expõe erro retornado e getLatestAnalysis devolve primeiro elemento; expõe funções de salvar/refetch/trend.

**Fixtures e substituições:** Auth/getUser/profile e Supabase chains falsos; mockAnalyses entrega a1 de01jan antes de a2 de02jan, ignorando order do builder.

**Controles positivos:** 81–94 força erro retornado e exige campo error, não só estado vazio.

**Limites e lacunas concretas:** 97–107 não chama saveAnalysis/refetch;116–119 'trend returns a value' só typeof função. getLatest exige a1 apesar da data mais antiga da fixture, portanto não prova ordenação real. Sem A→B tardio, autorização/RLS, gravar ou tendência calculada.

## 9. `src/hooks/__tests__/useCustomShortcuts.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 95]]; total: 95 linhas; blob: `7db1196734acebdeaa6d41344f68719c03ff1f6c`.

**Contrato exercitado:** Importa useCustomShortcuts real; verifica catálogo padrão, send-message, campos/categorias, IDs únicos e filtro chat; resetAllShortcuts executado mantém customKey ausente.

**Fixtures e substituições:** localStorage limpo por caso; logger substituído; resetAll parte de defaults sem personalização prévia.

**Controles positivos:** Valida conteúdo e unicidade do catálogo real, além de expor funções de atualização/reset/conflito.

**Limites e lacunas concretas:** updateShortcut, resetShortcut e checkConflict são verificados só como funções. Reset não parte de valor customizado; não exercita conflito, persistência, indisponibilidade de storage ou execução dos atalhos.

**Adjudicação:** Sem achado novo: delimita catálogo e reset inicial, sem provar fluxo completo de personalização.

## 10. `src/hooks/__tests__/useDebounce.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 108]]; total: 108 linhas; blob: `3b649fb581767ecd303e1e4eb5e6f36b91b91942`.

**Contrato exercitado:** Hook real adia callback 500ms, reinicia prazo após nova chamada, encaminha argumentos e retém apenas argumentos da última chamada rápida.

**Fixtures e substituições:** Timers falsos Vitest; callback vi.fn; renderHook/act.

**Controles positivos:** Asserções antes/depois do prazo e de quantidade/argumentos distinguem execução imediata e múltipla indevida.

**Limites e lacunas concretas:** Não muda callback/delay por rerender nem desmonta com timeout pendente; não demonstra cleanup ou identidade do callback atualizado.

## 11. `src/hooks/__tests__/useDeepLinks.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 73]]; total: 73 linhas; blob: `e6f340f5c10bd65d621482305cd3959271c64202`.

**Contrato exercitado:** useDeepLinks real usa inbox/default customizado sem hash; lê #contacts, atualiza estado/hash via setter, reage a hashchange e remove listener na desmontagem.

**Fixtures e substituições:** window.location.hash reiniciado por caso; evento HashChangeEvent explícito; spy removeEventListener.

**Controles positivos:** Inclui hash vazio, sequência de atualizações e cleanup de listener.

**Limites e lacunas concretas:** Contrato de hash isolado; não monta roteador/consumidor ativo, autorização de rota ou combinação com query params. Não prova integração com navegação principal.

## 12. `src/hooks/__tests__/useDeviceDetection.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 113]]; total: 113 linhas; blob: `4013d522ec57bd1c8cc2d9b9f5f6038bb97b2380`.

**Contrato exercitado:** useDeviceDetection real inicia loading com coleções vazias/currentDeviceId nulo; com usuário consulta user_devices e user_sessions e encerra loading.

**Fixtures e substituições:** Auth u1, getSession com token, getUser nulo, invoke retorna device_id d1; builders retornam listas vazias e mutações sem erro.

**Controles positivos:** Verifica tabelas efetivamente consultadas pelo hook no caso autenticado.

**Limites e lacunas concretas:** trustDevice/removeDevice/endSession/endAllOtherSessions/refetch só têm typeof verificado. Caso sem usuário exige apenas devices vazio, sem assegurar ausência de chamadas. Não testa filtros, erro, troca de usuário nem revogação real de sessão Auth.

Relacionados, sem nova contagem: R2-AUTH-004.

## 13. `src/hooks/__tests__/useDownloadPermission.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 109]]; total: 109 linhas; blob: `0553c3d9705a0160ad04f120540e2ef85c126a30`.

**Contrato exercitado:** Hook real traduz can_download true/false/null e perfil ausente/erro para permissão esperada; seleciona can_download e filtra user_id user-123.

**Fixtures e substituições:** React Query novo por caso com retry false; Auth substituído; SDK select/eq/single controlado.

**Controles positivos:** Inclui fallback false diante de erro e confirma filtro de identidade na consulta.

**Limites e lacunas concretas:** Nenhum PATCH de profiles ou RLS real: não demonstra integridade do campo can_download contra atualização própria. Caso sem usuário só verifica false, sem spy de ausência da query; sem troca de identidade/cache.

Relacionados, sem nova contagem: R2-AUTH-027.

## 14. `src/hooks/__tests__/useDuplicate.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 81]]; total: 81 linhas; blob: `d4a495647c57091a0b019aacbc12621d4e706374`.

**Contrato exercitado:** useDuplicate real monta e expõe mutate/mutateAsync com flags iniciais false; aceita opções sem erro de montagem.

**Fixtures e substituições:** Supabase insert/select/single sempre devolveria novo item; toast substituído; QueryClient isolado.

**Controles positivos:** Montagem real do hook e contrato inicial da mutation.

**Limites e lacunas concretas:** Nenhum caso chama mutate. Títulos 47 e 55 sobre excludeFields e 63 sobre transformData apenas verificam isPending=false; não provam remoção de campos, transformação, INSERT, invalidação ou recuperação de erro.

**Adjudicação:** Limite concreto de evidência dos títulos, sem novo defeito de produto.

## 15. `src/hooks/__tests__/useGlobalSettings.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 60]]; total: 60 linhas; blob: `4ca608cded3a198dccf85c2d58f89b2781ef15b0`.

**Contrato exercitado:** useGlobalSettings real consulta global_settings, encerra loading e getSetting de chave desconhecida retorna null.

**Fixtures e substituições:** SDK retorna theme/language; update/insert sempre sem erro; logger substituído.

**Controles positivos:** Consulta real do hook e fallback de chave ausente.

**Limites e lacunas concretas:** getSetting conhecido não é assertado; update/add apenas typeof, sem persistência, RLS, consumidor operacional ou erro. Não prova que valores gravados alteram o sistema.

Relacionados, sem nova contagem: R2-AUTH-030.

## 16. `src/hooks/__tests__/useGoalNotifications.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 107]]; total: 107 linhas; blob: `5cef94d69377a85a4c0302be21db35bf9f86ea6b`.

**Contrato exercitado:** useGoalNotifications real não consulta sem usuário, consulta profiles na montagem autenticada, registra intervalo 300000ms e limpa intervalo ao desmontar; perfil ausente resolve sem throw.

**Fixtures e substituições:** Timers falsos; usuário u1/perfil p1/listas vazias; sons e browser notifications desativados por mock; toast/logger/SDK substituídos.

**Controles positivos:** Gate de usuário e cleanup de intervalo têm asserts de chamada, além do intervalo exato.

**Limites e lacunas concretas:** Nenhuma meta/progresso não vazio ou tick avançado; não prova limiares, deduplicação, insert, horário silencioso, som/browser ou conclusão tardia após logout. checkGoalProgress só typeof salvo ramo perfil ausente.

## 17. `src/hooks/__tests__/useInfiniteScroll.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 98]]; total: 98 linhas; blob: `235983bd96d0cc1c61a59bdce551370499896eeb`.

**Contrato exercitado:** useInfiniteScroll real monta em loading e expõe setLoadMoreRef/totalLoaded com tipos esperados; aceita opções no render.

**Fixtures e substituições:** QueryClient isolado; SDK encadeado sempre devolveria dois itens; nenhuma observação real de interseção.

**Controles positivos:** Montagem do hook produtivo com configuração padrão e variantes.

**Limites e lacunas concretas:** Não aguarda dados nem chama setLoadMoreRef/load seguinte; pageSize/orderBy/filters/select apenas result definido, sem verificar argumentos SDK. Não prova paginação, fim, deduplicação, filtro, erro ou totalLoaded correto.

## 18. `src/hooks/__tests__/useIsMobile.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 87]]; total: 87 linhas; blob: `40cb0eb8104cb77e2aecf1e196154ce823eb9cfc`.

**Contrato exercitado:** useIsMobile real distingue 767/768 e outras larguras; instala/remove listener change e reage a callback com innerWidth alterado.

**Fixtures e substituições:** matchMedia sintético sempre matches=false, spies de listener; innerWidth explicitamente definido por caso.

**Controles positivos:** Teste exato da fronteira e transição desktop para mobile, não apenas tipos.

**Limites e lacunas concretas:** Evento de matchMedia chamado manualmente; não mede viewport/browser/layout real ou SSR. Não valida query passada a matchMedia.

## 19. `src/hooks/__tests__/useKeyboardShortcuts.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 103]]; total: 103 linhas; blob: `21404144fc10cb375d4e99a424b0374514f086aa`.

**Contrato exercitado:** useKeyboardShortcuts real dispara por tecla e Ctrl/Shift/Alt; rejeita Ctrl ausente e enabled=false; case-insensitive e cleanup de keydown.

**Fixtures e substituições:** KeyboardEvent no window; ações vi.fn; toast substituído.

**Controles positivos:** Inclui eventos positivos e negativos para modificador/disabled, além de quantidade de callback.

**Limites e lacunas concretas:** Não foca input/contenteditable, não testa modificadores extras, Meta, repeat, preventDefault ou integração com conflitos/customização.

## 20. `src/hooks/__tests__/useLoadingState.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 98]]; total: 98 linhas; blob: `4fb6e7186e172976f9c7ff6093957aae1c2f8b31`.

**Contrato exercitado:** Hook real transita idle/loading/success/error e reset; withLoading chama async; rejeição retorna undefined e deixa isError true.

**Fixtures e substituições:** Callbacks resolvidos/rejeitados vi.fn; hook real; logger real para catch defensivo.

**Controles positivos:** Ramo de rejeição verifica retorno e estado, de modo que o catch defensivo não torna a asserção vazia.

**Limites e lacunas concretas:** Sucesso async só verifica callback chamado, sem retorno/mensagens/estado final; não mede concorrência de duas operações ou unmount.

## 21. `src/hooks/__tests__/useMFA.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 92]]; total: 92 linhas; blob: `9176975d6dec577a21733be9902fab687deef251`.

**Contrato exercitado:** useMFA real chama enroll TOTP com friendlyName, challenge e verify com IDs/código, unenroll e fetchFactors atualiza enabled com fator verified.

**Fixtures e substituições:** Supabase mfa inteiramente simulado; AAL sempre aal1/aal1; fator e desafio sintéticos; insert/toast/logger mockados.

**Controles positivos:** Contrato concreto de argumentos SDK em cadastro/verificação/remoção, e estado após fatores.

**Limites e lacunas concretas:** Somente sucesso; não testa falhas, AAL2 requerido nem montagem/gate de login/rotas. Existência funcional do hook não contradiz ausência de desafio obrigatório no consumidor AUTH003; sem autenticação real.

Relacionados, sem nova contagem: R2-AUTH-003.

## 22. `src/hooks/__tests__/useNotifications.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 116]]; total: 116 linhas; blob: `c34cefee1642ee7e54a13c6f56b8387584a9080d`.

**Contrato exercitado:** useNotifications real carrega duas notificações e calcula um unread; sem usuário começa vazio; erro devolvido encerra loading.

**Fixtures e substituições:** SDK query, update e canal realtime substituídos; Auth u1; duas fixtures uma lida e outra não.

**Controles positivos:** Contador inicial é verificado com fixture mista, não só tipo.

**Limites e lacunas concretas:** Não executa markAsRead/markAllAsRead, callbacks realtime ou cleanup; não testa decremento duplicado. Erro só exige loading=false, sem verificar exposição/feedback/retry; query/filtro user não assertados.

Relacionados, sem nova contagem: R2-PLAT-002.

## 23. `src/hooks/__tests__/useParallax.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 96]]; total: 96 linhas; blob: `0a0f5f68f4642af9a0abd8a5b661566688959f31`.

**Contrato exercitado:** Hooks reais parallax/mouse inicializam zero e registram/removem listeners; getTransform distingue translateY/X; smoothScroll em alvo ausente não lança.

**Fixtures e substituições:** Spies de add/removeEventListener no ambiente de teste; nenhum scroll/mousemove real disparado, nenhum elemento de destino criado.

**Controles positivos:** Cleanup e registro passivo têm argumentos conferidos.

**Limites e lacunas concretas:** Speed/intensity customizados só verificam zero inicial; offset smoothScroll não mede posição pois alvo inexiste. Não prova movimento, progress/velocity, animação/rAF ou layout browser.

## 24. `src/hooks/__tests__/usePushNotifications.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 97]]; total: 97 linhas; blob: `114f1cfb22760d3e628dcbe7379fabee4979aa7e`.

**Contrato exercitado:** usePushNotifications real expõe API e estado; com feature desabilitada não toca serviceWorker.ready e operações retornam false/null imediatamente.

**Fixtures e substituições:** ServiceWorker.ready getter spy, PushManager classe fake, toast/logger substituídos; caminho disabled da configuração real.

**Controles positivos:** Casos 59–96 invocam request/subscribe/unsubscribe/showNotification e comprovam ausência de espera no SW.

**Limites e lacunas concretas:** Não valida feature habilitada, inscrição real, servidor VAPID, push entregue ou permissões browser; maioria inicial só verifica API, mas casos disabled têm contrato efetivo.

## 25. `src/hooks/__tests__/useSLANotifications.behavior.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 59]]; total: 59 linhas; blob: `ac22083a12013c6670b5795d13c2f700e1756640`.

**Contrato exercitado:** Callback realtime registrado pelo hook SLA real chama playNotificationSound(sla_breach,alert,60) em nova violação; cala com flag falsa ou breach já marcado.

**Fixtures e substituições:** alertMocks/alertBehaviorTestKit injetam settingsCfg/callbacks/player; fixture old/new de first_response_breached.

**Controles positivos:** Casos distinguem transição nova, repetida e alerta desligado.

**Limites e lacunas concretas:** Valores são injetados no kit, não gravados/lidos via painel/DB: título persistidos não prova persistência PLAT003. Sem player audível, realtime real ou conclusão após unmount.

Relacionados, sem nova contagem: R2-PLAT-003.

## 26. `src/hooks/__tests__/useScreenProtection.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 59]]; total: 59 linhas; blob: `fcaad14aec26a1eff4d415eed9d0392dcc7455a7`.

**Contrato exercitado:** useScreenProtection real monta e recebe alguns eventos sintéticos sem throw síncrono observado.

**Fixtures e substituições:** Auth fixo user-1; KeyboardEvent cancelável e Event contextmenu; input criado/removido.

**Controles positivos:** Montagem do hook de produção, porém sem assertion do seu efeito protetivo.

**Limites e lacunas concretas:** PrintScreen20–25 calcula prevented mas só verifica tipo de key. Ctrl+P28–32 e Ctrl+S35–39 só verificam key. Input42–50 não dispara evento e só verifica tagName. Contextmenu53–57 só verifica event.type. Nenhum teste prova bloqueio/permissão anunciado pelo título ou captura de tela real.

**Adjudicação:** Locus comunicado ao root para família GOV003, sem novo finding Auth.

## 27. `src/hooks/__tests__/useSearch.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 73]]; total: 73 linhas; blob: `21e1611b7386969611185d322f0a7b7520eb9a41`.

**Contrato exercitado:** useSearch real inicia com results vazio/isLoading false/hasResults false e expõe setters.

**Fixtures e substituições:** QueryClient novo, SDK or/limit/order de lista vazia; logger substituído.

**Controles positivos:** Estado inicial real do hook.

**Limites e lacunas concretas:** Não chama setSearchTerm nem clearSearch; não testa debounce, expressão or/escaping, resultado, erro, filtro por identidade ou corrida de buscas.

## 28. `src/hooks/__tests__/useServiceWorker.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 89]]; total: 89 linhas; blob: `ca7fb5bc58bafc06b29992a01ff7789bd2028c13`.

**Contrato exercitado:** useServiceWorker real lista/desregistra SW ao montar e exclui cache whatsapp-crm-v2, preservando other-cache; ausência de API não lança na montagem.

**Fixtures e substituições:** ServiceWorker/cache APIs artificiais; unregister resolve true; timers falsos e microtasks drenadas.

**Controles positivos:** Asserts positivos e negativos para exclusão seletiva de cache.

**Limites e lacunas concretas:** Sem SW/browser real, rejeição de unregister/cache, controller ativo ou efeitos de reload. Caso indisponível só captura throw síncrono.

## 29. `src/hooks/__tests__/useTheme.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 83]]; total: 83 linhas; blob: `601266fc6e3b787ba975d6c4facdf1d7ecdd974f`.

**Contrato exercitado:** useTheme real usa system por padrão, aplica dark/class/colorScheme, persiste/lê localStorage e compartilha mudança entre instâncias; toggle/isDark conferidos.

**Fixtures e substituições:** Storage e documentElement reiniciados; ambiente DOM de teste; hook produtivo importado.

**Controles positivos:** Efeitos no DOM/storage e propagação entre duas instâncias, além de estado local.

**Limites e lacunas concretas:** Não simula alteração de prefers-color-scheme, evento storage entre tabs, valor inválido/null ou storage indisponível; não prova contraste visual.

## 30. `src/hooks/__tests__/useTypingPresence.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 66]]; total: 66 linhas; blob: `f5a7d40535c8ee5b6fd1363a93b2b145861fe996`.

**Contrato exercitado:** useTypingPresence real monta com usuários digitando vazios, contato não digitando e funções start/stop expostas; aceita ausência de currentUserId.

**Fixtures e substituições:** Canal on/subscribe/track/untrack/unsubscribe e removeChannel substituídos; timers falsos não avançados.

**Controles positivos:** Estado inicial do hook produtivo conferido.

**Limites e lacunas concretas:** Nenhum start/stop, callback presence, track, timeout ou cleanup é executado/assertado; não prova presença, isolamento de conversa/usuário ou expiração.

## 31. `src/hooks/__tests__/useUndoableAction.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 79]]; total: 79 linhas; blob: `07250c857e955e575a8e524458be11877342420e`.

**Contrato exercitado:** useUndoableAction real inicia idle e execute chama action tanto no sucesso quanto na rejeição.

**Fixtures e substituições:** Toast fake com ID; action/undoAction vi.fn; timers falsos, logger no catch defensivo.

**Controles positivos:** Callback real de execute é exercitado e ação é observada.

**Limites e lacunas concretas:** Não executa undoAction/cancelPendingAction nem avança duração. Ramo de falha57–73 engole qualquer rejeição e só exige action chamada, sem provar feedback/estado/retorno. Cleanup75–78 desmonta sem ação pendente e só verifica não throw.

## 32. `src/hooks/__tests__/useUrlFilters.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 100]]; total: 100 linhas; blob: `cee0e526de2326ac8e9094bda3238b35ee008969`.

**Contrato exercitado:** useUrlFilters real interpreta status/tags/agent/datas/q, defaults e status vazio; hasActiveFilters reage a status. Set/clear chamam setter do router.

**Fixtures e substituições:** useSearchParams substituído por URLSearchParams mutável e setter spy que não atualiza URL; reset por caso.

**Controles positivos:** Parsing de cada campo e defaults concretos.

**Limites e lacunas concretas:** Não verifica argumentos de setSearchParams, round-trip, preservação de parâmetros alheios, atualização no router ou aplicação dos filtros ao consumidor/DB.

## 33. `src/hooks/__tests__/useVersions.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 103]]; total: 103 linhas; blob: `4b450ac0abf656cb969441edead1a561d4de4499`.

**Contrato exercitado:** useVersions real carrega duas versões e considera primeira v2 a atual; lista vazia resulta currentVersion undefined; erro lançado encerra loading.

**Fixtures e substituições:** QueryClient isolado; SDK ignora filtros/order e retorna fixture já ordenada; update fake sem erro.

**Controles positivos:** Conteúdo não vazio e estado vazio têm asserts específicos.

**Limites e lacunas concretas:** Teste no-fetch61–64 só verifica loading=false, não ausência de query. restoreVersion só typeof; não testa update, invalidação, identidade, RLS ou erro exposto. Fixture pré-ordenada não valida ordenação solicitada.

## 34. `src/hooks/chat/__tests__/useConversationHistoryTimeline.janela.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 87]]; total: 87 linhas; blob: `c512a3c5e9e2e365858cc7d0eebdbf7195f76923`.

**Contrato exercitado:** Hook timeline real solicita mesma janela de calendário em cinco tabelas: 7 dias desde24/09 e30 desde01/09 para30/09 22:30 local; período0 não chama gte.

**Fixtures e substituições:** Relógio falso; SDK grava gte por tabela e devolve listas vazias; expected usa helpers localDay reais/date-fns.

**Controles positivos:** Verifica valor ISO e conjunto exato de cinco fontes, cobrindo regressão168h versus dias de calendário.

**Limites e lacunas concretas:** Não testa período90, passagem do tempo sem remount, DST, erro de uma fonte, mesclagem/paginação ou filtro contato; SDK não aplica SQL/RLS.

## 35. `src/hooks/chat/__tests__/useFilesInfiniteScroll.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 94]]; total: 94 linhas; blob: `6fc3faec1c1aac499534b8083eaba0564799d7bd`.

**Contrato exercitado:** useFilesInfiniteScroll real observa sentinela e chama load só na interseção quando disponível; não carrega em isFetching, não cria observer sem hasMore e desconecta no unmount.

**Fixtures e substituições:** IntersectionObserverStub guarda callback/elementos; div sem layout; chamadas manuais de interseção.

**Controles positivos:** Asserts de ausência de chamada e disconnect complementam caminho de sucesso.

**Limites e lacunas concretas:** Não mede geometria/browser, callback tardio depois de disconnect ou rerender que altera flags; não testa query/página real.

## 36. `src/hooks/chat/__tests__/useFilesSelection.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 110]]; total: 110 linhas; blob: `5ed1387cec03456bcc005a1a1f14adeaac5ef711`.

**Contrato exercitado:** useFilesSelection real entra/sai, alterna IDs, seleciona recorte visível, preserva seleção fora do filtro, limpa ao trocar contato e remove só ID solicitado; storage permanece vazio.

**Fixtures e substituições:** Hook importado diretamente; arrays56/2 itens e rerenders de contato/filtro; localStorage real do ambiente limpo.

**Controles positivos:** Transições relevantes entre contatos/filtros são executadas e contagens/IDs/modo assertados; remove inexistente é inócuo.

**Limites e lacunas concretas:** Frase ação que falhou72 simula só rerender com array novo, não falha de mutação. Não cobre autorização, download/exclusão reais nem troca de usuário mantendo contato.

## 37. `src/hooks/system/useDebounce.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 57]]; total: 57 linhas; blob: `fdc225df28ca0fc9186ce1e031dc78d7858f7cab`.

**Contrato exercitado:** useDebounce real adia500ms, transmite argumento e substitui duas chamadas anteriores pela terceira.

**Fixtures e substituições:** Timers falsos, callbacks vi.fn; afterEach usa restoreAllMocks, sem useRealTimers neste arquivo.

**Controles positivos:** Asserts antes do prazo e quantidade/argumento final.

**Limites e lacunas concretas:** Sem unmount pendente, rerender de callback/delay ou consumidor; não executado para verificar isolamento de timer global entre arquivos. Complementa mas não amplia o contrato de ciclo de vida do outro useDebounce.test.

## 38. `src/hooks/system/useNavigationHistory.test.tsx`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 71]]; total: 71 linhas; blob: `5ba9aa2a3e6cd6c2c112c8b318d5cb4fcb5ba8cd`.

**Contrato exercitado:** Duas instâncias reais de useNavigationHistory sincronizam currentView em navigateTo e goBack, disparados por botões do harness.

**Fixtures e substituições:** Harness Navigator/Observer, fireEvent click, URL restaurada via history.replaceState; sem mock do hook.

**Controles positivos:** Observação de segunda instância comprova efeito compartilhado, além da instância autora.

**Limites e lacunas concretas:** Comentário inclui goForward, mas nenhum caso o dispara; não monta ActiveCallBar/mainrouter, history externo/popstate, autorização ou querypreservation.

## 39. `src/hooks/team-chat/__tests__/rls-contract.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 75]]; total: 75 linhas; blob: `48a8e147aceb6053a60f4e0967e65dcebc15fffd`.

**Contrato exercitado:** Somente coerência de objetos e listas constantes definidos neste teste: campos, status literal, strings e data ISO parseável.

**Fixtures e substituições:** Fixtures manuais de team_messages/department_invites; nenhum import produtivo, SQL, SDK ou autenticação.

**Controles positivos:** Documenta shape pretendido das duas fixtures; não há controle de policy real.

**Limites e lacunas concretas:** Título RLS contract não testa RLS, schema, FK, convite expirado ou acesso por membro. status defaults to pending apenas confirma literal definido na fixture.

**Adjudicação:** Mantém família prévia de testes Team Chat desconectados; sem nova contagem.

Relacionados, sem nova contagem: TC-011.

## 40. `src/lib/__tests__/audit.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 72]]; total: 72 linhas; blob: `c6f396de36a3b1fdb1704d91773e956a793698ad`.

**Contrato exercitado:** logAudit real mapeia action/entity/details/user_agent ao RPC log_audit_event, trata erro retornado sem throw e usa undefined/null nos opcionais.

**Fixtures e substituições:** RPC e logger fake; nenhum banco, Auth ou tabela audit_logs.

**Controles positivos:** Asserts de payload real, inclusive metadados opcionais.

**Limites e lacunas concretas:** Não testa promise rejeitada, resultado persistido, autorização/actor real ou consumidor; undefined no objeto mock não prova DEFAULT NULL na serialização/SQL.

## 41. `src/lib/__tests__/e2e-supabase-env.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 91]]; total: 91 linhas; blob: `41f2d4064dee917ca27b628a8381e9cd4adea346`.

**Contrato exercitado:** Código do teste pretende importar fixture real em processo bun isolado e comparar precedência .env.production/E2E overrides e ignorar VITE; normaliza override branco.

**Fixtures e substituições:** spawnSync bun com ambiente clonado e quatro variáveis removidas; expected lê .env.production e compara digest MD5 truncado da publishable key.

**Controles positivos:** Overrides dedicados e variáveis ignoradas são casos distintos; chave não é impressa diretamente no stdout do subprocesso.

**Limites e lacunas concretas:** Nesta auditoria apenas código lido: nenhum subprocesso executado e nenhum .env/valor secreto aberto. Não prova conectividade, autorização ou que bun/arquivo estejam disponíveis; cobertura limitada à seleção de configuração, não segurança do ambiente.

## 42. `src/lib/__tests__/emailAttachments.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 23]]; total: 23 linhas; blob: `4cdeb6eba565996e3fd7d67efe9117a4d6e84b23`.

**Contrato exercitado:** Helpers reais aceitam anexo pequeno, rejeitam limite25MB+1 e CRLF no nome; somam original+local; normalizam base64url com padding.

**Fixtures e substituições:** File/Uint8Array sintéticos e constante limite importada; nenhuma API/rede.

**Controles positivos:** Teste agregado combina dois grupos de anexos e valida erro de quebra MIME.

**Limites e lacunas concretas:** Não testa envio/encoding MIME real, downloads, contagem máxima, tipos exóticos, tamanho reportado adulterado ou integração com composer.

## 43. `src/lib/__tests__/emailDraftSession.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 64]]; total: 64 linhas; blob: `5fce3166f514a4119fb72be36e8da70de1405b2d`.

**Contrato exercitado:** Helpers reais separam chaves por mensagem/conta/usuário, restauram conteúdo/id remoto, ignoram JSON inválido, expiram8dias e limpam dois drafts preservando tema.

**Fixtures e substituições:** localStorage limpo; drafts sintéticos sem bytes de arquivos; timestamps derivados de Date.now.

**Controles positivos:** Limpeza seletiva e isolamento por userId têm asserts concretos.

**Limites e lacunas concretas:** Logout do título52 não é executado: chama clearEmailDraftSessions diretamente. Nenhum payload com bytes é fornecido, portanto ausência de base64 não prova sanitização contra bytes adicionais; sem fronteira exata7dias, storageerro ou composer async.

## 44. `src/lib/__tests__/emailErrorState.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 26]]; total: 26 linhas; blob: `11ad159e8b49d44e201931da89ac8c66e297705e`.

**Contrato exercitado:** Classificadores reais distinguem offline/403/401/429/503, tratam transporte/5xx como resultado incerto e produzem títulos de permissão/offline.

**Fixtures e substituições:** Objetos erro sintéticos; navigator.onLine false via stub temporário.

**Controles positivos:** 403 explicitamente não é outcomeUnknown; tipos de transporte distintos são cobertos.

**Limites e lacunas concretas:** Título sem expor detalhes só verifica fragmentos de title, não inspeção integral da mensagem; não testa erro SDK real, retry/envio ou consumidor.

## 45. `src/lib/__tests__/emailPagination.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 22]]; total: 22 linhas; blob: `490b781665441ccb48e71f70e61dcbe72889d49d`.

**Contrato exercitado:** collectEmailPages real reúne2205itens em3páginas inclusivas, segunda1000..1999; chunkEmailIds divide1201 em500/500/201.

**Fixtures e substituições:** fetchPage recorta array local; nenhuma Supabase/rede.

**Controles positivos:** Limite1000 ultrapassado com contagem, extremos e número de chamadas.

**Limites e lacunas concretas:** Não testa lista exatamente múltipla, falha em página intermediária, tamanho0/inválido, ordenação mutável/duplicata entre páginas ou consumidor.

## 46. `src/lib/__tests__/emailRecipients.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 38]]; total: 38 linhas; blob: `53e9708389696ccbfa1b6f207f859f09e9274848`.

**Contrato exercitado:** Helpers reais interpretam nome citado com vírgula, deduplicam case-insensitive, rejeitam CRLF/token inválido, resolvem reply-all via Reply-To sem própria conta e evitam prefixo duplicado.

**Fixtures e substituições:** EmailMessage completo sintético com to/cc, sender/replyTo distintos; nenhuma API.

**Controles positivos:** Separa To/Cc e elimina ME em caixa diferente; CRLF tem caso negativo explícito.

**Limites e lacunas concretas:** Não cobre conta ausente, direção outbound, reply simples, Bcc, múltiplos Reply-To ou envio MIME; não prova montagem do composer.

## 47. `src/lib/__tests__/emailRichText.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 15]]; total: 15 linhas; blob: `b674affd0df61474d76be979f8573ca786abf5b6`.

**Contrato exercitado:** emailHtmlToText real preserva texto de blocos/listas/links e remove tags em duas fixtures.

**Fixtures e substituições:** HTML estático com p/strong/ul/li/a e blockquote/em.

**Controles positivos:** Compara texto completo e quebras, além de ausência de marcador <.

**Limites e lacunas concretas:** Conversão de texto, não teste de sanitização/XSS, multipart real ou HTML hostil/script/entidades/tabelas.

## 48. `src/lib/__tests__/forward-limits.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 57]]; total: 57 linhas; blob: `03a45cb33a07fab7d12817fddca710367900c373`.

**Contrato exercitado:** Helpers reais contam produto, limitam negativos, expõem tetos10x10/100 e mensagens; confirmação em20 e texto de contagem conferidos.

**Fixtures e substituições:** Números e constantes importadas; nenhum componente ou envio.

**Controles positivos:** Fronteira10 itens/destinos e20 confirmação testadas.

**Limites e lacunas concretas:** Títulos botão desabilitado não montam botão; caso produto>100 esbarra primeiro no limite11destinos e não isola gate de produto. Não prova confirmação/enforcement no consumidor.

## 49. `src/lib/__tests__/localDay.app.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 83]]; total: 83 linhas; blob: `c9a21a9f11af9b2490a59c670562ff207de042d2`.

**Contrato exercitado:** localDay helpers reais usam America/Sao_Paulo para dia/semana/mês/chave, shift atravessa mês/ano e data local do seletor vira limites de app.

**Fixtures e substituições:** Datas explícitas Setembro2026 UTC-3; expectativa ISO fixa; sem relógio/DB.

**Controles positivos:** Instante01:30Z é corretamente dia anterior em SP;7dias usa6decalagem; domingo/sábado e mês completos.

**Limites e lacunas concretas:** APP_TIMEZONE igual servidor no título só verifica constante JS, sem ler SQL; não executa múltiplos TZ/processos, DST histórico ou datas inválidas. Não testa consumidores que fixam janela em memo.

## 50. `src/lib/__tests__/localDay.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 56]]; total: 56 linhas; blob: `3a9286cf69a083e63218293361391690bd6bab98`.

**Contrato exercitado:** Helpers reais localDayKey/parseDayKey/calendarDayKey preservam dia local, interpretam yyyy-MM-dd por componentes e mantêm data-only UTC; inválidos/ausentes retornam null.

**Fixtures e substituições:** Datas locais construídas no TZ do processo e strings fixas; nenhum mock produtivo.

**Controles positivos:** Componentes ano/mês/dia e resultado completo são assertados, com caminhos inválidos.

**Limites e lacunas concretas:** Não roda processo com TZ variado; UTC pode não discriminar parte da regressão UTC versus local. Caso53 só confirma retorno truthy, não dia. Sem datas impossíveis/DST ou consumidor.

## 51. `src/lib/__tests__/logger.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 54]]; total: 54 linhas; blob: `191ef9737ffdb90b2a0f663c7667009f69c7dcd6`.

**Contrato exercitado:** Módulo logger real importa, métodos existem e chamadas simples não lançam.

**Fixtures e substituições:** Console log/error/warn/debug/info substituídos por spies vazios.

**Controles positivos:** Métodos reais error/debug/info são invocados.

**Limites e lacunas concretas:** Não verifica argumentos/output, mascaramento, nível/ambiente ou transporte. Caso getLogger47–52 é condicionado à própria existência, podendo não executar assertion se export ausente.

## 52. `src/lib/__tests__/loginAttempts.test.ts`

Estado: SEMANTIC_REVIEW_COMPLETE; faixas lidas: [[1, 51]]; total: 51 linhas; blob: `2d22260c649d9e074e4f9ff6e48f98b3e02ad702`.

**Contrato exercitado:** clearLoginAttempts real chama clear_login_attempts com email e contém erro retornado; formatLockTime trata plural e arredonda90s para2min.

**Fixtures e substituições:** RPC/logger substituídos; data nula/error sintético; nenhuma sessão real.

**Controles positivos:** Nome/argumento de RPC e fronteira singular/plural verificados.

**Limites e lacunas concretas:** Não testa ACL SQL, JWT sem email, limpeza real/quantidade de tentativas, rejeição lançada ou integração com auth-login; não contradiz controles/falhas de login auditados.

