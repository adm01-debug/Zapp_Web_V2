import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Clock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueuePositionNotifierProps {
  contactId: string;
  className?: string;
}

export function QueuePositionNotifier({ contactId, className }: QueuePositionNotifierProps) {
  const { data: position } = useQuery({
    queryKey: ['queue-position', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('queue_positions')
        .select('position, estimated_wait_minutes, queue_id')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!data) return null;

      // Get queue name
      const { data: queue } = await supabase
        .from('queues')
        .select('name, color')
        .eq('id', data.queue_id)
        .maybeSingle();

      return { ...data, queueName: queue?.name, queueColor: queue?.color };
    },
    refetchInterval: 15000,
  });

  if (!position) return null;

  return (
    <div className={cn("flex items-center gap-2 text-xs", className)}>
      <Badge variant="outline" className="gap-1 text-[11px]" style={{ borderColor: position.queueColor }}>
        <Users className="w-3 h-3" />
        #{position.position} na fila
      </Badge>
      {position.estimated_wait_minutes && (
        <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          ~{position.estimated_wait_minutes}min
        </Badge>
      )}
    </div>
  );
}
