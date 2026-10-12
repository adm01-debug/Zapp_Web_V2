import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { fetchQueueMetrics, type QueueMetrics } from '@/pages/queue-details/queueMetrics';

export interface QueueDetailsData {
  id: string;
  name: string;
  description: string | null;
  color: string;
  max_wait_time_minutes: number | null;
  created_at: string;
}

export interface QueueMember {
  id: string;
  profile_id: string;
  profile: { name: string; avatar_url: string | null; is_active: boolean };
}

export interface QueueContact {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  assigned_to: string | null;
  created_at: string;
  assigned_agent?: { name: string | null; avatar_url: string | null } | null;
  messages_count: number;
  last_message_at: string | null;
}

export interface QueueDetailsState {
  queue: QueueDetailsData | null;
  members: QueueMember[];
  contacts: QueueContact[];
  metrics: QueueMetrics | null;
  loading: boolean;
  /** Fila inexistente (id que não existe) — distinto de falha de leitura. */
  notFound: boolean;
  /** Falha de leitura (rede/RLS): a tela oferece "Tentar novamente". */
  error: Error | null;
  refetch: () => void;
}

/** Página pedida explicitamente ao PostgREST na leitura de `messages` (teto padrão é 1000). */
export const MESSAGES_PAGE_SIZE = 1000;

/**
 * Normaliza o erro da leitura para `Error`.
 *
 * O cliente do Supabase rejeita com um OBJETO (`PostgrestError`) que tem `.message`, não um
 * `Error` — sem isto a tela mostraria "[object Object]". `Error` puro passa intacto.
 */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return new Error((e as { message: string }).message);
  }
  return new Error(String(e));
}

/**
 * Dados da tela de detalhes da fila (R2-QUE-004).
 *
 * O defeito antigo: cada um dos 50 contatos da página disparava DUAS consultas próprias
 * (`messages` count + última mensagem) e mais uma para o atendente — 1 + 2×50 consultas
 * por abertura da tela. Aqui o enriquecimento é AGREGADO: `messages` usa
 * `in('contact_id', ids)` e pagina a cada 1000 mensagens dos contatos exibidos (para não
 * subcontar contatos muito ativos), enquanto `profiles` usa uma leitura por `in('id', ids)`.
 * Sem N+1 por contato; a leitura de mensagens ainda pode crescer com o volume de mensagens.
 *
 * `notFound` e `error` são estados distintos: um id inexistente mostra "Fila não encontrada",
 * uma falha de leitura mostra "Erro ao carregar a fila" com botão de tentar de novo.
 *
 * Corrida: cada `fetchAll` recebe um token; resposta de requisição antiga (troca de fila ou
 * refetch) é descartada e não mexe no `loading` da requisição corrente.
 */
export function useQueueDetails(id: string | undefined): QueueDetailsState {
  const [queue, setQueue] = useState<QueueDetailsData | null>(null);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [contacts, setContacts] = useState<QueueContact[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const requestRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => requestId === requestRef.current;

    if (!id) {
      setQueue(null);
      setMembers([]);
      setContacts([]);
      setMetrics(null);
      setNotFound(false);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const { data: queueData, error: queueError } = await supabase
        .from('queues')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (queueError) throw queueError;
      if (!isCurrent()) return;

      if (!queueData) {
        // Id inexistente (PostgREST devolve `null`, não erro): "não encontrada", não "erro".
        setQueue(null);
        setMembers([]);
        setContacts([]);
        setMetrics(null);
        setNotFound(true);
        return;
      }

      setQueue(queueData as QueueDetailsData);

      const { data: membersData, error: membersError } = await supabase
        .from('queue_members')
        .select('id, profile_id, profile:profiles(name, avatar_url, is_active)')
        .eq('queue_id', id);
      if (membersError) throw membersError;
      if (!isCurrent()) return;
      setMembers((membersData ?? []) as unknown as QueueMember[]);

      // Amostra visual da tabela (50 mais recentes). As MÉTRICAS não saem daqui: vêm de
      // `fetchQueueMetrics`, que conta a fila inteira no servidor.
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url, assigned_to, created_at')
        .eq('queue_id', id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (contactsError) throw contactsError;
      if (!isCurrent()) return;

      const page = (contactsData ?? []) as Omit<QueueContact, 'messages_count' | 'last_message_at' | 'assigned_agent'>[];
      const contactIds = page.map((c) => c.id);
      const assignedToIds = Array.from(
        new Set(page.map((c) => c.assigned_to).filter((v): v is string => Boolean(v))),
      );

      // Enriquecimento AGREGADO (R2-QUE-004): `messages` usa `in('contact_id', ids)`
      // paginado a cada 1000 mensagens dos contatos exibidos, e `profiles` usa um único
      // `in('id', ids)`. Sem N+1 por contato; a leitura de mensagens ainda pode crescer por
      // página quando o volume desses contatos passa do teto do PostgREST.
      const messagesResult = contactIds.length
        ? await fetchAllRows<{ contact_id: string | null; created_at: string }>(
            (from, to) =>
              supabase
                .from('messages')
                .select('contact_id, created_at')
                .in('contact_id', contactIds)
                .order('id', { ascending: true })
                .range(from, to),
            { pageSize: MESSAGES_PAGE_SIZE },
          )
        : { rows: [] as { contact_id: string | null; created_at: string }[], incomplete: false };
      if (!isCurrent()) return;

      const agentsResult = assignedToIds.length
        ? await supabase.from('profiles').select('id, name, avatar_url').in('id', assignedToIds)
        : { data: [] as { id: string; name: string | null; avatar_url: string | null }[], error: null };
      if (!isCurrent()) return;

      if (agentsResult.error) throw agentsResult.error;
      if (messagesResult.incomplete) {
        // Leitura parcial: mantém a página utilizável, mas expõe o erro para a tela não vender
        // contagens/última mensagem parciais como se fossem completas.
        const partialMessage = messagesResult.error?.message
          ? `Leitura de mensagens incompleta: ${messagesResult.error.message}`
          : `Leitura de mensagens incompleta: a paginação atingiu o limite de segurança (${MESSAGES_PAGE_SIZE} por página).`;
        log.error('Leitura de mensagens incompleta ao enriquecer os contatos da fila.', messagesResult.error);
        setError(new Error(partialMessage));
      }

      const messages = messagesResult.rows;
      const countMap = new Map<string, number>();
      const lastMessageMap = new Map<string, string>();
      for (const msg of messages) {
        if (!msg.contact_id) continue;
        countMap.set(msg.contact_id, (countMap.get(msg.contact_id) ?? 0) + 1);
        const prev = lastMessageMap.get(msg.contact_id);
        if (!prev || msg.created_at > prev) lastMessageMap.set(msg.contact_id, msg.created_at);
      }

      const agents = agentsResult.data ?? [];
      const agentMap = new Map(agents.map((p) => [p.id, { name: p.name, avatar_url: p.avatar_url }]));

      const contactsWithDetails: QueueContact[] = page.map((contact) => ({
        ...contact,
        messages_count: countMap.get(contact.id) ?? 0,
        last_message_at: lastMessageMap.get(contact.id) ?? null,
        assigned_agent: contact.assigned_to ? (agentMap.get(contact.assigned_to) ?? null) : null,
      }));
      setContacts(contactsWithDetails);

      // R2-QUE-001/R2-QUE-003: os cartões medem a FILA INTEIRA via `fetchQueueMetrics`,
      // com `count: 'exact'` no servidor — nada derivado da página de 50 acima.
      const metricsData = await fetchQueueMetrics(supabase, id, new Date());
      if (!isCurrent()) return;
      setMetrics(metricsData);
    } catch (e) {
      if (!isCurrent()) return;
      setError(toError(e));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-fila padrão, sem estado derivado de props para sincronizar.
    void fetchAll();
  }, [fetchAll]);

  const refetch = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  return { queue, members, contacts, metrics, loading, notFound, error, refetch };
}
