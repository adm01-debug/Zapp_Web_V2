import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { log } from '@/lib/logger';
import { Key, Clock, CheckCircle, XCircle, Search, User, RefreshCw, AlertTriangle } from 'lucide-react';
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
  id: string; email: string; reason: string | null;
  status: 'pending' | 'approved' | 'rejected'; reviewed_at: string | null;
  rejection_reason: string | null; ip_address: string | null; created_at: string;
}

/** Mascara o endereço (a***@dominio) — o painel nunca repete o e-mail inteiro na confirmação. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

interface FunctionErrorPayload { error?: string; emailSent?: boolean; status?: string; }

/** Em resposta não-2xx o supabase-js devolve o corpo dentro de `error.context` (a Response).
 *  Lê o JSON sem estourar se o corpo já foi consumido ou não é JSON. */
async function readFunctionErrorPayload(error: unknown): Promise<FunctionErrorPayload | null> {
  const context = (error as { context?: unknown } | null)?.context;
  const json = (context as { json?: unknown } | null)?.json;
  if (typeof json !== 'function') return null;
  try {
    return (await (json as () => Promise<unknown>).call(context)) as FunctionErrorPayload;
  } catch {
    return null;
  }
}

export function PasswordResetRequestsPanel() {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ResetRequest | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  // Aprovada no banco, porém o e-mail não saiu (falha fechada da Edge): a solicitação
  // segue pendente e o reenvio é uma nova aprovação.
  const [emailFailedRequest, setEmailFailedRequest] = useState<ResetRequest | null>(null);

  // fetchRequests declarada antes do useEffect para satisfazer react-hooks/immutability
  const fetchRequests = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from('password_reset_requests_safe' as any).select('id, email, reason, status, reviewed_at, rejection_reason, ip_address, created_at').order('created_at', { ascending: false });
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
      if (error) {
        const payload = await readFunctionErrorPayload(error);
        if (payload?.emailSent === false) {
          // 502 approved_email_failed: a aprovação NÃO foi gravada (falha fechada), então
          // a solicitação continua pendente e oferecemos reenviar (nova aprovação idempotente).
          setEmailFailedRequest(request);
          toast.error('Aprovado, mas o e-mail não foi enviado — tente novamente');
          return;
        }
        throw new Error(payload?.error || (error instanceof Error ? error.message : 'Erro ao aprovar'));
      }
      setEmailFailedRequest(null);
      toast.success(`E-mail de redefinição enviado para ${maskEmail(request.email)}`);
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
        {emailFailedRequest && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Aprovado, mas o e-mail não foi enviado — tente novamente</span>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => void handleApprove(emailFailedRequest)} disabled={processing}>
              <RefreshCw className="h-4 w-4" />Reenviar
            </Button>
          </div>
        )}
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
