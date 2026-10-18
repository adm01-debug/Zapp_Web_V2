import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button, MotionButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Smartphone,
  MoreVertical,
  Trash2,
  Copy,
  QrCode,
  Wifi,
  WifiOff,
  Star,
  Clock,
  Loader2,
  RefreshCw,
  History,
  Link2,
  Settings,
  BatteryCharging,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  FileClock,
  HeartPulse,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { motion } from 'framer-motion';
import { useUserRole } from '@/hooks/system/useUserRole';
import { BusinessHoursIndicator } from './BusinessHoursIndicator';
import { ConnectionDisconnectDialog } from './ConnectionDisconnectDialog';
import { ConnectionDeleteDialog } from './ConnectionDeleteDialog';
import { ConnectionAuditDialog } from './ConnectionAuditDialog';
import type { WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

const statusConfig: Record<string, { label: string; color: string; icon: typeof Wifi }> = {
  connected: { label: 'Conectado', color: 'bg-status-online', icon: Wifi },
  disconnected: { label: 'Desconectado', color: 'bg-status-offline', icon: WifiOff },
  connecting: { label: 'Conectando...', color: 'bg-status-away', icon: RefreshCw },
  pending: { label: 'Aguardando QR', color: 'bg-status-away', icon: QrCode },
  qr_pending: { label: 'Aguardando QR', color: 'bg-status-away', icon: QrCode },
};

interface ConnectionCardProps {
  connection: WhatsAppConnection;
  syncingHistory: string | null;
  disconnecting?: boolean;
  onShowQrCode: (c: WhatsAppConnection) => void;
  onCopyId: (id: string) => void;
  onDisconnect: (c: WhatsAppConnection) => void | Promise<void>;
  onSetDefault: (id: string) => void;
  onDelete: (c: WhatsAppConnection) => void;
  onBusinessHours: (id: string, name: string) => void;
  onQueues: (id: string, name: string) => void;
  onSettings: (instanceName: string, name: string) => void;
  onSyncHistory: (connection: WhatsAppConnection) => void;
  /** Provedor atual recusou o histórico (Evolution GO): esconde a ação. */
  historyNotSupported?: boolean;
  /** Health check por conexão (staff/admin). Ausente = item não aparece. */
  onHealthCheck?: (connection: WhatsAppConnection) => void;
  /** id da conexão com health check em andamento. */
  checkingHealth?: string | null;
}

export function ConnectionCard({
  connection,
  syncingHistory,
  disconnecting = false,
  onShowQrCode,
  onCopyId,
  onDisconnect,
  onSetDefault,
  onDelete,
  onBusinessHours,
  onQueues,
  onSettings,
  onSyncHistory,
  historyNotSupported = false,
  onHealthCheck,
  checkingHealth,
}: ConnectionCardProps) {
  const status = statusConfig[connection.status] || statusConfig.disconnected;
  const StatusIcon = status.icon;

  // Exclusão de conexão é destrutiva (apaga a instância na Evolution e o
  // vínculo local): só admin vê o item. As duas ações destrutivas passam por
  // confirmação — nada executa no primeiro clique.
  const { isAdmin, isSupervisor } = useUserRole();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Enquanto o desconectar está em voo (estado `disconnecting` vindo da view),
  // o diálogo fica aberto com o spinner; só fecha quando onDisconnect resolve.
  const handleConfirmDisconnect = async () => {
    await onDisconnect(connection);
    setConfirmDisconnect(false);
  };

  return (
    <motion.div whileHover={{ y: -2, boxShadow: '0 8px 30px hsl(var(--primary) / 0.1)' }}>
      <Card className="min-w-0 border border-secondary/20 bg-card transition-all hover:border-secondary/40">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <motion.div
                animate={connection.status === 'connecting' ? { rotate: 360 } : {}}
                transition={{
                  duration: 1,
                  repeat: connection.status === 'connecting' ? Infinity : 0,
                  ease: 'linear',
                }}
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                  connection.status === 'connected' ? 'bg-whatsapp/10' : 'bg-muted'
                )}
              >
                <Smartphone
                  className={cn(
                    'h-6 w-6',
                    connection.status === 'connected' ? 'text-whatsapp' : 'text-muted-foreground'
                  )}
                />
              </motion.div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold">{connection.name}</h3>
                  {connection.is_default && (
                    <Badge variant="secondary" className="text-xs">
                      <Star className="mr-1 h-3 w-3" />
                      Padrão
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      connection.status === 'connected' &&
                        'border-status-online text-status-online',
                      !['connected', 'connecting', 'pending', 'qr_pending'].includes(
                        connection.status
                      ) && 'border-status-offline text-status-offline',
                      ['connecting', 'pending', 'qr_pending'].includes(connection.status) &&
                        'border-status-away text-status-away'
                    )}
                  >
                    <StatusIcon
                      className={cn(
                        'mr-1 h-3 w-3',
                        connection.status === 'connecting' && 'animate-spin'
                      )}
                    />
                    {status.label}
                  </Badge>
                  <BusinessHoursIndicator connectionId={connection.id} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm text-muted-foreground">
                    {connection.phone_number}
                  </p>
                  {connection.battery_level != null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {connection.is_plugged ? (
                        <BatteryCharging className="h-3.5 w-3.5 text-success" />
                      ) : connection.battery_level <= 20 ? (
                        <BatteryLow className="h-3.5 w-3.5 text-destructive" />
                      ) : connection.battery_level <= 50 ? (
                        <BatteryMedium className="h-3.5 w-3.5 text-warning" />
                      ) : (
                        <BatteryFull className="h-3.5 w-3.5 text-success" />
                      )}
                      {connection.battery_level}%
                    </span>
                  )}
                  {(connection.retry_count ?? 0) > 0 && (
                    <Badge variant="outline" className="border-warning/30 text-3xs text-warning">
                      Tentativa {connection.retry_count}/{connection.max_retries || 5}
                    </Badge>
                  )}
                </div>
                {connection.health_status && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      {connection.health_status === 'healthy' && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      )}
                      <span
                        className={cn(
                          'relative inline-flex h-2 w-2 rounded-full',
                          connection.health_status === 'healthy' && 'bg-success',
                          connection.health_status === 'degraded' && 'bg-warning',
                          (connection.health_status === 'error' ||
                            connection.health_status === 'timeout' ||
                            connection.health_status === 'disconnected') &&
                            'bg-destructive'
                        )}
                      />
                    </span>
                    <span className="text-3xs text-muted-foreground">
                      {connection.health_status === 'healthy'
                        ? 'Saudável'
                        : connection.health_status === 'degraded'
                          ? 'Degradado'
                          : connection.health_status === 'timeout'
                            ? 'Timeout'
                            : connection.health_status === 'error'
                              ? 'Erro'
                              : 'Desconectado'}
                      {connection.health_response_ms != null && (
                        <> · {connection.health_response_ms}ms</>
                      )}
                    </span>
                  </div>
                )}
                {connection.last_health_check &&
                  !Number.isNaN(new Date(connection.last_health_check).getTime()) && (
                    <p className="mt-1 text-3xs text-muted-foreground">
                      Último check{' '}
                      {formatDistanceToNow(new Date(connection.last_health_check), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="outline" size="sm" onClick={() => onCopyId(connection.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar ID
                </Button>
              </motion.div>
              {connection.status !== 'connected' && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onShowQrCode(connection)}
                    className="border-whatsapp text-whatsapp hover:bg-whatsapp hover:text-primary-foreground"
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    Conectar
                  </Button>
                </motion.div>
              )}
              {connection.status === 'connected' && (
                <motion.div
                  whileHover={{ scale: disconnecting ? 1 : 1.05 }}
                  whileTap={{ scale: disconnecting ? 1 : 0.95 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnecting}
                    aria-busy={disconnecting}
                    className={cn(disconnecting && 'motion-safe:animate-pulse')}
                    onClick={() => setConfirmDisconnect(true)}
                  >
                    {disconnecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                        Desconectando…
                      </>
                    ) : (
                      <>
                        <WifiOff className="mr-2 h-4 w-4" />
                        Desconectar
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <MotionButton
                    variant="ghost"
                    size="icon"
                    aria-label={`Ações da conexão ${connection.name}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </MotionButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onSetDefault(connection.id)}>
                    <Star className="mr-2 h-4 w-4" />
                    Definir como padrão
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onShowQrCode(connection)}>
                    <QrCode className="mr-2 h-4 w-4" />
                    Gerar QR Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBusinessHours(connection.id, connection.name)}>
                    <Clock className="mr-2 h-4 w-4" />
                    Horário de Atendimento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onQueues(connection.id, connection.name)}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Vincular Filas
                  </DropdownMenuItem>
                  {connection.instance_id && (
                    <DropdownMenuItem
                      onClick={() => onSettings(connection.instance_id!, connection.name)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Configurações & Perfil
                    </DropdownMenuItem>
                  )}
                  {connection.instance_id && !historyNotSupported && (
                    <DropdownMenuItem
                      disabled={syncingHistory === connection.id}
                      onClick={() => onSyncHistory(connection)}
                    >
                      {syncingHistory === connection.id ? (
                        <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                      ) : (
                        <History className="mr-2 h-4 w-4" />
                      )}
                      Sincronizar Histórico
                    </DropdownMenuItem>
                  )}
                  {isSupervisor && onHealthCheck && (
                    <DropdownMenuItem
                      disabled={checkingHealth === connection.id}
                      onClick={() => onHealthCheck(connection)}
                    >
                      {checkingHealth === connection.id ? (
                        <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />
                      ) : (
                        <HeartPulse className="mr-2 h-4 w-4" />
                      )}
                      Checar agora
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <>
                      {connection.instance_id && (
                        <DropdownMenuItem onClick={() => setAuditOpen(true)}>
                          <FileClock className="mr-2 h-4 w-4" />
                          Auditoria da conexão
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConnectionDisconnectDialog
        open={confirmDisconnect}
        onOpenChange={handleDisconnectDialogOpenChange}
        connectionName={connection.name}
        phoneNumber={connection.phone_number}
        pending={disconnecting}
        onConfirm={handleConfirmDisconnect}
      />
      {isAdmin && (
        <ConnectionDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          connectionName={connection.name}
          onConfirm={() => onDelete(connection)}
        />
      )}
      {isAdmin && (
        <ConnectionAuditDialog
          open={auditOpen}
          onOpenChange={setAuditOpen}
          connectionName={connection.name}
          instanceId={connection.instance_id ?? null}
        />
      )}
    </motion.div>
  );
}
