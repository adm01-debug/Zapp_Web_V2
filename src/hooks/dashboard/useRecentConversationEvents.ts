import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationEventItem {
  id: string;
  actorName: string;
  actorAvatarUrl: string | null;
  text: string;
  createdAt: string;
}

type EventRow = {
  id: string;
  event_type: string;
  created_at: string;
  contact_id: string;
  performed_by: string | null;
  to_agent_id: string | null;
  to_queue_id: string | null;
  contacts?: { name: string } | null;
};

export function eventText(eventType: string, contactName: string, toAgentName: string | undefined, toQueueName: string | undefined): string {
  switch (eventType) {
    case 'assign': return `Assumiu conversa com ${contactName}`;
    case 'unassign': return 'Liberou conversa';
    case 'transfer': return `Transferiu para ${toAgentName ?? 'agente'}`;
    case 'queue_transfer': return `Transferiu para ${toQueueName ?? 'fila'}`;
    case 'overload_reassign':
    case 'absence_reassign': return 'Reatribuição automática';
    default: return eventType;
  }
}

export function useRecentConversationEvents(limit = 4) {
  return useQuery({
    queryKey: ['recent-conversation-events', limit],
    queryFn: async () => {
      let usedEmbed = true;
      let events: EventRow[];
      const embedRes = await supabase
        .from('conversation_events')
        .select('id, event_type, created_at, contact_id, performed_by, to_agent_id, to_queue_id, contacts(name)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (embedRes.error) {
        usedEmbed = false;
        const plainRes = await supabase
          .from('conversation_events')
          .select('id, event_type, created_at, contact_id, performed_by, to_agent_id, to_queue_id')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (plainRes.error) throw plainRes.error;
        events = (plainRes.data ?? []) as EventRow[];
      } else {
        events = (embedRes.data ?? []) as unknown as EventRow[];
      }

      const contactIds = [...new Set(events.map((e) => e.contact_id).filter(Boolean))];
      const agentIds = [...new Set([...events.map((e) => e.performed_by), ...events.map((e) => e.to_agent_id)].filter((v): v is string => !!v))];
      const queueIds = [...new Set(events.map((e) => e.to_queue_id).filter((v): v is string => !!v))];

      const [contactsRes, profilesRes, queuesRes] = await Promise.all([
        !usedEmbed && contactIds.length ? supabase.from('contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        agentIds.length ? supabase.from('profiles').select('id, name, avatar_url').in('id', agentIds) : Promise.resolve({ data: [] as { id: string; name: string; avatar_url: string | null }[] }),
        queueIds.length ? supabase.from('queues').select('id, name').in('id', queueIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);

      const contactNameById = new Map<string, string>(
        usedEmbed
          ? events.map((e) => [e.contact_id, e.contacts?.name ?? 'contato'])
          : (contactsRes.data ?? []).map((c) => [c.id, c.name]),
      );
      const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const queueNameById = new Map((queuesRes.data ?? []).map((q) => [q.id, q.name]));

      const items: ConversationEventItem[] = events.map((e) => {
        const performer = e.performed_by ? profileById.get(e.performed_by) : undefined;
        const contactName = contactNameById.get(e.contact_id) ?? 'contato';
        const toAgentName = e.to_agent_id ? profileById.get(e.to_agent_id)?.name : undefined;
        const toQueueName = e.to_queue_id ? queueNameById.get(e.to_queue_id) : undefined;
        return {
          id: e.id,
          actorName: performer?.name ?? 'Sistema',
          actorAvatarUrl: performer?.avatar_url ?? null,
          text: eventText(e.event_type, contactName, toAgentName, toQueueName),
          createdAt: e.created_at,
        };
      });

      return { items, usedEmbed };
    },
    staleTime: 30_000,
  });
}
