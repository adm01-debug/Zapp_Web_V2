import { useState, useEffect } from 'react';
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

export function BusinessHoursIndicator({
  connectionId,
  className,
  showLabel = true,
}: BusinessHoursIndicatorProps) {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [todayHours, setTodayHours] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkBusinessHours();
    
    // Check every minute
    const interval = setInterval(checkBusinessHours, 60000);
    return () => clearInterval(interval);
  }, [connectionId]);

  const checkBusinessHours = async () => {
    try {
      // Get current time in Brazil timezone
      const now = new Date();
      const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const currentDay = brazilTime.getDay();
      const currentTimeStr = brazilTime.toTimeString().slice(0, 5); // HH:MM

      // Fetch business hours for today - using any to bypass type issues
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('whatsapp_connection_id', connectionId)
        .eq('day_of_week', currentDay)
        .single();

      if (error && error.code !== 'PGRST116') {
        log.error('Error fetching business hours:', error);
        setIsOpen(null);
        setLoading(false);
        return;
      }

      if (!data) {
        // No configuration = assume open
        setIsOpen(true);
        setTodayHours(null);
        setLoading(false);
        return;
      }

      if (!data.is_open) {
        setIsOpen(false);
        setTodayHours('Fechado hoje');
        setLoading(false);
        return;
      }

      // Check if current time is within business hours
      const openTime = data.open_time.slice(0, 5);
      const closeTime = data.close_time.slice(0, 5);
      const isWithinHours = currentTimeStr >= openTime && currentTimeStr <= closeTime;

      setIsOpen(isWithinHours);
      setTodayHours(`${openTime} - ${closeTime}`);
      setLoading(false);
    } catch (error) {
      log.error('Error checking business hours:', error);
      setIsOpen(null);
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

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
