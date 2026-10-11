import { describe, it, expect } from 'vitest';
import { KANBAN_COLUMNS } from '../workItem.types';

/**
 * Etapa 081: cada coluna do Quadro ganhou um subtítulo CURTO (etapa 080) sem
 * perder a `policy` longa — que segue sendo o texto do tooltip.
 */
describe('etapa 081 — subtítulo curto das colunas (policy longa preservada)', () => {
  const esperado: Record<string, string> = {
    backlog: 'A organizar',
    todo: 'Próximas ações',
    doing: 'Conclua uma para iniciar outra',
    waiting: 'Dependências externas',
    done: 'Últimos 7 dias',
  };

  it('as 5 colunas têm o subtítulo curto esperado', () => {
    expect(KANBAN_COLUMNS).toHaveLength(5);
    for (const col of KANBAN_COLUMNS) {
      expect(col.subtitle).toBe(esperado[col.status]);
      // O subtítulo é curto de verdade; a política longa continua no lugar.
      expect(col.subtitle.length).toBeLessThan(col.policy.length);
      expect(col.policy.length).toBeGreaterThan(0);
    }
  });
});
