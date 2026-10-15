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

/**
 * E71/E78 — entregues/lidas saem dos RECIBOS (`team_message_receipts`, um por
 * destinatário), não da coluna `team_messages.status`: aquela é uma só por
 * mensagem e não diz quantos receberam/leram. O `limit(500)` saiu junto: ele
 * cortava as conversas longas e o total do gráfico passava a ser o total das
 * 500 mais recentes, não o da conversa (falha silenciosa de contagem).
 */
export function useParticipantStats(conversationId: string) {
  return useQuery<ParticipantStat[]>({
    queryKey: queryKeys.participantStats(conversationId),
    queryFn: async () => {
      const [messagesRes, receiptsRes] = await Promise.all([
        supabase
          .from('team_messages')
          .select('id, sender_id, profiles:sender_id(name)')
          .eq('conversation_id', conversationId),
        supabase
          .from('team_message_receipts')
          .select('message_id, status')
          .eq('conversation_id', conversationId),
      ]);
      if (messagesRes.error) throw messagesRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      const stats = new Map<string, ParticipantStat>();
      const sentMessages: Array<{ messageId: string; senderId: string }> = [];

      for (const row of (messagesRes.data ?? []) as unknown as MessageRow[]) {
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
        sentMessages.push({ messageId: row.id, senderId: sid });
      }

      // O recibo é do destinatário; para atribuir a entrega/leitura a quem
      // enviou, a mensagem do recibo é resolvida pelo par message_id -> sender.
      const deliveredMessages = new Set<string>();
      const readMessages = new Set<string>();
      for (const receipt of (receiptsRes.data ?? []) as unknown as ReceiptRow[]) {
        if (receipt.status === 'delivered' || receipt.status === 'read') {
          deliveredMessages.add(receipt.message_id);
        }
        if (receipt.status === 'read') readMessages.add(receipt.message_id);
      }
      for (const { messageId, senderId } of sentMessages) {
        const stat = stats.get(senderId);
        if (!stat) continue;
        if (deliveredMessages.has(messageId)) stat.delivered++;
        if (readMessages.has(messageId)) stat.read++;
      }

      return Array.from(stats.values()).sort((a, b) => b.sent - a.sent).slice(0, 10);
    },
    staleTime: 60_000,
  });
}
