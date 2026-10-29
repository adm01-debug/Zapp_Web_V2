// useSystemHealthSignals.ts — coleta dos sinais do cartão "Saúde do Sistema" (painel principal).
//
// Só coleta: nenhuma regra mora aqui. A nota 0-100 é calculada no cliente, em
// src/components/dashboard/systemHealth.ts, a partir das três evidências que a V2 já
// tem no banco:
//   • conexões WhatsApp (status + health_status);
//   • mensagens do agente com falha nas últimas 24h (e o total, base da taxa);
//   • fila de envio parada: mensagens ainda em "sending" há mais de 5 min.
//
// A janela de falha é a mesma que o Diagnóstico já usa (sender = 'agent', 24h). RLS
// já escopa tudo; o cartão só é montado para staff.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SystemHealthConnectionSignal {
  status: string;
  healthStatus: string | null;
}

export interface SystemHealthSignals {
  connections: SystemHealthConnectionSignal[];
  /** Mensagens do agente com status "failed" nas últimas 24h. */
  failedRecent: number;
  /** Total de mensagens do agente nas últimas 24h (base da taxa de falha). */
  totalRecent: number;
  /** Mensagens ainda em "sending" há mais de 5 minutos. */
  stalledSending: number;
}

const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALL_WINDOW_MS = 5 * 60 * 1000;

async function fetchSystemHealthSignals(): Promise<SystemHealthSignals> {
  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const stallBefore = new Date(Date.now() - STALL_WINDOW_MS).toISOString();

  const [
    { data: connections, error: connError },
    { count: failedRecent, error: failedError },
    { count: totalRecent, error: totalError },
    { count: stalledSending, error: stalledError },
  ] = await Promise.all([
    supabase.from('whatsapp_connections').select('status, health_status'),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender', 'agent').eq('status', 'failed').gte('created_at', since),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender', 'agent').gte('created_at', since),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('status', 'sending').lt('created_at', stallBefore),
  ]);

  const firstError = connError ?? failedError ?? totalError ?? stalledError;
  if (firstError) throw firstError;

  return {
    connections: (connections ?? []).map((c) => ({
      status: c.status ?? 'unknown',
      healthStatus: c.health_status ?? null,
    })),
    failedRecent: failedRecent ?? 0,
    totalRecent: totalRecent ?? 0,
    stalledSending: stalledSending ?? 0,
  };
}

export function useSystemHealthSignals() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['system-health-signals'],
    queryFn: fetchSystemHealthSignals,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  return { signals: data ?? null, isLoading, isError, error };
}
