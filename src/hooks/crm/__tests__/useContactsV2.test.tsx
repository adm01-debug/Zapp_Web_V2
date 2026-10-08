import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * MC-010 — a flag do módulo de Contatos nasce aqui. `contacts.v2` é a chave-mestra
 * (desligada, o módulo inteiro volta ao comportamento atual) e `contacts.v2.<área>`
 * libera uma área por vez, sem deploy.
 *
 * O teste dirige a tabela `feature_flags` de verdade (cliente Supabase mockado) e
 * espera a query RESOLVER antes de afirmar o valor: sem isso, `false` passaria sem
 * a flag nunca ter sido lida.
 */
const h = vi.hoisted(() => ({
  rows: [] as Array<{ key: string; enabled: boolean }>,
  error: null as { message: string } | null,
  tables: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      h.tables.push(table);
      return {
        select: vi.fn(() => ({
          order: vi.fn(async () => ({ data: h.error ? null : h.rows, error: h.error })),
        })),
      };
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'usuario-sintetico' } }) }));

import { FEATURE_FLAGS_QUERY_KEY } from '@/hooks/system/useFeatureFlag';
import {
  CONTACTS_V2_AREAS,
  CONTACTS_V2_MASTER_KEY,
  contactsV2AreaKey,
  useContactsV2,
  type ContactsV2Area,
} from '../useContactsV2';

let qc: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function aguardarFlagsCarregadas() {
  await waitFor(() => expect(qc.getQueryState(FEATURE_FLAGS_QUERY_KEY)?.status).toBe('success'));
}

function renderArea(area: ContactsV2Area) {
  return renderHook(({ a }: { a: ContactsV2Area }) => useContactsV2(a), {
    wrapper,
    initialProps: { a: area },
  });
}

beforeEach(() => {
  h.rows = [];
  h.error = null;
  h.tables = [];
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useContactsV2 — flag contacts.v2 por área', () => {
  it('lê a infraestrutura existente (tabela feature_flags) com a chave-mestra e a chave da área', async () => {
    h.rows = [
      { key: 'contacts.v2', enabled: true },
      { key: 'contacts.v2.toolbar', enabled: true },
    ];

    const { result } = renderArea('toolbar');

    await waitFor(() => expect(result.current).toBe(true));
    expect(h.tables).toContain('feature_flags');
    expect(CONTACTS_V2_MASTER_KEY).toBe('contacts.v2');
    expect(contactsV2AreaKey('toolbar')).toBe('contacts.v2.toolbar');
  });

  it('libera só a área ligada — é por área, não por módulo', async () => {
    h.rows = [
      { key: 'contacts.v2', enabled: true },
      { key: 'contacts.v2.toolbar', enabled: true },
      { key: 'contacts.v2.cards', enabled: false },
      { key: 'contacts.v2.detail', enabled: false },
      { key: 'contacts.v2.form', enabled: false },
    ];

    const { result, rerender } = renderArea('toolbar');

    // Só espera a primeira área: quando ela fica `true`, as flags já carregaram.
    await waitFor(() => expect(result.current).toBe(true));

    rerender({ a: 'cards' });
    expect(result.current).toBe(false);
    rerender({ a: 'detail' });
    expect(result.current).toBe(false);
    rerender({ a: 'form' });
    expect(result.current).toBe(false);
  });

  it('com a chave-mestra desligada, nenhuma área fica ligada (desligar volta ao comportamento atual)', async () => {
    h.rows = [
      { key: 'contacts.v2', enabled: false },
      ...CONTACTS_V2_AREAS.map((area) => ({ key: contactsV2AreaKey(area), enabled: true })),
    ];

    const { result, rerender } = renderArea('toolbar');
    await aguardarFlagsCarregadas();

    for (const area of CONTACTS_V2_AREAS) {
      rerender({ a: area });
      expect(result.current).toBe(false);
    }
  });

  it('área sem linha em feature_flags fica no comportamento atual (fecha por padrão)', async () => {
    h.rows = [{ key: 'contacts.v2', enabled: true }];

    const { result } = renderArea('form');
    await aguardarFlagsCarregadas();

    expect(result.current).toBe(false);
  });

  it('erro na leitura das flags não liga nenhuma área', async () => {
    h.error = { message: 'falha sintetica na leitura das flags' };

    const { result } = renderArea('cards');
    await waitFor(() => expect(qc.getQueryState(FEATURE_FLAGS_QUERY_KEY)?.status).toBe('error'));

    expect(result.current).toBe(false);
  });

  it('cobre as quatro áreas da etapa com chave aceita pela tabela feature_flags', () => {
    expect([...CONTACTS_V2_AREAS]).toEqual(['toolbar', 'cards', 'detail', 'form']);

    for (const area of CONTACTS_V2_AREAS) {
      const key = contactsV2AreaKey(area);
      expect(key).toBe(`contacts.v2.${area}`);
      // Mesmo CHECK da migration 20260905060000_feature_flags.sql.
      expect(key).toMatch(/^[a-z0-9][a-z0-9_.-]{0,63}$/);
    }
  });
});
