import { useState } from 'react';
import { Monitor, Smartphone, LogOut, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDeviceDetection } from '@/hooks/ui/useDeviceDetection';
import { toast } from 'sonner';
import { SessionCard, DeviceCard } from './DeviceCard';

export function DevicesPanel() {
  const { devices, sessions, loading, currentDeviceId, trustDevice, removeDevice, endSession, endAllOtherSessions } = useDeviceDetection();
  const [processingDevice, setProcessingDevice] = useState<string | null>(null);
  const [processingSession, setProcessingSession] = useState<string | null>(null);

  const handleTrustDevice = async (deviceId: string) => {
    setProcessingDevice(deviceId);
    try { await trustDevice(deviceId); toast.success('Dispositivo marcado como confiável'); } catch { toast.error('Erro ao confiar no dispositivo'); } finally { setProcessingDevice(null); }
  };
  const handleRemoveDevice = async (deviceId: string) => {
    setProcessingDevice(deviceId);
    try { await removeDevice(deviceId); toast.success('Dispositivo removido'); } catch { toast.error('Erro ao remover dispositivo'); } finally { setProcessingDevice(null); }
  };
  const handleEndSession = async (sessionId: string) => {
    setProcessingSession(sessionId);
    try { await endSession(sessionId); toast.success('Sessão encerrada'); } catch { toast.error('Erro ao encerrar sessão'); } finally { setProcessingSession(null); }
  };
  const handleEndAllOtherSessions = async () => {
    try { await endAllOtherSessions(); toast.success('Todas as outras sessões foram encerradas'); } catch { toast.error('Erro ao encerrar sessões'); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Monitor className="w-5 h-5" />Sessões Ativas</CardTitle>
              <CardDescription>Sessões atualmente conectadas à sua conta</CardDescription>
            </div>
            {sessions.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"><LogOut className="w-4 h-4 mr-2" />Encerrar outras</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Encerrar outras sessões?</AlertDialogTitle><AlertDialogDescription>Isso desconectará todos os outros dispositivos da sua conta.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleEndAllOtherSessions} className="bg-destructive hover:bg-destructive">Encerrar sessões</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Monitor className="w-12 h-12 text-muted-foreground mb-3" /><h4 className="font-medium">Nenhuma sessão ativa</h4><p className="text-sm text-muted-foreground">Suas sessões aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={{ ...session, device_id: session.device_id ?? '', ip_address: session.ip_address ?? '' }} device={(() => { const d = devices.find(d => d.id === session.device_id); return d ? { ...d, device_name: d.device_name ?? '', browser: d.browser ?? '', os: d.os ?? '' } : undefined; })()} isCurrentSession={session.device_id === currentDeviceId} isProcessing={processingSession === session.id} onEndSession={handleEndSession} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" />Dispositivos Registrados</CardTitle>
          <CardDescription>Dispositivos que já acessaram sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Smartphone className="w-12 h-12 text-muted-foreground mb-3" /><h4 className="font-medium">Nenhum dispositivo registrado</h4><p className="text-sm text-muted-foreground">Seus dispositivos aparecerão aqui após o login</p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <DeviceCard key={device.id} device={{ ...device, device_name: device.device_name ?? '', browser: device.browser ?? '', os: device.os ?? '', ip_address: device.ip_address ?? '', is_trusted: device.is_trusted ?? false }} isCurrentDevice={device.id === currentDeviceId} isProcessing={processingDevice === device.id} onTrust={handleTrustDevice} onRemove={handleRemoveDevice} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-info/5 border-info/20">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertCircle className="w-5 h-5 text-info mt-0.5" />
          <div>
            <h4 className="font-medium text-info">Dica de Segurança</h4>
            <p className="text-sm text-muted-foreground mt-1">Marque seus dispositivos pessoais como "confiáveis" para não receber alertas de segurança a cada login. Remova dispositivos que você não reconhece imediatamente.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
