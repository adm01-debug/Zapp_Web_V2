import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useAddressAutocomplete';
import type { GeoSuggestion } from '@/lib/mapboxGeocode';

/**
 * Onda 2 da auditoria (red team do #1275): a asserção de `pausedUntil` no teste de hook não
 * distingue "o RETRY limpou a pausa" de "um SUGGEST_* seguinte limpou" — SUGGEST_START roda no
 * mesmo `act` e reescreve `status`, e SUGGEST_ERROR/SUGGEST_SUCCESS/CLEAR também zeram o campo.
 * Estes testes batem no REDUCER direto para fixar QUEM faz o quê (o autor, não o estado final).
 */
describe('useAddressAutocomplete · reducer (onda 2)', () => {
  it('RETRY é o AUTOR da limpeza da pausa: zera status/blocked/rateLimitedUntil e avança attempt', () => {
    const pausado = {
      ...initialState,
      query: 'rua a',
      status: 'paused' as const,
      blocked: 'rate_limited' as const,
      rateLimitedUntil: 999_999,
      attempt: 2,
    };
    const next = reducer(pausado, { type: 'RETRY' });
    expect(next.status).toBe('typing');
    expect(next.blocked).toBeNull();
    expect(next.rateLimitedUntil).toBeNull();
    expect(next.attempt).toBe(3);
  });

  it('CLEAR preserva o backoff de 429 (é do servidor) mas zera o resto do estado', () => {
    const pausado = {
      ...initialState,
      query: 'rua a',
      status: 'paused' as const,
      blocked: 'rate_limited' as const,
      rateLimitedUntil: 123_456,
      attempt: 2,
    };
    const next = reducer(pausado, { type: 'CLEAR' });
    expect(next.rateLimitedUntil).toBe(123_456);
    expect(next.query).toBe('');
    expect(next.blocked).toBeNull();
    expect(next.status).toBe('idle');
    expect(next.attempt).toBe(0);
  });

  it('SET_QUERY invalida o destaque em QUALQUER termo (não só abaixo do mínimo), sem apagar a lista', () => {
    const sugestao: GeoSuggestion = { id: 'a', name: 'Rua A', address: 'Rua A, SP', kind: 'street' };
    const comDestaque = {
      ...initialState,
      query: 'rua a',
      suggestions: [sugestao],
      highlightedIndex: 0,
    };
    const next = reducer(comDestaque, { type: 'SET_QUERY', query: 'rua augusta 100' });
    expect(next.highlightedIndex).toBe(-1);
    // A lista persiste durante o debounce (padrão do E25/E27) — só o destaque é invalidado.
    expect(next.suggestions).toHaveLength(1);
  });

  it('SET_QUERY descarta o /retrieve do TERMO anterior (R2-INB-037): o spinner e o erro do item não sobrevivem à troca', () => {
    const sugestao: GeoSuggestion = { id: 'a', name: 'Rua A', address: 'Rua A, SP', kind: 'street' };
    const comRetrieveEmVoo = {
      ...initialState,
      query: 'rua a',
      suggestions: [sugestao],
      retrievingId: 'a',
      retrieveError: { id: 'a', kind: 'network' as const },
    };
    const next = reducer(comRetrieveEmVoo, { type: 'SET_QUERY', query: 'rua augusta 100' });
    // A troca de termo invalida a seleção em voo (ver `selectionSeqRef` em `setQuery`); se o
    // `retrievingId` ficasse de pé, um resultado novo com o MESMO mapbox_id herdaria o spinner e
    // viraria clique morto (o consumidor corta o clique repetido no item que está "carregando").
    expect(next.retrievingId).toBeNull();
    expect(next.retrieveError).toBeNull();
  });
});
