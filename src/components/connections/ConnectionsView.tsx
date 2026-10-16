import { useState, useEffect } from 'react';
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
  Smartphone, Plus, QrCode, Loader2, CheckCircle2, XCircle, AlertCircle, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { BusinessHoursDialog } from './BusinessHoursDialog';
import { ConnectionQueuesDialog } from './ConnectionQueuesDialog';
import { InstanceSettingsDialog } from './InstanceSettingsDialog';
import { NumberReputationMonitor } from './NumberReputationMonitor';
import { ConnectionCard } from './ConnectionCard';
import { ConnectionDeleteDialog } from './ConnectionDeleteDialog';
import { useConnectionsManager, type WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';
import { useUserRole } from '@/hooks/system/useUserRole';

/** E42 — texto único da trava de nova conexão (cabeçalho e estado vazio). */
const MULTI_CONNECTION_LOCKED_MESSAGE = 'Múltiplas conexões ainda não estão habilitadas neste sistema';

export function ConnectionsView() {
  const {
    connections, loading,
    isAddDialogOpen, setIsAddDialogOpen,
    qrCodeDialog, newConnection, setNewConnection, isCreating,
    syncingHistory, setSyncingHistory, evolutionLoading,
    handleAddConnection, handleShowQrCode, handleRefreshQrCode,
    handleCopyId, handleDisconnect, handleSetDefault, handleDelete, closeQrDialog,
  } = useConnectionsManager();

  // PM-37 (parte de tela do PM-36): a comparação entre as instâncias do
  // provedor e as linhas de `whatsapp_connections` é uma ação de controle da
  // Edge Function `evolution-api` (`reconcile-instances`), restrita a
  // admin/supervisor — a tela só oferece o que a edge autoriza.
  const { isAdmin, isSupervisor } = useUserRole();
  const canManageInstances = isAdmin || isSupervisor;
  const [orphans, setOrphans] = useState<{ soNoProvedor: string[]; soNoBanco: string[] } | null>(null);
  const [checkingOrphans, setCheckingOrphans] = useState(false);
  const [orphanError, setOrphanError] = useState<string | null>(null);
  const [orphanToRemove, setOrphanToRemove] = useState<WhatsAppConnection | null>(null);

  // Trava a criação de conexão nova até o token por instância (Vault) estar
  // implementado — hoje ela nasceria sem credencial própria e usando o token
  // global da PRINCIPAL. Ver docs/audits/PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS_2026-09-25.md.
  const [multiConnectionEnabled, setMultiConnectionEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.from('global_settings').select('value').eq('key', 'multi_connection_enabled').maybeSingle()
      .then(({ data }) => { if (active) setMultiConnectionEnabled(data?.value === 'true'); });
    return () => { active = false; };
  }, []);

  // E42: os DOIS caminhos que abrem o diálogo de nova conexão — o botão do
  // cabeçalho e o "Adicionar Conexão" do estado vazio — passam pela mesma
  // chave. Antes o estado vazio chamava `setIsAddDialogOpen(true)` direto e
  // criava a conexão inoperante (token perdido, QR da PRINCIPAL) que a trava
  // existe para impedir.
  const openAddConnectionDialog = () => {
    if (multiConnectionEnabled) setIsAddDialogOpen(true);
  };

  const [businessHoursDialog, setBusinessHoursDialog] = useState({ open: false, connectionId: '', connectionName: '' });
  const [queuesDialog, setQueuesDialog] = useState({ open: false, connectionId: '', connectionName: '' });
  const [settingsDialog, setSettingsDialog] = useState({ open: false, instanceName: '', connectionName: '' });

  // A Evolution GO recusa o histórico (200 com `notSupported`). Quando isso
  // acontece, escondemos a ação em todos os cartões até a página recarregar.
  const [historyNotSupported, setHistoryNotSupported] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState<string | null>(null);

  const handleSyncHistory = async (connection: { id: string; instance_id?: string | null }) => {
    if (!connection.instance_id) return;
    setSyncingHistory(connection.id);
    toast({ title: 'Sincronizando histórico...', description: 'Isso pode levar alguns minutos.' });
    try {
      const { data, error } = await supabase.functions.invoke('evolution-sync', {
        body: { action: 'sync-all-messages', instanceName: connection.instance_id },
      });
      if (error) throw error;
      // Provedor GO: a função responde 200 com `{ success: false, notSupported: true }`.
      // Sem esta checagem a tela dizia "Sincronização concluída! 0 mensagens",
      // como se tivesse dado certo.
      if (data?.notSupported || data?.success === false) {
        setHistoryNotSupported(true);
        toast({
          title: 'Histórico não suportado',
          description: data?.message || 'O provedor atual (Evolution GO) não suporta sincronização de histórico. Requer Evolution API v2.',
        });
        return;
      }
      toast({ title: 'Sincronização concluída!', description: `${data?.totalSynced || 0} mensagens sincronizadas de ${data?.totalContacts || 0} contatos.` });
    } catch (e: unknown) {
      toast({ title: 'Erro na sincronização', description: e instanceof Error ? e.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setSyncingHistory(null); }
  };

  // Usa a ação de health check já existente (staff/admin). A função verifica
  // todas as conexões; o cartão se atualiza pelo realtime do `whatsapp_connections`.
  const handleHealthCheck = async (connection: { id: string }) => {
    setCheckingHealth(connection.id);
    try {
      const { data, error } = await supabase.functions.invoke('connection-health-check', { method: 'POST', body: {} });
      if (error) throw error;
      toast({ title: 'Health check concluído', description: `${data?.connections?.length || 0} conexão(ões) verificada(s).` });
    } catch (e: unknown) {
      toast({ title: 'Erro no health check', description: e instanceof Error ? e.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setCheckingHealth(null); }
  };

  // PM-36/PM-37: quem existe no provedor e não existe aqui (ou o contrário).
  // A edge é só leitura — ela não cria, não importa e não apaga nada. O Zapp
  // NÃO importa instâncias: "só no provedor" é informativo.
  const handleCheckOrphans = async () => {
    setCheckingOrphans(true);
    setOrphanError(null);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { action: 'reconcile-instances' },
      });
      if (error) throw error;
      // A edge responde 200 também nas falhas lógicas: o erro vem no corpo.
      if (data?.error) throw new Error(data.message ?? 'Não foi possível comparar as instâncias.');
      setOrphans({
        soNoProvedor: data?.so_no_provedor ?? [],
        soNoBanco: data?.so_no_banco ?? [],
      });
    } catch (e: unknown) {
      setOrphans(null);
      setOrphanError(e instanceof Error ? e.message : 'Não foi possível comparar as instâncias.');
    } finally { setCheckingOrphans(false); }
  };

  // A remoção reaproveita o `handleDelete` do gerenciador (mesmo caminho do
  // menu "Excluir" do cartão), depois da confirmação em duas etapas do
  // ConnectionDeleteDialog — nenhum clique único apaga nada.
  const handleRemoveOrphanRow = async () => {
    const connection = orphanToRemove;
    setOrphanToRemove(null);
    if (!connection) return;
    await handleDelete(connection);
    await handleCheckOrphans();
  };

  return (
    <div className="space-y-6 relative bg-background w-full min-w-0">
      <AuroraBorealis /><FloatingParticles />
      
      <PageHeader title="Conexões WhatsApp" subtitle="Gerencie múltiplas conexões WhatsApp via Evolution API"
        breadcrumbs={[{ label: 'Configurações' }, { label: 'Conexões' }]}
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground"
                disabled={!multiConnectionEnabled}
                title={multiConnectionEnabled ? undefined : MULTI_CONNECTION_LOCKED_MESSAGE}
              >
                <Plus className="w-4 h-4 mr-2" />Nova Conexão
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="sm:max-w-md">
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
        <DialogContent aria-describedby={undefined} className="sm:max-w-md text-center">
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
              <Button variant="outline" onClick={handleRefreshQrCode} disabled={evolutionLoading && qrCodeDialog.status !== 'error'}>
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

      {/* PM-36/PM-37 — instâncias sem correspondência (só para quem a edge
          autoriza: admin/supervisor). A lista é informativa e a única ação
          destrutiva é remover a LINHA local órfã, com confirmação. */}
      {canManageInstances && (
        <Card className="border border-secondary/20 bg-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" />
                  Instâncias sem correspondência
                </p>
                <p className="text-xs text-muted-foreground">
                  Compara as instâncias do provedor com as linhas de conexão daqui. O Zapp não
                  importa instâncias — nada é criado nem alterado; só a linha local órfã pode ser removida.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleCheckOrphans} disabled={checkingOrphans}>
                {checkingOrphans ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Verificar agora
              </Button>
            </div>

            {orphanError && <p role="alert" className="text-sm text-destructive">{orphanError}</p>}

            {orphans && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-secondary/20 p-3">
                  <p className="text-sm font-medium">Só no provedor ({orphans.soNoProvedor.length})</p>
                  <p className="text-xs text-muted-foreground">
                    Existem no provedor e não têm linha aqui. O Zapp não importa instâncias.
                  </p>
                  {orphans.soNoProvedor.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">Nenhuma.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {orphans.soNoProvedor.map((nome) => (
                        <li key={nome} className="text-sm font-mono break-all">{nome}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-secondary/20 p-3">
                  <p className="text-sm font-medium">Só no banco ({orphans.soNoBanco.length})</p>
                  <p className="text-xs text-muted-foreground">
                    Linhas reservadas que não têm instância no provedor. A remoção pede confirmação
                    e segue o mesmo caminho da exclusão de conexão.
                  </p>
                  {orphans.soNoBanco.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">Nenhuma.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {orphans.soNoBanco.map((nome) => {
                        const connection = connections.find((c) => c.instance_id === nome);
                        return (
                          <li key={nome} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-mono break-all">{nome}</span>
                            {connection ? (
                              <Button variant="outline" size="sm" onClick={() => setOrphanToRemove(connection)}>
                                Remover linha órfã
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                sem conexão carregada nesta tela
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Connections List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mr-2" />Carregando conexões...</div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Nenhuma conexão configurada"
          description={multiConnectionEnabled
            ? 'Adicione sua primeira conexão WhatsApp para começar a atender seus clientes.'
            : `${MULTI_CONNECTION_LOCKED_MESSAGE} — a criação de conexão fica disponível após a atualização multi-conexão.`}
          illustration="inbox"
          actionLabel={multiConnectionEnabled ? 'Adicionar Conexão' : undefined}
          onAction={multiConnectionEnabled ? openAddConnectionDialog : undefined}
        />
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
                onSyncHistory={handleSyncHistory}
                historyNotSupported={historyNotSupported}
                onHealthCheck={handleHealthCheck}
                checkingHealth={checkingHealth}
              />
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}

      <BusinessHoursDialog open={businessHoursDialog.open} onOpenChange={(open) => setBusinessHoursDialog(prev => ({ ...prev, open }))} connectionId={businessHoursDialog.connectionId} connectionName={businessHoursDialog.connectionName} />
      <ConnectionQueuesDialog open={queuesDialog.open} onOpenChange={(open) => setQueuesDialog(prev => ({ ...prev, open }))} connectionId={queuesDialog.connectionId} connectionName={queuesDialog.connectionName} />
      <InstanceSettingsDialog open={settingsDialog.open} onOpenChange={(open) => setSettingsDialog(prev => ({ ...prev, open }))} instanceName={settingsDialog.instanceName} connectionName={settingsDialog.connectionName} />
      {orphanToRemove && (
        <ConnectionDeleteDialog
          open
          onOpenChange={(open) => { if (!open) setOrphanToRemove(null); }}
          connectionName={orphanToRemove.name}
          onConfirm={() => { void handleRemoveOrphanRow(); }}
        />
      )}
      <NumberReputationMonitor />
    </div>
  );
}
