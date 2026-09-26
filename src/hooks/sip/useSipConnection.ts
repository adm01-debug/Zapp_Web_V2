import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { UserAgent, Registerer, Invitation } from 'sip.js';
import { toast } from 'sonner';

const log = getLogger('SipConnection');

export type SipStatus = 'disconnected' | 'connecting' | 'registered' | 'error';

interface SipConfig {
  server: string;
  user: string;
  password: string;
  wsPort?: number;
}

export function useSipConnection(onIncomingInvitation?: (invitation: Invitation) => void) {
  const [sipStatus, setSipStatus] = useState<SipStatus>('disconnected');
  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxReconnectAttempts = 5;
  const onIncomingInvitationRef = useRef(onIncomingInvitation);
  useEffect(() => { onIncomingInvitationRef.current = onIncomingInvitation; }, [onIncomingInvitation]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(async (config: SipConfig) => {
    try {
      clearReconnectTimer();
      setSipStatus('connecting');
      const wsPort = config.wsPort || 8089;
      const wsServer = `wss://${config.server}:${wsPort}/ws`;
      const uri = UserAgent.makeURI(`sip:${config.user}@${config.server}`);
      if (!uri) throw new Error('URI SIP inválida');

      const ua = new UserAgent({
        uri,
        transportOptions: { server: wsServer, traceSip: false },
        authorizationPassword: config.password,
        authorizationUsername: config.user,
        logLevel: 'warn',
        displayName: config.user,
        delegate: {
          onInvite: (invitation) => onIncomingInvitationRef.current?.(invitation),
        },
      });

      ua.transport.onDisconnect = () => {
        setSipStatus('disconnected');
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          toast.info(`Conexão perdida. Reconectando em ${delay / 1000}s... (tentativa ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            // eslint-disable-next-line react-hooks/immutability -- retry recursivo: só executa depois que connect() já terminou de ser atribuído.
            connect(config);
          }, delay);
        } else {
          toast.error('Não foi possível reconectar ao servidor VoIP.');
          reconnectAttemptsRef.current = 0;
        }
      };

      await ua.start();
      const registerer = new Registerer(ua);
      registerer.stateChange.addListener((state) => {
        if (state === 'Registered') { setSipStatus('registered'); reconnectAttemptsRef.current = 0; toast.success('VoIP conectado!'); }
        else if (state === 'Unregistered' || state === 'Terminated') setSipStatus('disconnected');
      });
      await registerer.register();
      uaRef.current = ua;
      registererRef.current = registerer;
    } catch (err: unknown) {
      log.error('SIP connection error:', err);
      setSipStatus('error');
      toast.error(`Erro ao conectar VoIP: ${err instanceof Error ? err.message : 'Falha na conexão'}`);
    }
  }, [clearReconnectTimer]);

  const disconnect = useCallback(async () => {
    try {
      reconnectAttemptsRef.current = maxReconnectAttempts;
      clearReconnectTimer();
      if (registererRef.current) await registererRef.current.unregister();
      if (uaRef.current) { uaRef.current.transport.onDisconnect = () => {}; await uaRef.current.stop(); }
      setSipStatus('disconnected');
      reconnectAttemptsRef.current = 0;
    } catch (err) { log.error('SIP disconnect error:', err); }
  }, [clearReconnectTimer]);

  return { sipStatus, uaRef, connect, disconnect };
}
