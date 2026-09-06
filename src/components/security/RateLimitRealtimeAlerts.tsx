import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Ban, Clock, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  ip_address: string | null;
  created_at: string;
  is_resolved: boolean | null;
}

const ALERT_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  rate_limit: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10 dark:bg-warning/20' },
  blocked_ip: { icon: Ban, color: 'text-destructive', bg: 'bg-destructive/10 dark:bg-destructive/20' },
  suspicious: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10 dark:bg-warning/20' },
  default: { icon: Shield, color: 'text-info', bg: 'bg-info/10 dark:bg-info/20' }
};

const SEVERITY_COLORS: Record<string, string> = {
  low: 'border-l-blue-500',
  medium: 'border-l-yellow-500',
  high: 'border-l-warning',
  critical: 'border-l-red-500'
};

function playAlertSound() {
  try {
    const audio = new Audio('/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch((err) => { console.warn('[RateLimitRealtimeAlerts] Audio play failed:', err); });
  } catch (e) {
    console.warn('[RateLimitRealtimeAlerts] Alert sound failed:', e);
  }
}

export function RateLimitRealtimeAlerts() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fetch recent unresolved alerts
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from('security_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.warn('[RateLimitRealtimeAlerts] Failed to fetch alerts:', error);
        return;
      }
      if (data) {
        setAlerts(data);
        return data;
      }
      return null;
    };

// E62: setTimeout(0) move o fetch inicial fora do body síncrono (set-state-in-effect).
    // lastKnownIds inicia vazio e é populado após o primeiro fetch.
    let lastKnownIds = new Set<string>();
    const timer = setTimeout(() => void fetchAlerts().then(initial => {
      if (initial) lastKnownIds = new Set(initial.map((a: SecurityAlert) => a.id));
    }), 0);

    // E62: Polling de 15s detecta novos alertas comparando com o snapshot anterior.
    const interval = setInterval(async () => {
      const { data: fresh } = await supabase
        .from('security_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!fresh) return;
      const newAlerts = (fresh as SecurityAlert[]).filter(a => !lastKnownIds.has(a.id));
      if (newAlerts.length > 0) {
        setAlerts(fresh as SecurityAlert[]);
        newAlerts.forEach(a => {
          if (a.severity === 'critical' || a.severity === 'high') playAlertSound();
        });
        lastKnownIds = new Set((fresh as SecurityAlert[]).map(a => a.id));
      }
    }, 15_000);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  const handleDismiss = async (alertId: string) => {
    setDismissed(prev => new Set([...prev, alertId]));
    
    // Mark as resolved in database
    await supabase
      .from('security_alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', alertId);
  };

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {visibleAlerts.slice(0, 3).map((alert) => {
          const config = ALERT_CONFIG[alert.alert_type] || ALERT_CONFIG.default;
          const Icon = config.icon;

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className={`bg-card border rounded-lg shadow-lg p-4 border-l-4 ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.medium}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bg}`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleDismiss(alert.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {alert.description && (
                    <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {alert.ip_address && (
                      <code className="font-mono">{alert.ip_address}</code>
                    )}
                    <span>•</span>
                    <span>
                      {formatDistanceToNow(new Date(alert.created_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
