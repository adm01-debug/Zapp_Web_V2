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

// Texto único (pt-BR) quando o GoTrue devolve um código que o mapeador não conhece.
const MFA_FALLBACK_MESSAGE =
  'Não foi possível concluir a verificação em duas etapas. Tente novamente.';

// Traduz o erro do GoTrue/Supabase para UMA mensagem em pt-BR. É a fonte única do
// texto: tanto o toast quanto o erro lançado (que telas com erro inline exibem)
// saem daqui, então a pessoa nunca vê o inglês cru ('Invalid TOTP code entered',
// 'over_request_rate_limit') nem duas mensagens diferentes para a mesma falha.
export function mapMfaError(err: unknown): string {
  const { code, message, status } =
    (err ?? {}) as { code?: string; message?: string; status?: number };
  const alvo = `${code ?? ''} ${message ?? ''}`.toLowerCase();

  if (alvo.includes('over_request_rate_limit') || alvo.includes('too many requests') || status === 429) {
    return 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.';
  }
  if (alvo.includes('mfa_challenge_expired') || alvo.includes('challenge has expired')) {
    return 'O código expirou. Gere um código novo no app autenticador e tente novamente.';
  }
  if (alvo.includes('mfa_factor_name_conflict') || alvo.includes('already exists')) {
    return 'Já existe um fator com esse nome. Tente novamente.';
  }
  if (
    alvo.includes('mfa_verification_failed') ||
    alvo.includes('invalid totp') ||
    alvo.includes('invalid code')
  ) {
    return 'Código inválido. Confira o código no app autenticador e tente novamente.';
  }
  return MFA_FALLBACK_MESSAGE;
}

// O GoTrue recusa dois fatores com o mesmo friendly_name (mfa_factor_name_conflict).
// Antes o nome era fixo ('Authenticator App') e o segundo cadastro — mesmo depois de
// um fator pendente — falhava em inglês. Agora cada cadastro carrega um carimbo de
// data/hora, então o nome é único e legível na lista de 2FA.
function defaultFriendlyName(): string {
  const agora = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  const carimbo =
    `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())} ` +
    `${dois(agora.getHours())}:${dois(agora.getMinutes())}:${dois(agora.getSeconds())}`;
  return `App Autenticador ${carimbo}`;
}

export function useMFA() {
  const [loading, setLoading] = useState(false);
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [enrollmentData, setEnrollmentData] = useState<EnrollResponse | null>(null);

  // Leitura da lista de fatores. Não engole erro: registra e relança, para quem
  // chama decidir (mostrar falha de leitura em vez de "nenhum 2FA").
  const fetchFactors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) throw error;

      const totp = (data?.totp ?? []) as MFAFactor[];
      setFactors(totp);
      return totp;
    } catch (err) {
      log.error('Error fetching MFA factors:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualização da lista depois de verify/unenroll/cancel: falha aqui NÃO invalida a
  // operação que já deu certo (verificação concluída segue concluída), por isso o
  // erro é só registrado.
  const refreshFactorsSilently = useCallback(async () => {
    await fetchFactors().catch((err) => {
      log.error('Error refreshing MFA factors:', err);
    });
  }, [fetchFactors]);

  // Fatores `unverified` são cadastros abandonados: ninguém consegue usar e eles
  // ocupam o nome. Removidos antes de um novo cadastro (melhor esforço — se a
  // limpeza falhar, o cadastro novo segue).
  const removeStaleUnverifiedFactors = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const pendentes = ((data?.totp ?? []) as MFAFactor[]).filter(
        (f) => f.status === 'unverified',
      );

      for (const fator of pendentes) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: fator.id });
        if (unenrollError) throw unenrollError;
      }
    } catch (err) {
      log.error('Error removing stale MFA factors:', err);
    }
  }, []);

  const enrollTOTP = useCallback(async (friendlyName?: string) => {
    setLoading(true);
    try {
      await removeStaleUnverifiedFactors();

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || defaultFriendlyName(),
      });

      if (error) throw error;

      setEnrollmentData(data);
      return data;
    } catch (err) {
      const message = mapMfaError(err);
      log.error('Error enrolling MFA factor:', err);
      toast.error(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [removeStaleUnverifiedFactors]);

  // Cancela/descarta o cadastro em andamento: remove o fator pendente criado pelo
  // enroll e qualquer outro `unverified` que tenha sobrado, para não deixar fator
  // órfão nem colidir o nome no próximo cadastro.
  const cancelEnroll = useCallback(async () => {
    setLoading(true);
    try {
      const ids = new Set<string>();
      if (enrollmentData) ids.add(enrollmentData.id);

      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      for (const fator of ((data?.totp ?? []) as MFAFactor[])) {
        if (fator.status === 'unverified') ids.add(fator.id);
      }

      for (const factorId of Array.from(ids)) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
        if (unenrollError && unenrollError.code !== 'mfa_factor_not_found') throw unenrollError;
      }

      setEnrollmentData(null);
      void queryClient.invalidateQueries({ queryKey: MFA_TOTP_QUERY_KEY });
      await refreshFactorsSilently();
    } catch (err) {
      const message = mapMfaError(err);
      log.error('Error cancelling MFA enrollment:', err);
      toast.error(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [enrollmentData, refreshFactorsSilently]);

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
      await refreshFactorsSilently();
      return data;
    } catch (err) {
      const message = mapMfaError(err);
      log.error('Error verifying MFA code:', err);
      toast.error(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [refreshFactorsSilently]);

  const unenroll = useCallback(async (factorId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });

      if (error) throw error;

      toast.success('MFA removido com sucesso');
      void queryClient.invalidateQueries({ queryKey: MFA_TOTP_QUERY_KEY });
      await refreshFactorsSilently();
    } catch (err) {
      const message = mapMfaError(err);
      log.error('Error removing MFA factor:', err);
      toast.error(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [refreshFactorsSilently]);

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
    cancelEnroll,
    verifyTOTP,
    unenroll,
    getAssuranceLevel,
  };
}

// Leitura pura (react-query) dos fatores TOTP da sessao autenticada. E a fonte
// COMPARTILHADA da UI de seguranca: distingue carregando (isLoading), erro de
// leitura (isError) e "nenhum fator" (isSuccess com lista vazia) — sem confundir
// ausencia com dado nao carregado. Invalidada por verifyTOTP/unenroll.
export const MFA_TOTP_QUERY_KEY = ['mfa-verified-totp'] as const;

export function useMfaFactors(enabled = true) {
  return useQuery({
    queryKey: MFA_TOTP_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []) as MFAFactor[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// Gate de UI derivado da mesma fonte: true/false quando carregou, undefined
// enquanto carrega ou em erro (inclusive refetch que falhou) — quem consome trata
// undefined como "nao incomodar". Invalidada por verifyTOTP/unenroll.
export function useHasVerifiedTotp(enabled = true) {
  const query = useMfaFactors(enabled);
  return {
    ...query,
    data: query.isError ? undefined : query.data?.some((f) => f.status === 'verified'),
  };
}
