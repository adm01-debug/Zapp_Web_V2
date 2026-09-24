import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Radio, MessageSquare, ArrowUp, Wifi, WifiOff, PlugZap, Pause, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type EventType = 'message_in' | 'message_out' | 'health_ok' | 'health_fail' | 'connection_change';

interface TimelineEvent {
  id: string;
  type: EventType;
  label: string;
  detail: string;
  timestamp: string;
  isNew?: boolean;
}

const iconMap: Record<EventType, typeof MessageSquare> = {
  message_in: MessageSquare,
  message_out: ArrowUp,
  health_ok: Wifi,
  health_fail: WifiOff,
  connection_change: PlugZap,
};

const colorMap: Record<EventType, string> = {
  message_in: 'text-primary',
  message_out: 'text-emerald-500',
  health_ok: 'text-emerald-500',
  health_fail: 'text-destructive',
  connection_change: 'text-amber-500',
};

type FilterType = 'all' | 'messages' | 'health';

function LiveDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="relative flex h-2 w-2" aria-label="Live">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  );
}

export function MonitoringEventTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [paused, setPaused] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (paused) return;

    const load = async () => {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const [msgRes, healthRes] = await Promise.all([
        supabase.from('messages').select('id, sender, content, created_at').gte('created_at', oneHourAgo).order('created_at', { ascending: false }).limit(20),
        supabase.from('connection_health_logs').select('id, instance_id, status, error_message, checked_at').order('checked_at', { ascending: false }).limit(15),
      ]);

      const timeline: TimelineEvent[] = [];
      const prevIds = prevIdsRef.current;

      msgRes.data?.forEach(m => timeline.push({
        id: m.id,
        type: m.sender === 'contact' ? 'message_in' : 'message_out',
        label: m.sender === 'contact' ? 'Mensagem Recebida' : 'Mensagem Enviada',
        detail: (m.content || '').slice(0, 60) + ((m.content || '').length > 60 ? '…' : ''),
        timestamp: m.created_at,
        isNew: !prevIds.has(m.id),
      }));

      healthRes.data?.forEach(h => {
        const ok = h.status === 'connected' || h.status === 'healthy';
        timeline.push({
          id: h.id,
          type: ok ? 'health_ok' : 'health_fail',
          label: ok ? 'Health OK' : 'Health Falha',
          detail: `${h.instance_id}${h.error_message ? ` — ${h.error_message.slice(0, 40)}` : ''}`,
          timestamp: h.checked_at,
          isNew: !prevIds.has(h.id),
        });
      });

      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const result = timeline.slice(0, 40);
      prevIdsRef.current = new Set(result.map(e => e.id));
      setEvents(result);
    };

    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [paused]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'messages') return events.filter(e => e.type === 'message_in' || e.type === 'message_out');
    return events.filter(e => e.type === 'health_ok' || e.type === 'health_fail');
  }, [events, filter]);

  const hasErrors = events.some(e => e.type === 'health_fail');

  const filters: { value: FilterType; label: string; count: number }[] = [
    { value: 'all', label: 'Todos', count: events.length },
    { value: 'messages', label: 'Msgs', count: events.filter(e => e.type.startsWith('message')).length },
    { value: 'health', label: 'Health', count: events.filter(e => e.type.startsWith('health')).length },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          Atividade Recente
          <LiveDot active={!paused} />
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Última hora
            {hasErrors && <Badge variant="destructive" className="text-[9px] h-4 px-1">Erros</Badge>}
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-3xs">{filtered.length} eventos</Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setPaused(p => !p)}
              aria-label={paused ? 'Retomar atualização' : 'Pausar atualização'}
            >
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </Button>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-1" role="tablist" aria-label="Filtrar eventos">
          {filters.map(f => (
            <Button key={f.value} variant="ghost" size="sm"
              role="tab"
              aria-selected={filter === f.value}
              className={cn('h-6 text-3xs px-2', filter === f.value && 'bg-muted font-semibold')}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({f.count})
            </Button>
          ))}
        </div>

        <ScrollArea className="h-[340px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
              <Radio className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm font-medium">Nenhuma atividade</p>
              <p className="text-2xs text-muted-foreground/60 mt-1">Eventos aparecerão aqui em tempo real</p>
            </div>
          ) : (
            <div className="relative space-y-0" role="log" aria-label="Feed de eventos em tempo real">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />
              <AnimatePresence initial={false}>
                {filtered.map(ev => {
                  const Icon = iconMap[ev.type];
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: -10, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        'relative flex items-start gap-3 py-2 pl-1',
                        ev.isNew && 'bg-primary/5 rounded-lg -mx-1 px-2'
                      )}
                    >
                      <div className={cn(
                        'relative z-10 flex items-center justify-center w-[30px] h-[30px] rounded-full bg-background border shrink-0 transition-colors',
                        ev.type === 'health_fail' ? 'border-destructive/40' : 'border-border'
                      )}>
                        <Icon className={cn('w-3.5 h-3.5', colorMap[ev.type])} />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{ev.label}</span>
                          {ev.isNew && <span className="text-[9px] text-primary font-semibold uppercase">Novo</span>}
                          <span className="text-3xs text-muted-foreground ml-auto shrink-0">
                            {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-2xs text-muted-foreground truncate mt-0.5">{ev.detail}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
