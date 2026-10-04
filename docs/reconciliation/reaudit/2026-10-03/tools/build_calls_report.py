#!/usr/bin/env python3
from pathlib import Path
import json,hashlib,argparse,subprocess
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--source',default=str(ROOT/'source'));p.add_argument('--integrity',default=str(ROOT/'source-integrity.json'));p.add_argument('--out',default=str(ROOT/'reports/calls'));args=p.parse_args()
SOURCE=Path(args.source).resolve();OUT=Path(args.out);OUT.mkdir(parents=True,exist_ok=True)
integrity=json.loads(Path(args.integrity).read_text());HEAD=integrity['head_sha'];files={f['path']:f for f in integrity['files']}
assert subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()==HEAD
def ev(path,lo,hi,purpose=''):
    b=(SOURCE/path).read_bytes();assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==files[path]['git_blob_sha']
    assert 0<lo<=hi<=len(b.splitlines())
    return {'path':path,'line_start':lo,'line_end':hi,'git_blob_sha':files[path]['git_blob_sha'],'purpose':purpose,
            'url':f'https://github.com/adm01-debug/Zapp_Web_V2/blob/{HEAD}/{path}#L{lo}-L{hi}'}
engine='src/lib/calls/adapters/CallEngine.ts';sink='src/hooks/communication/useCallEngineSink.ts';consumer='src/hooks/communication/useSipClient.ts'
findings=[
 {'id':'R2-CALL-001','priority':'P1','classification':'CONFIRMED_STATIC_CONTRACT','source_head':HEAD,
  'title':'Evento tardio da sessão SIP anterior altera a chamada seguinte',
  'preconditions':'SIP disponível e registrado. A chamada A chega ao watchdog local sem Terminated do adapter; após idle, começa B. Só então o adapter entrega um evento Established ou Terminated de A. Não se afirma que este timing já ocorreu no provedor real.',
  'consumer_chain':'useSipClient → CallEngine.makeCall → listener capturado por sessão → watchdog/encerrar → nova chamada → listener antigo.',
  'observed_behavior':'Cada sessão mantém listener, mas handleStateChange não valida a identidade da sessão recebida. O watchdog limpa referências/estado locais sem cancelar a sessão no adapter. Evento Terminated antigo consome callIdPromise da sessão nova; Established antigo marca o ID novo como atendido e anexa o áudio da sessão velha.',
  'impact':'Uma chamada atual pode receber encerramento, atendimento ou mídia de outra sessão e ter seu registro alterado indevidamente. Os probes do motor real produziram finalização e atendimento de B a partir de eventos de A.',
  'evidence':[ev(engine,162,194,'Handler sem fence pela identidade da sessão.'),ev(engine,213,234,'Listener fechado sobre inviter, repassado ao handler comum.'),ev(engine,313,366,'Reset/watchdog local e uso da promise corrente.'),ev(consumer,57,74,'Motor ativo e funil de discagem.'),ev('src/providers/CallSessionProvider.tsx',291,305,'Revisão cruzada confirma que o provider recebe outcome sem identidade.'),ev('src/providers/CallSessionProvider.tsx',410,445,'O efeito também aplica status à sessão corrente sem comparar ID.')],
  'probes':['CALL-P01','CALL-P02'],
  'acceptance_criteria':['Associar eventos/timers/persistência à geração e ID da chamada a que pertencem; ignorar eventos de sessões encerradas.','Cancelar/encerrar o transporte quando o watchdog encerra a intenção, observando o contrato real do adapter.','Provar A timeout→B inicia→A Established/Terminated tardios: B conserva estado, áudio e registro. Repetir Terminated da mesma sessão não afeta a próxima.'],
  'related_previous_findings':['TEL-RUNTIME-001'],
  'limitations':'Adapter, sink, relógio e timers simulados; execução da classe inteira fixada por blob. Ausência de fence e efeito são confirmados; a incidência e as garantias de timing do SIP publicado não foram medidas.'},
 {'id':'R2-CALL-002','priority':'P2','classification':'CONFIRMED_STATIC_CONTRACT','source_head':HEAD,
  'title':'Duração gravada da chamada inclui espera após o encerramento',
  'preconditions':'Uma chamada curta atende e termina antes de resolver a promise inicial de criação/persistência do registro.',
  'consumer_chain':'sink.create/lookup/persistência → callIdPromise pendente → CallEngine.encerrar → callback tardio → onFinished.',
  'observed_behavior':'encerrar captura answeredAt, mas calcula Date.now dentro do then de callIdPromise. O sink calcula endedAt ao receber esse callback, também depois da espera. O cronômetro visual já parou em onTerminated.',
  'impact':'O histórico pode atribuir como tempo de conversa o atraso de lookup/DB que ocorreu depois do término. Com chamada de 10 s e espera adicional de 10 s, o probe gravou talkSeconds=20.',
  'evidence':[ev(engine,315,350),ev(sink,54,67),ev(consumer,37,40)],'probes':['CALL-P03'],
  'acceptance_criteria':['Capturar timestamp/duração no evento de término, antes de aguardar qualquer I/O, e transportar esses valores imutáveis até a persistência.','Provar término antes/depois da criação do registro e várias latências; duração e endedAt não devem variar com o tempo de gravação.'],
  'related_previous_findings':['TEL-RUNTIME-001'],
  'limitations':'Relógio e persistência sintéticos; não se mediu latência real. A fila idempotente de gravação existe e não foi negada: o problema é o instante em que o valor é calculado.'},
]
leader='src/lib/calls/tabLeaderStore.ts';connection='src/hooks/sip/useSipConnection.ts'
findings += [
 {'id':'R2-CALL-003','priority':'P2','classification':'CONFIRMED_STATIC_CONTRACT','source_head':HEAD,
  'title':'Aba líder suspensa retoma sem ceder à nova líder',
  'preconditions':'Duas abas do mesmo app com storage e BroadcastChannel disponíveis. A não executa heartbeat por mais de 10 s, B assume pelo TTL, e A volta a executar. Suspensão é uma entrada do cenário, não um evento observado em navegador real.',
  'consumer_chain':'tabLeaderStore → useTabLeaderRole → useSipConnection.isLeader → registro da linha.',
  'observed_behavior':'O tick de uma líder chama renewLeadership sem reler o dono do lock. Ao retomar, A sobrescreve a concessão viva de B; ambas ignoram CLAIM/HEARTBEAT alheios enquanto se consideram líderes. O jitter não resolve a retomada de uma líder antiga.',
  'impact':'Duas abas permanecem elegíveis para registrar o mesmo ramal. O probe manteve ambas como leader com as mensagens de coordenação entregues; a consequência no servidor SIP não foi simulada como incidente real.',
  'evidence':[ev(leader,215,229),ev(leader,238,275),ev(leader,278,299),ev(connection,57,70),ev(consumer,85,91)],'probes':['CALL-P04'],
  'acceptance_criteria':['Revalidar posse e geração antes de renovar ou usar a liderança; líder antiga deve ceder a uma concessão válida posterior.','Provar suspensão além do TTL, promoção, retomada e mensagens atrasadas, terminando com uma única líder.'],
  'related_previous_findings':['TEL-RUNTIME-001'],
  'limitations':'Módulo inteiro executado em duas instâncias sintéticas com storage/canal/relógio controlados. Não se alegou falha quando storage/canal estão indisponíveis: o modo degradado é uma decisão explícita.'},
 {'id':'R2-CALL-004','priority':'P2','classification':'CONFIRMED_STATIC_CONTRACT','source_head':HEAD,
  'title':'Contrato desconectar e reconectar mantém referência de UA encerrado',
  'preconditions':'Consumidor chama connect, aguarda conexão, chama disconnect e depois connect novamente na mesma instância do hook. A API é exportada ao provider; não se identificou botão ativo de desconexão na UI atual, e a transição leader→follower→leader depende da eleição.',
  'consumer_chain':'useSipConnection.disconnect → refs retidos → connect.guard; useSipClient expõe a API e a usa na transição de papel.',
  'observed_behavior':'disconnect encerra transporte e altera status para idle, mas não limpa uaRef/registererRef. connect retorna imediatamente se uaRef é não nulo, mesmo quando aponta para um UA já parado.',
  'impact':'A sequência do contrato termina sem nova conexão. O probe criou só um UA e reteve a referência parada após a segunda tentativa. A incidência por controles visíveis não foi alegada.',
  'evidence':[ev(connection,64,76),ev(connection,147,172),ev(consumer,85,98)],'probes':['CALL-P05'],
  'acceptance_criteria':['Retirar refs da sessão encerrada de modo seguro e permitir reconexão posterior, inclusive após erro de teardown.','Testar connect→disconnect→connect e perda/retomada de liderança sem reusar UA parado.'],
  'related_previous_findings':['TEL-RUNTIME-001'],
  'limitations':'Hook inteiro com substituições mínimas de estado/ref/efeito e classes SIP simuladas; alcance atual da UI explicitamente limitado. Não é uma falha comprovada de clique em botão existente.'},
 {'id':'R2-CALL-005','priority':'P2','classification':'CONFIRMED_STATIC_CONTRACT','source_head':HEAD,
  'title':'Conexão SIP pendente não é invalidada pelo cancelamento e permite criação concorrente',
  'preconditions':'connect está em import/ua.start/register pendente quando ocorre disconnect, perda de liderança ou unmount; ou dois consumidores invocam connect antes de a primeira chamada concluir.',
  'consumer_chain':'connect → await import/start/register → refs atribuídos apenas no final; disconnect/cleanup não invalidam a operação pendente.',
  'observed_behavior':'As guardas de líder e uaRef são verificadas só antes dos awaits. unmountedRef protege o retry, mas não a operação inicial. Uma conexão pendente continua a REGISTER depois de cancelada; duas chamadas concorrentes passam por uaRef ainda nulo e criam dois UAs.',
  'impact':'A conexão pode reaparecer após cancelamento ou existir em duplicidade na mesma instância. Os probes registraram o UA após disconnect/unmount e criaram dois UAs em chamadas concorrentes; não mediram o comportamento do servidor.',
  'evidence':[ev(connection,38,48),ev(connection,57,82),ev(connection,118,167),ev(consumer,80,93)],'probes':['CALL-P06','CALL-P07'],
  'acceptance_criteria':['Associar connect a uma geração cancelável e bloquear uma segunda operação enquanto a primeira estiver pendente.','Após cada await, verificar cancelamento/liderança e encerrar recursos já criados quando a tentativa perdeu validade.','Provar cancelamento e unmount em cada fronteira async, além de duas chamadas concorrentes, com no máximo um UA válido.'],
  'related_previous_findings':['TEL-RUNTIME-001'],
  'limitations':'Fronteiras SIP/React simuladas; dados e credenciais sintéticos. A confirmação é do contrato do hook e dos efeitos observáveis na simulação, sem homologação de SIP ou navegadores.'},
]
full=[engine,sink,consumer,'src/lib/calls/persistence.ts','src/hooks/communication/useTabLeaderRole.ts',
      'src/hooks/communication/useIncomingCallListener.ts','src/hooks/communication/useCallHistory.ts',connection,
      'src/lib/calls/adapters/SipCallAdapter.ts','src/lib/calls/adapters/CallAdapter.ts','src/lib/calls/WhatsAppCallAdapter.ts',
      'src/lib/calls/session.ts',leader,'src/lib/calls/capabilities.ts','src/lib/calls/duration.ts','src/lib/calls/phone.ts',
      'src/lib/calls/callStatus.ts','src/lib/calls/formatoKpi.ts','src/lib/calls/historyFormat.ts','src/lib/calls/historyLabels.ts',
      'src/lib/calls/nomeDoContato.ts','src/lib/calls/sipProvisioning.ts','src/lib/calls/terminoRemoto.ts','src/lib/calls/toqueDaChamada.ts']
coverage=[dict(ev(p,1,len((SOURCE/p).read_bytes().splitlines())),review_level='SEMANTIC_FILE_REVIEW',
               scope='Corpo, invariantes de identidade/estado/tempo e consumidores examinados; não é homologação SIP real.') for p in full]
coverage.append(dict(ev('src/providers/CallSessionProvider.tsx',200,455),review_level='TARGETED_RANGE_REVIEW',scope='Ponte de navegação, despacho/fim, discagem e projeção de eventos. Revisão independente de modules confirma ausência de fence; não se atribui ao root o restante não lido.'))
positive=[
 {'contract':'Fila de persistência','basis':'criarFilaDePersistencia encadeia chamadas e upsertMyCall repete o mesmo payload/id. Não foi alegada ausência de idempotência.'},
 {'contract':'Notificação tardia e identidade do usuário','basis':'useIncomingCallListener tem active/geração e userId no estado. Consulta de chamada finalizada é best-effort deliberada; falha de leitura não foi rotulada automaticamente como defeito.'},
 {'contract':'Transição de líder da aba','basis':'useTabLeaderRole guarda callbacks em ref e age só na transição de papel. Não foi extrapolado o ciclo encontrado no Email a este hook.'},
 {'contract':'Busca por telefone','basis':'useSipClient usa variantes completas e pickUniquePhoneMatch. Não foi inventado sufixo de telefone nesse consumidor; reconciliação Bitrix é um achado antigo diferente.'},
 {'contract':'WhatsApp sem áudio no browser','basis':'WhatsAppCallAdapter declara o contrato de abrir conversa e registrar intenção local. Dial não suportado e recusa local são decisões explícitas do plano, não defeitos novos.'},
 {'contract':'Encerramento por Realtime','basis':'terminoRemotoDaChamada compara o ID recebido ao ID em curso. O defeito de evento tardio foi delimitado ao motor SIP, sem negar esse controle no caminho Realtime.'},
]
def save(n,o):(OUT/n).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
save('findings.json',{'schema_version':1,'source_head':HEAD,'status':'COMPLETED_REVIEW_PASS','findings':findings,'confirmed_controls':positive})
save('coverage.json',{'schema_version':1,'source_head':HEAD,'files':coverage,'limits':['Demais módulos de chamadas são enumerados na matriz global; somente as faixas aqui declaradas são reivindicadas.','Sem registro SIP, áudio, credenciais, banco ou provedor real.']})
lines=['# Reauditoria do motor e ciclo de vida de chamadas','',f'Fonte: `{HEAD}`. Cinco contratos adicionais; sete casos offline, com variantes agrupadas por defeito.','']
for f in findings:
    lines += [f"## {f['id']} · {f['priority']} · {f['title']}",'','**Condição:** '+f['preconditions'],'','**Cadeia:** '+f['consumer_chain'],'',
              '**Comportamento:** '+f['observed_behavior'],'','**Efeito:** '+f['impact'],'','**Aceite proposto:** '+' '.join(f['acceptance_criteria']),'',
              '**Limites:** '+f['limitations'],'','**Evidência:** '+'; '.join(f"[{e['path']}:{e['line_start']}–{e['line_end']}]({e['url']})" for e in f['evidence'])+'.','',
              '**Probes:** '+', '.join(f['probes'])+'.','']
lines += ['## Controles existentes preservados na conclusão','']
for c in positive:lines += ['- **'+c['contract']+':** '+c['basis']]
(OUT/'report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'findings':len(findings),'coverage_entries':len(coverage)}))
