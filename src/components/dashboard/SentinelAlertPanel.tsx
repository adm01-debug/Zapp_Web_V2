import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { WarRoomAlert } from '@/hooks/business/useWarRoomData';

interface SentinelAlertPanelProps {
  alerts: WarRoomAlert[];
}

export function SentinelAlertPanel({ alerts: initialAlerts }: SentinelAlertPanelProps) {
  const [visibleAlerts, setVisibleAlerts] = useState<WarRoomAlert[]>(initialAlerts);

  const handleDismiss = async (alertId: string) => {
    const saved = [...visibleAlerts];
    setVisibleAlerts(current => current.filter(a => a.id !== alertId));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)('warroom_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', alertId);
    if (error) {
      setVisibleAlerts(saved);
      toast.error('Erro ao dispensar alerta');
    }
  };

  return (
    <div>
      {visibleAlerts.map((alert) => (
        <div key={alert.id}>
          <p>{alert.title}</p>
          <p>{alert.message}</p>
          <button
            onClick={() => void handleDismiss(alert.id)}
            aria-label={`Dispensar alerta: ${alert.title}`}
          >
            Dispensar
          </button>
        </div>
      ))}
    </div>
  );
}
