import type { ChipTab } from '@/components/inbox/TicketTabs';

/**
 * Chip em que a conversa passa a aparecer depois de reaberta.
 *
 * A RPC `reopen_conversation` (migration 20261013210003) devolve o estado novo:
 * `waiting` quando o contato fica sem responsável e `open` quando já estava
 * atribuído. Quem chama a RPC usa este mapa para levar a lista ao chip certo —
 * sem isso a conversa sai de Resolvidas/Arquivadas e some da vista do usuário.
 */
export function chipDoStatusReaberto(status: string | null | undefined): ChipTab {
  return status === 'waiting' ? 'waiting' : 'attending';
}
