import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ArrowRight, UserPlus, UserMinus, RotateCcw, XCircle, 
  AlertTriangle, Clock, Loader2, GitBranch
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

interface TimelineEvent {
  id: string;
  event_type: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_queue_id: string | null;
  to_queue_id: string | null;
  metadata: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
  from_agent?: { name: string } | null;
  to_agent?: { name: string } | null;
  from_queue?: { name: string } | null;
  to_queue?: { name: string } | null;
}

const EVENT_CONFIG: Record<string, { icon: typeof ArrowRight; label: string; color: string }> = {
  assign: { icon: UserPlus, label: 'Atribuído', color: 'text-success' },
  unassign: { icon: UserMinus, label: 'Desatribuído', color: 'text-warning' },
  transfer: { icon: ArrowRight, label: 'Transferido', color: 'text-primary' },
  queue_transfer: { icon: GitBranch, label: 'Transferido de fila', color: 'text-accent-foreground' },
  overload_reassign: { icon: AlertTriangle, label: 'Reatribuição por sobrecarga', color: 'text-warning' },
  absence_reassign: { icon: Clock, label: 'Reatribuição por ausência', color: 'text-destructive' },
  close: { icon: XCircle, label: 'Encerrado', color: 'text-muted-foreground' },
  reopen: { icon: RotateCcw, label: 'Reaberto', color: 'text-success' },
};

export function ConversationTimeline({ contactId }: { contactId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['conversation-timeline', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_events')
        .select(`
          id, event_type, from_agent_id, to_agent_id, 
          from_queue_id, to_queue_id, metadata, performed_by, created_at,
          from_agent:profiles!conversation_events_from_agent_id_fkey(name),
          to_agent:profiles!conversation_events_to_agent_id_fkey(name),
          from_queue:queues!conversation_events_from_queue_id_fkey(name),
          to_queue:queues!conversation_events_to_queue_id_fkey(name)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as TimelineEvent[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhum evento registrado ainda
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border/50" />

      {events.map((event, idx) => {
        const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.assign;
        const Icon = config.icon;

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="relative flex gap-3 py-2"
          >
            {/* Dot */}
            <div className={`relative z-10 mt-0.5 w-[22px] h-[22px] rounded-full bg-background border-2 border-border flex items-center justify-center shrink-0`}>
              <Icon className={`w-3 h-3 ${config.color}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-3xs h-5 px-1.5 font-medium">
                  {config.label}
                </Badge>
                <span className="text-3xs text-muted-foreground">
                  {format(new Date(event.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              </div>

              <p className="text-2xs text-foreground/80 mt-0.5 leading-relaxed">
                {event.event_type === 'transfer' && (
                  <>
                    De <strong>{event.from_agent?.name || '—'}</strong> para{' '}
                    <strong>{event.to_agent?.name || '—'}</strong>
                  </>
                )}
                {event.event_type === 'assign' && (
                  <>Atribuído a <strong>{event.to_agent?.name || '—'}</strong></>
                )}
                {event.event_type === 'unassign' && (
                  <>Removido de <strong>{event.from_agent?.name || '—'}</strong></>
                )}
                {event.event_type === 'queue_transfer' && (
                  <>
                    De <strong>{event.from_queue?.name || '—'}</strong> para{' '}
                    <strong>{event.to_queue?.name || '—'}</strong>
                  </>
                )}
                {(event.event_type === 'overload_reassign' || event.event_type === 'absence_reassign') && (
                  <>
                    De <strong>{event.from_agent?.name || '—'}</strong> para{' '}
                    <strong>{event.to_agent?.name || '—'}</strong>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
