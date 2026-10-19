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
  instanceName: string | null;
}

const normalizeDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

/**
 * Hook to fetch WhatsApp presence for a contact.
 * Status messages (stories) are not supported by Evolution GO.
 */
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
      return { instanceName: null };
    }

    const { data: connection } = await supabase
      .from('whatsapp_connections')
      .select('instance_id')
      .eq('id', connectionId)
      .maybeSingle();

    return { instanceName: connection?.instance_id ?? null };
  }, []);

  const fetchData = useCallback(async () => {
    if (!phone) {
      setInstanceName(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { instanceName: resolvedInstance } = await getConnectionInfo(phone);

      if (!mountedRef.current) return;
      setInstanceName(resolvedInstance);

      if (!resolvedInstance) {
        setError('Sem conexão WhatsApp disponível');
        return;
      }

      await Promise.allSettled([
        supabase.functions.invoke('evolution-api/send-chat-presence', {
          method: 'POST',
          body: { instanceName: resolvedInstance, number: phone, presence: 'paused', delay: 0 },
        }),
      ]);

      if (!mountedRef.current) return;

      setStatusMessages([]);
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
