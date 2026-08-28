import { useState, useEffect, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';

export interface WhatsAppConnection {
  id: string;
  name: string;
  phone_number: string;
  instance_id: string | null;
  status: string;
  qr_code: string | null;
  is_default: boolean;
  created_at: string;
  battery_level?: number | null;
  is_plugged?: boolean | null;
  retry_count?: number | null;
  max_retries?: number | null;
  health_status?: string | null;
  health_response_ms?: number | null;
  last_health_check?: string | null;
}

export interface QrCodeDialogState {
  open: boolean;
  connectionId: string;
  connectionName: string;
  qrCode: string | null;
  status: 'loading' | 'pending' | 'connected' | 'error';
  errorMessage?: string;
}

const INITIAL_QR_STATE: QrCodeDialogState = {
  open: false,
  connectionId: '',
  connectionName: '',
  qrCode: null,
  status: 'loading',
};

export function useConnectionsManager() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [qrCodeDialog, setQrCodeDialog] = useState<QrCodeDialogState>(INITIAL_QR_STATE);
  const [newConnection, setNewConnection] = useState({ name: '', phone_number: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const {
    isLoading: evolutionLoading,
    createInstance,
    connectInstance,
    getInstanceStatus,
    disconnectInstance,
    deleteInstance,
  } = useEvolutionApi();

  useEffect(() => {
    fetchConnections();

    const channel = supabase
      .channel('whatsapp-connections-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_connections' },
        (payload) => {
          log.debug('Connection update:', payload);
          if (payload.eventType === 'UPDATE') {
            setConnections((prev) =>
              prev.map((conn) =>
                conn.id === (payload.new as WhatsAppConnection).id
                  ? (payload.new as WhatsAppConnection)
                  : conn
              )
            );
            if (qrCodeDialog.open && qrCodeDialog.connectionId === (payload.new as WhatsAppConnection).id) {
              const newConn = payload.new as WhatsAppConnection;
              if (newConn.status === 'connected') {
                setQrCodeDialog((prev) => ({ ...prev, status: 'connected', qrCode: null }));
              } else if (newConn.qr_code) {
                setQrCodeDialog((prev) => ({ ...prev, qrCode: newConn.qr_code, status: 'pending' }));
              }
            }
          } else if (payload.eventType === 'INSERT') {
            setConnections((prev) => [payload.new as WhatsAppConnection, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setConnections((prev) => prev.filter((conn) => conn.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  const fetchConnections = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setConnections(data);
    setLoading(false);
  };

  const generateInstanceName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30) +
    '_' + Date.now().toString().slice(-6);

  const handleAddConnection = async () => {
    if (!newConnection.name || !newConnection.phone_number) {
      toast({ title: 'Erro', description: 'Preencha o nome e o número do telefone.', variant: 'destructive' });
      return;
    }
    setIsCreating(true);
    const instanceName = generateInstanceName(newConnection.name);
    try {
      await createInstance({ instanceName });
      const { data, error } = await supabase.from('whatsapp_connections').insert({
        name: newConnection.name,
        phone_number: newConnection.phone_number,
        instance_id: instanceName,
        status: 'disconnected',
        is_default: connections.length === 0,
      }).select().single();
      if (error) throw error;
      toast({ title: 'Conexão criada!', description: 'Agora conecte escaneando o QR Code.' });
      setIsAddDialogOpen(false);
      setNewConnection({ name: '', phone_number: '' });
      if (data) handleShowQrCode(data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      log.error('Error creating connection:', error);
      toast({ title: 'Erro ao criar conexão', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const startStatusPolling = useCallback((instanceName: string, _connectionId: string) => {
    if (pollingInterval) clearInterval(pollingInterval);
    const interval = setInterval(async () => {
      try {
        const result = await getInstanceStatus(instanceName);
        if (result?.state === 'open' || result?.status === 'connected') {
          clearInterval(interval);
          setPollingInterval(null);
          setQrCodeDialog((prev) => ({ ...prev, status: 'connected', qrCode: null }));
          toast({ title: 'Conectado!', description: 'WhatsApp conectado com sucesso.' });
        }
      } catch (error) {
        log.error('Status polling error:', error);
      }
    }, 3000);
    setPollingInterval(interval);
  }, [getInstanceStatus, pollingInterval]);

  const handleShowQrCode = async (connection: WhatsAppConnection) => {
    if (!connection.instance_id) {
      toast({ title: 'Erro', description: 'Esta conexão não possui uma instância configurada.', variant: 'destructive' });
      return;
    }
    setQrCodeDialog({
      open: true, connectionId: connection.id, connectionName: connection.name,
      qrCode: connection.qr_code,
      status: connection.status === 'connected' ? 'connected' : 'loading',
    });
    if (connection.status !== 'connected') {
      try {
        const result = await connectInstance(connection.instance_id);
        if (result?.qrcode?.base64) {
          setQrCodeDialog((prev) => ({ ...prev, qrCode: result.qrcode.base64, status: 'pending' }));
        }
        startStatusPolling(connection.instance_id, connection.id);
      } catch (error: unknown) {
        setQrCodeDialog((prev) => ({
          ...prev, status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Erro ao gerar QR Code',
        }));
      }
    }
  };

  const handleRefreshQrCode = async () => {
    const connection = connections.find((c) => c.id === qrCodeDialog.connectionId);
    if (!connection?.instance_id) return;
    setQrCodeDialog((prev) => ({ ...prev, status: 'loading', qrCode: null }));
    try {
      const result = await connectInstance(connection.instance_id);
      if (result?.qrcode?.base64) {
        setQrCodeDialog((prev) => ({ ...prev, qrCode: result.qrcode.base64, status: 'pending' }));
      }
    } catch (error: unknown) {
      setQrCodeDialog((prev) => ({
        ...prev, status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Erro ao atualizar QR Code',
      }));
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: 'ID copiado!', description: 'O ID da conexão foi copiado para a área de transferência.' });
  };

  const handleReconnect = (connection: WhatsAppConnection) => handleShowQrCode(connection);

  const handleDisconnect = async (connection: WhatsAppConnection) => {
    if (!connection.instance_id) return;
    try {
      await disconnectInstance(connection.instance_id);
      await supabase.from('whatsapp_connections').update({ status: 'disconnected', qr_code: null }).eq('id', connection.id);
    } catch (error: unknown) {
      toast({ title: 'Erro ao desconectar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    }
  };

  const handleSetDefault = async (id: string) => {
    await supabase.from('whatsapp_connections').update({ is_default: false }).neq('id', id);
    await supabase.from('whatsapp_connections').update({ is_default: true }).eq('id', id);
    setConnections(connections.map((conn) => ({ ...conn, is_default: conn.id === id })));
    toast({ title: 'Conexão padrão atualizada' });
  };

  const handleDelete = async (connection: WhatsAppConnection) => {
    try {
      if (connection.instance_id) await deleteInstance(connection.instance_id).catch(() => {});
      const { error } = await supabase.from('whatsapp_connections').delete().eq('id', connection.id);
      if (!error) {
        setConnections(connections.filter((conn) => conn.id !== connection.id));
        toast({ title: 'Conexão removida', description: 'A conexão foi excluída com sucesso.' });
      }
    } catch (error: unknown) {
      toast({ title: 'Erro ao excluir', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    }
  };

  const closeQrDialog = () => {
    if (pollingInterval) { clearInterval(pollingInterval); setPollingInterval(null); }
    setQrCodeDialog(INITIAL_QR_STATE);
  };

  return {
    connections,
    loading,
    isAddDialogOpen, setIsAddDialogOpen,
    qrCodeDialog,
    newConnection, setNewConnection,
    isCreating,
    syncingHistory, setSyncingHistory,
    evolutionLoading,
    handleAddConnection,
    handleShowQrCode,
    handleRefreshQrCode,
    handleCopyId,
    handleReconnect,
    handleDisconnect,
    handleSetDefault,
    handleDelete,
    closeQrDialog,
  };
}
