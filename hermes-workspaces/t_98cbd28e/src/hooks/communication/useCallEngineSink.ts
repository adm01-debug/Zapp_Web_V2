import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { novoCallId, desfechoDaChamada, type CallEndOutcome, type UpsertMyCallInput, type FilaDePersistencia } from '@/lib/calls/persistence';
import type { CallEngineSink, EngineStatus } from '@/lib/calls/adapters/CallEngine';
import type { AdapterDirection } from '@/lib/calls/adapters/CallAdapter';
import { busyHereOutcome } from '@/lib/calls/session';
import { REASON_LABEL } from '@/lib/calls/capabilities';

const log = getLogger('SipClient');

/**
 * Deps do sink do motor. São exatamente as mesmas do array de `useMemo` que
 * vivia no `useSipClient` (`startTimer`, `stopTimer`, `findContactByPhone`,
 * `filaDePersistencia`, `onEnd`) mais os setters estáveis de estado e a ref da
 * direção, que o sink já usava sem entrar em deps (o React garante a identidade
 * dos setters; a ref é estável por natureza).
 */
export interface CallEngineSinkDeps {
  setCallStatus: Dispatch<SetStateAction<EngineStatus>>;
  setCallDirection: Dispatch<SetStateAction<AdapterDirection | null>>;
  setCurrentNumber: Dispatch<SetStateAction<string>>;
  setIsMuted: Dispatch<SetStateAction<boolean>>;
  setCurrentCallId: Dispatch<SetStateAction<string | null>>;
  /** T11: a direção fica fora do estado — o sink é memoizado e a ref evita closure velha. */
  directionRef: { current: AdapterDirection | null };
  startTimer: () => void;
  stopTimer: () => void;
  findContactByPhone: (phone: string) => Promise<string | null>;
  filaDePersistencia: FilaDePersistencia;
  onEnd?: (outcome: CallEndOutcome) => void;
}

/**
 * Sink do `CallEngine` (extraído do `useSipClient` no T09, movimentação
 * mecânica): liga o motor sem React aos setters de estado, ao banco
 * (`upsert_my_call` via fila) e ao toast. Mesmos textos e mesmas ordens do
 * original — tudo o que este hook faz é agrupar as MESMAS deps do `useMemo`.
 */
export function useCallEngineSink(deps: CallEngineSinkDeps): CallEngineSink {
  const { setCallStatus, setCallDirection, setCurrentNumber, setIsMuted, setCurrentCallId, directionRef, startTimer, stopTimer, findContactByPhone, filaDePersistencia, onEnd } = deps;
  return useMemo(() => {
    const persistir = async (input: UpsertMyCallInput) => {
      const { ok, error } = await filaDePersistencia.executar(input);
      // Falha de banco nunca é silenciosa: log com o id da chamada + toast.
      if (!ok) { log.error(`Falha ao gravar a chamada (id=${input.id})`, error); toast.error('Não foi possível salvar a ligação'); }
    };
    return {
      onStatus: setCallStatus,
      onSession: (direction, number) => { directionRef.current = direction; setCallDirection(direction); setCurrentNumber(number); },
      onEstablished: startTimer,
      onTerminated: stopTimer,
      onMuted: setIsMuted,
      onError: (message) => toast.error(message),
      create: async (params) => {
        const id = novoCallId(params.sessionId);
        setCurrentCallId(id);
        const contactId = await findContactByPhone(params.contactPhone);
        await persistir({ id, direction: params.direction, status: 'ringing', channel: 'voip', peerNumber: params.contactPhone, contactId, providerCallId: params.providerCallId });
        return id;
      },
      onAnswered: (callId) => {
        void persistir({ id: callId, direction: directionRef.current ?? 'outbound', status: 'answered', answeredAt: new Date().toISOString() });
      },
      onFinished: (callId, talkSeconds, outcome) => {
        const direction = directionRef.current ?? 'outbound';
        setCurrentCallId(null); onEnd?.(outcome); // a próxima discagem não reaproveita a linha anterior
        void persistir({ id: callId, direction, endedAt: new Date().toISOString(), talkSeconds, ...desfechoDaChamada(talkSeconds, direction, outcome) });
      },
      onBusyHere: (number) => {
        // T20: 2ª chamada chegando com a linha ocupada. A chamada em CURSO não
        // é tocada aqui; a que chega nasce e morre como `missed`/`busy_here`
        // (busyHereOutcome), com id próprio — nunca o id da que está no ar.
        const { persistedStatus, endReason } = busyHereOutcome();
        void persistir({
          id: novoCallId(), direction: 'inbound', status: persistedStatus, channel: 'voip',
          peerNumber: number, endReason, endedAt: new Date().toISOString(),
        });
        toast.info(REASON_LABEL.line_busy_here);
      },
    };
  }, [startTimer, stopTimer, findContactByPhone, filaDePersistencia, onEnd, directionRef, setCallDirection, setCallStatus, setCurrentCallId, setCurrentNumber, setIsMuted]);
}
