import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Regra dos três níveis (docs/contexto/regras/manual/regras.md §4.2): o atendente
 * nunca pode mandar mensagem sem saber que a conexão caiu. Nível 0 = amarelo
 * ("sem conexão — o envio falha até voltar"); nível 1+ = vermelho ("precisa de
 * QR Code — só admin"). Hoje `enqueue_outbound_message` RECUSA o envio sem
 * conexão viva (`no_connected_whatsapp_connection`) — não há fila offline; o aviso
 * diz isso. A caixa continua aberta: o erro de envio já aparece no SendErrorBanner.
 *
 * Fonte: `whatsapp_connections` (status/health_status/health_reason), leitura direta.
 * A RLS só libera a tabela para admin/supervisor: o AGENTE só passa a ver o aviso
 * quando a RPC `get_contact_connection_health` (SECURITY DEFINER) entrar no banco —
 * migration pendente (regras.md §4.2); até lá, para ele, a linha é null = sem aviso.
 *
 * Sem react-query de propósito: o composer é renderizado em dezenas de testes sem
 * QueryClientProvider; um `useEffect` + intervalo de 60 s basta (a sonda roda a cada 5 min).
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

const OK: ConnectionBanner = { level: 'ok', reason: null };
export const CONNECTION_BANNER_POLL_MS = 60_000;

export function classifyConnectionHealth(row: HealthRow | null | undefined): ConnectionBanner {
  if (!row) return OK;
  const connected = row.status === 'connected';
  if (!connected && row.health_reason) return { level: 'down', reason: row.health_reason };
  if (!connected || row.health_status === 'degraded' || row.health_status === 'disconnected') {
    return { level: 'warn', reason: row.health_reason ?? null };
  }
  return OK;
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
  const [banner, setBanner] = useState<ConnectionBanner>(OK);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Sem instância resolvida não há o que consultar: volta ao estado neutro.
      const row = instanceName ? await fetchHealth(instanceName).catch(() => null) : null;
      // Leitura que falhou (rede/RLS) devolve null = sem aviso, nunca estado inventado.
      if (active) setBanner(classifyConnectionHealth(row));
    };
    void load();
    if (!instanceName) return () => { active = false; };
    const timer = setInterval(() => { void load(); }, CONNECTION_BANNER_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [instanceName]);

  return banner;
}

/** Texto do aviso. QR Code é só admin (regras.md §4.2) — quem não é admin avisa o admin. */
export function connectionBannerText(banner: ConnectionBanner): string | null {
  if (banner.level === 'down') {
    return 'WhatsApp desconectado — precisa de um novo QR Code na tela Conexões (só o admin conecta). Envios falham até reconectar.';
  }
  if (banner.level === 'warn') {
    return 'Sem conexão com o WhatsApp — o envio vai falhar até a conexão voltar.';
  }
  return null;
}
