import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Regra dos três níveis (docs/contexto/regras/manual/regras.md §4.2): o atendente
 * nunca pode mandar mensagem sem saber que a conexão caiu. Nível 0 = amarelo
 * ("sem conexão — a mensagem ficará na fila"); nível 1+ = vermelho ("precisa de
 * QR Code — avise o admin"). A mensagem continua entrando na fila; nada é bloqueado.
 *
 * Fonte: `whatsapp_connections` (status/health_status/health_reason), leitura direta.
 * A RLS só libera a tabela para admin/supervisor: o AGENTE só passa a ver o aviso
 * quando a RPC `get_contact_connection_health` (SECURITY DEFINER) entrar no banco —
 * migration pendente (regras.md §4.2); até lá, para ele, `data` é null = sem aviso.
 */
export type ConnectionBannerLevel = 'ok' | 'warn' | 'down';

export interface ConnectionBanner {
  level: ConnectionBannerLevel;
  /** Motivo de saúde gravado pela sonda (pede QR quando a queda foi confirmada). */
  reason: string | null;
}

interface HealthRow {
  status: string | null;
  health_status: string | null;
  health_reason: string | null;
}

export function classifyConnectionHealth(row: HealthRow | null | undefined): ConnectionBanner {
  if (!row) return { level: 'ok', reason: null };
  const connected = row.status === 'connected';
  if (!connected && row.health_reason) return { level: 'down', reason: row.health_reason };
  if (!connected || row.health_status === 'degraded' || row.health_status === 'disconnected') {
    return { level: 'warn', reason: row.health_reason ?? null };
  }
  return { level: 'ok', reason: null };
}

async function fetchHealth(instanceName: string): Promise<HealthRow | null> {
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('status, health_status, health_reason')
    .eq('instance_id', instanceName)
    .maybeSingle();
  if (error) return null;
  return (data as HealthRow | null) ?? null;
}

export function useConnectionHealthBanner(instanceName: string | undefined): ConnectionBanner {
  const { data } = useQuery({
    queryKey: ['connection-health-banner', instanceName],
    queryFn: () => fetchHealth(instanceName as string),
    enabled: !!instanceName,
    // A sonda roda a cada 5 min; 60 s é suficiente para a tela acompanhar.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return classifyConnectionHealth(data);
}

/** Texto do aviso: admin vê a instrução do QR; os demais, "avise o admin" (QR é só admin). */
export function connectionBannerText(banner: ConnectionBanner, isAdmin: boolean): string | null {
  if (banner.level === 'down') {
    return isAdmin
      ? 'WhatsApp desconectado — precisa de QR Code. Gere um novo na tela Conexões. As mensagens ficam na fila.'
      : 'WhatsApp desconectado — precisa de QR Code. Avise o admin. As mensagens ficam na fila.';
  }
  if (banner.level === 'warn') {
    return 'Sem conexão com o WhatsApp — a mensagem ficará na fila e sai quando a conexão voltar.';
  }
  return null;
}
