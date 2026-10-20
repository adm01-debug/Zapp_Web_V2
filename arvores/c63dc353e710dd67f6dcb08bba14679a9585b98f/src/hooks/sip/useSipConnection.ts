import { useState, useRef, useCallback, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import type { UserAgent, Registerer, Invitation } from 'sip.js';
import { toast } from 'sonner';
import { REASON_LABEL, type CapabilityReason } from '@/lib/calls/capabilities';
import { isLeader } from '@/lib/calls/tabLeaderStore';

const log = getLogger('SipConnection');

// T16: estados explicitos no lugar de `disconnected|connecting|registered|error`.
// - `reconnecting`: ha um retry agendado (antes a tela dizia "Desconectado"
//   enquanto o app tentava voltar, e o agente clicava em Conectar por cima).
// - `unavailable`: a linha nao volta sozinha (6a falha seguida) ou o REGISTER
//   foi recusado. So sai daí com um `connect()` novo, do usuario.
export type SipStatus = 'idle' | 'connecting' | 'registered' | 'reconnecting' | 'unavailable';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 30_000;

interface SipConfig {
  server: string;
  user: string;
  password: string;
  wsPort?: number;
}

export function useSipConnection(onIncomingInvitation?: (invitation: Invitation) => void) {
  const [sipStatus, setSipStatus] = useState<SipStatus>('idle');
  // T15: motivo operacional do estado (ex.: linha em uso por outro usuário).
  const [sipReason, setSipReason] = useState<CapabilityReason | null>(null);
  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIncomingInvitationRef = useRef(onIncomingInvitation);
  useEffect(() => { onIncomingInvitationRef.current = onIncomingInvitation; }, [onIncomingInvitation]);

  // T16: depois do unmount ninguem mais conecta. Sem isto o retry agendado
  // criava um UserAgent orfao — registrando a linha de um painel que nao existe
  // mais, e o servidor so aceita um ramal por vez.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(async (config: SipConfig) => {
    // T20: uma aba por linha. Quem decide o papel é a eleição do
    // `tabLeaderStore` — este hook só obedece. A aba SEGUIDORA não registra: a
    // líder é quem segura o ramal no servidor, e um REGISTER concorrente daqui
    // só tomaria a linha de volta (403), deixando as duas abas parecendo
    // "conectadas". O portão fica ANTES de criar o UserAgent porque é o único
    // caminho de registro: sem UA não há REGISTER, retry nem áudio.
    if (!isLeader()) {
      setSipReason('line_in_use_other_tab');
      return;
    }
    // T16: um UA por vez. Sem a guarda, dois cliques (ou um retry sobre um UA
    // vivo) criavam dois registros da MESMA linha — e o servidor devolvia 403.
    if (uaRef.current) return;
    try {
      clearReconnectTimer();
      setSipStatus('connecting');
      // sip.js só é baixado quando o usuário realmente tenta conectar — mantém
      // a lib (e seu vendor chunk) fora do bundle inicial do app.
      const { UserAgent, Registerer } = await import('sip.js');
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
        clearReconnectTimer();
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), MAX_BACKOFF_MS);
          setSipStatus('reconnecting');
          toast.info(`Conexão perdida. Reconectando em ${delay / 1000}s... (tentativa ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (unmountedRef.current) return;
            // O UA anterior morreu junto com o transporte: limpar os refs e o
            // que permite o retry passar pela guarda de `connect`.
            uaRef.current = null;
            registererRef.current = null;
            // eslint-disable-next-line react-hooks/immutability -- retry recursivo: só executa depois que connect() já terminou de ser atribuído.
            connect(config);
          }, delay);
        } else {
          // T16: 6a falha seguida — para de tentar e diz isso na tela.
          setSipStatus('unavailable');
          toast.error('Não foi possível reconectar ao servidor VoIP.');
        }
      };

      await ua.start();
      const registerer = new Registerer(ua);
      // T16: o REGISTER pode ser recusado (403) antes de `register()` resolver,
      // entao o motivo e guardado localmente para decidir o que fazer depois.
      let registroRecusado = false;
      registerer.stateChange.addListener((state) => {
        if (state === 'Registered') { setSipStatus('registered'); setSipReason(null); reconnectAttemptsRef.current = 0; toast.success('VoIP conectado!'); }
        else if (state === 'Unregistered' || state === 'Terminated') setSipStatus('idle');
      });
      await registerer.register({
        requestDelegate: {
          // T15: 403 no REGISTER = a credencial está certa, mas a linha já está
          // atendendo em outro dispositivo (o servidor limita um ramal por vez).
          // Sem isso o agente via "Erro ao conectar VoIP" e não entendia nada.
          onReject: (response) => {
            if (response.message.statusCode !== 403) return;
            registroRecusado = true;
            setSipStatus('unavailable');
            setSipReason('line_in_use_other_user');
            toast.error(REASON_LABEL.line_in_use_other_user);
          },
        },
      });
      // T16: num 403 nao deixo UA vivo: a guarda de `connect` transformaria o
      // botao "Conectar SIP" em botao morto depois que a linha fosse liberada.
      if (registroRecusado) {
        try { await ua.stop(); } catch { /* transporte ja encerrado */ }
        return;
      }
      uaRef.current = ua;
      registererRef.current = registerer;
    } catch (err: unknown) {
      log.error('SIP connection error:', err);
      uaRef.current = null;
      registererRef.current = null;
      setSipStatus('unavailable');
      toast.error(`Erro ao conectar VoIP: ${err instanceof Error ? err.message : 'Falha na conexão'}`);
    }
  }, [clearReconnectTimer]);

  const disconnect = useCallback(async () => {
    try {
      reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
      clearReconnectTimer();
      if (registererRef.current) await registererRef.current.unregister();
      if (uaRef.current) { uaRef.current.transport.onDisconnect = () => {}; await uaRef.current.stop(); }
      setSipStatus('idle');
      reconnectAttemptsRef.current = 0;
    } catch (err) { log.error('SIP disconnect error:', err); }
  }, [clearReconnectTimer]);

  // T20: `setSipReason` sai daqui para o consumidor (useSipClient) marcar o
  // motivo que a ELEIÇÃO provoca (virou seguidora) — o hook não decide papel,
  // só oferece a via de escrita tipada, sem quebrar a API existente.
  return { sipStatus, sipReason, setSipReason, uaRef, connect, disconnect };
}
