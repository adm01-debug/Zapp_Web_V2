import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageSquare, Phone, Mail, UserPlus, Edit,
  ArrowRight, Clock, ChevronDown, ChevronUp, Zap, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface TimelineEvent {
  id: string;
  type: 'message_sent' | 'message_received' | 'created' | 'updated' | 'assigned' | 'note';
  title: string;
  description?: string;
  /** Texto completo da nota da transferência — o `title` da linha cortada. */
  notaCompleta?: string;
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
  assigned: { icon: ArrowRight, color: 'text-info', bg: 'bg-info/10' },
  note: { icon: Edit, color: 'text-muted-foreground', bg: 'bg-muted/30' },
};

/**
 * Rótulo pt-BR de cada `conversation_events.event_type` conhecido. Sem ele, todo evento caía no
 * genérico "Evento" — o atendente não sabia o que aconteceu na conversa.
 */
const EVENT_TYPE_LABELS: Record<string, string> = {
  assign: 'Atribuído a agente',
  transfer: 'Transferido',
  close: 'Conversa encerrada',
  reopen: 'Conversa reaberta',
  unassign: 'Liberou conversa',
  queue_transfer: 'Transferido para fila',
  overload_reassign: 'Reatribuição automática',
  absence_reassign: 'Reatribuição automática',
};

/** Rótulo do evento; tipo fora do catálogo cai no genérico "Evento" (nunca some da linha do tempo). */
function labelDoEvento(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? 'Evento';
}

/**
 * O painel é seu próprio landmark: ele aparece no detalhe do contato, e sem papel de landmark o
 * axe acusa TODO o texto dele com a regra `region` (fora de `<main>`).
 */
const REGIAO = { role: 'region' as const, 'aria-label': 'Linha do Tempo' };

/** Mesmo teto de corte usado na linha do tempo do histórico (`useConversationHistoryTimeline`). */
const NOTA_MAX = 120;

/**
 * Nota escrita na transferência (`conversation_events.metadata.note`): devolve o texto cortado em
 * 120 (a linha) e o texto completo (o detalhe) — ou `undefined`. Nota vazia/ausente não muda nada.
 */
function notaDoEvento(
  metadata: unknown,
): { curto: string; completo: string } | undefined {
  const nota = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).note : undefined;
  const bruto = typeof nota === 'string' ? nota : '';
  const completo = bruto.replace(/\s+/g, ' ').trim();
  if (!completo) return undefined;
  const curto = completo.length <= NOTA_MAX ? completo : `${completo.slice(0, NOTA_MAX).trimEnd()}…`;
  return { curto, completo };
}

export function ContactActivityTimeline({ contactId, contactCreatedAt, className }: ContactActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    async function fetchTimeline() {
      setLoading(true);
      setErro(null);
      const timeline: TimelineEvent[] = [];

      try {
        // Add creation event
        timeline.push({
          id: 'created',
          type: 'created',
          title: 'Contato criado',
          description: 'Adicionado à base de contatos',
          timestamp: contactCreatedAt,
        });

        // Fetch messages
        const { data: messages, error: erroMensagens } = await supabase
          .from('messages')
          .select('id, content, sender, created_at')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(20);
        if (erroMensagens) throw erroMensagens;

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
        const { data: notes, error: erroNotas } = await supabase
          .from('contact_notes')
          .select('id, content, created_at')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(10);
        if (erroNotas) throw erroNotas;

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

        // Fetch assignment events — sem teto: o "Ver mais" mostra o restante (antes, o 11º evento
        // e seguintes sumiam sem aviso).
        const { data: assignments, error: erroEventos } = await supabase
          .from('conversation_events')
          .select('id, event_type, created_at, metadata')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false });
        if (erroEventos) throw erroEventos;

        if (assignments) {
          assignments.forEach(evt => {
            const nota = notaDoEvento(evt.metadata);
            timeline.push({
              id: evt.id,
              type: 'assigned',
              title: labelDoEvento(evt.event_type),
              description: nota ? `Nota: ${nota.curto}` : undefined,
              notaCompleta: nota?.completo,
              timestamp: evt.created_at,
            });
          });
        }

        // Sort by timestamp descending
        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (!isMountedRef.current) return;
        setEvents(timeline);
      } catch (e) {
        if (!isMountedRef.current) return;
        setEvents([]);
        setErro(e instanceof Error && e.message ? e.message : 'Falha ao carregar a linha do tempo.');
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    }

    void fetchTimeline();
  }, [contactId, contactCreatedAt, tentativa]);

  const displayedEvents = expanded ? events : events.slice(0, 5);

  if (loading) {
    return (
      <div {...REGIAO} className={cn("space-y-3", className)}>
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

  if (erro) {
    return (
      <div {...REGIAO} className={cn("space-y-3", className)}>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Linha do Tempo
        </h3>
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
        >
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Não foi possível carregar a linha do tempo.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTentativa((t) => t + 1)}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div {...REGIAO} className={cn("space-y-3", className)}>
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
                    <span className="text-caption whitespace-nowrap">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-2xs text-muted-foreground truncate mt-0.5" title={event.notaCompleta}>{event.description}</p>
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
