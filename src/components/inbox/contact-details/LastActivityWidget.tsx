import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversationHistoryTimeline } from '@/hooks/chat/useConversationHistoryTimeline';

interface LastActivityWidgetProps {
  contactId: string;
}

export function LastActivityWidget({ contactId }: LastActivityWidgetProps) {
  const { data, isLoading } = useConversationHistoryTimeline(contactId);
  const events = (data?.days ?? []).flatMap((d) => d.events).slice(0, 3);

  if (isLoading) return <div className="h-10 rounded-lg bg-muted/20 animate-pulse" />;
  if (!events.length) return <p className="text-xs text-muted-foreground/60 text-center py-2">Nenhuma atividade recente</p>;

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.id} className="flex items-start gap-2 text-[13px]">
          <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-foreground truncate">{event.title}</p>
            <p className="text-[11px] text-muted-foreground">{format(new Date(event.at), "dd/MM 'às' HH:mm", { locale: ptBR })}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
