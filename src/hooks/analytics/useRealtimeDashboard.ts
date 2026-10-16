import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

const log = getLogger('RealtimeDashboard');

export interface RealtimeMetric {
  timestamp: Date;
  messagesPerMinute: number;
  activeConversations: number;
  avgResponseTimeSeconds: number | null;
}

export interface RealtimeDashboardState {
  messagesThisHour: number;
  messagesLastHour: number;
  messagesPerMinute: number;
  activeConversationsNow: number;
  newContactsToday: number;
  unreadMessages: number;
  metricsHistory: RealtimeMetric[];
  lastMessageAt: Date | null;
  isConnected: boolean;
}

/** Recorte do topo (fila/agente) — os MESMOS filtros que os KPIs recebem. */
export interface RealtimeDashboardScope {
  queueId?: string | null;
  agentId?: string | null;
}

const MAX_HISTORY = 60; // Keep last 60 data points (1 per minute = 1 hour)
/** Janela da hora corrente do próprio hook: expira sozinha, sem depender do refresh de 5 min. */
const JANELA_HORA_MS = 60 * 60 * 1000;
/** Teto de ids guardados para não decrementar duas vezes a mesma transição de leitura. */
const MAX_IDS_CONTABILIZADOS = 500;

/** `count` do PostgREST só vale como número: `null`/`undefined` (erro ou ausência) não
 * pode virar 0 na tela — quem mantém o valor é o último número bom. */
function contagemOuNulo(valor: number | null | undefined): number | null {
  return typeof valor === 'number' ? valor : null;
}

/** Chegadas realtime ainda dentro da última hora E posteriores à partida do snapshot
 * (o que já entrou na contagem do snapshot não é somado de novo). */
function contarChegadasNaHora(chegadas: number[], partidaSnapshot: number, agora: number): number {
  const limite = agora - JANELA_HORA_MS;
  return chegadas.filter(t => t >= limite && t >= partidaSnapshot).length;
}

/** Descarta chegadas que saíram da janela de 1 h. */
function podarChegadas(chegadas: number[], agora: number): number[] {
  const limite = agora - JANELA_HORA_MS;
  return chegadas.filter(t => t >= limite);
}

export function useRealtimeDashboard(filters: RealtimeDashboardScope = {}) {
  const queueId = filters.queueId ?? null;
  const agentId = filters.agentId ?? null;

  const [state, setState] = useState<RealtimeDashboardState>({
    messagesThisHour: 0,
    messagesLastHour: 0,
    messagesPerMinute: 0,
    activeConversationsNow: 0,
    newContactsToday: 0,
    unreadMessages: 0,
    metricsHistory: [],
    lastMessageAt: null,
    isConnected: false,
  });

  const minuteCountRef = useRef(0);
  const isMountedRef = useRef(true);
  // Chegadas realtime de `messages` na última hora (o contador da hora expira por conta própria).
  const chegadasRef = useRef<number[]>([]);
  // Contagem do último snapshot bom de mensagens + instante da requisição que o produziu:
  // evento que chegou DEPOIS da partida do snapshot não entra duas vezes na conta.
  const snapshotMensagensRef = useRef(0);
  const partidaSnapshotRef = useRef(0);
  // Deltas JÁ aplicados na tela (watermark: o snapshot soma o que chegou depois dele).
  const deltasAplicadosRef = useRef({ unread: 0, contatos: 0 });
  // Ids de mensagem já contabilizados na transição não-lida → lida (reentrega não conta 2x).
  const idsContabilizadosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch initial counts
  const fetchInitialData = useCallback(async () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Watermark: os deltas que chegarem depois DESTE instante somam ao snapshot em vez de
    // serem sobrescritos por ele (leitura em voo não pode apagar o que o realtime já mostrou).
    const partida = Date.now();
    const deltasNaPartida = { ...deltasAplicadosRef.current };

    // Escopo do topo: `messages` não tem coluna de fila, então o recorte de fila vale para
    // `contacts`; o de agente vale para as duas tabelas.
    let porHora = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', hourAgo.toISOString());
    let horaAnterior = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', twoHoursAgo.toISOString())
      .lt('created_at', hourAgo.toISOString());
    let naoLidas = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('sender', 'contact');
    let contatosDeHoje = supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString());

    if (agentId) {
      porHora = porHora.eq('agent_id', agentId);
      horaAnterior = horaAnterior.eq('agent_id', agentId);
      naoLidas = naoLidas.eq('agent_id', agentId);
      contatosDeHoje = contatosDeHoje.eq('assigned_to', agentId);
    }
    if (queueId) {
      contatosDeHoje = contatosDeHoje.eq('queue_id', queueId);
    }

    try {
      const [mensagensHora, mensagensHoraAnterior, naoLidasResp, contatosHojeResp] = await Promise.all([
        porHora,
        horaAnterior,
        naoLidas,
        contatosDeHoje,
      ]);

      // Erro de leitura não é zero: o campo que falhou mantém o último valor bom (nada de
      // `count || 0` transformando RLS fora do ar em 0 silencioso na tela).
      const falhas = [mensagensHora, mensagensHoraAnterior, naoLidasResp, contatosHojeResp]
        .map(resultado => resultado.error)
        .filter(Boolean);
      if (falhas.length > 0) {
        log.error('Error fetching initial data:', falhas);
      }

      // Get active conversations (contacts with messages in last hour)
      // Ordem determinística ANTES do corte: sem `.order()`, o PostgREST
      // devolve um subconjunto ARBITRÁRIO das linhas pedidas e a contagem de
      // conversas ativas oscilava entre refreshes (mesma janela, número
      // diferente). Com `created_at` DESC e `id` como desempate, o corte de
      // 5000 é sempre "as 5000 mais recentes" — reprodutível.
      // E26: o corte continua (mitigação do cap do PostgREST; o fix definitivo
      // é a RPC do E24/E25, que não é deste cartão).
      let consultaAtivos = supabase
        .from('messages')
        .select('contact_id')
        .gte('created_at', hourAgo.toISOString())
        .not('contact_id', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(5000);
      if (agentId) consultaAtivos = consultaAtivos.eq('agent_id', agentId);

      const { data: activeContacts, error: erroAtivos } = await consultaAtivos;
      if (erroAtivos) log.error('Error fetching active contacts:', erroAtivos);

      const totalAtivos = activeContacts
        ? new Set(activeContacts.map(m => m.contact_id)).size
        : null;

      if (!isMountedRef.current) return;

      const agora = Date.now();
      chegadasRef.current = podarChegadas(chegadasRef.current, agora);

      // Só um snapshot NUMÉRICO vira a nova base; a partida só avança junto com ele.
      const contagemMensagens = contagemOuNulo(mensagensHora.count);
      if (contagemMensagens !== null) {
        snapshotMensagensRef.current = contagemMensagens;
        partidaSnapshotRef.current = partida;
      }

      const mensagensNaHora =
        snapshotMensagensRef.current +
        contarChegadasNaHora(chegadasRef.current, partidaSnapshotRef.current, agora);
      const contagemAnterior = contagemOuNulo(mensagensHoraAnterior.count);
      const contagemNaoLidas = contagemOuNulo(naoLidasResp.count);
      const contagemContatos = contagemOuNulo(contatosHojeResp.count);
      const deltaUnread = deltasAplicadosRef.current.unread - deltasNaPartida.unread;
      const deltaContatos = deltasAplicadosRef.current.contatos - deltasNaPartida.contatos;

      setState(prev => ({
        ...prev,
        messagesThisHour: mensagensNaHora,
        messagesLastHour: contagemAnterior ?? prev.messagesLastHour,
        unreadMessages: (contagemNaoLidas ?? prev.unreadMessages) + deltaUnread,
        newContactsToday: (contagemContatos ?? prev.newContactsToday) + deltaContatos,
        activeConversationsNow: totalAtivos ?? prev.activeConversationsNow,
      }));
    } catch (error) {
      log.error('Error fetching initial data:', error);
    }
  }, [queueId, agentId]);

  // Subscribe to realtime changes
  useEffect(() => {
    // Troca de recorte: o recorte novo não herda contagens do recorte anterior —
    // chegadas na hora, deltas já aplicados, ids contabilizados e a base do
    // snapshot são todos números produzidos sob o recorte velho. (No mount eles
    // já estão zerados, então zerar de novo não muda nada.)
    chegadasRef.current = [];
    idsContabilizadosRef.current = new Set();
    deltasAplicadosRef.current = { unread: 0, contatos: 0 };
    snapshotMensagensRef.current = 0;
    partidaSnapshotRef.current = 0;
    minuteCountRef.current = 0;

    fetchInitialData();

    // Tópico exclusivo por instância: `supabase.channel('dashboard-realtime')`
    // devolve o MESMO canal quando o nome se repete e, desde a realtime-js
    // 2.101, `.on()` em canal já inscrito lança ("cannot add postgres_changes
    // callbacks ... after subscribe()") — dois consumidores simultâneos do hook
    // derrubavam a tela. Mesmo tratamento de useLeaderboard/useQueueGoals (ver
    // src/hooks/__tests__/realtimeSharedTopic.test.tsx).
    const channel = supabase
      .channel(uniqueRealtimeTopic('dashboard-realtime'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          // Mesmo recorte da leitura inicial: com agente ativo só conta mensagem
          // DELE. `messages` NÃO tem coluna de fila — o recorte de fila não
          // alcança mensagens (só `contacts`), então com fila ativa e sem agente
          // os eventos de `messages` passam sem filtro, como na leitura inicial.
          if (agentId && payload.new.agent_id !== agentId) return;
          log.debug('New message received in dashboard');
          minuteCountRef.current++;
          chegadasRef.current = [...chegadasRef.current, Date.now()];

          pending.hasUpdate = true;
          pending.lastMessageAt = new Date();
          if (payload.new.sender === 'contact') {
            pending.unreadMessagesDelta += 1;
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contacts' },
        (payload) => {
          // Mesmo recorte da leitura inicial: `assigned_to` casa com o agente e
          // `queue_id` com a fila — contato fora do recorte não entra no delta.
          if (agentId && payload.new.assigned_to !== agentId) return;
          if (queueId && payload.new.queue_id !== queueId) return;
          pending.hasUpdate = true;
          pending.newContactsTodayDelta += 1;
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          // Recorte de agente: transição de leitura de mensagem de outro agente
          // não decrementa (mesmo filtro do INSERT; fila não alcança `messages`).
          if (agentId && payload.new.agent_id !== agentId) return;
          // Só a transição não-lida → lida de mensagem DO CONTATO decrementa, e só uma vez
          // por mensagem: reentrega do mesmo evento e mensagem do agente não contam.
          if (!payload.new.is_read || payload.old?.is_read) return;
          if (payload.new.sender !== 'contact') return;
          const id = payload.new.id;
          if (typeof id === 'string' && id.length > 0) {
            if (idsContabilizadosRef.current.has(id)) return;
            if (idsContabilizadosRef.current.size >= MAX_IDS_CONTABILIZADOS) {
              idsContabilizadosRef.current.clear();
            }
            idsContabilizadosRef.current.add(id);
          }
          pending.hasUpdate = true;
          pending.unreadMessagesDelta -= 1;
        }
      )
      .subscribe((status) => {
        // `isConnected` é o estado DO CANAL — o sucesso de uma leitura nunca o liga.
        setState(prev => ({ ...prev, isConnected: status === 'SUBSCRIBED' }));
      });

    // E27: deltas de eventos realtime acumulados aqui (ver callbacks acima) e aplicados em lote
    // pelo flushInterval abaixo, em vez de 1 setState sincrono por INSERT/UPDATE.
    const FLUSH_MS = 4000;
    type PendingDelta = {
      hasUpdate: boolean;
      unreadMessagesDelta: number;
      newContactsTodayDelta: number;
      lastMessageAt: Date | null;
    };
    let pending: PendingDelta = {
      hasUpdate: false,
      unreadMessagesDelta: 0,
      newContactsTodayDelta: 0,
      lastMessageAt: null,
    };

    const flushInterval = setInterval(() => {
      const agora = Date.now();
      const antesDaPoda = chegadasRef.current.length;
      chegadasRef.current = podarChegadas(chegadasRef.current, agora);
      // A janela de 1 h expira por conta própria: um evento que saiu da hora corrente tira
      // o próprio ponto da conta, sem depender do refresh de 5 min para reconciliar.
      const expirou = chegadasRef.current.length !== antesDaPoda;

      if (!pending.hasUpdate && !expirou) return;

      // O lote é COPIADO e zerado ANTES do updater: o updater do React roda depois e não pode
      // ler o objeto já zerado (era assim que os deltas de unread/contatos se perdiam).
      const lote = pending;
      pending = { hasUpdate: false, unreadMessagesDelta: 0, newContactsTodayDelta: 0, lastMessageAt: null };
      deltasAplicadosRef.current.unread += lote.unreadMessagesDelta;
      deltasAplicadosRef.current.contatos += lote.newContactsTodayDelta;

      const mensagensNaHora =
        snapshotMensagensRef.current +
        contarChegadasNaHora(chegadasRef.current, partidaSnapshotRef.current, agora);

      setState(prev => ({
        ...prev,
        messagesThisHour: mensagensNaHora,
        lastMessageAt: lote.lastMessageAt ?? prev.lastMessageAt,
        unreadMessages: Math.max(0, prev.unreadMessages + lote.unreadMessagesDelta),
        newContactsToday: Math.max(0, prev.newContactsToday + lote.newContactsTodayDelta),
      }));
    }, FLUSH_MS);

    // Collect metrics every minute
    const metricsInterval = setInterval(() => {
      setState(prev => {
        const metric: RealtimeMetric = {
          timestamp: new Date(),
          messagesPerMinute: minuteCountRef.current,
          activeConversations: prev.activeConversationsNow,
          avgResponseTimeSeconds: null,
        };

        const newHistory = [...prev.metricsHistory, metric].slice(-MAX_HISTORY);

        return {
          ...prev,
          messagesPerMinute: minuteCountRef.current,
          metricsHistory: newHistory,
        };
      });

      minuteCountRef.current = 0;
    }, 60000);

    // Refresh full data every 5 minutes
    const refreshInterval = setInterval(fetchInitialData, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(flushInterval);
      clearInterval(metricsInterval);
      clearInterval(refreshInterval);
    };
  // `agentId`/`queueId` entram porque os handlers do canal leem o recorte; na
  // prática `fetchInitialData` já muda de identidade quando qualquer um muda.
  }, [fetchInitialData, agentId, queueId]);

  return state;
}
