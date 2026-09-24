import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Users, Clock, MessageSquare, TrendingUp, ShieldAlert, CheckCircle2, XCircle, Siren } from 'lucide-react';
import { motion } from 'framer-motion';

interface CrisisMetric {
  label: string;
  value: number;
  threshold: number;
  unit: string;
  severity: 'ok' | 'warning' | 'critical';
  icon: typeof AlertTriangle;
}

export function CrisisRoom() {
  const [metrics, setMetrics] = useState<CrisisMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCrisis, setIsCrisis] = useState(false);

  useEffect(() => { loadMetrics(); }, []);

  const loadMetrics = async () => {
    setLoading(true);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [unanswered, totalToday, activeAgents, breachedSLA] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('sender', 'contact').gte('created_at', oneHourAgo.toISOString()),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(now.setHours(0, 0, 0, 0)).toISOString()),
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('is_active', true).in('role', ['agent', 'admin', 'supervisor']),
      supabase.from('conversation_sla').select('id', { count: 'exact', head: true })
        .eq('first_response_breached', true),
    ]);

    const unansweredCount = unanswered.count || 0;
    const totalCount = totalToday.count || 0;
    const agentCount = activeAgents.count || 0;
    const slaBreached = breachedSLA.count || 0;
    const queueRatio = agentCount > 0 ? Math.round(unansweredCount / agentCount) : unansweredCount;

    const buildMetrics: CrisisMetric[] = [
      {
        label: 'Msgs sem resposta (1h)',
        value: unansweredCount,
        threshold: 20,
        unit: 'msgs',
        severity: unansweredCount > 30 ? 'critical' : unansweredCount > 20 ? 'warning' : 'ok',
        icon: MessageSquare,
      },
      {
        label: 'Carga por agente',
        value: queueRatio,
        threshold: 10,
        unit: 'conv/agente',
        severity: queueRatio > 15 ? 'critical' : queueRatio > 10 ? 'warning' : 'ok',
        icon: Users,
      },
      {
        label: 'SLA estourados',
        value: slaBreached,
        threshold: 5,
        unit: 'conversas',
        severity: slaBreached > 10 ? 'critical' : slaBreached > 5 ? 'warning' : 'ok',
        icon: Clock,
      },
      {
        label: 'Agentes ativos',
        value: agentCount,
        threshold: 2,
        unit: 'online',
        severity: agentCount < 2 ? 'critical' : agentCount < 4 ? 'warning' : 'ok',
        icon: Users,
      },
    ];

    setMetrics(buildMetrics);
    setIsCrisis(buildMetrics.some(m => m.severity === 'critical'));
    setLoading(false);
  };

  const severityConfig = {
    ok: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success', label: 'Normal' },
    warning: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', label: 'Atenção' },
    critical: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', label: 'Crítico' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Siren className={`w-5 h-5 ${isCrisis ? 'text-destructive animate-pulse' : 'text-primary'}`} />
            Sala de Crise
          </h2>
          <p className="text-sm text-muted-foreground">Monitor em tempo real da operação</p>
        </div>
        <Badge variant={isCrisis ? 'destructive' : 'outline'} className="text-xs">
          {isCrisis ? '🔴 MODO CRISE ATIVO' : '🟢 Operação normal'}
        </Badge>
      </div>

      {/* Overall status banner */}
      {isCrisis && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center"
        >
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive mb-2" />
          <p className="text-sm font-bold text-destructive">Operação em estado crítico!</p>
          <p className="text-xs text-muted-foreground mt-1">Uma ou mais métricas excederam limites aceitáveis</p>
        </motion.div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted/20 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m, idx) => {
            const cfg = severityConfig[m.severity];
            const Icon = m.icon;
            return (
              <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <Card className={`border ${cfg.border}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                      <Badge variant="outline" className={`text-3xs ${cfg.text}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div>
                      <p className={`text-3xl font-bold ${cfg.text}`}>{m.value}</p>
                      <p className="text-3xs text-muted-foreground">{m.label}</p>
                    </div>
                    <div className="text-3xs text-muted-foreground">
                      Limite: {m.threshold} {m.unit}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={loadMetrics} className="text-xs">
          🔄 Atualizar métricas
        </Button>
      </div>
    </div>
  );
}
