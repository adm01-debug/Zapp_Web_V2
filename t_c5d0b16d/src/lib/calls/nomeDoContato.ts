import { formatPhoneBR } from '@/lib/calls/phone';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

/**
 * Nome do contato na linha do historico (T48).
 *
 * Fica em lib porque arquivo de componente so exporta componente
 * (react-refresh/only-export-components) - e e logica pura, testavel sem render.
 */
export function nomeDoContato(row: Pick<SearchMyCallsRow, 'peer_name' | 'contact_name' | 'peer_number' | 'contact_avatar_url'>): string {
  const nome = row.peer_name || row.contact_name;
  if (nome) return nome;
  // Só vale a pena mostrar telefone quando há número de verdade: `formatPhoneBR` de
  // entrada vazia ou curta devolve algo que não identifica ninguém.
  const digitos = (row.peer_number || '').replace(/\D/g, '');
  if (digitos.length >= 10) {
    const telefone = formatPhoneBR(row.peer_number);
    if (telefone) return telefone;
  }
  return 'Número não identificado';
}
