import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import { Key, Clock, CheckCircle, XCircle, Search, User, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RejectResetDialog } from './RejectResetDialog';

interface ResetRequest {
  id: string; user_id: string; email: string; reason: string | null;
  status: 'pending' | 'approved' | 'rejected'; reviewed_by: string | null;
  reviewed_at: string | null; rejection_reason: string | null;
  ip_address: string | null; user_agent: string | null; created_at: string;
}

export function PasswordResetRequestsPanel() {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ResetRequest | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // fetchRequests declarada antes do useEffect para satisfazer react-hooks/immutability
  const fetchRequests = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from('password_reset_requests_safe' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setRequests((data || []) as unknown as ResetRequest[]);
    } catch (error) { log.error('Error fetching requests:', error); toast.error('Erro ao carregar solicitações'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // E62: setTimeout(0) move o fetch inicial fora do body síncrono do effect
    // satisfazendo react-hooks/set-state-in-effect sem alterar o comportamento.
    const timer = setTimeout(() => void fetchRequests(), 0);
    const interval = setInterval(() => void fetchRequests(), 30_000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [fetchRequests]);

  const handleApprove = async (request: ResetRequest) => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('approve-password-reset', { body: { requestId: request.id, action: 'approve' } });
      if (error) throw error;
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
      if (error) throw error;
      toast.success('Solicitação rejeitada');
      setRejectDialogOpen(false); setSelectedRequest(null); fetchRequests();
    } catch (error) { log.error('Error rejecting:', error); toast.error(error instanceof Error ? error.message : 'Erro ao rejeitar'); }
    finally { setProcessing(false); }
  };

  const filteredRequests = requests.filter(r => r.email.toLowerCase().includes(search.toLowerCase()) && (activeTab === 'all' || r.status === 'pending'));
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusBadge = (status: string) => {
    if (status === 'pending') return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pendente</Badge>;
    if (status === 'approved') return <Badge variant="default" className="gap-1 bg-success"><CheckCircle className="w-3 h-3" /> Aprovado</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Rejeitado</Badge>;
    return null;
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
        </Tabs>
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar por email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>

        {loading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        : filteredRequests.length === 0 ? <div className="text-center py-8"><Key className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" /><p className="text-muted-foreground">{search ? 'Nenhuma solicitação encontrada' : 'Nenhuma solicitação pendente'}</p></div>
        : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredRequests.map((req) => (
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
                        <Button size="sm" onClick={() => { setSelectedRequest(req); handleApprove(req); }} disabled={processing}><CheckCircle className="w-4 h-4 mr-1" />Aprovar</Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
      <RejectResetDialog open={rejectDialogOpen} email={selectedRequest?.email || ''} processing={processing} onClose={() => setRejectDialogOpen(false)} onReject={handleReject} />
    </Card>
  );
}
