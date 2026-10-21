/**
 * Reproduz a falha de runtime relatada: `cannot read properties of undefined
 * (reading 'rest')` ao chamar `supabase.rpc` extraído do cliente.
 *
 * O dublê abaixo põe `rpc` no PROTÓTIPO (método de classe), como no cliente
 * real: ao chamar o método extraído (`const rpc = supabase.rpc; rpc(...)`)
 * o `this` fica `undefined` e a chamada quebra — exatamente o que acontecia
 * no navegador. Com o `.bind(supabase)` o `this` volta a ser o cliente.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  result: {
    data: { eligible: 42, rows: [] } as Record<string, unknown>,
    error: null as { message: string } | null,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  class FakeSupabaseClient {
    rpc(name: string, args: Record<string, unknown>) {
      // Depende do `this`: sem receber o cliente de volta, `this` é undefined.
      this.record(name, args);
      return Promise.resolve(state.result);
    }

    record(name: string, args: Record<string, unknown>) {
      state.calls.push({ name, args });
    }
  }

  return { supabase: new FakeSupabaseClient() };
});

import { countAudience, resolveAudience } from '@/hooks/integrations/useTalkXSegments';

beforeEach(() => {
  state.calls.length = 0;
  state.result = { data: { eligible: 42, rows: [] }, error: null };
});

describe('supabase.rpc ligado ao cliente (Talk-X)', () => {
  it('countAudience chama a RPC sem perder o this e devolve o elegível', async () => {
    await expect(countAudience(null)).resolves.toBe(42);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].name).toBe('talkx_resolve_audience');
  });

  it('countAudience envia o modo count com paginação nula', async () => {
    await countAudience(null, ['seg-1']);
    expect(state.calls[0].args).toEqual({
      p_rules: { groups: [] },
      p_segment_ids: ['seg-1'],
      p_mode: 'count',
      p_limit: null,
      p_after: null,
    });
  });

  it('resolveAudience percorre a página via RPC ligada ao cliente', async () => {
    state.result = {
      data: {
        rows: [
          {
            id: 'c-1',
            name: 'Ana',
            nickname: null,
            phone: '+5511****0000',
            company: null,
            avatar_url: null,
            tags: null,
          },
        ],
        has_more: false,
      },
      error: null,
    };
    const rows = await resolveAudience(null, 5);
    expect(rows).toHaveLength(1);
    expect(state.calls[0].name).toBe('talkx_resolve_audience');
    expect(state.calls[0].args.p_mode).toBe('page');
  });
});
