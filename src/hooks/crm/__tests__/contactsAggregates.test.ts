import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateContactsAggregates } from '../contactsAggregates';

describe('invalidateContactsAggregates', () => {
  it('invalida os KPIs (qualquer filtro) e os contadores por tipo, sem tocar outras queries', () => {
    const qc = new QueryClient();
    // Chaves exatamente como `useContactsKpi` e `useContactsSearch` as registram.
    qc.setQueryData(['contacts-kpi', true], { total: 1 });
    qc.setQueryData(['contacts-kpi', false], { total: 2 });
    qc.setQueryData(['contacts-type-counts'], [{ contact_type: 'cliente', count: 3 }]);
    qc.setQueryData(['contacts-last-message', ['c1']], {});

    invalidateContactsAggregates(qc);

    const invalidated = (key: unknown[]) => qc.getQueryState(key)?.isInvalidated;
    expect(invalidated(['contacts-kpi', true])).toBe(true);
    expect(invalidated(['contacts-kpi', false])).toBe(true);
    expect(invalidated(['contacts-type-counts'])).toBe(true);
    expect(invalidated(['contacts-last-message', ['c1']])).toBe(false);
  });
});
