import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

/**
 * Rotulos das linhas de historico (T65). Moram aqui, e nao dentro do componente, pela
 * mesma razao das outras funcoes puras da telefonia: `react-refresh/only-export-components`
 * reprova funcao exportada junto de componente - e a guarda da casa cobra de verdade.
 */
export function getChannelLabel(call: Pick<SearchMyCallsRow, 'channel'>): string {
  return call.channel === 'whatsapp' ? 'WhatsApp' : 'VoIP';
}

export function getContactLabel(call: Pick<SearchMyCallsRow, 'contact_name' | 'peer_number' | 'contact_phone'>): string {
  return call.contact_name?.trim() || call.peer_number || call.contact_phone || 'Número desconhecido';
}
