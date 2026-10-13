import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * useLeaderboard alimenta `previousRank: row.rank` (não existe histórico de
 * posição no servidor), então a variação de posição é desconhecida — nunca
 * verdadeira. O componente NÃO pode exibir seta de subida/descida (nem o traço
 * de "sem mudança") a partir de um valor que não é histórico: seria uma
 * variação fabricada. Este teste dá ao agente um previousRank DIFERENTE do rank
 * e prova que nada de variação aparece.
 */

import { LeaderboardRow } from '../LeaderboardHelpers';
import type { LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';

function agente(over: Partial<LeaderboardAgent>): LeaderboardAgent {
  return {
    id: 'a1',
    profile_id: 'p1',
    name: 'Ana Silva',
    xp: 100,
    level: 2,
    streak: 0,
    messagesHandled: 0,
    conversationsResolved: 0,
    avgResponseTime: 0,
    satisfaction: 0,
    rank: 3,
    previousRank: 3,
    achievements: [],
    achievementsCount: 0,
    isOnline: false,
    ...over,
  };
}

describe('LeaderboardRow — sem setas de variação fabricadas', () => {
  it('não mostra seta de subida, descida nem traço, mesmo com previousRank diferente', () => {
    const { container } = render(<LeaderboardRow agent={agente({ rank: 5, previousRank: 1 })} index={0} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(container.querySelector('.lucide-trending-up')).toBeNull();
    expect(container.querySelector('.lucide-trending-down')).toBeNull();
    expect(container.querySelector('.lucide-minus')).toBeNull();
  });

  it('líder também não exibe variação (previousRank ausente de histórico)', () => {
    const { container } = render(<LeaderboardRow agent={agente({ rank: 1, previousRank: 4 })} index={0} />);

    expect(container.querySelector('.lucide-trending-up')).toBeNull();
    expect(container.querySelector('.lucide-trending-down')).toBeNull();
  });
});
