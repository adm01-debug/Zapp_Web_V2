import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, Send, Shield, PlayCircle, Loader2, Radio, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ConnectionInfo, WebhookTestResult, WebhookConfig } from './hooks/useEvolutionMonitoring';

interface Props {
  connections: ConnectionInfo[];
  webhookTest: WebhookTestResult;
  webhookConfig: WebhookConfig | null;
  reconfiguring: boolean;
  onTest: (instanceId: string) => void;
  onReconfigure: (instanceId: string) => void;
  onCheckConfig: (instanceId: string) => void;
}

const ALL_EXPECTED_EVENTS = [
  'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'MESSAGES_SET',
  'SEND_MESSAGE', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE', 'CONTACTS_SET',
  'PRESENCE_UPDATE', 'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE', 'CHATS_SET',
  'CONNECTION_UPDATE', 'LABELS_EDIT', 'LABELS_ASSOCIATION',
  'GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE', 'CALL', 'QRCODE_UPDATED',
];

const EVENT_CATEGORIES: Record<string, string[]> = {
  'Mensagens': ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'MESSAGES_SET', 'SEND_MESSAGE'],
  'Conexão': ['CONNECTION_UPDATE', 'QRCODE_UPDATED'],
  'Contatos': ['CONTACTS_UPSERT', 'CONTACTS_UPDATE', 'CONTACTS_SET'],
  'Chats': ['CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE', 'CHATS_SET'],
  'Grupos': ['GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE'],
  'Outros': ['PRESENCE_UPDATE', 'LABELS_EDIT', 'LABELS_ASSOCIATION', 'CALL'],
};

export function MonitoringWebhookPanel({ connections, webhookTest, webhookConfig, reconfiguring, onTest, onReconfigure, onCheckConfig }: Props) {
  const configuredEvents = webhookConfig?.events || [];

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  return (
    <div className="space-y-4">
      {/* Auto-load config for first connection if not loaded */}
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
            <CardDescription>Envio → Webhook → Persistência → Verificação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections.map(conn => (
              <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <span className="font-medium text-sm">{conn.instance_id}</span>
                  <p className="text-3xs text-muted-foreground">Testa pipeline completo</p>
                </div>
                <Button size="sm" onClick={() => onTest(conn.instance_id)} disabled={webhookTest.status === 'testing'}>
                  {webhookTest.status === 'testing'
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Testando...</>
                    : <><PlayCircle className="w-3.5 h-3.5 mr-1" />Testar E2E</>
                  }
                </Button>
              </div>
            ))}
            {webhookTest.status !== 'idle' && webhookTest.status !== 'testing' && (
              <div className={cn(
                'p-4 rounded-lg border',
                webhookTest.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-destructive/5 border-destructive/20'
              )}>
                <div className="flex items-center gap-2">
                  {webhookTest.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                  <span className="font-medium text-sm">{webhookTest.status === 'success' ? 'Sucesso' : 'Falha'}</span>
                  {webhookTest.latencyMs && <Badge variant="outline" className="text-xs">{webhookTest.latencyMs}ms</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{webhookTest.message}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />Configuração do Webhook
            </CardTitle>
            <CardDescription>Diff visual: esperado vs. configurado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookConfig ? (
              <>
                <div className="flex items-center gap-2">
                  {webhookConfig.configured ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                  <span className="font-medium text-sm">{webhookConfig.configured ? 'Configurado' : 'NÃO Configurado'}</span>
                  <Badge variant="outline" className="text-3xs ml-auto">{configuredEvents.length}/{ALL_EXPECTED_EVENTS.length} eventos</Badge>
                </div>

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

                {/* Event Diff by Category */}
                <div className="space-y-2">
                  {Object.entries(EVENT_CATEGORIES).map(([category, events]) => {
                    const configured = events.filter(e => configuredEvents.includes(e));
                    const missing = events.filter(e => !configuredEvents.includes(e));
                    const allOk = missing.length === 0;

                    return (
                      <div key={category} className="p-2.5 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 mb-1.5">
                          {allOk ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
                          <span className="text-2xs font-medium">{category}</span>
                          <span className="text-3xs text-muted-foreground ml-auto">{configured.length}/{events.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {events.map(e => {
                            const isConfigured = configuredEvents.includes(e);
                            return (
                              <Badge
                                key={e}
                                variant={isConfigured ? 'default' : 'destructive'}
                                className={cn('text-[9px]', isConfigured && 'bg-emerald-500/80 hover:bg-emerald-500/70')}
                              >
                                {isConfigured ? '✓' : '✗'} {e}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
