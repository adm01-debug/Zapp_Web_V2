import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface WhatsAppStatusMessage {
  id: string;
  fromMe: boolean;
  remoteJid: string;
  remoteJidAlt?: string | null;
  participant?: string | null;
  status?: string;
  messageId?: string;
  keyId?: string;
  messageType?: string;
  source?: string;
  key?: {
    remoteJid: string;
    remoteJidAlt?: string | null;
    participant?: string | null;
    fromMe: boolean;
    id: string;
  };
  message?: {
    imageMessage?: {
      url?: string;
      caption?: string;
      mimetype?: string;
    };
    videoMessage?: {
      url?: string;
      caption?: string;
      mimetype?: string;
    };
    extendedTextMessage?: {
      text?: string;
      backgroundColor?: number;
    };
    conversation?: string;
  };
  messageTimestamp?: number | string;
  pushName?: string;
}

export interface WhatsAppPresenceInfo {
  isOnline: boolean;
  lastSeen?: string | null;
  loading: boolean;
}

export interface WhatsAppStatusData {
  statusMessages: WhatsAppStatusMessage[];
  presence: WhatsAppPresenceInfo;
  /** Instância resolvida do contato — necessária para buscar a mídia privada no viewer. */
  instanceName: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface ContactConnectionInfo {
  contactName: string | null;
  instanceName: string | null;
}

const normalizeDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

const toTimestampNumber = (value?: number | string) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const buildPhoneNeedles = (phone: string) => {
  const digits = normalizeDigits(phone);
  if (!digits) return [];

  const values = new Set<string>([digits]);
  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits;

  values.add(withoutCountry);

  if (withoutCountry.length >= 10) {
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);

    values.add(localNumber);

    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      values.add(localNumber.slice(1));
      values.add(`${areaCode}${localNumber.slice(1)}`);
      values.add(`55${areaCode}${localNumber.slice(1)}`);
    }
  }

  return Array.from(values).filter((value) => value.length >= 8);
};

const matchesPhone = (candidate: string | null | undefined, phoneNeedles: string[]) => {
  const digits = normalizeDigits(candidate);
  if (!digits) return false;

  return phoneNeedles.some((needle) => digits.endsWith(needle) || needle.endsWith(digits));
};

const extractStatusRecords = (data: unknown): WhatsAppStatusMessage[] => {
  if (Array.isArray(data)) {
    return data as WhatsAppStatusMessage[];
  }

  if (data && typeof data === 'object') {
    const maybeMessages = (data as { messages?: { records?: unknown[] } }).messages;
    if (Array.isArray(maybeMessages?.records)) {
      return maybeMessages.records as WhatsAppStatusMessage[];
    }
  }

  return [];
};

/**
 * Hook to fetch WhatsApp status (stories) and presence for a contact
 */
/**
 * Status/Stories é recurso OPCIONAL do painel do contato. Instâncias em que a
 * leitura não está disponível para esta sessão — a Edge recusou (403: leitura
 * instance-wide é só de admin/supervisor), não tem a rota (404: Edge antiga) ou
 * o provedor não suporta histórico (`notSupported`, Evolution GO) — ficam
 * lembradas aqui até recarregar a página: abrir outro contato não refaz a
 * chamada (antes, cada abertura do ContactDetails gerava um 404 no console).
 * Falha passageira (rede, 5xx, instância desconectada) NÃO entra: só vira lista
 * vazia e a próxima abertura tenta de novo.
 */
const statusIndisponivelPorInstancia = new Set<string>();

/** Só para testes: zera a memória de instâncias sem Status. */
export function __resetStatusIndisponivelParaTestes(): void {
  statusIndisponivelPorInstancia.clear();
}

const STATUS_HTTP_PERMANENTES = new Set([401, 403, 404, 405, 501]);

function statusIndisponivelDefinitivo(result: { data?: unknown; error?: unknown }): boolean {
  if ((result.data as { notSupported?: boolean } | null)?.notSupported === true) return true;
  const ctx = (result.error as { context?: { status?: number } } | null | undefined)?.context;
  return typeof ctx?.status === 'number' && STATUS_HTTP_PERMANENTES.has(ctx.status);
}

export function useWhatsAppStatus(phone: string | undefined): WhatsAppStatusData {
  const [statusMessages, setStatusMessages] = useState<WhatsAppStatusMessage[]>([]);
  const [presence, setPresence] = useState<WhatsAppPresenceInfo>({ isOnline: false, lastSeen: null, loading: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getConnectionInfo = useCallback(async (contactPhone: string): Promise<ContactConnectionInfo> => {
    const cleanPhone = normalizeDigits(contactPhone);

    const contactQuery = supabase
      .from('contacts')
      .select('name, whatsapp_connection_id')
      .eq('phone', contactPhone)
      .maybeSingle();

    let { data: contact } = await contactQuery;

    if (!contact && cleanPhone && cleanPhone !== contactPhone) {
      const fallback = await supabase
        .from('contacts')
        .select('name, whatsapp_connection_id')
        .eq('phone', cleanPhone)
        .maybeSingle();

      contact = fallback.data;
    }

    let connectionId = contact?.whatsapp_connection_id;

    if (!connectionId) {
      const { data: connection } = await supabase
        .from('whatsapp_connections')
        .select('id')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

      connectionId = connection?.id;
    }

    if (!connectionId) {
      return {
        contactName: contact?.name ?? null,
        instanceName: null,
      };
    }

    const { data: connection } = await supabase
      .from('whatsapp_connections')
      .select('instance_id')
      .eq('id', connectionId)
      .maybeSingle();

    return {
      contactName: contact?.name ?? null,
      instanceName: connection?.instance_id ?? null,
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!phone) {
      setInstanceName(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { instanceName: resolvedInstance, contactName } = await getConnectionInfo(phone);

      if (!mountedRef.current) return;
      setInstanceName(resolvedInstance);

      if (!resolvedInstance) {
        setError('Sem conexão WhatsApp disponível');
        return;
      }

      // Só a leitura dos status. Antes ia junto um `send-chat-presence`
      // 'paused' para o CONTATO a cada abertura da aba — o cliente recebia um
      // sinal de presença sem o atendente estar digitando. Presença só sai do
      // compositor, quando o atendente digita de fato.
      const consultarStatus = !statusIndisponivelPorInstancia.has(resolvedInstance);
      const [statusResult] = await Promise.allSettled([
        consultarStatus
          ? supabase.functions.invoke('evolution-api/find-status-messages', {
              method: 'POST',
              body: { instanceName: resolvedInstance, page: 1, offset: 200 },
            })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!mountedRef.current) return;

      if (statusResult.status === 'fulfilled' && statusResult.value.error) {
        // Recurso opcional: falha vira lista vazia, sem erro na tela nem no console.
        if (statusIndisponivelDefinitivo(statusResult.value)) statusIndisponivelPorInstancia.add(resolvedInstance);
        log.debug('Status do WhatsApp indisponível para a instância', resolvedInstance);
        setStatusMessages([]);
      } else if (statusResult.status === 'fulfilled') {
        if (statusIndisponivelDefinitivo(statusResult.value)) statusIndisponivelPorInstancia.add(resolvedInstance);
        const allStatuses = extractStatusRecords(statusResult.value.data);
        const phoneNeedles = buildPhoneNeedles(phone);
        const normalizedContactName = contactName?.trim().toLowerCase() ?? null;

        const contactStatuses = allStatuses
          .filter((status) => {
            const key = status.key ?? {
              remoteJid: status.remoteJid,
              fromMe: status.fromMe,
              id: status.id,
            };

            const isFromMe = status.fromMe ?? key.fromMe ?? false;
            if (isFromMe) return false;

            const candidateFields = [
              status.remoteJid,
              status.remoteJidAlt,
              status.participant,
              key.remoteJid,
              key.remoteJidAlt,
              key.participant,
              status.pushName,
            ];

            const phoneMatch = candidateFields.some((value) => matchesPhone(value, phoneNeedles));
            const nameMatch = Boolean(
              normalizedContactName &&
                typeof status.pushName === 'string' &&
                status.pushName.trim().toLowerCase() === normalizedContactName,
            );

            return phoneMatch || nameMatch;
          })
          .sort((left, right) => toTimestampNumber(right.messageTimestamp) - toTimestampNumber(left.messageTimestamp));

        setStatusMessages(contactStatuses);
      } else {
        setStatusMessages([]);
      }

      setPresence({ isOnline: false, lastSeen: null, loading: false });
    } catch (err) {
      log.error('WhatsApp status fetch error:', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar status');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [phone, getConnectionInfo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    statusMessages,
    presence,
    instanceName,
    loading,
    error,
    refresh: fetchData,
  };
}
