import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { REMOTE_AUDIO_ID } from '@/lib/calls/adapters/SipCallAdapter';
import { useCallSession } from '@/providers/CallSessionProvider';
import type { CallSessionStatus } from '@/lib/calls/session';
import { logAudit } from '@/lib/audit';

interface CallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id?: string;
    name: string;
    phone: string;
    avatar?: string;
  };
  direction: 'inbound' | 'outbound';
  /**
   * @deprecated T21 — o canal da chamada (`calls.whatsapp_connection_id`) agora é
   * decidido pelo motor/RPC `upsert_my_call`, não pela UI. A prop continua
   * aceita para não quebrar os chamadores (`IncomingCallAlert`), mas o diálogo
   * não a consome mais.
   */
  whatsappConnectionId?: string;
  /** Chamada já identificada e/ou já atendida antes da abertura do diálogo
   *  (ex.: aceite feito no alerta de chamada recebida) — evita discar de novo e
   *  evita pedir "Atender" uma segunda vez. */
  existingCallId?: string | null;
  initialStatus?: 'ringing' | 'answered';
  onAnswer?: () => void;
  onEnd: () => void;
}

/** Variantes visuais que este diálogo desenha. */
type VisualStatus = 'ringing' | 'answered' | 'ended';

/**
 * T21 — traduz o estado da máquina de sessão (`session.status`, do provider)
 * para as variantes que a UI sempre usou.
 *
 * O diálogo não tem mais status próprio: quem sabe se a chamada toca, foi
 * atendida ou terminou é o `reduce()` de `src/lib/calls/session.ts`, via
 * `useCallSession()`. O mapeamento é conservador para não regredir a tela:
 * - `connecting`/`active` → `answered` (aceita ou em curso);
 * - `ending`/`ended`      → `ended`;
 * - `dialing`/`ringing_out`/`ringing_in` → `ringing`, EXCETO quando a chamada
 *   já chegou atendida (`initialStatus='answered'`, ex.: o alerta de chamada
 *   recebida) — aí não se volta a pedir "Atender";
 * - `idle` (máquina ainda sem sessão, ex.: antes do `dial()` resolver o gate de
 *   microfone) → `initialStatus`, ou `ringing` como antes.
 */
function visualStatus(status: CallSessionStatus, initial?: 'ringing' | 'answered'): VisualStatus {
  switch (status) {
    case 'connecting':
    case 'active':
      return 'answered';
    case 'ending':
    case 'ended':
      return 'ended';
    case 'dialing':
    case 'ringing_out':
    case 'ringing_in':
      return initial === 'answered' ? 'answered' : 'ringing';
    case 'idle':
      return initial ?? 'ringing';
  }
}

/**
 * SL-246 — o navegador sabe trocar a SAÍDA de áudio (`setSinkId`)?
 *
 * A função está na lib do TypeScript, mas não existe em todo navegador (Firefox
 * e Safari não implementam): sem ela, o controle de saída não é renderizado —
 * era exatamente o combinado do T21, que removeu o botão de alto-falante
 * cosmético e o condicionou à existência da troca real de sink.
 */
function suportaTrocaDeSaida(): boolean {
  return typeof HTMLMediaElement !== 'undefined'
    && typeof (HTMLMediaElement.prototype as Partial<HTMLMediaElement>).setSinkId === 'function';
}

/** Uma saída de áudio do sistema, como o navegador a enxerga. */
interface SaidaDeAudio {
  deviceId: string;
  label: string;
}

/**
 * Saídas de áudio da máquina. O rótulo vem vazio enquanto o usuário não deu
 * permissão de microfone à página (comportamento do navegador, não bug): nesse
 * caso numeramos a lista para o atendente ainda poder escolher.
 */
async function listarSaidasDeAudio(): Promise<SaidaDeAudio[]> {
  const midia = navigator.mediaDevices;
  if (!midia?.enumerateDevices) return [];
  const dispositivos = await midia.enumerateDevices();
  return dispositivos
    .filter((dispositivo) => dispositivo.kind === 'audiooutput')
    .map((dispositivo, indice) => ({
      deviceId: dispositivo.deviceId,
      label: dispositivo.label || `Saída de áudio ${indice + 1}`,
    }));
}

export function CallDialog({
  open,
  onOpenChange,
  contact,
  direction,
  existingCallId,
  initialStatus,
  onAnswer,
  onEnd,
}: CallDialogProps) {
  // T21 — a fonte única da sessão. O diálogo NÃO grava em `calls`: o registro
  // (RPC `upsert_my_call`) é do MOTOR; aqui só se disca, atende e desliga pela
  // máquina de estados do provider.
  const { session, dial, accept, hangup, callDuration, isMuted, toggleMute } = useCallSession();

  const status = visualStatus(session.status, initialStatus);

  /**
   * Guarda de discagem: uma por abertura do diálogo.
   *
   * Sem o id/timer local de antes, é este ref que impede discar duas vezes: o
   * `dial` do provider troca de identidade a cada render (depende do estado do
   * SIP), então o efeito re-executa o tempo todo e precisa de uma trava própria.
   * Também preserva o comportamento antigo de não discar quando a chamada já
   * existe (`existingCallId`).
   */
  const discouRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Próxima abertura = próxima chamada.
      discouRef.current = false;
      return;
    }
    if (discouRef.current || existingCallId) return;
    // Entrada sem id (não acontece pelo `IncomingCallAlert`, que sempre manda
    // `existingCallId`): quem registra é o motor, via `INVITE_RECEIVED`. Discar
    // aqui criaria uma SAÍDA para uma chamada que está CHEGANDO.
    if (direction !== 'outbound') return;
    discouRef.current = true;
    // C02 — o cartão do contato disca SEM abrir o discador da Telefonia
    // (`abrirDiscador:false`): a chamada fica na tela onde o agente está. Se a
    // guarda do microfone recusar, `dial` resolve `false` (o motivo já foi ao
    // toast por ela): o diálogo fecha em vez de ficar "Chamando..." eterno.
    void Promise.resolve(dial(contact.phone, { abrirDiscador: false })).then((discou) => {
      if (discou === false) {
        onEnd();
        onOpenChange(false);
      }
    });
  }, [open, existingCallId, direction, contact.phone, dial, onEnd, onOpenChange]);

  /**
   * SL-246 — saída de áudio da chamada.
   *
   * `setSinkId` é do navegador, não do nosso estado: a lista é lida na hora do
   * clique (nunca em efeito) e a troca é aplicada ao elemento de áudio remoto do
   * SIP (`REMOTE_AUDIO_ID`), que é quem toca o áudio do outro lado. A saída só é
   * marcada como atual DEPOIS de o `setSinkId` resolver — anunciar sucesso antes
   * da confirmação é o que o revisor recusa.
   */
  const sinkSuportado = suportaTrocaDeSaida();
  const [painelSaida, setPainelSaida] = useState(false);
  const [carregandoSaidas, setCarregandoSaidas] = useState(false);
  const [saidas, setSaidas] = useState<SaidaDeAudio[]>([]);
  const [saidaAtual, setSaidaAtual] = useState<string | null>(null);
  const [erroSaida, setErroSaida] = useState<string | null>(null);

  const fecharSeletorSaida = () => {
    setPainelSaida(false);
    setCarregandoSaidas(false);
    setSaidas([]);
    setErroSaida(null);
  };

  const alternarSeletorSaida = async () => {
    if (painelSaida) {
      fecharSeletorSaida();
      return;
    }
    // O painel abre JÁ, com o estado de carregamento: enumerar dispositivos pode
    // demorar (o navegador pergunta a permissão) e um clique sem resposta na
    // tela é o que o atendente lê como "não funciona".
    setPainelSaida(true);
    setErroSaida(null);
    setCarregandoSaidas(true);
    try {
      setSaidas(await listarSaidasDeAudio());
    } catch {
      setSaidas([]);
      setErroSaida('Não foi possível listar as saídas de áudio.');
    } finally {
      setCarregandoSaidas(false);
    }
  };

  const escolherSaida = async (deviceId: string) => {
    const audio = document.getElementById(REMOTE_AUDIO_ID) as HTMLMediaElement | null;
    if (!audio || typeof audio.setSinkId !== 'function') {
      setErroSaida('O áudio da chamada não está disponível nesta página.');
      return;
    }
    try {
      await audio.setSinkId(deviceId);
      setSaidaAtual(deviceId);
      setErroSaida(null);
      setPainelSaida(false);
    } catch {
      // O navegador recusou (saída desconectada, sem permissão): o motivo fica na
      // tela e a saída atual NÃO muda.
      setErroSaida('Não foi possível trocar a saída de áudio.');
    }
  };

  const handleAnswer = async () => {
    // A máquina decide: `accept()` despacha ACCEPT (ringing_in → connecting) e
    // deixa o ESTABLISHED do motor marcar `answeredAt`.
    await accept();
    onAnswer?.();
    void logAudit({
      action: 'call_started',
      entityType: 'call',
      entityId: session.sessionId ?? undefined,
      details: { direction, contact_phone: contact.phone },
    });
  };

  const handleEnd = () => {
    // A máquina decide o desfecho: desligar uma entrada que ainda toca vira
    // REJECT → `declined`; nos demais estados, HANGUP_LOCAL. O gravação do
    // desfecho é do motor (RPC), não da UI.
    hangup();
    void logAudit({
      action: 'call_ended',
      entityType: 'call',
      entityId: session.sessionId ?? undefined,
      details: { direction, duration: callDuration, contact_phone: contact.phone },
    });
    onEnd();
    onOpenChange(false);
    // O seletor de saída não sobrevive à chamada: a próxima abertura começa com
    // a lista fechada e sem erro de áudio antigo na tela.
    fecharSeletorSaida();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(proximo) => {
        // Fechar por X/ESC/clique fora também fecha o seletor de saída, para a
        // próxima chamada não abrir com a lista (e o erro) da anterior na tela.
        if (!proximo) fecharSeletorSaida();
        onOpenChange(proximo);
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 overflow-hidden bg-gradient-to-b from-card to-background border-0">
        <DialogTitle className="sr-only">Chamada em andamento</DialogTitle>
        <div className="p-8 flex flex-col items-center">
          {/* Contact Avatar */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
            <Avatar className="w-24 h-24 border-4 border-whatsapp/20">
              <AvatarImage src={contact.avatar} alt={contact.name || 'Avatar'} />
              <AvatarFallback className="text-2xl bg-whatsapp/10 text-whatsapp">
                {contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            {/* Ringing animation */}
            <AnimatePresence>
              {status === 'ringing' && (
                <>
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border-2 border-whatsapp"
                  />
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    className="absolute inset-0 rounded-full border-2 border-whatsapp"
                  />
                </>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Contact Info */}
          <h3 className="mt-6 text-xl font-semibold text-foreground">{contact.name}</h3>
          <p className="text-muted-foreground">{contact.phone}</p>

          {/* Status */}
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            {status === 'ringing' && (
              <p className="text-muted-foreground">
                {direction === 'inbound' ? 'Chamada recebida...' : 'Chamando...'}
              </p>
            )}
            {status === 'answered' && (
              <p className="text-whatsapp font-mono text-lg">{formatDuration(callDuration)}</p>
            )}
          </motion.div>

          {/* Controls */}
          <div className="mt-8 flex items-center gap-4">
            {status === 'answered' && (
              <>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'w-12 h-12 rounded-full',
                      isMuted && 'bg-destructive/10 border-destructive text-destructive'
                    )}
                    // T21 — o mudo agora é o REAL do motor (engine.toggleMute()),
                    // não um estado local que não silenciava nada.
                    onClick={toggleMute}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </Button>
                </motion.div>

                {/* SL-246 — alto-falante de verdade: troca a saída de áudio do
                    navegador (`setSinkId`) no elemento de áudio remoto da
                    chamada. Onde o navegador não tem a função, o controle não
                    existe — era o combinado do T21: nada de botão cosmético. */}
                {sinkSuportado && (
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        'w-12 h-12 rounded-full',
                        painelSaida && 'bg-primary/10 border-primary text-primary'
                      )}
                      aria-label="Saída de áudio"
                      aria-haspopup="listbox"
                      aria-expanded={painelSaida}
                      data-testid="call-output-device-trigger"
                      onClick={() => void alternarSeletorSaida()}
                    >
                      <Volume2 className="w-5 h-5" />
                    </Button>
                  </motion.div>
                )}
              </>
            )}

            {status === 'ringing' && direction === 'inbound' && (
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  size="icon"
                  className="w-14 h-14 rounded-full bg-whatsapp hover:bg-whatsapp-dark"
                  onClick={handleAnswer}
                >
                  <Phone className="w-6 h-6" />
                </Button>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                size="icon"
                className="w-14 h-14 rounded-full bg-destructive hover:bg-destructive/90"
                onClick={handleEnd}
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </motion.div>
          </div>

          {/* SL-246 — saídas de áudio da máquina. Só com a chamada ATENDIDA e com
              `setSinkId` no navegador: em toque/chamada encerrada não há saída a
              trocar. */}
          {status === 'answered' && sinkSuportado && painelSaida && (
            <div
              data-testid="call-output-device-panel"
              className="mt-4 w-full rounded-xl border border-border/60 bg-popover p-3 text-popover-foreground"
            >
              <p className="text-xs font-medium">Saída de áudio</p>
              {carregandoSaidas && (
                <p className="mt-1 text-xs text-muted-foreground">Carregando saídas de áudio…</p>
              )}
              {!carregandoSaidas && erroSaida && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {erroSaida}
                </p>
              )}
              {!carregandoSaidas && !erroSaida && saidas.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhuma saída de áudio encontrada.
                </p>
              )}
              {!carregandoSaidas && saidas.length > 0 && (
                <ul role="listbox" aria-label="Saída de áudio" className="mt-2 flex flex-col gap-1">
                  {saidas.map((saida) => (
                    <li key={saida.deviceId}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={saida.deviceId === saidaAtual}
                        className={cn(
                          'w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                          saida.deviceId === saidaAtual ? 'bg-primary/10 text-primary' : 'text-foreground',
                        )}
                        onClick={() => void escolherSaida(saida.deviceId)}
                      >
                        {saida.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Info text */}
          <p className="mt-6 text-xs text-muted-foreground text-center max-w-xs">
            {status === 'ringing' && direction === 'outbound' 
              ? 'Aguardando resposta do contato...'
              : status === 'answered'
              ? 'Chamada em andamento'
              : null
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
