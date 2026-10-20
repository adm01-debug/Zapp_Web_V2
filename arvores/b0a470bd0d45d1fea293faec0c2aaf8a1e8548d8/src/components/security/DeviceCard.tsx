import { motion } from 'framer-motion';
import { Smartphone, Monitor, Globe, Clock, Trash2, Shield, ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SessionCardProps {
  session: { id: string; device_id: string; ip_address: string; started_at: string };
  device?: { device_name: string; browser: string; os: string } | null;
  isCurrentSession: boolean;
  isProcessing: boolean;
  onEndSession: (id: string) => void;
}

export function SessionCard({ session, device, isCurrentSession, isProcessing, onEndSession }: SessionCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`flex items-center justify-between p-4 rounded-lg border ${isCurrentSession ? 'border-primary bg-primary/5' : 'bg-card'}`}>
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${isCurrentSession ? 'bg-primary/10' : 'bg-muted'}`}>
          <Monitor className={`w-5 h-5 ${isCurrentSession ? 'text-primary' : ''}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{device?.device_name || 'Dispositivo desconhecido'}</h4>
            {isCurrentSession && <Badge className="bg-primary">Sessão atual</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{device?.browser} · {device?.os}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
            <Globe className="w-3 h-3" />{session.ip_address}<span>·</span>
            <Clock className="w-3 h-3" />Ativa {formatDistanceToNow(new Date(session.started_at), { addSuffix: false, locale: ptBR })}
          </p>
        </div>
      </div>
      {!isCurrentSession && (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onEndSession(session.id)} disabled={isProcessing}>
          {isProcessing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> : <><LogOut className="w-4 h-4 mr-2" />Encerrar</>}
        </Button>
      )}
    </motion.div>
  );
}

interface DeviceCardProps {
  device: { id: string; device_name: string; browser: string; os: string; ip_address: string; is_trusted: boolean; last_seen_at: string };
  isCurrentDevice: boolean;
  isProcessing: boolean;
  onTrust: (id: string) => void;
  onRemove: (id: string) => void;
}

export function DeviceCard({ device, isCurrentDevice, isProcessing, onTrust, onRemove }: DeviceCardProps) {
  const isMobile = device.os?.toLowerCase().includes('mobile') || device.os?.toLowerCase().includes('android') || device.os?.toLowerCase().includes('ios');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-lg border ${isCurrentDevice ? 'border-primary bg-primary/5' : 'bg-card'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${isCurrentDevice ? 'bg-primary/10' : 'bg-muted'}`}>
            {isMobile ? <Smartphone className={`w-5 h-5 ${isCurrentDevice ? 'text-primary' : ''}`} /> : <Monitor className={`w-5 h-5 ${isCurrentDevice ? 'text-primary' : ''}`} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium">{device.device_name || 'Dispositivo'}</h4>
              {isCurrentDevice && <Badge className="bg-primary">Este dispositivo</Badge>}
              {device.is_trusted && <Badge variant="outline" className="bg-success/10 text-success border-success/20"><ShieldCheck className="w-3 h-3 mr-1" />Confiável</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{device.browser} · {device.os}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{device.ip_address}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Último acesso: {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true, locale: ptBR })}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!device.is_trusted && (
            <Button variant="outline" size="sm" onClick={() => onTrust(device.id)} disabled={isProcessing}>
              {isProcessing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> : <><Shield className="w-4 h-4 mr-2" />Confiar</>}
            </Button>
          )}
          {!isCurrentDevice && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover dispositivo?</AlertDialogTitle>
                  <AlertDialogDescription>Isso removerá o dispositivo da lista e encerrará todas as sessões associadas.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onRemove(device.id)} className="bg-destructive hover:bg-destructive">Remover</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </motion.div>
  );
}
