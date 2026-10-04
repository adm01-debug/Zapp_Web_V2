# Reauditoria do motor e ciclo de vida de chamadas

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Cinco contratos adicionais; sete casos offline, com variantes agrupadas por defeito.

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

## Controles existentes preservados na conclusão

- **Fila de persistência:** criarFilaDePersistencia encadeia chamadas e upsertMyCall repete o mesmo payload/id. Não foi alegada ausência de idempotência.
- **Notificação tardia e identidade do usuário:** useIncomingCallListener tem active/geração e userId no estado. Consulta de chamada finalizada é best-effort deliberada; falha de leitura não foi rotulada automaticamente como defeito.
- **Transição de líder da aba:** useTabLeaderRole guarda callbacks em ref e age só na transição de papel. Não foi extrapolado o ciclo encontrado no Email a este hook.
- **Busca por telefone:** useSipClient usa variantes completas e pickUniquePhoneMatch. Não foi inventado sufixo de telefone nesse consumidor; reconciliação Bitrix é um achado antigo diferente.
- **WhatsApp sem áudio no browser:** WhatsAppCallAdapter declara o contrato de abrir conversa e registrar intenção local. Dial não suportado e recusa local são decisões explícitas do plano, não defeitos novos.
- **Encerramento por Realtime:** terminoRemotoDaChamada compara o ID recebido ao ID em curso. O defeito de evento tardio foi delimitado ao motor SIP, sem negar esse controle no caminho Realtime.
