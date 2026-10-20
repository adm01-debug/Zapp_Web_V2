import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Loader2, Wrench, Clock, TrendingUp, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import type { DiagnosticResult } from './hooks/useEvolutionMonitoring';

interface Props {
  diagnostic: DiagnosticResult | null;
  diagnosing: boolean;
  onRunDiagnostic: (autoFix?: boolean) => void;
  onReconfigureWebhook: (instanceId: string) => void;
  reconfiguring: boolean;
}

const sevCfg: Record<string, { icon: typeof CheckCircle2; color: string; label: string; bg: string }> = {
  ok: { icon: CheckCircle2, color: 'text-emerald-500', label: 'OK', bg: 'bg-emerald-500/10' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', label: 'Atenção', bg: 'bg-amber-500/10' },
  critical: { icon: XCircle, color: 'text-destructive', label: 'Crítico', bg: 'bg-destructive/10' },
  error: { icon: XCircle, color: 'text-destructive', label: 'Erro', bg: 'bg-destructive/10' },
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-destructive';
  const pc = score >= 80 ? '[&>div]:bg-emerald-500' : score >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-destructive';
  return (
    <div className="flex items-center gap-4">
      <motion.div className={cn('text-5xl font-bold tabular-nums', color)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
        {score}
      </motion.div>
      <div className="flex-1 space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground"><span>Saúde</span><span>{score}/100</span></div>
        <Progress value={score} className={cn('h-2.5 rounded-full', pc)} aria-label="Saúde" />
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <TrendingUp className="w-3 h-3" />
          <span>{score >= 80 ? 'Sistema saudável' : score >= 50 ? 'Necessita atenção' : 'Ação imediata'}</span>
        </div>
      </div>
    </div>
  );
}

interface CheckItem { label: string; status: 'ok' | 'warning' | 'error'; detail: string; action?: { label: string; onClick: () => void }; }

export function MonitoringDiagnosticPanel({ diagnostic, diagnosing, onRunDiagnostic, onReconfigureWebhook, reconfiguring }: Props) {
  const buildChecklist = (): CheckItem[] => {
    if (!diagnostic) return [];
    const items: CheckItem[] = [];
    diagnostic.diagnostics.forEach(d => {
      items.push({ label: `Conexão ${d.instance}`, status: d.connectionState === 'open' ? 'ok' : 'error', detail: d.connectionState === 'open' ? 'Operacional' : `Estado: ${d.connectionState}` });
      if (d.webhook) {
        items.push({ label: `Webhook URL (${d.instance})`, status: d.webhook.urlCorrect ? 'ok' : 'error', detail: d.webhook.urlCorrect ? 'URL correta' : 'URL incorreta',
          action: !d.webhook.urlCorrect ? { label: 'Corrigir', onClick: () => onReconfigureWebhook(d.instance) } : undefined });
        const m = d.webhook.missingCritical?.length || 0;
        items.push({ label: `Eventos (${d.instance})`, status: m === 0 ? 'ok' : m <= 2 ? 'warning' : 'error', detail: m === 0 ? `${d.webhook.eventsCount} configurados` : `${m} ausentes`,
          action: m > 0 ? { label: 'Reconfigurar', onClick: () => onReconfigureWebhook(d.instance) } : undefined });
      }
      if (d.messageFlow) items.push({ label: 'Fluxo de Mensagens', status: d.messageFlow.flowHealth === 'healthy' ? 'ok' : d.messageFlow.flowHealth === 'outbound-only' ? 'warning' : 'error',
        detail: d.messageFlow.flowHealth === 'healthy' ? `↓${d.messageFlow.lastHour.incoming} ↑${d.messageFlow.lastHour.outgoing}` : d.messageFlow.flowHealth === 'outbound-only' ? 'Apenas enviando' : 'Sem tráfego' });
    });
    return items;
  };

  const checklist = buildChecklist();
  const okCount = checklist.filter(c => c.status === 'ok').length;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => onRunDiagnostic(false)} disabled={diagnosing} variant="outline">
          {diagnosing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}Executar Diagnóstico
        </Button>
        <Button onClick={() => onRunDiagnostic(true)} disabled={diagnosing} variant="default">
          {diagnosing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}Diagnóstico + Auto-Fix
        </Button>
        {diagnostic && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(diagnostic.timestamp).toLocaleString('pt-BR')}</span>
          </div>
        )}
      </div>

      {diagnostic && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">Saúde Geral</CardTitle><CardDescription>Score baseado em conexão, webhook e fluxo</CardDescription></CardHeader>
                <CardContent><ScoreGauge score={diagnostic.overallHealth.score} /></CardContent></Card>
            </motion.div>
            {diagnostic.diagnostics.map((d, i) => {
              const sev = sevCfg[d.webhookSeverity] || sevCfg.error; const SevIcon = sev.icon;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 1) * 0.08 }}>
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">{d.instance}<Badge variant={d.connectionState === 'open' ? 'default' : 'destructive'} className="text-xs">{d.connectionState}</Badge></CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className={cn('flex items-center gap-2 p-2.5 rounded-lg', sev.bg)}><SevIcon className={cn('w-4 h-4', sev.color)} /><span className="text-sm font-medium">Webhook: {sev.label}</span>{d.webhookIssue && <span className="text-xs text-muted-foreground">— {d.webhookIssue}</span>}</div>
                      {d.autoFix && <div className={cn('p-3 rounded-lg text-xs font-medium', d.autoFix.applied ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive')}>{d.autoFix.applied ? '✅ Auto-fix aplicado' : '❌ Auto-fix falhou'}</div>}
                    </CardContent></Card>
                </motion.div>);
            })}
          </div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="h-fit"><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">Checklist<Badge variant="outline" className="text-3xs ml-auto">{okCount}/{checklist.length} OK</Badge></CardTitle><CardDescription>Verificações com ações diretas</CardDescription></CardHeader>
              <CardContent><div className="space-y-2">
                {checklist.map((item, i) => {
                  const icons = { ok: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />, warning: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />, error: <XCircle className="w-4 h-4 text-destructive shrink-0" /> };
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className={cn('flex items-center gap-3 p-2.5 rounded-lg', item.status === 'ok' ? 'bg-emerald-500/5' : item.status === 'warning' ? 'bg-amber-500/5' : 'bg-destructive/5')}>
                      {icons[item.status]}
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium">{item.label}</p><p className="text-2xs text-muted-foreground">{item.detail}</p></div>
                      {item.action && <Button size="sm" variant="outline" className="text-3xs h-7 shrink-0" onClick={item.action.onClick} disabled={reconfiguring}>
                        {reconfiguring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3 mr-1" />}{item.action.label}
                      </Button>}
                    </motion.div>);
                })}
              </div></CardContent></Card>
          </motion.div>
        </div>
      )}

      {!diagnostic && !diagnosing && (
        <Card><CardContent className="py-12 text-center"><Stethoscope className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Execute um diagnóstico para verificar o sistema.</p></CardContent></Card>
      )}
    </div>
  );
}
