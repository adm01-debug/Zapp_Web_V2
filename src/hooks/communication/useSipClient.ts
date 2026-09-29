import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSipConnection } from '../sip/useSipConnection';
import { useCalls } from './useCalls';
import { phoneQueryVariants, pickUniquePhoneMatch } from '@/lib/calls/phone';
import { SipCallAdapter } from '@/lib/calls/adapters/SipCallAdapter';
import { CallEngine } from '@/lib/calls/adapters/CallEngine';
import type { CallEngineSink, EngineStatus } from '@/lib/calls/adapters/CallEngine';
import type { AdapterDirection } from '@/lib/calls/adapters/CallAdapter';

export type { SipStatus } from '../sip/useSipConnection';
export type CallStatus = EngineStatus;
export type CallDirection = AdapterDirection;

const log = getLogger('SipClient');
// Removidos no T15 (provisionamento por Edge): por ora são o default do
// servidor, e o front ainda precisa deles para conectar.
const SIP_SERVER = 'ip.b24-9441-1552764901.bitrixphone.com';
const SIP_USER = 'phone1';
const SIP_WS_PORT = 8089;

/**
 * Ligação React do motor de chamada (T09): estado espelhado, cronômetro da
 * duração, toast e conexão. A lógica de sessão vive em `CallEngine`.
 */
export function useSipClient() {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [currentNumber, setCurrentNumber] = useState('');
  const [callDirection, setCallDirection] = useState<CallDirection | null>(null);

  const { startCall, answerCall, endCall, missCall, currentCallId } = useCalls();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  const startTimer = useCallback(() => { setCallDuration(0); timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000); }, []);

  // T14: correspondência só por E.164 completo (nunca por sufixo de 8 dígitos).
  // A consulta é textual e traz candidatos; `pickUniquePhoneMatch` decide.
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

  const sink: CallEngineSink = useMemo(() => ({
    onStatus: setCallStatus,
    onSession: (direction, number) => { setCallDirection(direction); setCurrentNumber(number); },
    onEstablished: startTimer,
    onTerminated: stopTimer,
    onMuted: setIsMuted,
    onError: (message) => toast.error(message),
    create: async (params) => {
      const contactId = await findContactByPhone(params.contactPhone);
      return startCall({ ...params, contactId: contactId || undefined });
    },
    onAnswered: answerCall,
    onFinished: (callId, talkSeconds) => {
      if (talkSeconds === null) void missCall(callId); else void endCall(callId, talkSeconds);
    },
  }), [startTimer, stopTimer, findContactByPhone, startCall, answerCall, endCall, missCall]);

  // Lazy init (não `useRef`): o motor é criado uma vez e nunca lido em render.
  // O sink é ligado no efeito abaixo, então a construção não captura estado.
  const [engine] = useState(() => new CallEngine(new SipCallAdapter(log)));
  useEffect(() => { engine.bind(sink); }, [engine, sink]);

  const handleInvitation = useCallback((invitation: Parameters<CallEngine['handleInvitation']>[0]) => {
    engine.handleInvitation(invitation);
  }, [engine]);

  const { sipStatus, uaRef, connect, disconnect } = useSipConnection(handleInvitation);

  const makeCall = useCallback((number: string) => engine.makeCall(number, uaRef.current, sipStatus === 'registered'), [engine, sipStatus, uaRef]);
  const hangUp = useCallback(() => engine.hangUp(), [engine]);
  const toggleMute = useCallback(() => engine.toggleMute(), [engine]);
  const sendDTMF = useCallback((digit: string) => engine.sendDTMF(digit), [engine]);
  const acceptIncomingCall = useCallback(async () => { await engine.accept(); }, [engine]);
  const rejectIncomingCall = useCallback(async () => { await engine.reject(); }, [engine]);

  const connectWithStoredCredentials = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('get-sip-password');
    const password = data?.password;
    if (error || !password) {
      // FunctionsHttpError.context pode ser Response (status) ou corpo já
      // parseado (code), dependendo da versão do supabase-js.
      const ctx = (error as { context?: { status?: number; code?: string } } | null)?.context;
      const isMissingSecret = error ? ctx?.status === 503 || ctx?.code === 'SIP_NOT_CONFIGURED' : true;
      toast.error(isMissingSecret
        ? 'Senha SIP não configurada. Adicione o segredo SIP_PASSWORD no Supabase.'
        : 'Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.');
      return;
    }
    await connect({ server: SIP_SERVER, user: SIP_USER, password, wsPort: SIP_WS_PORT });
  }, [connect]);

  useEffect(() => () => { stopTimer(); engine.dispose(); }, [stopTimer, engine]);

  return {
    sipStatus, callStatus, callDuration, isMuted, currentNumber, callDirection, currentCallId,
    connect, connectWithStoredCredentials, disconnect, makeCall, hangUp, toggleMute, sendDTMF,
    acceptIncomingCall, rejectIncomingCall,
  };
}
