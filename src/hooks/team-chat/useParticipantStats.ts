import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from './queryKeys';

export interface ParticipantStat {
  senderId: string;
  senderName: string;
  sent: number;
  delivered: number;
  read: number;
}

interface MessageRow {
  id: string;
  sender_id: string;
  profiles: { name?: string } | null;
}

interface ReceiptRow {
  message_id: string;
  status: string | null;
}

/** Tamanho da página: teto de 1000 linhas por requisição (recusa E78). */
export const PARTICIPANT_STATS_PAGE_SIZE = 1000;

async function fetchPage(
  table: 'team_messages' | 'team_message_receipts',
  select: string,
  conversationId: string,
  from: number,
  to: number,
) {
  return supabase
    .from(table)
    .select(select)
    .eq('conversation_id', conversationId)
    .order('id', { ascending: true })
    .range(from, to);
}

async function fetchAll<T>(args: {
  table: 'team_messages' | 'team_message_receipts';
  select: string;
  conversationId: string;
}): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const res = await fetchPage(
      args.table,
      args.select,
      args.conversationId,
      from,
      from + PARTICIPANT_STATS_PAGE_SIZE - 1,
    );
    if (res.error) throw res.error;
    const page = (res.data ?? []) as unknown as T[];
    all.push(...page);
    if (page.length < PARTICIPANT_STATS_PAGE_SIZE) break;
    from += PARTICIPANT_STATS_PAGE_SIZE;
  }
  return all;
}

/**
 * E71/E78 — entregues/lidas saem dos RECIBOS (`team_message_receipts`, um por
 * destinatário), não da coluna `team_messages.status`. A contagem é POR
 * RECIBO (total de recibos por status): uma mensagem com 1 recibo
 * "delivered" entre 20 destinatários conta 1 entregue, não 20 — e uma com 20
 * recibos conta 20. As duas leituras são paginadas em janelas de 1000
 * (`.range()`): sem teto a conversa de 50k+ mensagens/recibos transfere tudo
 * de uma vez e estoura memória/rede.
 */
export function useParticipantStats(conversationId: string) {
  return useQuery<ParticipantStat[]>({
    queryKey: queryKeys.participantStats(conversationId),
    queryFn: async () => {
      const [messages, receipts] = await Promise.all([
        fetchAll<MessageRow>({
          table: 'team_messages',
          select: 'id, sender_id, profiles:sender_id(name)',
          conversationId,
        }),
        fetchAll<ReceiptRow>({
          table: 'team_message_receipts',
          select: 'message_id, status',
          conversationId,
        }),
      ]);

      const stats = new Map<string, ParticipantStat>();
      const senderByMessage = new Map<string, string>();

      for (const row of messages) {
        const sid = row.sender_id;
        if (!stats.has(sid)) {
          stats.set(sid, {
            senderId: sid,
            senderName: row.profiles?.name ?? sid.slice(0, 8),
            sent: 0,
            delivered: 0,
            read: 0,
          });
        }
        stats.get(sid)!.sent++;
        senderByMessage.set(row.id, sid);
      }

      // O recibo é do destinatário; a entrega/leitura é atribuída a quem
      // enviou resolvendo message_id -> sender, SOMANDO um por recibo.
      for (const receipt of receipts) {
        const senderId = senderByMessage.get(receipt.message_id);
        if (!senderId) continue;
        const stat = stats.get(senderId);
        if (!stat) continue;
        if (receipt.status === 'delivered' || receipt.status === 'read') {
          stat.delivered++;
        }
        if (receipt.status === 'read') stat.read++;
      }

      return Array.from(stats.values()).sort((a, b) => b.sent - a.sent).slice(0, 10);
    },
    staleTime: 60_000,
  });
}
