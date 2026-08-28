import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { UserAgent, Inviter, SessionState, Web } from 'sip.js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSipConnection } from '../sip/useSipConnection';

export type { SipStatus } from '../sip/useSipConnection';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active' | 'on-hold' | 'ended';

const log = getLogger('SipClient');

export function useSipClient() {
  const { sipStatus, uaRef, connect, disconnect } = useSipConnection();
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const callStatusRef = useRef<CallStatus>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [currentNumber, setCurrentNumber] = useState('');

  const sessionRef = useRef<Inviter | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callStartTimeRef = useRef<string | null>(null);
  const profileIdRef = useRef<string | null>(null);

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

  const findContactByPhone = useCallback(async (phone: string): Promise<string | null> => {
    try {
      const n = phone.replace(/[\s\-\(\)]/g, '');
      const { data } = await supabase.from('contacts').select('id').or(`phone.eq.${n},phone.eq.+${n},phone.ilike.%${n.slice(-8)}%`).limit(1).maybeSingle();
      return data?.id || null;
    } catch { return null; }
  }, []);

  const getProfileId = useCallback(async (): Promise<string | null> => {
    if (profileIdRef.current) return profileIdRef.current;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
      if (data?.id) profileIdRef.current = data.id;
      return data?.id || null;
    } catch { return null; }
  }, []);

  const logCall = useCallback(async (number: string, status: string) => {
    try {
      const agentId = await getProfileId();
      const contactId = await findContactByPhone(number);
      const startedAt = callStartTimeRef.current || new Date().toISOString();
      const endedAt = new Date().toISOString();
      const duration = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
      await supabase.from('calls').insert({ direction: 'outbound', status, started_at: startedAt, ended_at: endedAt, duration_seconds: duration, agent_id: agentId, contact_id: contactId, notes: `Chamada para ${number}` });
      callStartTimeRef.current = null;
    } catch (err) { log.error('Error logging call:', err); }
  }, [getProfileId, findContactByPhone]);

  const makeCall = useCallback(async (number: string) => {
    if (!uaRef.current || sipStatus !== 'registered') { toast.error('VoIP não conectado.'); return; }
    if (callStatusRef.current !== 'idle') { toast.error('Já existe uma chamada em andamento.'); return; }
    try {
      const target = UserAgent.makeURI(`sip:${number}@${uaRef.current.configuration.uri.host}`);
      if (!target) { toast.error('Número inválido'); return; }
      setCurrentNumber(number); setCallStatus('calling'); callStatusRef.current = 'calling';
      callStartTimeRef.current = new Date().toISOString();
      const inviter = new Inviter(uaRef.current, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } });
      inviter.stateChange.addListener((state) => {
        if (state === SessionState.Establishing) { setCallStatus('ringing'); callStatusRef.current = 'ringing'; }
        else if (state === SessionState.Established) {
          setCallStatus('active'); callStatusRef.current = 'active'; startTimer();
          const stream = new MediaStream(); const audio = getRemoteAudio();
          const sdh = inviter.sessionDescriptionHandler as Web.SessionDescriptionHandler;
          sdh?.peerConnection?.getReceivers().forEach(r => { if (r.track) stream.addTrack(r.track); });
          audio.srcObject = stream;
        } else if (state === SessionState.Terminated) {
          stopTimer();
          const prev = callStatusRef.current;
          const logStatus = prev === 'active' ? 'ended' : 'missed';
          setCallStatus('ended'); callStatusRef.current = 'ended'; setIsMuted(false);
          logCall(number, logStatus);
          setTimeout(() => { setCallStatus('idle'); callStatusRef.current = 'idle'; }, 2000);
        }
      });
      await inviter.invite();
      sessionRef.current = inviter;
    } catch (err: unknown) {
      log.error('Call error:', err); logCall(number, 'missed');
      setCallStatus('idle'); callStatusRef.current = 'idle';
      toast.error(`Erro ao ligar: ${err instanceof Error ? err.message : 'Falha'}`);
    }
  }, [sipStatus, uaRef, startTimer, stopTimer, getRemoteAudio, logCall]);

  const hangUp = useCallback(() => {
    if (sessionRef.current) {
      try { sessionRef.current.state === SessionState.Established ? sessionRef.current.bye() : sessionRef.current.cancel(); } catch (err) { log.error('Hangup error:', err); }
      sessionRef.current = null;
    }
    stopTimer(); setCallStatus('idle'); callStatusRef.current = 'idle'; setIsMuted(false);
  }, [stopTimer]);

  const toggleMute = useCallback(() => {
    if (!sessionRef.current) return;
    const sdh = sessionRef.current.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    sdh?.peerConnection?.getSenders().forEach(s => { if (s.track?.kind === 'audio') s.track.enabled = isMuted; });
    setIsMuted(!isMuted);
  }, [isMuted]);

  const sendDTMF = useCallback((digit: string) => {
    if (!sessionRef.current || sessionRef.current.state !== SessionState.Established) return;
    try {
      const sdh = sessionRef.current.sessionDescriptionHandler as Web.SessionDescriptionHandler;
      const sender = sdh?.peerConnection?.getSenders().find(s => s.track?.kind === 'audio');
      if (sender) (sender as RTCRtpSender & { dtmf?: RTCDTMFSender }).dtmf?.insertDTMF(digit, 100, 70);
    } catch (err) { log.error('DTMF error:', err); }
  }, []);

  useEffect(() => { return () => { stopTimer(); remoteAudioRef.current?.remove(); remoteAudioRef.current = null; }; }, [stopTimer]);

  return { sipStatus, callStatus, callDuration, isMuted, currentNumber, connect, disconnect, makeCall, hangUp, toggleMute, sendDTMF };
}
