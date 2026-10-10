import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

interface MFAFactor {
  id: string;
  factor_type: 'totp';
  friendly_name?: string;
  status: 'verified' | 'unverified';
}

interface EnrollResponse {
  id: string;
  type: 'totp';
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

export function useMFA() {
  const [loading, setLoading] = useState(false);
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [enrollmentData, setEnrollmentData] = useState<EnrollResponse | null>(null);

  const fetchFactors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      
      if (error) throw error;
      
      setFactors(data.totp || []);
      return data.totp || [];
    } catch (err) {
      log.error('Error fetching MFA factors:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const enrollTOTP = useCallback(async (friendlyName?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || 'Authenticator App',
      });

      if (error) throw error;

      setEnrollmentData(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao iniciar enrollment MFA';
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyTOTP = useCallback(async (factorId: string, code: string) => {
    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = 
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) throw challengeError;

      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });

      if (error) throw error;

      toast.success('MFA verificado com sucesso!');
      void queryClient.invalidateQueries({ queryKey: MFA_TOTP_QUERY_KEY });
      setEnrollmentData(null);
      await fetchFactors();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Código inválido';
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchFactors]);

  const unenroll = useCallback(async (factorId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });

      if (error) throw error;

      toast.success('MFA removido com sucesso');
      void queryClient.invalidateQueries({ queryKey: MFA_TOTP_QUERY_KEY });
      await fetchFactors();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao remover MFA';
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchFactors]);

  const getAssuranceLevel = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (error) throw error;
      
      return data;
    } catch (err) {
      log.error('Error getting assurance level:', err);
      return null;
    }
  }, []);

  const isMFAEnabled = factors.some(f => f.status === 'verified');

  return {
    loading,
    factors,
    enrollmentData,
    isMFAEnabled,
    fetchFactors,
    enrollTOTP,
    verifyTOTP,
    unenroll,
    getAssuranceLevel,
  };
}

// Leitura pura (react-query) para gates de UI: true/false quando carregou, undefined
// enquanto carrega ou em erro (inclusive refetch que falhou) — quem consome trata
// undefined como "nao incomodar". Invalidada por verifyTOTP/unenroll.
export const MFA_TOTP_QUERY_KEY = ['mfa-verified-totp'] as const;

export function useHasVerifiedTotp(enabled = true) {
  const query = useQuery({
    queryKey: MFA_TOTP_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []).some((f) => f.status === 'verified');
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}
