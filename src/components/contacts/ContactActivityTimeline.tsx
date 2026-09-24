import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageSquare, Phone, Mail, Tag, UserPlus, Edit,
  ArrowRight, Clock, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface TimelineEvent {
  id: string;
  type: 'message_sent' | 'message_received' | 'created' | 'updated' | 'tag_added' | 'assigned' | 'note';
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ContactActivityTimelineProps {
  contactId: string;
  contactCreatedAt: string;
  className?: string;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  message_sent: { icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/10' },
  message_received: { icon: MessageSquare, color: 'text-accent-foreground', bg: 'bg-accent/10' },
  created: { icon: UserPlus, color: 'text-success', bg: 'bg-success/10' },
  updated: { icon: Edit, color: 'text-warning', bg: 'bg-warning/10' },
  tag_added: { icon: Tag, color: 'text-secondary', bg: 'bg-secondary/10' },
  assigned: { icon: ArrowRight, color: 'text-info', bg: 'bg-info/10' },
  note: { icon: Edit, color: 'text-muted-foreground', bg: 'bg-muted/30' },
};

export function ContactActivityTimeline({ contactId, contactCreatedAt, className }: ContactActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    async function fetchTimeline() {
      setLoading(true);
      const timeline: TimelineEvent[] = [];

      // Add creation event
      timeline.push({
        id: 'created',
        type: 'created',
        title: 'Contato criado',
        description: 'Adicionado à base de contatos',
        timestamp: contactCreatedAt,
      });

      // Fetch messages
      const { data: messages } = await supabase
        .from('messages')
        .select('id, content, sender, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (messages) {
        messages.forEach(msg => {
          timeline.push({
            id: msg.id,
            type: msg.sender === 'agent' ? 'message_sent' : 'message_received',
            title: msg.sender === 'agent' ? 'Mensagem enviada' : 'Mensagem recebida',
            description: (msg.content || '').substring(0, 80) + ((msg.content?.length || 0) > 80 ? '...' : ''),
            timestamp: msg.created_at,
          });
        });
      }

      // Fetch notes
      const { data: notes } = await supabase
        .from('contact_notes')
        .select('id, content, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (notes) {
        notes.forEach(note => {
          timeline.push({
            id: note.id,
            type: 'note',
            title: 'Nota adicionada',
            description: note.content.substring(0, 80),
            timestamp: note.created_at,
          });
        });
      }

      // Fetch assignment events
      const { data: assignments } = await supabase
        .from('conversation_events')
        .select('id, event_type, created_at, metadata')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (assignments) {
        assignments.forEach(evt => {
          timeline.push({
            id: evt.id,
            type: 'assigned',
            title: evt.event_type === 'assign' ? 'Atribuído a agente' :
                   evt.event_type === 'transfer' ? 'Transferido' : 'Evento',
            timestamp: evt.created_at,
          });
        });
      }

      // Sort by timestamp descending
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (!isMountedRef.current) return;
      setEvents(timeline);
      setLoading(false);
    }

    fetchTimeline();
  }, [contactId, contactCreatedAt]);

  const displayedEvents = expanded ? events : events.slice(0, 5);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Linha do Tempo
        </h3>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-2.5 w-32 bg-muted/60 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Linha do Tempo
        </h3>
        <Badge variant="secondary" className="text-3xs">{events.length} eventos</Badge>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border/50" />

        <AnimatePresence>
          {displayedEvents.map((event, index) => {
            const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.note;
            const Icon = config.icon;
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="flex gap-3 relative py-1.5"
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 z-10",
                  config.bg
                )}>
                  <Icon className={cn("w-3.5 h-3.5", config.color)} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                    <span className="text-3xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-2xs text-muted-foreground truncate mt-0.5">{event.description}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {events.length > 5 && (
        <Button
          variant="ghost" size="sm"
          className="w-full text-xs h-7 text-muted-foreground gap-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Mostrar menos' : `Ver mais ${events.length - 5} eventos`}
        </Button>
      )}
    </div>
  );
}
