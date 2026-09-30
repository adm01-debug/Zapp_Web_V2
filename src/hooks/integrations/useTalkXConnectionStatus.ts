/**
 * CT — status real da conexão WhatsApp da campanha (substitui o "Conectada" hardcoded).
 *
 * A camada de apresentação não fala com o Supabase direto; este hook lê o status
 * de `whatsapp_connections` e devolve o rótulo em pt-BR (connected/pending/disconnected).
 * `connectionId` nulo (campanha legada) → não consulta e devolve `null` (exibe '—').
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const WA_CONNECTION_STATUS_LABEL: Record<string, string> = {
  connected: 'Conectada',
  pending: 'Pendente',
  disconnected: 'Desconectada',
};

export function useTalkXConnectionStatus(connectionId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['talkx-connection-status', connectionId ?? null],
    enabled: !!connectionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('status')
        .eq('id', connectionId as string)
        .maybeSingle();
      if (error) throw error;
      return (data?.status ?? null) as string | null;
    },
  });

  const status = query.data ?? null;
  return {
    status,
    label: status ? (WA_CONNECTION_STATUS_LABEL[status] ?? null) : null,
    loading: query.isLoading,
  };
}
