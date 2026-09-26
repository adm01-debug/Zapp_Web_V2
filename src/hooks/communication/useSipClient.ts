import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import type { Invitation, Inviter, Session, Web } from 'sip.js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSipConnection } from '../sip/useSipConnection';
import { useCalls } from './useCalls';

export type { SipStatus } from '../sip/useSipConnection';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'on-hold' | 'ended';
export type CallDirection = 'inbound' | 'outbound';

const log = getLogger('SipClient');

const SIP_SERVER = 'ip.b24-9441-1552764901.bitrixphone.com';
const SIP_USER = 'phone1';
const SIP_WS_PORT = 8089;

export function useSipClient() {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const callStatusRef = useRef<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [currentNumber, setCurrentNumber] = useState('');
  const [callDirection, setCallDirection] = useState<CallDirection | null>(null);
  const callDirectionRef = useRef<CallDirection | null>(null);

  const { startCall, answerCall, endCall, missCall, currentCallId } = useCalls();

  const sessionRef = useRef<Session | null>(null);
  const incomingInvitationRef = useRef<Invitation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const answeredAtRef = useRef<Date | null>(null);
  // Promise (não valor síncrono) porque o registro no banco começa em paralelo
  // com o convite SIP — Estabelecida/Terminada podem chegar antes de resolver.
  const callIdPromiseRef = useRef<Promise<string | null> | null>(null);

  const getRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) {
      const existing = document.getElementById('sip-remote-audio');
      if (existing) existing.remove();
      const audio = document.createElement('audio');
      audio.id = 'sip-remote-audio'; audio.autoplay = true;
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
    }
    return remoteAudioRef.current;
  }, []);

  const startTimer = useCallback(() => { setCallDuration(0); timerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000); }, []);
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);

  // Prioriza correspondência exata e normalizada; só usa o fallback por sufixo
  // quando ele resolve para um único contato, para não associar a chamada ao
  // contato errado por coincidência dos últimos dígitos.
  const findContactByPhone = useCallback(async (phone: string): Promise<string | null> => {
    try {
      const digits = phone.replace(/\D/g, '');
      if (!digits) return null;
      const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
      const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
      const candidates = Array.from(new Set([digits, withCountry, withoutCountry]));
      const orFilter = candidates.flatMap(d => [`phone.eq.${d}`, `phone.eq.+${d}`]).join(',');

      const { data: exact } = await supabase.from('contacts').select('id').or(orFilter).limit(2);
      if (exact && exact.length === 1) return exact[0].id;
      if (exact && exact.length > 1) return null;

      if (digits.length < 8) return null;
      const suffix = digits.slice(-8);
      const { data: fuzzy } = await supabase.from('contacts').select('id').ilike('phone', `%${suffix}`).limit(2);
      if (fuzzy && fuzzy.length === 1) return fuzzy[0].id;
      return null;
    } catch {
      return null;
    }
  }, []);

  // `state` é comparado por valor (strings): sip.js só é importado de fato
  // (import() dinâmico) no momento de conectar/discar, para não engordar o
  // bundle inicial do app com uma lib que só entra em uso dentro de Telefonia.
  const handleSessionStateChange = useCallback((state: string, session: Session, number: string, direction: CallDirection) => {
    if (state === 'Establishing') {
      setCallStatus('ringing'); callStatusRef.current = 'ringing';
    } else if (state === 'Established') {
      const answeredAt = new Date();
      answeredAtRef.current = answeredAt;
      setCallStatus('active'); callStatusRef.current = 'active'; startTimer();
      callIdPromiseRef.current?.then((id) => { if (id) answerCall(id); });
      const stream = new MediaStream();
      const audio = getRemoteAudio();
      const sdh = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      sdh?.peerConnection?.getReceivers().forEach(r => { if (r.track) stream.addTrack(r.track); });
      audio.srcObject = stream;
    } else if (state === 'Terminated') {
      stopTimer();
      const answeredAt = answeredAtRef.current;
      setCallStatus('ended'); callStatusRef.current = 'ended'; setIsMuted(false);

      callIdPromiseRef.current?.then((id) => {
        if (!id) return;
        if (answeredAt) {
          const durationSeconds = Math.max(0, Math.round((Date.now() - answeredAt.getTime()) / 1000));
          endCall(id, durationSeconds);
        } else {
          missCall(id);
        }
      });

      answeredAtRef.current = null;
      callIdPromiseRef.current = null;
      sessionRef.current = null;
      if (direction === 'inbound') incomingInvitationRef.current = null;
      setTimeout(() => {
        setCallStatus('idle'); callStatusRef.current = 'idle';
        setCallDirection(null); callDirectionRef.current = null; setCurrentNumber('');
      }, 2000);
    }
  }, [startTimer, stopTimer, getRemoteAudio, answerCall, endCall, missCall]);

  const handleIncomingInvitation = useCallback((invitation: Invitation) => {
    if (callStatusRef.current !== 'idle') {
      invitation.reject({ statusCode: 486 }).catch((err) => log.error('Reject (busy) error:', err));
      return;
    }

    const remoteUser = invitation.remoteIdentity?.uri?.user || 'desconhecido';
    incomingInvitationRef.current = invitation;
    answeredAtRef.current = null;
    setCurrentNumber(remoteUser);
    setCallDirection('inbound'); callDirectionRef.current = 'inbound';
    setCallStatus('ringing'); callStatusRef.current = 'ringing';

    invitation.stateChange.addListener((state) => handleSessionStateChange(state, invitation, remoteUser, 'inbound'));

    callIdPromiseRef.current = findContactByPhone(remoteUser).then((contactId) => startCall({
      contactId: contactId || undefined,
      contactPhone: remoteUser,
      contactName: '',
      direction: 'inbound',
    }));
  }, [handleSessionStateChange, findContactByPhone, startCall]);

  const { sipStatus, uaRef, connect, disconnect } = useSipConnection(handleIncomingInvitation);

  const acceptIncomingCall = useCallback(async () => {
    const invitation = incomingInvitationRef.current;
    if (!invitation) return;
    try {
      await invitation.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      sessionRef.current = invitation;
    } catch (err) {
      log.error('Accept error:', err);
      toast.error('Erro ao atender a chamada.');
    }
  }, []);

  const rejectIncomingCall = useCallback(async () => {
    const invitation = incomingInvitationRef.current;
    if (!invitation) return;
    try {
      await invitation.reject();
    } catch (err) {
      log.error('Reject error:', err);
    }
  }, []);

  const makeCall = useCallback(async (number: string) => {
    if (!uaRef.current || sipStatus !== 'registered') { toast.error('VoIP não conectado.'); return; }
    if (callStatusRef.current !== 'idle') { toast.error('Já existe uma chamada em andamento.'); return; }
    try {
      const { UserAgent, Inviter } = await import('sip.js');
      const target = UserAgent.makeURI(`sip:${number}@${uaRef.current.configuration.uri.host}`);
      if (!target) { toast.error('Número inválido'); return; }

      setCurrentNumber(number); setCallDirection('outbound'); callDirectionRef.current = 'outbound';
      setCallStatus('calling'); callStatusRef.current = 'calling';
      answeredAtRef.current = null;

      // Não bloqueia a discagem: o registro roda em paralelo com o convite SIP.
      callIdPromiseRef.current = findContactByPhone(number).then((contactId) => startCall({
        contactId: contactId || undefined,
        contactPhone: number,
        contactName: '',
        direction: 'outbound',
      }));

      const inviter = new Inviter(uaRef.current, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      // Atribuído antes do invite() para que hangUp() encontre a sessão mesmo
      // com o INVITE ainda pendente (evita ligação órfã em cancelamento rápido).
      sessionRef.current = inviter;
      inviter.stateChange.addListener((state) => handleSessionStateChange(state, inviter, number, 'outbound'));
      await inviter.invite();
    } catch (err: unknown) {
      log.error('Call error:', err);
      callIdPromiseRef.current?.then((id) => { if (id) missCall(id); });
      callIdPromiseRef.current = null;
      sessionRef.current = null;
      setCallStatus('idle'); callStatusRef.current = 'idle'; setCallDirection(null); callDirectionRef.current = null;
      toast.error(`Erro ao ligar: ${err instanceof Error ? err.message : 'Falha'}`);
    }
  }, [sipStatus, uaRef, findContactByPhone, startCall, missCall, handleSessionStateChange]);

  const hangUp = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      try {
        if (session.state === 'Established') {
          session.bye();
        } else if (callDirectionRef.current === 'outbound') {
          (session as Inviter).cancel();
        } else {
          (session as Invitation).reject().catch((err) => log.error('Reject error:', err));
        }
      } catch (err) { log.error('Hangup error:', err); }
    } else if (incomingInvitationRef.current && callStatusRef.current === 'ringing') {
      rejectIncomingCall();
    }
    // Não força 'idle' aqui: o listener de Terminated é a única fonte de
    // verdade sobre o resultado final (atendida/perdida) e a duração.
  }, [rejectIncomingCall]);

  const toggleMute = useCallback(() => {
    if (!sessionRef.current) return;
    const sdh = sessionRef.current.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    sdh?.peerConnection?.getSenders().forEach(s => { if (s.track?.kind === 'audio') s.track.enabled = isMuted; });
    setIsMuted(!isMuted);
  }, [isMuted]);

  const sendDTMF = useCallback((digit: string) => {
    if (!sessionRef.current || sessionRef.current.state !== 'Established') return;
    try {
      const sdh = sessionRef.current.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      const sender = sdh?.peerConnection?.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) (sender as RTCRtpSender & { dtmf?: RTCDTMFSender }).dtmf?.insertDTMF(digit, 100, 70);
    } catch (err) { log.error('DTMF error:', err); }
  }, []);

  const connectWithStoredCredentials = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('get-sip-password');
    const password = data?.password;
    if (error || !password) {
      // FunctionsHttpError.context pode ser Response (status) ou corpo já
      // parseado (code), dependendo da versão do supabase-js.
      const ctx = (error as { context?: { status?: number; code?: string } } | null)?.context;
      const isMissingSecret = error
        ? ctx?.status === 503 || ctx?.code === 'SIP_NOT_CONFIGURED'
        : true;
      toast.error(
        isMissingSecret
          ? 'Senha SIP não configurada. Adicione o segredo SIP_PASSWORD no Supabase.'
          : 'Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.'
      );
      return;
    }
    await connect({ server: SIP_SERVER, user: SIP_USER, password, wsPort: SIP_WS_PORT });
  }, [connect]);

  useEffect(() => { return () => { stopTimer(); remoteAudioRef.current?.remove(); remoteAudioRef.current = null; }; }, [stopTimer]);

  return {
    sipStatus, callStatus, callDuration, isMuted, currentNumber, callDirection, currentCallId,
    connect, connectWithStoredCredentials, disconnect, makeCall, hangUp, toggleMute, sendDTMF,
    acceptIncomingCall, rejectIncomingCall,
  };
}
