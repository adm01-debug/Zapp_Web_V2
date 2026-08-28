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
export function useWhatsAppStatus(phone: string | undefined): WhatsAppStatusData {
  const [statusMessages, setStatusMessages] = useState<WhatsAppStatusMessage[]>([]);
  const [presence, setPresence] = useState<WhatsAppPresenceInfo>({ isOnline: false, lastSeen: null, loading: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getConnectionInfo = useCallback(async (contactPhone: string): Promise<ContactConnectionInfo> => {
    const cleanPhone = normalizeDigits(contactPhone);

    let contactQuery = supabase
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
    if (!phone) return;

    setLoading(true);
    setError(null);

    try {
      const { instanceName, contactName } = await getConnectionInfo(phone);

      if (!instanceName) {
        setError('Sem conexão WhatsApp disponível');
        return;
      }

      const [statusResult, presenceResult] = await Promise.allSettled([
        supabase.functions.invoke('evolution-api/find-status-messages', {
          method: 'POST',
          body: { instanceName, page: 1, offset: 200 },
        }),
        supabase.functions.invoke('evolution-api/send-chat-presence', {
          method: 'POST',
          body: { instanceName, number: phone, presence: 'paused', delay: 0 },
        }),
      ]);

      if (!mountedRef.current) return;

      if (statusResult.status === 'fulfilled') {
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

      if (presenceResult.status === 'fulfilled') {
        setPresence({ isOnline: false, lastSeen: null, loading: false });
      } else {
        setPresence({ isOnline: false, lastSeen: null, loading: false });
      }
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
    loading,
    error,
    refresh: fetchData,
  };
}
