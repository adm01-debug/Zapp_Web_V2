import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { Clock, Sun, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface BusinessHoursIndicatorProps {
  connectionId: string;
  className?: string;
  showLabel?: boolean;
}

interface BusinessHoursStatus {
  isOpen: boolean | null;
  todayHours: string | null;
}

async function fetchBusinessHoursStatus(connectionId: string): Promise<BusinessHoursStatus> {
  // Get current time in Brazil timezone
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentDay = brazilTime.getDay();
  const currentTimeStr = brazilTime.toTimeString().slice(0, 5); // HH:MM

  // limit(1) em vez de single(): single() força o header
  // "Accept: application/vnd.pgrst.object+json", que faz o PostgREST
  // responder 406 sempre que não existe configuração para o dia atual
  // (caso normal, não um erro).
  const { data: rows, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('whatsapp_connection_id', connectionId)
    .eq('day_of_week', currentDay)
    .limit(1);

  if (error) {
    log.error('Error fetching business hours:', error);
    return { isOpen: null, todayHours: null };
  }

  const data = rows?.[0] ?? null;

  if (!data) {
    // No configuration = assume open
    return { isOpen: true, todayHours: null };
  }

  if (!data.is_open) {
    return { isOpen: false, todayHours: 'Fechado hoje' };
  }

  // Check if current time is within business hours
  const openTime = data.open_time.slice(0, 5);
  const closeTime = data.close_time.slice(0, 5);
  const isWithinHours = currentTimeStr >= openTime && currentTimeStr <= closeTime;

  return { isOpen: isWithinHours, todayHours: `${openTime} - ${closeTime}` };
}

export function BusinessHoursIndicator({
  connectionId,
  className,
  showLabel = true,
}: BusinessHoursIndicatorProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['business-hours-status', connectionId],
    queryFn: () => fetchBusinessHoursStatus(connectionId),
    enabled: !!connectionId,
    refetchInterval: 60000, // Check every minute
  });

  if (isLoading) {
    return null;
  }

  const isOpen = data?.isOpen ?? null;
  const todayHours = data?.todayHours ?? null;

  if (isOpen === null) {
    return null; // No business hours configured
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className={className}
          >
            <Badge
              variant="outline"
              className={cn(
                'text-xs gap-1 cursor-default',
                isOpen
                  ? 'border-status-online/50 text-status-online bg-status-online/10'
                  : 'border-status-offline/50 text-status-offline bg-status-offline/10'
              )}
            >
              {isOpen ? (
                <Sun className="w-3 h-3" />
              ) : (
                <Moon className="w-3 h-3" />
              )}
              {showLabel && (isOpen ? 'Aberto' : 'Fechado')}
            </Badge>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            {todayHours ? (
              <span>Horário hoje: {todayHours}</span>
            ) : (
              <span>Sem horário configurado</span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
