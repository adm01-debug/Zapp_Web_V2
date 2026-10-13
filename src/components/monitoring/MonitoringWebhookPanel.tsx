import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Send, Shield, PlayCircle, Loader2, Radio, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ConnectionInfo } from './hooks/useEvolutionMonitoring';
import type { WebhookConfigView, WebhookTestStage, WebhookTestState } from './hooks/useMonitoringActions';
import { groupExpectedEvents } from './hooks/useMonitoringActions';

interface Props {
  connections: ConnectionInfo[];
  webhookTest: WebhookTestState;
  webhookConfig: WebhookConfigView | null;
  reconfiguring: boolean;
  onTest: (instanceId: string) => void;
  onReconfigure: (instanceId: string) => void;
  onCheckConfig: (instanceId: string) => void;
}

const stageIcon = (state: WebhookTestStage['state']) => {
  if (state === 'ok') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (state === 'fail') return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
  return <MinusCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
};

/** Resultado do autoteste por etapa (assinatura → entrega → gravação). */
export function WebhookTestResultView({ webhookTest }: { webhookTest: WebhookTestState }) {
  if (webhookTest.status === 'idle' || webhookTest.status === 'testing') return null;
  const success = webhookTest.status === 'success';
  return (
    <div className={cn('p-4 rounded-lg border', success ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-destructive/5 border-destructive/20')}>
      <div className="flex items-center gap-2 flex-wrap">
        {success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
        <span className="font-medium text-sm">{success ? 'Sucesso' : 'Falha'}</span>
        {webhookTest.instance && <Badge variant="outline" className="text-3xs">{webhookTest.instance}</Badge>}
        {webhookTest.latencyMs != null && <Badge variant="outline" className="text-xs">{webhookTest.latencyMs}ms</Badge>}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{webhookTest.message}</p>
      <ul className="mt-2 space-y-1">
        {webhookTest.stages.map((stage) => (
          <li key={stage.id} className="flex items-start gap-2">
            {stageIcon(stage.state)}
            <span className="text-xs">
              <span className="font-medium">{stage.label}:</span> {stage.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MonitoringWebhookPanel({ connections, webhookTest, webhookConfig, reconfiguring, onTest, onReconfigure, onCheckConfig }: Props) {
  const expectedEvents = webhookConfig?.expectedEvents ?? [];
  const configuredEvents = webhookConfig?.events ?? [];
  const hasAll = configuredEvents.some((e) => e.toUpperCase() === 'ALL');
  const isConfigured = (event: string) => hasAll || configuredEvents.some((e) => e.toUpperCase() === event.toUpperCase());
  const categories = groupExpectedEvents(expectedEvents);

  const copyUrl = (url: string) => {
    void navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  return (
    <div className="space-y-4">
      {/* Carrega a config da conexão escolhida (diagnóstico do servidor, por flavor). */}
      {!webhookConfig && connections.length > 0 && (
        <div className="flex gap-2">
          {connections.map(conn => (
            <Button key={conn.id} variant="outline" size="sm" onClick={() => onCheckConfig(conn.instance_id)}>
              <Shield className="w-3.5 h-3.5 mr-1.5" />Carregar config ({conn.instance_id})
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Test Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />Teste de Entrega E2E
            </CardTitle>
            <CardDescription>Autoteste no servidor: assinatura → entrega → gravação (sem dado real)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections.map(conn => (
              <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <span className="font-medium text-sm">{conn.instance_id}</span>
                  <p className="text-3xs text-muted-foreground">Testa o pipeline no servidor</p>
                </div>
                <Button size="sm" onClick={() => onTest(conn.instance_id)} disabled={webhookTest.status === 'testing'}>
                  {webhookTest.status === 'testing'
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Testando...</>
                    : <><PlayCircle className="w-3.5 h-3.5 mr-1" />Testar E2E</>
                  }
                </Button>
              </div>
            ))}
            <WebhookTestResultView webhookTest={webhookTest} />
          </CardContent>
        </Card>

        {/* Config Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />Configuração do Webhook
            </CardTitle>
            <CardDescription>Diff visual: esperado pelo flavor ativo vs. configurado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookConfig ? (
              <>
                <div className="flex items-center gap-2">
                  {webhookConfig.configured ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                  <span className="font-medium text-sm">{webhookConfig.configured ? 'Configurado' : 'NÃO Configurado'}</span>
                  <Badge variant="outline" className="text-3xs ml-auto">{webhookConfig.presentCount ?? 0}/{expectedEvents.length} eventos</Badge>
                </div>

                {webhookConfig.configured && webhookConfig.urlCorrect === false && (
                  <p className="text-xs text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />URL diferente da esperada pelo servidor.
                  </p>
                )}

                {webhookConfig.url && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-3xs text-muted-foreground uppercase tracking-wide">URL</p>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyUrl(webhookConfig.url!)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-xs font-mono break-all">{webhookConfig.url}</p>
                  </div>
                )}

                {/* Event Diff by Category (lista esperada vem do servidor) */}
                {categories.length > 0 ? (
                  <div className="space-y-2">
                    {categories.map(({ label, events }) => {
                      const present = events.filter(isConfigured);
                      const allOk = present.length === events.length;

                      return (
                        <div key={label} className="p-2.5 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-2 mb-1.5">
                            {allOk ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
                            <span className="text-2xs font-medium">{label}</span>
                            <span className="text-3xs text-muted-foreground ml-auto">{present.length}/{events.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {events.map(e => {
                              const ok = isConfigured(e);
                              return (
                                <Badge
                                  key={e}
                                  variant={ok ? 'default' : 'destructive'}
                                  className={cn('text-[9px]', ok && 'bg-emerald-500/80 hover:bg-emerald-500/70')}
                                >
                                  {ok ? '✓' : '✗'} {e}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">O diagnóstico não devolveu a lista de eventos esperada.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Carregue a configuração de uma conexão.</p>
            )}

            {connections.map(conn => (
              <Button key={conn.id} className="w-full" onClick={() => onReconfigure(conn.instance_id)} disabled={reconfiguring} variant="default">
                {reconfiguring
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reconfigurando...</>
                  : <><Radio className="w-4 h-4 mr-2" />Reconfigurar ({conn.instance_id})</>
                }
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
