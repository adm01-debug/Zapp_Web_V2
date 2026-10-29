# Reconciliação achado → cartão (paridade V3 → V2)

> Gerado em 12/10/2026 18:52 por `reconciliar.py`. Cada item cita cartões que EXISTEM no quadro (verificado pelo script) ou um descarte com motivo.

- Itens reconciliados: **215** · com cartão: **151** · descartados com motivo: **64** · erros (cartão inexistente): **0**
- Cartões acompanhados: **264** · estado: {'done': 99, 'todo': 144, 'blocked': 1, 'running': 6, 'archived': 1, 'ready': 13}
- Por especialista: {'iris': 130, 'hugo': 48, 'designer': 3, 'workersql': 45, 'edgar': 17, 'senior': 5, 'workertestes': 8, 'worker': 6, 'workerauth': 2}

| Origem | Achado | Cartões (especialista, estado) ou descarte |
|---|---|---|
| Parte 1 | Histórico de envio pronto e sem uso (MessageSendHistorySheet) | `C1` iris (done) |
| Parte 1 | Código morto: ChatHeader.tsx e MessageContextMenu.tsx | `C4` iris (done) |
| Parte 1 | Resumo de entrega e aviso de falha na conversa (ConversationDeliverySummary, SendErrorBanner) | `C2` iris (done) |
| Parte 1 | Estado vazio da conversa e botão Rolar para o final | `C6` iris (done) |
| Parte 1 | Busca sem 'nenhum resultado' e sem aviso de limite | `C5` iris (done) |
| Parte 1 | Respostas rápidas e barras de edição (dicas, vazio, rótulos) | `C7` iris (done) |
| Parte 1 | Tipos de mensagem sem renderizador (enquete, visualização única, contato) | `C8a` hugo (done), `C8b` iris (done) |
| Parte 1 | MessageStatus* (Inline, Panel, Timeline, Timestamps): linha do tempo por tentativa | `M1` workersql (done), `M1b` workersql (done), `M2` edgar (done), `M3` hugo (todo), `M4` iris (todo) |
| Parte 1 | MessageDetailsDialog (payload, só admin) | `M5` iris (todo) |
| Parte 1 | ChatMonitoringDialog (métricas de envio) | `M6` iris (todo) |
| Parte 1 | MessageStatusFilterBar e FailureFilterBar (filtro de falhas) | `FF1` hugo (todo), `FF2` iris (todo) |
| Parte 1 | ChatSendProgress (progresso real de upload) | `AX1` iris (done) |
| Parte 1 | Reenvio da mesma mensagem que falhou | `R1` workersql (todo), `R2` iris (todo) |
| Parte 1 | TicketActionsBar / assumir e devolver | `T1` workersql (done), `T2` hugo (done), `T3` iris (todo) |
| Parte 1 | ChatHeaderMenu (Resolver, Encerrar, Arquivar) | `RS1` iris (todo) |
| Parte 1 | ChatTemplatesOverlay (templates com variáveis) | `TM1` iris (todo) |
| Parte 1 | AutomationSuggestionsBar | `A1` edgar (done), `A2` hugo (done), `A3` iris (todo) |
| Parte 1 | Favoritar, fixar, adiar e reportar mensagem | `F1` workersql (done), `F2` workersql (done), `F3` hugo (done), `F4a` iris (blocked), `F4b` iris (todo) |
| Parte 1 | Painel Arquivos da Equipe | `TF1` hugo (done), `TF2` iris (todo) |
| Parte 1 | Reações em tempo real e pré-carga | `RB1` hugo (done) |
| Parte 1 | Rótulos de acessibilidade do compositor, 'AO VIVO/Gravando áudio', filtro de data | `PL1` iris (todo) |
| Parte 1 | Testes ausentes da V3 (3) e prova de regressão integrada | `RG1` workertestes (todo), `TT1` workertestes (todo), `TT2` workertestes (todo), `TT3` workertestes (todo) |
| Parte 1 | MessageReadStatus (visto de mensagem RECEBIDA) | descartado: exige a coluna contact_read_at, que não existe em messages; mostrar status só em enviadas, como hoje |
| Parte 1 | ChatPanelOverlays (consolidar overlays) | descartado: refatoração interna sem efeito para o usuário; as funções existem espalhadas |
| Parte 1 | ChatMessageBubble | descartado: duplica o MessageBubble da V2 |
| Parte 1 | ChatWatermark (marca d'água decorativa) | descartado: removida de propósito na V2 |
| Parte 1 | Checklist e validação visual 10/10 do cabeçalho | descartado: ferramenta interna de desenvolvimento da V3 |
| Parte 1 | Tags no cabeçalho (Adicionar tag) | descartado: removida por decisão R2-INB-021; tags tratadas no painel de detalhes (cartão antigo já concluído) e agora atômicas em TG1/TG2 |
| Parte 2 | Mensagem agendada nunca é enviada (nenhum job) | `AG2` workersql (done), `AG2r` senior (done) |
| Parte 2 | Agendar anuncia sucesso mesmo com falha | `AG1` iris (todo) |
| Parte 2 | Editar, copiar e comandos de barra sem falso sucesso; /archive; /snooze e /priority sem argumento | `PH1` hugo (done) |
| Parte 2 | Adiar 'próxima semana' erra no domingo; falha invisível; não atômico | `SN1` hugo (done) |
| Parte 2 | Alerta de SLA fixo em 2 min | `SL1` hugo (done) |
| Parte 2 | Indicador de SLA com regra, nível e prazos | `SL2` iris (todo) |
| Parte 2 | 1 consulta de reações por mensagem | `RB1` hugo (done) |
| Parte 2 | Link direto para mensagem e scrollToMessage com retorno | `DL1` hugo (todo), `DL2` iris (todo) |
| Parte 2 | Agrupamento de bolhas por 5 min e rolar ao enviar | `GR1` iris (running) |
| Parte 2 | Texto do compositor em store externo | `IN1` iris (todo) |
| Parte 2 | Seta para cima edita; ferramentas travam durante envio | `IN2` iris (todo) |
| Parte 2 | Menções com cache, áudio vencido, colar arquivo | `PO1` iris (todo) |
| Parte 2 | Arquivo largado durante envio, RFM em português, pular para mensagens | `PO2` iris (todo) |
| Parte 2 | Humanizar erro de envio (frases de ação) | `EV1` hugo (todo), `M4` iris (todo) |
| Parte 2 | Escopo da inbox Meus/Departamento/Todos com auditoria | `ES1` workersql (done), `ES2` hugo (todo), `ES3` iris (todo) |
| Parte 2 | Sussurro no compositor (Alt+W) | `WH1` hugo (done), `WH2` iris (todo) |
| Parte 2 | Transferir robusto (compare-and-set, auditoria, diálogo só fecha no sucesso) | `TR1` workersql (todo), `TR2` hugo (todo), `TR3` iris (todo) |
| Parte 2 | Remetente em grupos ponta a ponta | `GP1` workersql (done), `GP2` edgar (todo), `GP3` hugo (todo), `GP4` iris (todo) |
| Parte 2 | Alerta de atraso de entrega com configuração | `SD1` workersql (done), `SD2` hugo (todo), `SD3` iris (todo), `SD4` iris (todo) |
| Parte 2 | Botão interativo responde ao cliente | `IB1` iris (running) |
| Parte 2 | Vocabulário e estados de entrega (Visualizada, played, failed_auth, failed_retries) | `VC1` iris (todo), `VC2` workersql (todo), `VC3` edgar (todo) |
| Parte 2 | Acessibilidade do balão (teclado, leitor de tela, menu de contexto, atalhos R/F/C) | `BA1` iris (todo) |
| Parte 2 | Avatar com nova tentativa, imagem com tentar de novo, estimativa de altura por tipo, selo da fila | `PL1` iris (todo) |
| Parte 2 | /note e /tag | descartado: decisão do dono em 11/10: não reativar |
| Parte 2 | Contador 'tentativa X de Y' no balão | descartado: a V2 não tem número máximo de tentativas; o balão mostra 'N tentativas' |
| Parte 2 | Fila de envio no cliente, offline, circuit breaker por instância | descartado: a V2 tem fila e idempotência no servidor (enqueue/claim/complete/fail) |
| Parte 2 | Reação otimista | descartado: a ordem da V2 (transporte antes de gravar, R2-INB-032) é intencional |
| Parte 2 | ChatScrollerV2, scrollLoaderController, loadOlderMetrics | descartado: sem uso na própria V3; a V2 carrega antigas melhor |
| Parte 2 | Estatística de entrega por participante de grupo (useDeliveryStats) | descartado: baixo valor; sem demanda |
| Parte 2 | Contadores cumulativos por direção no resumo de entrega | descartado: baixo valor; o resumo do C2 cobre fila, enviando, falha e confirmadas |
| Parte 3 | Qualquer agente reescreve conteúdo de mensagem (UPDATE sem WITH CHECK) | `ED1` workersql (done), `ED2` iris (todo) |
| Parte 3 | scheduled_messages sem visibilidade nem permissão; whisper_messages sem visibilidade na escrita | `RL1` workersql (done), `AG2r` senior (done) |
| Parte 3 | Apagar mensagem diz 'deletada para todos' com a API falha | `DM1` iris (todo) |
| Parte 3 | Anexo some se o envio falha; prévias no desmonte | `AX1` iris (done) |
| Parte 3 | Chat não se recupera de queda do realtime | `RT1` hugo (done) |
| Parte 3 | Canais realtime com nome fixo | `RT2` hugo (done) |
| Parte 3 | Enter com '/texto', /summary, trava áudio × texto, envio sem contato | `PH2` iris (todo) |
| Parte 3 | Voz e velocidade da leitura gravam valor antigo | `TS1` hugo (todo) |
| Parte 3 | 'Copiado!' sem confirmar em mais 4 pontos | `CP1` hugo (done) |
| Parte 3 | Trocador de voz sem tratamento de falha | `VZ1` iris (done) |
| Parte 3 | Overlay de arraste preso (seletor de figurinhas) | `DG1` iris (todo) |
| Parte 3 | Tag do contato perdida (ler e regravar array) | descartado: decisão do Joaquim em 12/10: a função de etiquetas sai de todas as implementações; TG1 e TG2 arquivados |
| Parte 3 | Rajada de ~13 consultas ao abrir ou trocar de conversa | `PF1` hugo (todo) |
| Parte 3 | Sussurro do painel sem destinatário e erro ignorado | `WM1` iris (done) |
| Parte 3 | Testes que copiam a regra de produção | `TT1` workertestes (todo) |
| Parte 3 | Buracos de teste (slash, localização, janela de edição, arrastar, reducer, respostas rápidas, busca) | `TT2` workertestes (todo), `TT3` workertestes (todo) |
| Parte 3 | Robustez de realtime, catches silenciosos e nomes de arquivo com UUID | `RB2` hugo (todo) |
| Parte 3 | Agendamento: sem limite de antecedência, atraso de 15 min, assinatura, status e cancelamento com limpeza de anexo | `AG2r` senior (done), `AG3` hugo (todo), `AG4` iris (todo) |
| Parte 3 | /priority sobrescrito pela IA: prioridade manual separada | `MP1` workersql (done), `MP2` hugo (todo), `MP3` iris (todo) |
| Parte 3 | Encaminhar para grupos | `FW1` workersql (done), `FW2` edgar (todo), `FW3` hugo (todo), `FW4` iris (todo) |
| Parte 3 | Marca 'Encaminhada' no encaminhar | `FWD` hugo (todo) |
| Parte 3 | Regra de auto-promoção ao assumir conversa resolvida | `T1r` senior (done) |
| Parte 3 | Trocar a voz de áudio já enviado (useAudioVoiceChange) | descartado: alteraria mídia que o cliente já recebeu |
| Parte 3 | Telemetria window.__loadOlderMetrics | descartado: debug em produção; a V2 não a tem |
| Plano | Flags de funcionalidade com rollout | `FL1` workersql (done), `FL2` hugo (todo), `FL3` iris (todo) |
| Plano | Funcionalidades novas atrás de flags | `FL4` iris (todo) |
| Plano | Provas ponta a ponta | `E2E1` workertestes (todo), `E2E2` workertestes (todo), `E2E3` workertestes (todo) |
| Plano | Acessibilidade das telas novas | `A11Y1` iris (todo) |
| Plano | Revisão de segurança independente | `SEC1` senior (todo) |
| Plano | Documentação e guia do atendente | `DOC1` worker (todo), `DOC2` worker (todo) |
| Plano | Roteiro de promoção | `PR1` worker (todo) |
| Plano | Kit de microinterações e revisão visual | `D0` designer (done), `D1` iris (todo) |
| Parte 4 | Texto da mensagem sem link clicável; recebidas sem prévia de link (TextWithLinks sem uso) | `LK1` iris (todo) |
| Parte 4 | Atalho '/' das respostas rápidas quebrado; /quick abre vazio; /template só avisa | `QR1` iris (todo) |
| Parte 4 | Emoji nativo é enviado como mensagem solta em vez de entrar no texto | `EM1` iris (todo) |
| Parte 4 | Mídia com URL do CDN vencida nunca é recuperada | `MR1` edgar (done), `MR2` iris (todo) |
| Parte 4 | Sem carregamento visível ao abrir ou trocar de conversa | `CL1` iris (todo) |
| Parte 4 | Copiar mídia sem legenda grava vazio com 'Copiado!'; apagada sem horário e com reações | `BL1` iris (todo) |
| Parte 4 | scrollToMessage só por id interno; busca global não leva à mensagem | `SM1` iris (todo) |
| Parte 4 | Erro num painel ou diálogo derruba o chat inteiro (sem boundary por seção) | `EB1` iris (todo) |
| Parte 4 | Sugestão de escalar ignora estouro do prazo de resolução | `NB1` hugo (done) |
| Parte 4 | Sentimento só como cor de fundo; voltar com toque de 32px | `SE1` iris (todo) |
| Parte 4 | Preferência 'Mostrar texto de status nas mensagens' (useInboxStatusPref/StatusLabelToggle) | `SL3` iris (todo) |
| Parte 4 | Sons de início e fim de gravação de áudio | `AU1` iris (todo) |
| Parte 4 | Teste do 'Ligar' prova um botão falso; prop onStartCall morta | `TL1` workertestes (done) |
| Parte 4 | Atalhos Ctrl+B/I/E anunciados e inexistentes; Tooltip+Popover aninhados no reescrever | `FM1` iris (todo) |
| Parte 4 | Selo da fila, botão Enviar vazio abre anexo, contador de sussurros, vazio das respostas rápidas | `PL1` iris (todo), `WH2` iris (todo), `C7` iris (done) |
| Parte 4 | Banner 'Criptografia de Ponta a Ponta' (A12) | descartado: afirmação falsa num CRM que guarda as mensagens, com IA e supervisores lendo; não reintroduzir |
| Parte 4 | Ferramentas do cabeçalho em barra visível em vez do menu 'Mais ações' | descartado: redesign carvão #301 (commit 2cdcbcdf0) trocou a barra pelo menu de propósito |
| Parte 4 | Histórico do atendimento na conversa (TicketHistorySheet) | descartado: a V2 já tem a linha do tempo (useConversationHistoryTimeline na aba Jornada); TR1 alimenta a trilha de transferências |
| Parte 4 | Botão 'Atribuir automaticamente' (edge ticket-router) | descartado: a V2 atribui sozinha por gatilho (auto_assign_to_queue_agent) ao entrar na fila; 'Devolver à fila' do T3 cobre o fluxo |
| Parte 4 | DOMPurify no MarkdownPreview | descartado: a prévia nunca abre em nenhuma das versões; a sanitização entra no LK1, onde o HTML é usado de fato |
| Parte 4 | Emojis de sentimento sem aria-label (A10) e videochamada fixa em undefined (A8) | descartado: não procedem na V3 atual (já têm aria-label; a l.246 é tooltip de validação visual); sentimento tratado no SE1 |
| Parte 4 | key instável na lista de tentativas (A6) | descartado: não existe na V2: chaves queued/attempt/result únicas em messageSendTimeline.ts |
| Parte 5 | Editar/reagir/apagar em grupo monta '@s.whatsapp.net' (P0-1 da V3) | `JG1` hugo (todo) |
| Parte 5 | 'Desfazer' depois de enviar diz 'Ação desfeita' com a mensagem já entregue | `UN1` iris (todo) |
| Parte 5 | Comandos de barra /whisper e /files | `SC1` iris (todo) |
| Parte 5 | Filtro de falhas persistido na URL (useChatFilters) | `FF1` hugo (todo), `FF2` iris (todo) |
| Parte 5 | Deep-link com retry e aviso de não encontrada (useInitialHighlight) | `DL1` hugo (todo), `DL2` iris (todo), `SM1` iris (todo) |
| Parte 5 | Alerta de SLA de entrega (useSLADelivery): regra ativa, intervalo, sem dedupe na V3 | `SD1` workersql (done), `SD2` hugo (todo), `SD3` iris (todo), `SD4` iris (todo) |
| Parte 5 | Testes da V3 sem equivalente (getItemSize, scrollToMessage, keyboard da busca, simulação, slash, localização, diálogos, arrastar, respostas rápidas) | `PL1` iris (todo), `SM1` iris (todo), `TT2` workertestes (todo), `TT3` workertestes (todo), `RG1` workertestes (todo), `QR1` iris (todo) |
| Parte 5 | chatInputGuards e ChatInputArea.guards (fila de envio no cliente) | descartado: a V2 não tem fila no cliente (descarte anterior); fila e idempotência ficam no servidor |
| Parte 5 | sendContract com onProgress (E13) | descartado: o contrato da V2 é (content, replyToId) e o progresso real de anexo está no AX1 |
| Parte 5 | P0-4 cache de mensagens por instância | descartado: não se aplica: a V2 indexa o cache pelo id (UUID) do contato, não pelo JID |
| Parte 5 | Signed URL de 7 dias no agendamento (A5) | descartado: não se aplica: a V2 guarda o localizador privado e só assina no envio |
| Parte 5 | Achados de estilo do documento (Math.random no id de anexo, cast de erro repetido, dep redundante, barrel sem hooks, mock com path divergente) | descartado: específicos do código da V3; sem equivalente na V2 ou sem efeito para o usuário |
| Parte 6 | Acesso negado sem página nem registro; destino perdido após login/2FA | `SH1` iris (done), `SH2` hugo (running) |
| Parte 6 | Rotas de SLA/filas abertas a agente; /install pública; links antigos em 404 | `SH7` iris (ready) |
| Parte 6 | Recuperação de chunk, auto-recuperação que não zera, tela branca, handlers duplicados, retry cego | `SH3` hugo (done), `SH4` hugo (running), `SH5` hugo (todo), `SH6` hugo (done) |
| Parte 6 | Esqueci a senha não cria a solicitação (visitante sem acesso) | `PW1` edgar (done), `PW2` iris (todo) |
| Parte 6 | Cadastro público aberto; polimento de reset/SSO/PWA; detalhes da fila N+1 | `SG1` iris (done), `AU2` iris (done), `QD1` hugo (done) |
| Parte 6 | SLA: histórico de alertas, resolver, preferências, aba Entregas & Leituras | `SA1` workersql (done), `SA2` hugo (todo), `SA3` iris (todo), `SA4` iris (todo) |
| Parte 6 | Mensagens com falha: ver, reenviar, abandonar, causa raiz, lote | `FQ1` workersql (todo), `FQ2` hugo (todo), `FQ3` iris (todo) |
| Parte 6 | Sala de crise: resolver, histórico e transferências em risco | `WR1` workersql (done), `WR2` iris (todo), `TV1` iris (todo) |
| Parte 6 | Pausa de instância manual e automática | `IP1` workersql (done), `IP2` edgar (todo), `IP3` iris (todo) |
| Parte 6 | Observabilidade da Evolution e do webhook, autoteste HMAC, erros do navegador | `OB1` workersql (done), `OB2` edgar (todo), `OB3` iris (todo), `HM1` edgar (done), `HM2` iris (todo), `TE1` iris (done) |
| Parte 6 | Automações gravadas e nunca executadas | `AT1` workersql (done), `AT2` edgar (todo), `AT3` iris (todo) |
| Parte 6 | Departamentos sem gestão; diálogo de membros/modo WhatsApp inacessível | `DP1` workersql (done), `DP2` iris (todo) |
| Parte 6 | Tentativas de login, chave visível a supervisor, saúde de e-mail, filas, cron, pendências por atendente | `LA1` workersql (done), `LA2` iris (todo), `GS1` workersql (done), `GS2` iris (todo), `EH1` workersql (done), `EH2` iris (todo), `QA1` workersql (done), `QA2` iris (todo), `CR1` workersql (done), `CR2` iris (todo), `AO1` iris (done) |
| Parte 6 | Tela 'Export Auto' contraria a regra de não exportar | `EX1` iris (done) |
| Parte 6 | Páginas de debug/desenvolvimento (BackendDiagnostics, fanout, bus, DesignSystem, demo, dev-diagnostics, audit-evidence) | descartado: ferramentas de desenvolvimento; não fazem falta para operar |
| Parte 6 | OAuthConsent | descartado: específico do Lovable |
| Parte 6 | SelfHostedHealth, EvoApiHealth/DR, Providers, InboxSyncStatus, ponte de sessão | descartado: infraestrutura que só a V3 tinha |
| Parte 6 | RoutePermissions | descartado: a V2 usa papéis fixos e permissões por desenho |
| Parte 6 | NotificationChannels | descartado: sem executor já na V3 |
| Parte 6 | Sentry | descartado: regra: nada sai do sistema; erros vão para audit_logs |
| Parte 6 | Pipeline de vendas (quadro de negócios) | descartado: decisão da fusão Quadro→Tarefas; negócios no CRM360 do contato |
| Parte 6 | TagsView | descartado: decisão de remover o módulo Etiquetas |
| Parte 6 | SearchInsights, Sicoob, ValidationProvider, AuthDiagnosticsPanel, revalidação de e-mail, correlação de chamadas, métricas de operação | descartado: baixo valor, sem motor na V2 ou equivalente parcial suficiente |
| Parte 6 | Bloqueio de login por IP/país: aplicado no servidor (R2-AUTH-022, auth-login l.115); falta a mensagem ao usuário barrado | `NP1` hugo (done) |
| Parte 6 | Remoção de Pagamentos | descartado: linhagem t_c789fa62 aprovada pelo revisor e na fila do integrador (t_4b28061c, t_dc033852) |
| Parte 8 | Modelos de e-mail (EmailTemplatesManager / email_templates) inexistentes na V2 | `ET1` workersql (done), `ET2` hugo (todo), `ET3` iris (todo) |
| Parte 8 | Regras de roteamento por palavra-chave, etiqueta, departamento e horário sem executor | `RR1` workersql (todo), `RR2` iris (todo) |
| Parte 8 | Teste A/B de campanhas (campaign_ab_variants) | descartado: campanhas na V2 são o Talk X, que já tem variantes A/B de modelo (talkx_template_variants_ab) e plano próprio |
| Parte 8 | Envio de produto do catálogo pelo WhatsApp | descartado: equivalente: SendProductDialog e sendProductUtils na V2 |
| Parte 8 | Pipeline de vendas (useBusinessLogicPipelineManagement) | descartado: decisão da fusão Quadro→Tarefas; negócios no CRM360 do contato |
| Parte 8 | Indicadores diários (evolution_daily_metrics) | descartado: view da infraestrutura da V3; o painel da V2 tem os seus indicadores |
| Parte 8 | Widgets, metas, ranking e sala de crise do painel | descartado: equivalentes na V2 (WidgetConfigSheet, GoalsConfigDialog, AchievementsSystem/agent_stats, WarRoom) e sem os zeros fixos da V3 |
| Parte 8 | Emojis personalizados (upload, favorito, categoria, contador, excluir) | descartado: equivalente: useCustomEmojis da V2 |
| Parte 8 | Credenciais da Evolution por instância com teste de conexão | descartado: a V2 guarda por departamento (DepartmentWhatsAppView), que o DP2 torna acessível |
| Parte 9 | Ferramentas de IA sem acessibilidade (anúncios, nomes, teclado, painel como diálogo) e defeitos de exibição herdados | `AY1` iris (ready) |
| Parte 9 | Inteligência comercial pronta e desligada (churn, melhores horários) | `CI1` iris (ready) |
| Parte 9 | Consultas desperdiçadas de tags de IA e SLA no painel | `CQ1` worker (done) |
| Parte 9 | Linha do tempo de SLA por contato | `SLT1` worker (done), `SLT2` iris (todo) |
| Parte 9 | Campos personalizados invisíveis no atendimento | `CF1` iris (ready) |
| Parte 9 | Stories do WhatsApp do contato | `WS1` iris (ready) |
| Parte 9 | Pontuação de engajamento inventada | `EG1` iris (ready) |
| Parte 9 | Memória da conversa sem tela | `MV1` iris (ready) |
| Parte 9 | Bloqueio depende da etiqueta 'Bloqueado' (quebra com a remoção das etiquetas) | `BK1` workersql (running), `BK2` hugo (todo), `BK3` iris (todo) |
| Parte 9 | VIP depende da etiqueta 'vip' (substituto em campo próprio previsto na D-T2) | `VP1` workersql (running), `VP2` iris (todo) |
| Parte 9 | Lista: falha de envio, digitando, nome completo, status no avatar, prévia | `LS1` hugo (todo), `LS2` iris (todo) |
| Parte 9 | Atalhos Alt+↑/↓ anunciados sem efeito e muitas paradas de Tab na lista | `KN1` iris (todo) |
| Parte 9 | Gerenciador de figurinhas: envio, erros, contador, Recentes, rótulos | `SK1` iris (ready) |
| Parte 9 | Tags do contato e tags de IA no painel (ContactTagsContent, SLAAndAITagsSection) | descartado: decisão do dono 12/10: etiquetas retiradas de todas as implementações |
| Parte 9 | Presença online e visto por último reais (o R2-INB-030 só removeu o Online fixo; o webhook recebe online/offline e descarta) | `PS1` worker (ready), `PS2` iris (todo) |
| Parte 9 | Cache do último resumo no assistente (conversation_summaries no cliente) | descartado: dependia do bug A1 da V3; na V2 a Edge grava e a falha aparece |
| Parte 9 | Botão 'Resumo' dentro do assistente de IA | descartado: a função existe no painel Resumo do chat |
| Parte 9 | Botão de vídeo | descartado: atrás de flag, mostra 'em breve' de forma honesta |
| Parte 9 | Editar contato com trava otimista (A10) | descartado: edição vira pedido ao Singu (CT-071..079) |
| Parte 9 | Estatísticas com sparkline inventada (A16) | descartado: não se aplica: a V2 usa dados reais (ContactStatsStrip) |
| Parte 9 | Configuração de SLA de entrega por contato com simulação | descartado: coberta por SD1-SD4 |
| Parte 9 | Monolito ConversationItem, tooltip duplicado e item compacto não focável (A3, A4, A11) | descartado: não se aplicam à V2 (componente único e focável) |
| Parte 7 | Aprovar redefinição de senha: supervisor aprova qualquer conta e recebe o link (tomada de conta); e-mail nunca enviado | `PR0` edgar (done), `PR0b` iris (ready) |
| Parte 7 | Excluir/desconectar conexão sem confirmação e liberado a supervisor | `CX0` iris (done), `CX0b` workersql (done) |
| Parte 7 | Painel de SLA por fila, filtros e redistribuição em lote | `SQ1` workersql (todo), `SQ2` edgar (todo), `SQ3` iris (todo) |
| Parte 7 | Resolução ausente no painel de SLA | `SR1` iris (done) |
| Parte 7 | Base de conhecimento não consultável na conversa | `KB1` iris (done) |
| Parte 7 | Previsão de demanda com amostra e ruído aleatório | `DF1` workersql (done), `DF2` iris (todo) |
| Parte 7 | Assinatura de e-mail | `EA1` workersql (done), `EA2` iris (todo) |
| Parte 7 | SLA de primeira resposta de e-mail | `EF1` workersql (done), `EF2` iris (todo) |
| Parte 7 | Cc/Cco manual e histórico citado no e-mail | `EC1` iris (todo) |
| Parte 7 | Follow-up gravado e nunca executado; pendentes sem tela | `FU1` workersql (done), `FU2` edgar (todo), `FU3` iris (todo) |
| Parte 7 | Reconexão automática, motivo de saúde e conexão fantasma | `RC1` workersql (done), `RC2` edgar (todo), `RC3` iris (todo) |
| Parte 7 | Conexão por código de emparelhamento | `PC1` edgar (done), `PC2` iris (todo) |
| Parte 7 | QR com validade e histórico de tentativas | `QH1` workersql (done), `QH2` edgar (todo), `QH3` iris (todo) |
| Parte 7 | Opção Cloud API sem executor; auditoria por conexão; busca/filtro/link do QR/ações da degradada | `CA1` iris (todo), `CA2` iris (done), `CN1` iris (todo) |
| Parte 7 | n8n com sucesso falso | `NX1` iris (done) |
| Parte 7 | LGPD: fila de exclusão, tela fechada ao atendente, política e histórico do titular | `LG1` workersql (done), `LG2` iris (todo) |
| Parte 7 | Consentimento LGPD por contato | `CS1` workersql (done), `CS2` iris (todo) |
| Parte 7 | Moldura: estado global das conexões, indicador fixo, avisos de degradada/servidor fora, notificação de queda, avisos globais de falha | `GL1` hugo (done), `GL2` iris (ready), `GL3` iris (ready), `GL4` hugo (ready), `GL5` hugo (todo) |
| Parte 7 | Saúde do sistema no painel | `HS1` iris (done) |
| Parte 7 | Fila priorizada do supervisor | `SV1` hugo (done), `SV2` iris (todo) |
| Parte 7 | Sessões por usuário (listar e encerrar uma) | `SS1` workerauth (done), `SS2` iris (todo) |
| Parte 7 | Convidar usuário por e-mail | `IV1` workerauth (done), `IV2` iris (todo) |
| Parte 7 | Alertas de limite de requisições | `RA1` workersql (done), `RA2` iris (todo) |
| Parte 7 | Exportação TXT/PDF do diagnóstico contraria a regra do dono | `EX2` iris (done) |
| Parte 7 | Bots externos por instância (Typebot, OpenAI, Dify, Flowise, Chatwoot, EvolutionBot) | descartado: enviam a conversa a terceiros: regra do dono (nada sai do sistema) |
| Parte 7 | VirusTotal e exportar/importar tema | descartado: regra do dono (nada sai do sistema); a V2 tem Quarentena |
| Parte 7 | Contas IMAP/SMTP | descartado: a V2 é só Gmail por desenho |
| Parte 7 | Orçamento de marketing | descartado: fora do escopo do Zapp |
| Parte 7 | Preferências de alerta de conexão por usuário (connection_alert_preferences) | descartado: sem consumidor já na V3; avisos cobertos por GL4 |
| Parte 7 | Credenciais e histórico de saúde da Evolution por instância | descartado: a V2 usa credencial central; saúde coberta por RC/GL |
| Parte 7 | Versões de perfil com restaurar (entity_versions) | descartado: sem gravação na V2; a auditoria registra quem mudou |
| Parte 7 | Histórico imutável de erros de envio | descartado: coberto pelo registro de tentativas (M1) e pela visão FQ1 |
| Parte 7 | Métricas de retry e alertas de idempotência da ponte evo, fallback multi-provedor, dedupe entre abas, painel comercial sem uso | descartado: infraestrutura/debug só da V3 |
| Parte 7 | Escopos personalizados da inbox e API pública | descartado: decididos: matriz de permissões editável e API pública desativada de propósito |
| Parte 7 | A/B de campanha na tela antiga de campanhas | descartado: campanhas são o Talk X na V2 |

## Cartões que nenhum item cita (conferir se são extras legítimos)

`TG1`, `TG2`
