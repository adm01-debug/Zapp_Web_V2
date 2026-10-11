# Reconciliação achado → cartão (paridade V3 → V2)

> Gerado em 11/10/2026 13:33 por `reconciliar.py`. Cada item cita cartões que EXISTEM no quadro (verificado pelo script) ou um descarte com motivo.

- Itens reconciliados: **112** · com cartão: **90** · descartados com motivo: **22** · erros (cartão inexistente): **0**
- Cartões acompanhados: **137** · estado: {'done': 44, 'todo': 89, 'ready': 3, 'running': 1}
- Por especialista: {'iris': 63, 'hugo': 31, 'designer': 3, 'workersql': 18, 'edgar': 6, 'senior': 5, 'workertestes': 8, 'worker': 3}

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
| Parte 1 | Favoritar, fixar, adiar e reportar mensagem | `F1` workersql (done), `F2` workersql (done), `F3` hugo (done), `F4a` iris (todo), `F4b` iris (todo) |
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
| Parte 2 | Mensagem agendada nunca é enviada (nenhum job) | `AG2` workersql (done), `AG2r` senior (ready) |
| Parte 2 | Agendar anuncia sucesso mesmo com falha | `AG1` iris (todo) |
| Parte 2 | Editar, copiar e comandos de barra sem falso sucesso; /archive; /snooze e /priority sem argumento | `PH1` hugo (done) |
| Parte 2 | Adiar 'próxima semana' erra no domingo; falha invisível; não atômico | `SN1` hugo (done) |
| Parte 2 | Alerta de SLA fixo em 2 min | `SL1` hugo (done) |
| Parte 2 | Indicador de SLA com regra, nível e prazos | `SL2` iris (todo) |
| Parte 2 | 1 consulta de reações por mensagem | `RB1` hugo (done) |
| Parte 2 | Link direto para mensagem e scrollToMessage com retorno | `DL1` hugo (todo), `DL2` iris (todo) |
| Parte 2 | Agrupamento de bolhas por 5 min e rolar ao enviar | `GR1` iris (todo) |
| Parte 2 | Texto do compositor em store externo | `IN1` iris (todo) |
| Parte 2 | Seta para cima edita; ferramentas travam durante envio | `IN2` iris (todo) |
| Parte 2 | Menções com cache, áudio vencido, colar arquivo | `PO1` iris (todo) |
| Parte 2 | Arquivo largado durante envio, RFM em português, pular para mensagens | `PO2` iris (todo) |
| Parte 2 | Humanizar erro de envio (frases de ação) | `EV1` hugo (todo), `M4` iris (todo) |
| Parte 2 | Escopo da inbox Meus/Departamento/Todos com auditoria | `ES1` workersql (done), `ES2` hugo (todo), `ES3` iris (todo) |
| Parte 2 | Sussurro no compositor (Alt+W) | `WH1` hugo (todo), `WH2` iris (todo) |
| Parte 2 | Transferir robusto (compare-and-set, auditoria, diálogo só fecha no sucesso) | `TR1` workersql (todo), `TR2` hugo (todo), `TR3` iris (todo) |
| Parte 2 | Remetente em grupos ponta a ponta | `GP1` workersql (done), `GP2` edgar (todo), `GP3` hugo (todo), `GP4` iris (todo) |
| Parte 2 | Alerta de atraso de entrega com configuração | `SD1` workersql (done), `SD2` hugo (todo), `SD3` iris (todo), `SD4` iris (todo) |
| Parte 2 | Botão interativo responde ao cliente | `IB1` iris (todo) |
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
| Parte 3 | scheduled_messages sem visibilidade nem permissão; whisper_messages sem visibilidade na escrita | `RL1` workersql (done), `AG2r` senior (ready) |
| Parte 3 | Apagar mensagem diz 'deletada para todos' com a API falha | `DM1` iris (todo) |
| Parte 3 | Anexo some se o envio falha; prévias no desmonte | `AX1` iris (done) |
| Parte 3 | Chat não se recupera de queda do realtime | `RT1` hugo (done) |
| Parte 3 | Canais realtime com nome fixo | `RT2` hugo (todo) |
| Parte 3 | Enter com '/texto', /summary, trava áudio × texto, envio sem contato | `PH2` iris (todo) |
| Parte 3 | Voz e velocidade da leitura gravam valor antigo | `TS1` hugo (todo) |
| Parte 3 | 'Copiado!' sem confirmar em mais 4 pontos | `CP1` hugo (done) |
| Parte 3 | Trocador de voz sem tratamento de falha | `VZ1` iris (done) |
| Parte 3 | Overlay de arraste preso (seletor de figurinhas) | `DG1` iris (todo) |
| Parte 3 | Tag do contato perdida (ler e regravar array) | `TG1` workersql (done), `TG2` hugo (todo) |
| Parte 3 | Rajada de ~13 consultas ao abrir ou trocar de conversa | `PF1` hugo (todo) |
| Parte 3 | Sussurro do painel sem destinatário e erro ignorado | `WM1` iris (done) |
| Parte 3 | Testes que copiam a regra de produção | `TT1` workertestes (todo) |
| Parte 3 | Buracos de teste (slash, localização, janela de edição, arrastar, reducer, respostas rápidas, busca) | `TT2` workertestes (todo), `TT3` workertestes (todo) |
| Parte 3 | Robustez de realtime, catches silenciosos e nomes de arquivo com UUID | `RB2` hugo (todo) |
| Parte 3 | Agendamento: sem limite de antecedência, atraso de 15 min, assinatura, status e cancelamento com limpeza de anexo | `AG2r` senior (ready), `AG3` hugo (todo), `AG4` iris (todo) |
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
| Parte 4 | Mídia com URL do CDN vencida nunca é recuperada | `MR1` edgar (running), `MR2` iris (todo) |
| Parte 4 | Sem carregamento visível ao abrir ou trocar de conversa | `CL1` iris (todo) |
| Parte 4 | Copiar mídia sem legenda grava vazio com 'Copiado!'; apagada sem horário e com reações | `BL1` iris (todo) |
| Parte 4 | scrollToMessage só por id interno; busca global não leva à mensagem | `SM1` iris (todo) |
| Parte 4 | Erro num painel ou diálogo derruba o chat inteiro (sem boundary por seção) | `EB1` iris (todo) |
| Parte 4 | Sugestão de escalar ignora estouro do prazo de resolução | `NB1` hugo (ready) |
| Parte 4 | Sentimento só como cor de fundo; voltar com toque de 32px | `SE1` iris (todo) |
| Parte 4 | Preferência 'Mostrar texto de status nas mensagens' (useInboxStatusPref/StatusLabelToggle) | `SL3` iris (todo) |
| Parte 4 | Sons de início e fim de gravação de áudio | `AU1` iris (todo) |
| Parte 4 | Teste do 'Ligar' prova um botão falso; prop onStartCall morta | `TL1` workertestes (ready) |
| Parte 4 | Atalhos Ctrl+B/I/E anunciados e inexistentes; Tooltip+Popover aninhados no reescrever | `FM1` iris (todo) |
| Parte 4 | Selo da fila, botão Enviar vazio abre anexo, contador de sussurros, vazio das respostas rápidas | `PL1` iris (todo), `WH2` iris (todo), `C7` iris (done) |
| Parte 4 | Banner 'Criptografia de Ponta a Ponta' (A12) | descartado: afirmação falsa num CRM que guarda as mensagens, com IA e supervisores lendo; não reintroduzir |
| Parte 4 | Ferramentas do cabeçalho em barra visível em vez do menu 'Mais ações' | descartado: redesign carvão #301 (commit 2cdcbcdf0) trocou a barra pelo menu de propósito |
| Parte 4 | Histórico do atendimento na conversa (TicketHistorySheet) | descartado: a V2 já tem a linha do tempo (useConversationHistoryTimeline na aba Jornada); TR1 alimenta a trilha de transferências |
| Parte 4 | Botão 'Atribuir automaticamente' (edge ticket-router) | descartado: a V2 atribui sozinha por gatilho (auto_assign_to_queue_agent) ao entrar na fila; 'Devolver à fila' do T3 cobre o fluxo |
| Parte 4 | DOMPurify no MarkdownPreview | descartado: a prévia nunca abre em nenhuma das versões; a sanitização entra no LK1, onde o HTML é usado de fato |
| Parte 4 | Emojis de sentimento sem aria-label (A10) e videochamada fixa em undefined (A8) | descartado: não procedem na V3 atual (já têm aria-label; a l.246 é tooltip de validação visual); sentimento tratado no SE1 |
| Parte 4 | key instável na lista de tentativas (A6) | descartado: não existe na V2: chaves queued/attempt/result únicas em messageSendTimeline.ts |
