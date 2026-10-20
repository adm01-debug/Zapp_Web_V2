import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Ban, Clock, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { toast } from 'sonner';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';
import { playAlertSound } from '@/utils/securityAlertSound';
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

// Acima disso o painel mostra o contador '+N' em vez de listar tudo de uma vez.
const VISIBLE_LIMIT = 3;

const fallbackSettings = { soundVolume: 70, soundEnabled: true };

export function RateLimitRealtimeAlerts() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { settings, isQuietHours } = useNotificationSettings();
  // O polling roda fora do corpo do componente: as refs evitam ler volume/mudo/horário velhos na detecção.
  const soundVolumeRef = useRef(settings?.soundVolume ?? fallbackSettings.soundVolume);
  const soundEnabledRef = useRef(settings?.soundEnabled ?? fallbackSettings.soundEnabled);
  const isQuietHoursRef = useRef(isQuietHours);
  // Ids do snapshot anterior: populate no primeiro fetch e atualizado a cada rodada.
  const lastKnownIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    soundVolumeRef.current = settings?.soundVolume ?? fallbackSettings.soundVolume;
    soundEnabledRef.current = settings?.soundEnabled ?? fallbackSettings.soundEnabled;
    isQuietHoursRef.current = isQuietHours;
  }, [settings?.soundVolume, settings?.soundEnabled, isQuietHours]);

  const fetchAlerts = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await supabase
      .from('security_alerts')
      .select('*')
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (signal.aborted) return;
    if (error) {
      // Sem log do corpo da resposta: só o alerta de que a leitura falhou.
      setLoadError(true);
      return;
    }
    setLoadError(false);

    const fresh = (data ?? []) as SecurityAlert[];
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastKnownIdsRef.current = new Set(fresh.map((a) => a.id));
      setAlerts(fresh);
      return;
    }

    const newAlerts = fresh.filter((a) => !lastKnownIdsRef.current.has(a.id));
    if (newAlerts.length === 0) return;

    setAlerts(fresh);
    newAlerts.forEach((a) => {
      // Mudo do painel e horário de silêncio valem para o alerta de segurança também.
      const severo = a.severity === 'critical' || a.severity === 'high';
      if (severo && soundEnabledRef.current && !isQuietHoursRef.current()) {
        playAlertSound(soundVolumeRef.current);
      }
    });
    lastKnownIdsRef.current = new Set(fresh.map((a) => a.id));
  }, []);

  // Somente enquanto a aba está visível e online, uma requisição por vez (useVisiblePolling).
  const refresh = useVisiblePolling(fetchAlerts, 15_000);

  const handleDismiss = async (alertId: string) => {
    const { error } = await supabase
      .from('security_alerts')
      .update({ is_resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', alertId);

    if (error) {
      // O card só some quando o update confirma; senão o usuário pensa que resolveu e o alerta volta no polling.
      toast.error('Não foi possível dispensar o alerta. Tente novamente.');
      return;
    }
    setDismissed((prev) => new Set([...prev, alertId]));
  };

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));

  if (loadError && visibleAlerts.length === 0) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm"
      >
        <div className="bg-card border rounded-lg shadow-lg p-3 flex items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">Não foi possível carregar os alertas de segurança.</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return null;
  }

  const ocultos = visibleAlerts.length - VISIBLE_LIMIT;
  const exibidos = expanded ? visibleAlerts : visibleAlerts.slice(0, VISIBLE_LIMIT);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm"
    >
      {loadError && (
        <div className="bg-card border rounded-lg shadow-lg p-3 flex items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">Falha ao atualizar os alertas.</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Tentar de novo
          </Button>
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {exibidos.map((alert) => {
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
                      aria-label={`Dispensar alerta: ${alert.title}`}
                      onClick={() => void handleDismiss(alert.id)}
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
                    <span aria-hidden="true">•</span>
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
      {ocultos > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Mostrar menos' : `+${ocultos} ${ocultos === 1 ? 'alerta' : 'alertas'}`}
        </Button>
      )}
    </div>
  );
}
