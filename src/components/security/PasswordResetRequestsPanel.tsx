import { useState } from 'react';
import { getLogger } from '@/lib/logger';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Clock, CheckCircle, XCircle, Search, User, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { parseEdgeError } from '@/lib/invokeEdge';
import { isAccessDeniedError, ACCESS_DENIED_MESSAGE } from '@/lib/rlsError';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RejectResetDialog } from './RejectResetDialog';
import { usePasswordResetRequests, type ResetRequest } from '@/hooks/security/usePasswordResetRequests';

export function PasswordResetRequestsPanel() {
  const { requests, loading, processing: _hookProcessing, fetchRequests, approveRequest, rejectRequest } = usePasswordResetRequests();
  const [processing, setProcessing] = useState(false);
  const log = getLogger('password-reset-panel');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ResetRequest | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  const handleApprove = async (request: ResetRequest) => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('approve-password-reset', { body: { requestId: request.id, action: 'approve' } });
      if (error) {
        if (isAccessDeniedError(error)) throw new Error(ACCESS_DENIED_MESSAGE);
        throw new Error((await parseEdgeError(error, 'Erro ao aprovar')).message);
      }
      toast.success('Solicitação aprovada! Email de reset enviado.');
      fetchRequests();
    } catch (error) { log.error('Error approving:', error); toast.error(error instanceof Error ? error.message : 'Erro ao aprovar'); }
    finally { setProcessing(false); setSelectedRequest(null); }
  };

  const handleReject = async (reason: string) => {
    if (!selectedRequest) return;
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('approve-password-reset', { body: { requestId: selectedRequest.id, action: 'reject', rejectionReason: reason } });
      if (error) {
        if (isAccessDeniedError(error)) throw new Error(ACCESS_DENIED_MESSAGE);
        throw new Error((await parseEdgeError(error, 'Erro ao rejeitar')).message);
      }
      toast.success('Solicitação rejeitada');
      setRejectDialogOpen(false); setSelectedRequest(null); fetchRequests();
    } catch (error) { log.error('Error rejecting:', error); toast.error(error instanceof Error ? error.message : 'Erro ao rejeitar'); }
    finally { setProcessing(false); }
  };

  const matchesSearch = (r: ResetRequest) => r.email.toLowerCase().includes(search.toLowerCase());
  const pendingRequests = requests.filter(r => r.status === 'pending' && matchesSearch(r));
  const allRequests = requests.filter(matchesSearch);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusBadge = (status: string) => {
    if (status === 'pending') return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
    if (status === 'approved') return <Badge variant="default" className="gap-1 bg-success"><CheckCircle className="w-3 h-3" /> Aprovado</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Rejeitado</Badge>;
    return null;
  };

  // Conteúdo compartilhado pelas abas; cada TabsContent monta apenas o painel ativo.
  const renderRequests = (items: ResetRequest[], emptyText: string) => {
    if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
    if (items.length === 0) {
      return (
        <div className="text-center py-8">
          <Key className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">{search ? 'Nenhuma solicitação encontrada' : emptyText}</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {items.map((req) => (
            <motion.div key={req.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }} className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 rounded-lg bg-muted"><User className="w-4 h-4 text-muted-foreground" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{req.email}</span>{statusBadge(req.status)}</div>
                    <div className="text-sm text-muted-foreground mt-1">Solicitado {formatDistanceToNow(new Date(req.created_at), { addSuffix: true, locale: ptBR })}</div>
                    {req.reason && <p className="text-sm mt-2 p-2 rounded bg-muted"><strong>Motivo:</strong> {req.reason}</p>}
                    {req.ip_address && <p className="text-xs text-muted-foreground mt-1">IP: {req.ip_address}</p>}
                    {req.status === 'rejected' && req.rejection_reason && <div className="mt-2 p-2 rounded bg-destructive/10 text-sm"><strong className="text-destructive">Motivo da rejeição:</strong> {req.rejection_reason}</div>}
                    {req.reviewed_at && <p className="text-xs text-muted-foreground mt-1">Revisado em {format(new Date(req.reviewed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
                  </div>
                </div>
                {req.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setSelectedRequest(req); setRejectDialogOpen(true); }}><XCircle className="w-4 h-4 mr-1" />Rejeitar</Button>
                    <Button size="sm" onClick={() => { setSelectedRequest(req); void handleApprove(req); }} disabled={processing}><CheckCircle className="w-4 h-4 mr-1" />Aprovar</Button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Key className="w-5 h-5 text-primary" /></div>
            <div>
              <CardTitle className="flex items-center gap-2">Solicitações de Reset de Senha{pendingCount > 0 && <Badge variant="destructive" className="ml-2">{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</Badge>}</CardTitle>
              <CardDescription>Aprove ou rejeite solicitações de reset de senha</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRequests} className="gap-2"><RefreshCw className="w-4 h-4" />Atualizar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'all')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending" className="gap-2"><Clock className="w-4 h-4" />Pendentes ({pendingCount})</TabsTrigger>
            <TabsTrigger value="all" className="gap-2">Todas ({requests.length})</TabsTrigger>
          </TabsList>
          <div className="relative mt-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar por email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
          <TabsContent value="pending" className="mt-4">{renderRequests(pendingRequests, 'Nenhuma solicitação pendente')}</TabsContent>
          <TabsContent value="all" className="mt-4">{renderRequests(allRequests, 'Nenhuma solicitação encontrada')}</TabsContent>
        </Tabs>
      </CardContent>
      <RejectResetDialog open={rejectDialogOpen} email={selectedRequest?.email || ''} processing={processing} onClose={() => setRejectDialogOpen(false)} onReject={handleReject} />
    </Card>
  );
}
