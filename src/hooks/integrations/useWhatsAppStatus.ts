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
    } else if (localNumber.length === 8) {
      // Sem o nono dígito: o contato pode estar salvo com o 9 — gerar as
      // variantes com o 9 para a mesma linha ser encontrada.
      values.add(`9${localNumber}`);
      values.add(`${areaCode}9${localNumber}`);
      values.add(`55${areaCode}9${localNumber}`);
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
 * A Edge `find-status-messages` responde HTTP 200 com `{ error: true, status, message }`
 * quando a sessão não está utilizável (ex.: 409). Extrai a mensagem para exibir.
 */
const extractStatusApiError = (data: unknown): string | null => {
  if (data && typeof data === 'object' && (data as { error?: unknown }).error === true) {
    const message = (data as { message?: unknown }).message;
    return typeof message === 'string' && message ? message : 'Erro ao buscar status';
  }

  return null;
};

/**
 * Hook to fetch WhatsApp status (stories) and presence for a contact
 */
export function useWhatsAppStatus(phone: string | undefined): WhatsAppStatusData {
  const [statusMessages, setStatusMessages] = useState<WhatsAppStatusMessage[]>([]);
  const [presence, setPresence] = useState<WhatsAppPresenceInfo>({ isOnline: false, lastSeen: null, loading: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const mountedRef = useRef(true);
  /** Geração da busca: cada troca/refresh de telefone invalida as respostas em voo. */
  const generationRef = useRef(0);
  const lastPhoneRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const getConnectionInfo = useCallback(async (contactPhone: string): Promise<ContactConnectionInfo> => {
    // A coluna certa na tabela certa: `contacts.phone` (única coluna de
    // telefone de contato no banco — `phones` só existe fora deste pedido).
    // O número pode estar salvo com ou sem o nono dígito e com ou sem DDI:
    // buscar por todas as variantes da mesma linha numa única consulta.
    const candidates = Array.from(new Set([contactPhone, ...buildPhoneNeedles(contactPhone)]));

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('whatsapp_connection_id')
      .in('phone', candidates)
      .maybeSingle();

    if (contactError) throw contactError;

    const connectionId = contact?.whatsapp_connection_id;

    if (!connectionId) {
      return {
        instanceName: null,
      };
    }

    // Só a conexão `connected` do próprio contato atende o status: usar outra
    // conexão apontaria a busca para um número que não fala com este contato.
    const { data: connection, error: connectionError } = await supabase
      .from('whatsapp_connections')
      .select('instance_id')
      .eq('id', connectionId)
      .eq('status', 'connected')
      .maybeSingle();

    if (connectionError) throw connectionError;

    return {
      instanceName: connection?.instance_id ?? null,
    };
  }, []);

  const fetchData = useCallback(async () => {
    const generation = ++generationRef.current;

    if (lastPhoneRef.current !== phone) {
      // Trocou de contato: o que estava na tela era do telefone anterior.
      lastPhoneRef.current = phone;
      setStatusMessages([]);
      setInstanceName(null);
      setError(null);
      setPresence({ isOnline: false, lastSeen: null, loading: true });
    }

    if (!phone) {
      setLoading(false);
      setPresence({ isOnline: false, lastSeen: null, loading: false });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { instanceName: resolvedInstance } = await getConnectionInfo(phone);

      if (!mountedRef.current || generation !== generationRef.current) return;
      setInstanceName(resolvedInstance);

      if (!resolvedInstance) {
        setError('Sem conexão WhatsApp disponível');
        setPresence({ isOnline: false, lastSeen: null, loading: false });
        return;
      }

      // Abrir o status é só leitura: nenhuma presença é enviada ao contato.
      const { data: statusData, error: statusError } = await supabase.functions.invoke(
        'evolution-api/find-status-messages',
        {
          method: 'POST',
          body: { instanceName: resolvedInstance, number: phone, page: 1, offset: 200 },
        },
      );

      if (!mountedRef.current || generation !== generationRef.current) return;

      if (statusError) {
        log.error('WhatsApp status invoke error:', statusError);
        setStatusMessages([]);
      } else {
        // A Edge devolve HTTP 200 com `{ error: true, status: 409, message }`
        // quando a sessão não está utilizável: exibir a mensagem em vez de
        // uma lista vazia silenciosa.
        const apiMessage = extractStatusApiError(statusData);

        if (apiMessage) {
          log.error('WhatsApp status API error:', statusData);
          setStatusMessages([]);
          setError(apiMessage);
        } else {
        const allStatuses = extractStatusRecords(statusData);
        const phoneNeedles = buildPhoneNeedles(phone);

        const contactStatuses = allStatuses
          .filter((status) => {
            const key = status.key ?? {
              remoteJid: status.remoteJid,
              fromMe: status.fromMe,
              id: status.id,
            };

            const isFromMe = status.fromMe ?? key.fromMe ?? false;
            if (isFromMe) return false;

            // Identidade é o telefone (remoteJid/JID), nunca o pushName:
            // nome exibido não prova autoria do status.
            const candidateFields = [
              status.remoteJid,
              status.remoteJidAlt,
              status.participant,
              key.remoteJid,
              key.remoteJidAlt,
              key.participant,
            ];

            return candidateFields.some((value) => matchesPhone(value, phoneNeedles));
          })
          .sort((left, right) => toTimestampNumber(right.messageTimestamp) - toTimestampNumber(left.messageTimestamp));

        setStatusMessages(contactStatuses);
        }
      }

      setPresence({ isOnline: false, lastSeen: null, loading: false });
    } catch (err) {
      log.error('WhatsApp status fetch error:', err);
      if (mountedRef.current && generation === generationRef.current) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar status');
        setPresence({ isOnline: false, lastSeen: null, loading: false });
      }
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
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
