import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, CheckCircle2, XCircle, AlertTriangle, Clock, Settings2, PlayCircle, Loader2, RefreshCw, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ConnectionInfo, WebhookTestResult } from './hooks/useEvolutionMonitoring';

interface Props {
  connections: ConnectionInfo[];
  webhookTest: WebhookTestResult;
  onCheckWebhook: (id: string) => void;
  onTestWebhook: (id: string) => void;
}

const statusIcon = (s: string | null) => {
  if (s === 'connected' || s === 'healthy') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (s === 'disconnected' || s === 'error') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (s === 'degraded') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
};

export function MonitoringConnectionsList({ connections, webhookTest, onCheckWebhook, onTestWebhook }: Props) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [loadingQr, setLoadingQr] = useState<Record<string, boolean>>({});
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});

  const fetchQr = useCallback(async (id: string) => {
    setLoadingQr(p => ({ ...p, [id]: true }));
    try {
      // 'get-qrcode' nunca existiu na edge (404 garantido) — 'connect' é a
      // action real do fluxo de QR e responde {qrcode:{base64}}.
      const { data, error } = await supabase.functions.invoke('evolution-api', { body: { action: 'connect', instanceName: id } });
      if (error) throw error;
      const b64 = data?.qrcode?.base64 || data?.base64;
      if (b64) setQrCodes(p => ({ ...p, [id]: b64 }));
      else toast.info('QR Code indisponível — instância pode já estar conectada.');
    } catch { toast.error('Erro ao buscar QR Code'); }
    finally { setLoadingQr(p => ({ ...p, [id]: false })); }
  }, []);

  const reconnect = useCallback(async (id: string) => {
    setReconnecting(p => ({ ...p, [id]: true }));
    try {
      const { error } = await supabase.functions.invoke('evolution-api', { body: { action: 'restart-instance', instanceName: id } });
      if (error) throw error;
      toast.success(`Instância ${id} reiniciada!`);
    } catch { toast.error('Erro ao reconectar'); }
    finally { setReconnecting(p => ({ ...p, [id]: false })); }
  }, []);

  if (!connections.length) return (
    <Card><CardContent className="py-12 text-center">
      <WifiOff className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>
    </CardContent></Card>
  );

  return (
    <div className="space-y-3">
      {connections.map((conn, i) => {
        const offline = conn.status !== 'connected';
        return (
          <motion.div key={conn.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="hover:shadow-md transition-all border-border/60">
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', conn.status === 'connected' ? 'bg-emerald-500/10' : 'bg-destructive/10')}>
                      {conn.status === 'connected' ? <Wifi className="w-5 h-5 text-emerald-500" /> : <WifiOff className="w-5 h-5 text-destructive" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{conn.instance_id}</span>
                        <Badge variant={conn.status === 'connected' ? 'default' : 'destructive'} className="text-[10px]">{conn.status}</Badge>
                        {conn.health_status && <Badge variant="outline" className="text-[10px] gap-1">{statusIcon(conn.health_status)}{conn.health_status}</Badge>}
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        {conn.phone_number && <span>📱 {conn.phone_number}</span>}
                        {conn.health_response_ms != null && (
                          <span className={cn('font-medium', conn.health_response_ms < 300 ? 'text-emerald-500' : conn.health_response_ms < 800 ? 'text-amber-500' : 'text-destructive')}>
                            ⚡ {conn.health_response_ms}ms
                          </span>
                        )}
                        {conn.last_health_check && <span>🕐 {formatDistanceToNow(new Date(conn.last_health_check), { addSuffix: true, locale: ptBR })}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {offline && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => fetchQr(conn.instance_id)} disabled={loadingQr[conn.instance_id]} className="text-xs h-8">
                          {loadingQr[conn.instance_id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <QrCode className="w-3.5 h-3.5 mr-1" />}QR
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => reconnect(conn.instance_id)} disabled={reconnecting[conn.instance_id]} className="text-xs h-8 text-amber-600">
                          {reconnecting[conn.instance_id] ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}Reconectar
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onCheckWebhook(conn.instance_id)} className="text-xs h-8">
                      <Settings2 className="w-3.5 h-3.5 mr-1" />Webhook
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onTestWebhook(conn.instance_id)} disabled={webhookTest.status === 'testing'} className="text-xs h-8">
                      {webhookTest.status === 'testing' ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Testando</> : <><PlayCircle className="w-3.5 h-3.5 mr-1" />Testar</>}
                    </Button>
                  </div>
                </div>
                {qrCodes[conn.instance_id] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 flex justify-center">
                    <div className="p-4 bg-white rounded-xl border shadow-sm">
                      <img src={qrCodes[conn.instance_id]} alt={`QR ${conn.instance_id}`} className="w-48 h-48 object-contain"  loading="lazy" decoding="async"/>
                      <p className="text-[10px] text-center text-muted-foreground mt-2">Escaneie com WhatsApp</p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
