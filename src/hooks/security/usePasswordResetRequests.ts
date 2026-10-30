import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { describeAccessError, isAccessDeniedError } from '@/lib/rlsError';
import { parseEdgeError } from '@/lib/invokeEdge';
import { toast } from 'sonner';

export interface ResetRequest {
  id: string;
  email: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  rejection_reason: string | null;
  ip_address: string | null;
  created_at: string;
}

export function usePasswordResetRequests() {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('password_reset_requests_safe')
        .select('id, email, reason, status, reviewed_at, rejection_reason, ip_address, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRequests((data || []) as unknown as ResetRequest[]);
    } catch (error) {
      log.error('Error fetching requests:', error);
      toast.error('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // E62: setTimeout(0) move o fetch inicial fora do body síncrono do effect
    // satisfazendo react-hooks/set-state-in-effect sem alterar o comportamento.
    const timer = setTimeout(() => void fetchRequests(), 0);
    const interval = setInterval(() => void fetchRequests(), 30_000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [fetchRequests]);

  const approveRequest = useCallback(async (request: ResetRequest) => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('approve-password-reset', {
        body: { requestId: request.id, action: 'approve' },
      });
      if (error) throw new Error((await parseEdgeError(error, 'Erro ao aprovar')).message);
      toast.success('Solicitação aprovada! Email de reset enviado.');
      void fetchRequests();
    } catch (error) {
      log.error('Error approving:', error);
      toast.error(
        isAccessDeniedError(error)
          ? describeAccessError(error)
          : error instanceof Error ? error.message : 'Erro ao aprovar'
      );
    } finally {
      setProcessing(false);
    }
  }, [fetchRequests]);

  const rejectRequest = useCallback(async (request: ResetRequest, reason: string) => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('approve-password-reset', {
        body: { requestId: request.id, action: 'reject', rejectionReason: reason },
      });
      if (error) throw new Error((await parseEdgeError(error, 'Erro ao rejeitar')).message);
      toast.success('Solicitação rejeitada');
      void fetchRequests();
    } catch (error) {
      log.error('Error rejecting:', error);
      toast.error(
        isAccessDeniedError(error)
          ? describeAccessError(error)
          : error instanceof Error ? error.message : 'Erro ao rejeitar'
      );
    } finally {
      setProcessing(false);
    }
  }, [fetchRequests]);

  return { requests, loading, processing, fetchRequests, approveRequest, rejectRequest };
}
