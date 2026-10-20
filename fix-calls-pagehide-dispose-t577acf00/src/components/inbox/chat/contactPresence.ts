import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Presença REAL do contato (R2-INB-030 + presença viva do webhook).
 *
 * Fonte dos campos: `contacts.presence_status`, `contacts.presence_updated_at` e
 * `contacts.last_seen_at` (colunas aditivas gravadas pelo webhook Evolution na
 * transição online→offline). A inscrição realtime de contatos que a V2 já usa
 * (`global-contacts-realtime`, em useRealtimeMessages) mescla a linha inteira de
 * `contacts` dentro de `conversation.contact`, então o dado chega à tela sem canal
 * novo.
 *
 * Regra única (uma só fonte para o limiar): só afirma "Online" quando
 * `presence_status === 'online'` E `presence_updated_at` está dentro dos últimos
 * 2 minutos — um `online` velho é sinal morto e não pode virar afirmação.
 * Havendo `last_seen_at`, mostra "Visto por último há X". Sem sinal, estado
 * neutro (nunca afirma o que não sabe).
 *
 * A lógica vive fora do .tsx para o arquivo do componente exportar só componente
 * (regra react-refresh/only-export-components).
 */
export const PRESENCE_ONLINE_WINDOW_MS = 2 * 60 * 1000;

export const PRESENCE_UNKNOWN_LABEL = 'Presença do contato não informada';

/** Campos de presença lidos do contato. Tipados aqui porque as colunas novas de
 *  `contacts` ainda não entraram no `ConversationContact` escrito à mão. */
export interface ContactPresenceFields {
  presence_status?: string | null;
  presence_updated_at?: string | null;
  last_seen_at?: string | null;
}

export type ContactPresenceSignal =
  | { kind: 'online'; label: string }
  | { kind: 'last_seen'; label: string }
  | { kind: 'unknown'; label: string };

export function describeContactPresence(
  contact: ContactPresenceFields | null | undefined,
  now: Date = new Date(),
): ContactPresenceSignal {
  const updatedAt = contact?.presence_updated_at;
  if (contact?.presence_status === 'online' && updatedAt) {
    const ageMs = now.getTime() - new Date(updatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= PRESENCE_ONLINE_WINDOW_MS) {
      return { kind: 'online', label: 'Online' };
    }
  }

  const lastSeenAt = contact?.last_seen_at;
  if (lastSeenAt) {
    const seen = new Date(lastSeenAt);
    if (!Number.isNaN(seen.getTime())) {
      return {
        kind: 'last_seen',
        label: `Visto por último ${formatDistanceToNow(seen, { addSuffix: true, locale: ptBR })}`,
      };
    }
  }

  return { kind: 'unknown', label: PRESENCE_UNKNOWN_LABEL };
}
