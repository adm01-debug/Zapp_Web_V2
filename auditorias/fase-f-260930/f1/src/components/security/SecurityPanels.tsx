import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Smartphone, Monitor, Globe, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  created_at: string;
  is_resolved: boolean | null;
}

export interface Device {
  id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  is_trusted: boolean;
  last_seen_at: string;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high': case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'medium': return 'bg-warning/10 text-warning border-yellow-500/20';
    default: return 'bg-info/10 text-info border-info/20';
  }
};

interface SecurityAlertsPanelProps {
  alerts: SecurityAlert[];
  loading: boolean;
}

export function SecurityAlertsPanel({ alerts, loading }: SecurityAlertsPanelProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Alertas Recentes</CardTitle>
          <CardDescription>Atividades de segurança na sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-success mb-3" />
              <h4 className="font-medium">Nenhum alerta recente</h4>
              <p className="text-sm text-muted-foreground">Sua conta está segura e sem atividades suspeitas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                  <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}><AlertTriangle className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{alert.title}</h4>
                      <Badge variant="outline" className={getSeverityColor(alert.severity)}>{alert.severity}</Badge>
                      {alert.is_resolved && <Badge variant="outline" className="bg-success/10 text-success border-success/20">Resolvido</Badge>}
                    </div>
                    {alert.description && <p className="text-sm text-muted-foreground truncate">{alert.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: ptBR })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface SecurityDevicesPanelProps {
  devices: Device[];
  loading: boolean;
}

export function SecurityDevicesPanel({ devices, loading }: SecurityDevicesPanelProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" />Dispositivos Recentes</CardTitle>
          <CardDescription>Últimos dispositivos que acessaram sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Smartphone className="w-12 h-12 text-muted-foreground mb-3" />
              <h4 className="font-medium">Nenhum dispositivo registrado</h4>
              <p className="text-sm text-muted-foreground">Seus dispositivos aparecerão aqui após o login</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.slice(0, 5).map((device) => (
                <div key={device.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      {device.os?.toLowerCase().includes('mobile') || device.os?.toLowerCase().includes('android') || device.os?.toLowerCase().includes('ios')
                        ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{device.device_name || 'Dispositivo'}</h4>
                        {device.is_trusted && <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">Confiável</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{device.browser} · {device.os}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" />{device.ip_address}<span className="mx-1">·</span>
                        <Clock className="w-3 h-3" />{formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
