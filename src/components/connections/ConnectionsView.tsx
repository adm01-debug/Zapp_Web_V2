import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { motion, StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import {
  Smartphone, Plus, QrCode, Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { BusinessHoursDialog } from './BusinessHoursDialog';
import { ConnectionQueuesDialog } from './ConnectionQueuesDialog';
import { InstanceSettingsDialog } from './InstanceSettingsDialog';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NumberReputationMonitor } from './NumberReputationMonitor';
import { ConnectionCard } from './ConnectionCard';
import { useConnectionsManager } from '@/hooks/inbox/useConnectionsManager';

export function ConnectionsView() {
  const {
    connections, loading,
    isAddDialogOpen, setIsAddDialogOpen,
    qrCodeDialog, newConnection, setNewConnection, isCreating,
    syncingHistory, setSyncingHistory, evolutionLoading,
    handleAddConnection, handleShowQrCode, handleRefreshQrCode,
    handleCopyId, handleDisconnect, handleSetDefault, handleDelete, closeQrDialog,
  } = useConnectionsManager();

  const [businessHoursDialog, setBusinessHoursDialog] = useState({ open: false, connectionId: '', connectionName: '' });
  const [queuesDialog, setQueuesDialog] = useState({ open: false, connectionId: '', connectionName: '' });
  const [settingsDialog, setSettingsDialog] = useState({ open: false, instanceName: '', connectionName: '' });
  const [integrationsDialog, setIntegrationsDialog] = useState({ open: false, instanceName: '', connectionName: '' });

  const handleSyncHistory = async (connection: { id: string; instance_id?: string | null }) => {
    if (!connection.instance_id) return;
    setSyncingHistory(connection.id);
    toast({ title: 'Sincronizando histórico...', description: 'Isso pode levar alguns minutos.' });
    try {
      const { data, error } = await supabase.functions.invoke('evolution-sync', {
        body: { action: 'sync-all-messages', instanceName: connection.instance_id },
      });
      if (error) throw error;
      toast({ title: 'Sincronização concluída!', description: `${data?.totalSynced || 0} mensagens sincronizadas de ${data?.totalContacts || 0} contatos.` });
    } catch (e: unknown) {
      toast({ title: 'Erro na sincronização', description: e instanceof Error ? e.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setSyncingHistory(null); }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis /><FloatingParticles />
      
      <PageHeader title="Conexões WhatsApp" subtitle="Gerencie múltiplas conexões WhatsApp via Evolution API"
        breadcrumbs={[{ label: 'Configurações' }, { label: 'Conexões' }]}
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild><Button className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Nova Conexão</Button></DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Adicionar Nova Conexão</DialogTitle><DialogDescription>Crie uma nova instância para conectar ao WhatsApp</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>Nome da Conexão</Label><Input placeholder="Ex: WhatsApp Vendas" value={newConnection.name} onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Número do WhatsApp</Label><Input placeholder="+55 11 99999-0000" value={newConnection.phone_number} onChange={(e) => setNewConnection({ ...newConnection, phone_number: e.target.value })} /></div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isCreating}>Cancelar</Button>
                  <Button onClick={handleAddConnection} className="bg-whatsapp hover:bg-whatsapp-dark" disabled={isCreating}>
                    {isCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Adicionar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* QR Code Dialog */}
      <Dialog open={qrCodeDialog.open} onOpenChange={(open) => !open && closeQrDialog()}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              {qrCodeDialog.status === 'connected' ? <><CheckCircle2 className="w-5 h-5 text-status-online" />Conectado!</> :
               qrCodeDialog.status === 'error' ? <><XCircle className="w-5 h-5 text-destructive" />Erro</> :
               <><QrCode className="w-5 h-5" />Escanear QR Code - {qrCodeDialog.connectionName}</>}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            {qrCodeDialog.status === 'loading' && <div className="w-64 h-64 mx-auto bg-muted rounded-xl flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-muted-foreground" /></div>}
            {qrCodeDialog.status === 'pending' && qrCodeDialog.qrCode && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-64 h-64 mx-auto bg-background rounded-xl p-2 flex items-center justify-center">
                <img src={qrCodeDialog.qrCode.startsWith('data:') ? qrCodeDialog.qrCode : `data:image/png;base64,${qrCodeDialog.qrCode}`} alt="QR Code" className="w-full h-full object-contain"  loading="lazy" decoding="async"/>
              </motion.div>
            )}
            {qrCodeDialog.status === 'connected' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-64 h-64 mx-auto bg-status-online/10 rounded-xl flex flex-col items-center justify-center">
                <CheckCircle2 className="w-20 h-20 text-status-online mb-4" /><p className="text-lg font-medium text-status-online">WhatsApp Conectado!</p>
              </motion.div>
            )}
            {qrCodeDialog.status === 'error' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-64 h-64 mx-auto bg-destructive/10 rounded-xl flex flex-col items-center justify-center p-4">
                <AlertCircle className="w-16 h-16 text-destructive mb-4" /><p className="text-sm text-destructive text-center">{qrCodeDialog.errorMessage}</p>
              </motion.div>
            )}
            {qrCodeDialog.status === 'pending' && (
              <>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>1. Abra o WhatsApp no seu celular</p><p>2. Toque em <strong>Menu</strong> ou <strong>Configurações</strong></p>
                  <p>3. Toque em <strong>Aparelhos conectados</strong></p><p>4. Toque em <strong>Conectar um aparelho</strong></p><p>5. Aponte seu celular para esta tela</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Aguardando conexão...</div>
              </>
            )}
            {(qrCodeDialog.status === 'pending' || qrCodeDialog.status === 'error') && (
              <Button variant="outline" onClick={handleRefreshQrCode} disabled={evolutionLoading}>
                {evolutionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Gerar novo código
              </Button>
            )}
            {qrCodeDialog.status === 'connected' && <Button onClick={closeQrDialog}>Fechar</Button>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total de Conexões', value: connections.length, color: 'text-primary' },
          { label: 'Conectadas', value: connections.filter(c => c.status === 'connected').length, color: 'text-status-online' },
          { label: 'Desconectadas', value: connections.filter(c => c.status !== 'connected').length, color: 'text-status-offline' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="border border-secondary/20 bg-card card-glow-purple"><CardContent className="p-4"><p className="text-sm text-muted-foreground">{stat.label}</p><p className={cn('text-3xl font-bold', stat.color)}>{stat.value}</p></CardContent></Card>
          </motion.div>
        ))}
      </div>

      {/* Connections List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2" />Carregando conexões...</div>
      ) : connections.length === 0 ? (
        <EmptyState icon={Smartphone} title="Nenhuma conexão configurada" description="Adicione sua primeira conexão WhatsApp para começar a atender seus clientes." illustration="inbox" actionLabel="Adicionar Conexão" onAction={() => setIsAddDialogOpen(true)} />
      ) : (
        <StaggeredList className="space-y-4">
          {connections.map((connection) => (
            <StaggeredItem key={connection.id}>
              <ConnectionCard
                connection={connection} syncingHistory={syncingHistory}
                onShowQrCode={handleShowQrCode} onCopyId={handleCopyId} onDisconnect={handleDisconnect}
                onSetDefault={handleSetDefault} onDelete={handleDelete}
                onBusinessHours={(id, name) => setBusinessHoursDialog({ open: true, connectionId: id, connectionName: name })}
                onQueues={(id, name) => setQueuesDialog({ open: true, connectionId: id, connectionName: name })}
                onSettings={(inst, name) => setSettingsDialog({ open: true, instanceName: inst, connectionName: name })}
                onIntegrations={(inst, name) => setIntegrationsDialog({ open: true, instanceName: inst, connectionName: name })}
                onSyncHistory={handleSyncHistory}
              />
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <BusinessHoursDialog open={businessHoursDialog.open} onOpenChange={(open) => setBusinessHoursDialog(prev => ({ ...prev, open }))} connectionId={businessHoursDialog.connectionId} connectionName={businessHoursDialog.connectionName} />
      <ConnectionQueuesDialog open={queuesDialog.open} onOpenChange={(open) => setQueuesDialog(prev => ({ ...prev, open }))} connectionId={queuesDialog.connectionId} connectionName={queuesDialog.connectionName} />
      <InstanceSettingsDialog open={settingsDialog.open} onOpenChange={(open) => setSettingsDialog(prev => ({ ...prev, open }))} instanceName={settingsDialog.instanceName} connectionName={settingsDialog.connectionName} />
      <IntegrationsPanel open={integrationsDialog.open} onOpenChange={(open) => setIntegrationsDialog(prev => ({ ...prev, open }))} instanceName={integrationsDialog.instanceName} connectionName={integrationsDialog.connectionName} />
      <NumberReputationMonitor />
    </div>
  );
}
