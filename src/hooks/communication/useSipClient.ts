import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useSipConnection } from '../sip/useSipConnection';
import { criarFilaDePersistencia, type CallEndOutcome } from '@/lib/calls/persistence';
import { phoneQueryVariants, pickUniquePhoneMatch } from '@/lib/calls/phone';
import { SipCallAdapter } from '@/lib/calls/adapters/SipCallAdapter';
import { provisionarSip } from '@/lib/calls/sipProvisioning';
import { useMicrophoneGuard } from './useMicrophoneGuard';
import { useTabLeaderRole } from './useTabLeaderRole';
import { useCallEngineSink } from './useCallEngineSink';
import { CallEngine } from '@/lib/calls/adapters/CallEngine';
import type { EngineStatus } from '@/lib/calls/adapters/CallEngine';
import type { AdapterDirection } from '@/lib/calls/adapters/CallAdapter';

export type { SipStatus } from '../sip/useSipConnection';
export type CallStatus = EngineStatus;
export type CallDirection = AdapterDirection;

const log = getLogger('SipClient');

/**
 * T09: estado espelhado do motor, cronômetro, toast e conexão. T11: o banco é
 * gravado por `upsert_my_call` (mesmo id nas 3 gravações) — `useCalls` sai. T12: `onEnd` recebe o desfecho fino do fim (quem encerrou + o código SIP).
 */
export function useSipClient(onEnd?: (outcome: CallEndOutcome) => void) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [currentNumber, setCurrentNumber] = useState('');
  const [callDirection, setCallDirection] = useState<CallDirection | null>(null);
  // T11: a linha no banco (= `sessionId` da máquina) e a direção fora do estado
  // (o sink é memoizado: `directionRef` evita closure velha).
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [filaDePersistencia] = useState(() => criarFilaDePersistencia()); // D3: ordem de chamada = ordem de gravação
  const directionRef = useRef<CallDirection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  const startTimer = useCallback(() => { setCallDuration(0); timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000); }, []);
  // T14: correspondência só por E.164 completo (nunca por sufixo de 8 dígitos).
  const findContactByPhone = useCallback(async (phone: string): Promise<string | null> => {
    const variants = phoneQueryVariants(phone);
    if (variants.length === 0) return null;
    try {
      const { data } = await supabase.from('contacts').select('id, phone')
        .or(variants.map(v => `phone.eq.${v}`).join(',')).limit(5);
      return pickUniquePhoneMatch(data ?? [], phone);
    } catch {
      return null;
    }
  }, []);
  const sink = useCallEngineSink({
    setCallStatus, setCallDirection, setCurrentNumber, setIsMuted, setCurrentCallId,
    directionRef, startTimer, stopTimer, findContactByPhone, filaDePersistencia, onEnd,
  });

  // Lazy init (não `useRef`): o motor é criado uma vez e nunca lido em render.
  const [engine] = useState(() => new CallEngine(new SipCallAdapter(log)));
  useEffect(() => { engine.bind(sink); }, [engine, sink]);
  const handleInvitation = useCallback((invitation: Parameters<CallEngine['handleInvitation']>[0]) => engine.handleInvitation(invitation), [engine]);
  const { sipStatus, sipReason, setSipReason, uaRef, connect, disconnect } = useSipConnection(handleInvitation);

  // T17: o microfone é conferido ANTES de discar E de atender — este é o funil
  // real dos dois caminhos (o painel VoIP chama o SIP direto, sem passar pelo
  // provider). Sem isto a negativa virava "Erro ao ligar" genérico.
  const { micReason, garantirMicrofone } = useMicrophoneGuard();
  // O `sessionId` vem do provider: é o id da linha e o mesmo do evento `DIAL`.
  const makeCall = useCallback(async (number: string, sessionId?: string) => {
    if (!(await garantirMicrofone())) return;
    engine.makeCall(number, uaRef.current, sipStatus === 'registered', sessionId);
  }, [engine, sipStatus, uaRef, garantirMicrofone]);
  const hangUp = useCallback(() => engine.hangUp(), [engine]);
  const toggleMute = useCallback(() => engine.toggleMute(), [engine]);
  const sendDTMF = useCallback((digit: string) => engine.sendDTMF(digit), [engine]);
  const acceptIncomingCall = useCallback(async () => { if (await garantirMicrofone()) await engine.accept(); }, [engine, garantirMicrofone]);
  const rejectIncomingCall = useCallback(async () => { await engine.reject(); }, [engine]);

  const connectWithStoredCredentials = useCallback(async () => {
    const config = await provisionarSip();
    if (config) await connect(config);
  }, [connect]);

  // T20: só a TRANSIÇÃO de papel age (o papel de nascença não conecta). Os
  // callbacks vão numa ref dentro do hook — a identidade deles não agenda o
  // efeito, então não há loop de disconnect a cada render.
  useTabLeaderRole({
    onBecameLeader: () => { void connectWithStoredCredentials(); },
    onBecameFollower: () => { void disconnect().then(() => setSipReason('line_in_use_other_tab')); },
  });

  useEffect(() => () => { stopTimer(); engine.dispose(); }, [stopTimer, engine]);

  return {
    sipStatus, sipReason, micReason, callStatus, callDuration, isMuted, currentNumber, callDirection, currentCallId,
    connect, connectWithStoredCredentials, disconnect, makeCall, hangUp, toggleMute, sendDTMF,
    acceptIncomingCall, rejectIncomingCall, garantirMicrofone,
  };
}
