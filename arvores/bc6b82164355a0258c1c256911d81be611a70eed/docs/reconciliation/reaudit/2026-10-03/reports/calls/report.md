# Reauditoria do motor e ciclo de vida de chamadas

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Oito contratos adicionais; onze casos offline, com variantes agrupadas por defeito.

## R2-CALL-001 · P1 · Evento tardio da sessão SIP anterior altera a chamada seguinte

**Condição:** SIP disponível e registrado. A chamada A chega ao watchdog local sem Terminated do adapter; após idle, começa B. Só então o adapter entrega um evento Established ou Terminated de A. Não se afirma que este timing já ocorreu no provedor real.

**Cadeia:** useSipClient → CallEngine.makeCall → listener capturado por sessão → watchdog/encerrar → nova chamada → listener antigo.

**Comportamento:** Cada sessão mantém listener, mas handleStateChange não valida a identidade da sessão recebida. O watchdog limpa referências/estado locais sem cancelar a sessão no adapter. Evento Terminated antigo consome callIdPromise da sessão nova; Established antigo marca o ID novo como atendido e anexa o áudio da sessão velha.

**Efeito:** Uma chamada atual pode receber encerramento, atendimento ou mídia de outra sessão e ter seu registro alterado indevidamente. Os probes do motor real produziram finalização e atendimento de B a partir de eventos de A.

**Aceite proposto:** Associar eventos/timers/persistência à geração e ID da chamada a que pertencem; ignorar eventos de sessões encerradas. Cancelar/encerrar o transporte quando o watchdog encerra a intenção, observando o contrato real do adapter. Provar A timeout→B inicia→A Established/Terminated tardios: B conserva estado, áudio e registro. Repetir Terminated da mesma sessão não afeta a próxima.

**Limites:** Adapter, sink, relógio e timers simulados; execução da classe inteira fixada por blob. Ausência de fence e efeito são confirmados; a incidência e as garantias de timing do SIP publicado não foram medidas.

**Evidência:** [src/lib/calls/adapters/CallEngine.ts:162–194](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/adapters/CallEngine.ts#L162-L194); [src/lib/calls/adapters/CallEngine.ts:213–234](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/adapters/CallEngine.ts#L213-L234); [src/lib/calls/adapters/CallEngine.ts:313–366](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/adapters/CallEngine.ts#L313-L366); [src/hooks/communication/useSipClient.ts:57–74](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L57-L74); [src/providers/CallSessionProvider.tsx:291–305](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/providers/CallSessionProvider.tsx#L291-L305); [src/providers/CallSessionProvider.tsx:410–445](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/providers/CallSessionProvider.tsx#L410-L445).

**Probes:** CALL-P01, CALL-P02.

## R2-CALL-002 · P2 · Duração gravada da chamada inclui espera após o encerramento

**Condição:** Uma chamada curta atende e termina antes de resolver a promise inicial de criação/persistência do registro.

**Cadeia:** sink.create/lookup/persistência → callIdPromise pendente → CallEngine.encerrar → callback tardio → onFinished.

**Comportamento:** encerrar captura answeredAt, mas calcula Date.now dentro do then de callIdPromise. O sink calcula endedAt ao receber esse callback, também depois da espera. O cronômetro visual já parou em onTerminated.

**Efeito:** O histórico pode atribuir como tempo de conversa o atraso de lookup/DB que ocorreu depois do término. Com chamada de 10 s e espera adicional de 10 s, o probe gravou talkSeconds=20.

**Aceite proposto:** Capturar timestamp/duração no evento de término, antes de aguardar qualquer I/O, e transportar esses valores imutáveis até a persistência. Provar término antes/depois da criação do registro e várias latências; duração e endedAt não devem variar com o tempo de gravação.

**Limites:** Relógio e persistência sintéticos; não se mediu latência real. A fila idempotente de gravação existe e não foi negada: o problema é o instante em que o valor é calculado.

**Evidência:** [src/lib/calls/adapters/CallEngine.ts:315–350](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/adapters/CallEngine.ts#L315-L350); [src/hooks/communication/useCallEngineSink.ts:54–67](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useCallEngineSink.ts#L54-L67); [src/hooks/communication/useSipClient.ts:37–40](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L37-L40).

**Probes:** CALL-P03.

## R2-CALL-003 · P2 · Aba líder suspensa retoma sem ceder à nova líder

**Condição:** Duas abas do mesmo app com storage e BroadcastChannel disponíveis. A não executa heartbeat por mais de 10 s, B assume pelo TTL, e A volta a executar. Suspensão é uma entrada do cenário, não um evento observado em navegador real.

**Cadeia:** tabLeaderStore → useTabLeaderRole → useSipConnection.isLeader → registro da linha.

**Comportamento:** O tick de uma líder chama renewLeadership sem reler o dono do lock. Ao retomar, A sobrescreve a concessão viva de B; ambas ignoram CLAIM/HEARTBEAT alheios enquanto se consideram líderes. O jitter não resolve a retomada de uma líder antiga.

**Efeito:** Duas abas permanecem elegíveis para registrar o mesmo ramal. O probe manteve ambas como leader com as mensagens de coordenação entregues; a consequência no servidor SIP não foi simulada como incidente real.

**Aceite proposto:** Revalidar posse e geração antes de renovar ou usar a liderança; líder antiga deve ceder a uma concessão válida posterior. Provar suspensão além do TTL, promoção, retomada e mensagens atrasadas, terminando com uma única líder.

**Limites:** Módulo inteiro executado em duas instâncias sintéticas com storage/canal/relógio controlados. Não se alegou falha quando storage/canal estão indisponíveis: o modo degradado é uma decisão explícita.

**Evidência:** [src/lib/calls/tabLeaderStore.ts:215–229](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/tabLeaderStore.ts#L215-L229); [src/lib/calls/tabLeaderStore.ts:238–275](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/tabLeaderStore.ts#L238-L275); [src/lib/calls/tabLeaderStore.ts:278–299](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/tabLeaderStore.ts#L278-L299); [src/hooks/sip/useSipConnection.ts:57–70](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sip/useSipConnection.ts#L57-L70); [src/hooks/communication/useSipClient.ts:85–91](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L85-L91).

**Probes:** CALL-P04.

## R2-CALL-004 · P2 · Contrato desconectar e reconectar mantém referência de UA encerrado

**Condição:** Consumidor chama connect, aguarda conexão, chama disconnect e depois connect novamente na mesma instância do hook. A API é exportada ao provider; não se identificou botão ativo de desconexão na UI atual, e a transição leader→follower→leader depende da eleição.

**Cadeia:** useSipConnection.disconnect → refs retidos → connect.guard; useSipClient expõe a API e a usa na transição de papel.

**Comportamento:** disconnect encerra transporte e altera status para idle, mas não limpa uaRef/registererRef. connect retorna imediatamente se uaRef é não nulo, mesmo quando aponta para um UA já parado.

**Efeito:** A sequência do contrato termina sem nova conexão. O probe criou só um UA e reteve a referência parada após a segunda tentativa. A incidência por controles visíveis não foi alegada.

**Aceite proposto:** Retirar refs da sessão encerrada de modo seguro e permitir reconexão posterior, inclusive após erro de teardown. Testar connect→disconnect→connect e perda/retomada de liderança sem reusar UA parado.

**Limites:** Hook inteiro com substituições mínimas de estado/ref/efeito e classes SIP simuladas; alcance atual da UI explicitamente limitado. Não é uma falha comprovada de clique em botão existente.

**Evidência:** [src/hooks/sip/useSipConnection.ts:64–76](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sip/useSipConnection.ts#L64-L76); [src/hooks/sip/useSipConnection.ts:147–172](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sip/useSipConnection.ts#L147-L172); [src/hooks/communication/useSipClient.ts:85–98](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L85-L98).

**Probes:** CALL-P05.

## R2-CALL-005 · P2 · Conexão SIP pendente não é invalidada pelo cancelamento e permite criação concorrente

**Condição:** connect está em import/ua.start/register pendente quando ocorre disconnect, perda de liderança ou unmount; ou dois consumidores invocam connect antes de a primeira chamada concluir.

**Cadeia:** connect → await import/start/register → refs atribuídos apenas no final; disconnect/cleanup não invalidam a operação pendente.

**Comportamento:** As guardas de líder e uaRef são verificadas só antes dos awaits. unmountedRef protege o retry, mas não a operação inicial. Uma conexão pendente continua a REGISTER depois de cancelada; duas chamadas concorrentes passam por uaRef ainda nulo e criam dois UAs.

**Efeito:** A conexão pode reaparecer após cancelamento ou existir em duplicidade na mesma instância. Os probes registraram o UA após disconnect/unmount e criaram dois UAs em chamadas concorrentes; não mediram o comportamento do servidor.

**Aceite proposto:** Associar connect a uma geração cancelável e bloquear uma segunda operação enquanto a primeira estiver pendente. Após cada await, verificar cancelamento/liderança e encerrar recursos já criados quando a tentativa perdeu validade. Provar cancelamento e unmount em cada fronteira async, além de duas chamadas concorrentes, com no máximo um UA válido.

**Limites:** Fronteiras SIP/React simuladas; dados e credenciais sintéticos. A confirmação é do contrato do hook e dos efeitos observáveis na simulação, sem homologação de SIP ou navegadores.

**Evidência:** [src/hooks/sip/useSipConnection.ts:38–48](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sip/useSipConnection.ts#L38-L48); [src/hooks/sip/useSipConnection.ts:57–82](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sip/useSipConnection.ts#L57-L82); [src/hooks/sip/useSipConnection.ts:118–167](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sip/useSipConnection.ts#L118-L167); [src/hooks/communication/useSipClient.ts:80–93](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L80-L93).

**Probes:** CALL-P06, CALL-P07.

## R2-CALL-006 · P2 · Alerta recebido conserva a notificação encerrada e o diálogo da chamada anterior

**Condição:** O overlay global permanece montado. Uma notificação válida já foi entregue; a sessão termina fora de handleDialogEnd/dismissCall. Na variante entre chamadas, A foi aberta pelo botão Atender e B chega antes de um fechamento explícito do diálogo.

**Cadeia:** App.DeferredProviders → IncomingCallAlert → useIncomingCallListener.incomingState → showDialog → CallDialog.initialStatus.

**Comportamento:** O listener assina INSERT em notifications e guarda a chamada até dismissCall ou troca de usuário. Não observa o estado do provider nem UPDATE terminal em calls. Os comentários do alerta dizem que ele deixa de entregar quando sai de ringing_in, mas isso não está implementado. showDialog também não é associado ao callId: B herda true e recebe initialStatus=answered, que visualStatus aplica mesmo para ringing_in/idle.

**Efeito:** A entrada de um alerta pode continuar presente após a sessão terminar. Se A abriu o diálogo, B pode aparecer como em andamento sem novo aceite e sem o botão Atender; o guarda !showDialog também suprime seu toque. Não se afirma que o transporte de B tenha sido atendido.

**Aceite proposto:** Reconciliar a notificação com a identidade e o ciclo real da chamada; remover a entrada terminal e reinicializar o diálogo quando mudar o callId. Provar fim remoto, timeout, encerramento em outro painel e A atendida→B recebida sem fechamento manual; B deve ter controles e toque próprios.

**Limites:** Hook inteiro, reducer, regras puras e callbacks exatos executados com fronteiras sintéticas. Não houve ReactDOM, navegador, som ou chamada real; o vínculo dos flags ao JSX foi examinado na fonte. A filtragem inicial de replay terminal e o dismiss explícito funcionam e foram preservados.

**Evidência:** [src/App.tsx:50–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/App.tsx#L50-L63); [src/hooks/communication/useIncomingCallListener.ts:56–74](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useIncomingCallListener.ts#L56-L74); [src/hooks/communication/useIncomingCallListener.ts:143–173](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useIncomingCallListener.ts#L143-L173); [src/components/calls/IncomingCallAlert.tsx:43–66](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/IncomingCallAlert.tsx#L43-L66); [src/components/calls/IncomingCallAlert.tsx:106–148](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/IncomingCallAlert.tsx#L106-L148); [src/components/calls/CallDialog.tsx:63–79](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/CallDialog.tsx#L63-L79); [src/components/calls/CallDialog.tsx:237–250](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/CallDialog.tsx#L237-L250).

**Probes:** CALL-P08, CALL-P09.

## R2-CALL-007 · P1 · Atender e ignorar alerta WhatsApp usam comandos SIP sem identidade da notificação

**Condição:** Usuário vê uma conexão WhatsApp conectada e recebe incoming_call com whatsapp_connection_id. O cenário de interferência exige ainda uma entrada SIP distinta na mesma sessão; nenhuma ocorrência produtiva dessa simultaneidade foi alegada.

**Cadeia:** Webhook/notificação WhatsApp → capacidade canReceive → IncomingCallAlert.handleAnswer/handleDecline → CallSessionProvider.accept/reject → useSipClient → CallEngine SIP.

**Comportamento:** A UI escolhe o rótulo/capacidade pelo canal, mas os handlers chamam accept/reject sem callId, contato ou canal. O provider usa sempre sip.acceptIncomingCall/rejectIncomingCall. O adapter WhatsApp que implementa registro local + abertura da conversa não é invocado por essa cadeia. handleAnswer abre o diálogo mesmo sem aguardar o resultado.

**Efeito:** O clique em Atender para WhatsApp não cumpre o fluxo local documentado daquele canal. Com outra chamada SIP tocando, o comando pode atuar nela: o probe mudou a sessão SIP A para connecting e chamou sua API ao clicar na notificação WhatsApp B. O áudio e o aceite do servidor não foram executados.

**Aceite proposto:** Encaminhar ações pelo canal e pela identidade da chamada alvo; o alerta WhatsApp deve executar somente o contrato local aprovado desse canal. Provar notificação WhatsApp B com SIP A em ringing/active/idle: nenhuma ação de B pode aceitar, rejeitar ou alterar A. Abrir estado atendido somente após resultado válido da operação alvo.

**Limites:** Callbacks e mapper reais com SIP substituído por spy. O adapter WhatsApp explicitamente não transporta áudio no browser; isso não foi tratado como defeito. O defeito é o consumidor não encaminhar a ação para o contrato correspondente e poder alcançar a sessão SIP corrente.

**Evidência:** [src/components/calls/IncomingCallAlert.tsx:34–48](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/IncomingCallAlert.tsx#L34-L48); [src/components/calls/IncomingCallAlert.tsx:111–118](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/IncomingCallAlert.tsx#L111-L118); [src/components/calls/IncomingCallAlert.tsx:201–223](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/IncomingCallAlert.tsx#L201-L223); [src/hooks/calls/useCallChannels.ts:181–208](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/calls/useCallChannels.ts#L181-L208); [src/providers/CallSessionProvider.tsx:377–391](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/providers/CallSessionProvider.tsx#L377-L391); [src/hooks/communication/useSipClient.ts:57–77](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L57-L77); [src/lib/calls/WhatsAppCallAdapter.ts:173–213](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/WhatsAppCallAdapter.ts#L173-L213).

**Probes:** CALL-P10.

## R2-CALL-008 · P2 · Encerramento por Realtime compara o ID observado, mas despacha sobre outra sessão e evento inválido em ringing

**Condição:** O hook observa a chamada B do alerta enquanto o provider está na sessão ativa A; ou a mesma chamada observada ainda está em ringing_in quando chega status terminal.

**Cadeia:** IncomingCallAlert.useTerminoRemoto(notification.callId) → UPDATE calls filtrado por esse ID → terminoRemotoDaChamada → dispatch HANGUP_REMOTE → reducer da sessão global.

**Comportamento:** A regra pura rejeita payload com ID diferente do argumento observado, mas o hook não compara esse argumento a session.sessionId. HANGUP_REMOTE não carrega identidade e é aplicado ao estado global corrente. Além disso, endReasonFor aceita CANCEL_REMOTE/REJECT/TIMEOUT em ringing_in, não HANGUP_REMOTE; o evento único do hook é ignorado nesse estado.

**Efeito:** O UPDATE terminal de B pode encerrar o estado visual de A, sem demonstrar teardown de seu transporte. Na entrada ainda tocando, o mesmo evento terminal não encerra a sessão e depende de outro evento/timeout. O probe confirmou ambos os estados e preservou o controle positivo de rejeitar payload de outro ID.

**Aceite proposto:** Associar o evento remoto à identidade/geração da sessão atual e rejeitar eventos de outras chamadas. Selecionar evento terminal válido para o estado atual, preservando motivo e identidade; usar a mesma regra do restante do provider. Provar A ativa+B termina, A tocando+A termina, payload de outro ID e evento repetido; preservar sessão não alvo.

**Limites:** Callback do hook e reducer inteiros/exatos, com payloads sintéticos. Confirma somente transição de estado local; não confirma encerramento do SIP, alteração no banco nem incidente real. A comparação existente com o ID assinado não foi negada.

**Evidência:** [src/components/calls/IncomingCallAlert.tsx:41–44](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/IncomingCallAlert.tsx#L41-L44); [src/hooks/calls/useTerminoRemoto.ts:17–45](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/calls/useTerminoRemoto.ts#L17-L45); [src/lib/calls/terminoRemoto.ts:45–51](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/terminoRemoto.ts#L45-L51); [src/lib/calls/session.ts:179–215](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/session.ts#L179-L215); [src/lib/calls/session.ts:299–310](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/calls/session.ts#L299-L310); [src/providers/CallSessionProvider.tsx:119–147](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/providers/CallSessionProvider.tsx#L119-L147).

**Probes:** CALL-P11.

## Controles existentes preservados na conclusão

- **Fila de persistência:** criarFilaDePersistencia encadeia chamadas e upsertMyCall repete o mesmo payload/id. Não foi alegada ausência de idempotência.
- **Notificação tardia e identidade do usuário:** useIncomingCallListener tem active/geração e userId no estado. Consulta de chamada finalizada é best-effort deliberada; falha de leitura não foi rotulada automaticamente como defeito.
- **Transição de líder da aba:** useTabLeaderRole guarda callbacks em ref e age só na transição de papel. Não foi extrapolado o ciclo encontrado no Email a este hook.
- **Busca por telefone:** useSipClient usa variantes completas e pickUniquePhoneMatch. Não foi inventado sufixo de telefone nesse consumidor; reconciliação Bitrix é um achado antigo diferente.
- **WhatsApp sem áudio no browser:** WhatsAppCallAdapter declara o contrato de abrir conversa e registrar intenção local. Dial não suportado e recusa local são decisões explícitas do plano, não defeitos novos.
- **Encerramento por Realtime:** terminoRemotoDaChamada compara o ID recebido ao argumento observado e rejeita payload divergente. Esse controle foi confirmado por CALL-P11; não compara esse argumento à sessão global, lacuna delimitada em CALL008.
