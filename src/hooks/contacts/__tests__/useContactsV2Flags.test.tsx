import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CT-005 — chave `contacts.v2`.
 *
 * O hook é exercitado de verdade: só o cliente Supabase (a fonte do dado) e o
 * usuário logado são trocados. As linhas usam os nomes das chaves como eles
 * existirão na tabela `feature_flags` — é assim que a liberação por partes vai
 * ser escrita lá.
 *
 * Os casos cobrem o que o cartão pede: cada sub-chave por si, o desligamento
 * geral pela chave `contacts.v2` e o padrão (ligada em desenvolvimento/teste,
 * desligada em produção, inclusive quando a consulta das flags falha).
 */

interface LinhaFlag {
  key: string;
  enabled: boolean;
  description: null;
  updated_at: string;
}

/** Nomes das chaves como eles vão existir em `feature_flags`. */
const CHAVE_GERAL = 'contacts.v2';
const CHAVE_AREA = {
  toolbar: 'contacts.v2.toolbar',
  cards: 'contacts.v2.cards',
  detalhe: 'contacts.v2.detalhe',
  empresa: 'contacts.v2.empresa',
  edicao: 'contacts.v2.edicao',
  protecao: 'contacts.v2.protecao',
};

const h = vi.hoisted(() => ({
  rows: [] as LinhaFlag[],
  error: null as unknown,
  consultas: 0,
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'usuario-teste' } }) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => {
          h.consultas += 1;
          return Promise.resolve({ data: h.rows, error: h.error });
        },
      }),
    }),
  },
}));

import {
  CONTACTS_V2_AREAS,
  CONTACTS_V2_MASTER_KEY,
  contactsV2AreaKey,
  contactsV2AreasLigadas,
  useContactsV2Flags,
  type ContactsV2Area,
} from '../useContactsV2Flags';

const linha = (key: string, enabled: boolean): LinhaFlag => ({
  key,
  enabled,
  description: null,
  updated_at: '2026-10-08T00:00:00Z',
});

/** Linhas com todas as chaves ligadas, nos nomes que a tabela guarda. */
const todasLigadas = (): LinhaFlag[] => [
  linha(CHAVE_GERAL, true),
  ...CONTACTS_V2_AREAS.map((area) => linha(CHAVE_AREA[area], true)),
];

/** Linhas com a chave geral ligada e só as áreas indicadas ligadas. */
const comAreasLigadas = (...areasLigadas: ContactsV2Area[]): LinhaFlag[] => [
  linha(CHAVE_GERAL, true),
  ...CONTACTS_V2_AREAS.map((area) => linha(CHAVE_AREA[area], areasLigadas.includes(area))),
];

const desligada: Record<ContactsV2Area, boolean> = {
  toolbar: false,
  cards: false,
  detalhe: false,
  empresa: false,
  edicao: false,
  protecao: false,
};

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderFlags() {
  return renderHook(() => useContactsV2Flags(), { wrapper: createWrapper() });
}

/** Espera a consulta das flags terminar (o valor só sai dela). */
async function aguardarConsulta() {
  await waitFor(() => expect(h.consultas).toBeGreaterThan(0));
  await waitFor(() => expect(h.consultas).toBe(1));
}

beforeEach(() => {
  h.rows = [];
  h.error = null;
  h.consultas = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('useContactsV2Flags — nomes das chaves', () => {
  it('a chave publicada e as áreas cobrem exatamente o que a tabela guarda', () => {
    expect(CONTACTS_V2_MASTER_KEY).toBe(CHAVE_GERAL);
    expect([...CONTACTS_V2_AREAS].sort()).toEqual(Object.keys(CHAVE_AREA).sort());
    for (const area of CONTACTS_V2_AREAS) {
      expect(contactsV2AreaKey(area)).toBe(CHAVE_AREA[area]);
    }
  });
});

describe('useContactsV2Flags — desenvolvimento e teste', () => {
  it('sem linha na tabela, todas as áreas ficam ligadas', async () => {
    h.rows = [];
    const { result } = renderFlags();
    await aguardarConsulta();
    expect(result.current).toEqual({
      toolbar: true,
      cards: true,
      detalhe: true,
      empresa: true,
      edicao: true,
      protecao: true,
    });
  });

  it('cada sub-chave é independente: desligar uma área no banco não desliga as outras', async () => {
    h.rows = comAreasLigadas('toolbar', 'detalhe', 'empresa', 'edicao', 'protecao');
    const { result } = renderFlags();
    await waitFor(() => expect(result.current.cards).toBe(false));
    expect(result.current).toEqual({
      toolbar: true,
      cards: false,
      detalhe: true,
      empresa: true,
      edicao: true,
      protecao: true,
    });
  });

  it('só a área ligada no banco responde ligada', async () => {
    h.rows = comAreasLigadas('detalhe');
    const { result } = renderFlags();
    // Em desenvolvimento o padrão é ligado: só o valor vindo da tabela prova que
    // a leitura terminou (as outras áreas estão desligadas lá).
    await waitFor(() => expect(result.current.toolbar).toBe(false));
    expect(result.current).toEqual({ ...desligada, detalhe: true });
  });
});

describe('useContactsV2Flags — chave geral desligada', () => {
  it('recolhe TODAS as áreas, mesmo com as sub-chaves ligadas no banco', async () => {
    h.rows = todasLigadas().map((row) => ({
      ...row,
      enabled: row.key !== CHAVE_GERAL,
    }));
    const { result } = renderFlags();
    // A consulta responde com as áreas ligadas; mesmo assim nada fica ligado.
    await waitFor(() => expect(result.current.toolbar).toBe(false));
    expect(result.current).toEqual(desligada);
  });
});

describe('useContactsV2Flags — produção', () => {
  it('sem linha na tabela (chave não liberada), nada fica ligado', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    h.rows = [];
    const { result } = renderFlags();
    await aguardarConsulta();
    expect(result.current).toEqual(desligada);
  });

  it('com a chave geral e a área liberadas no banco, só aquela área fica ligada', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    h.rows = comAreasLigadas('toolbar');
    const { result } = renderFlags();
    await waitFor(() => expect(result.current.toolbar).toBe(true));
    expect(result.current).toEqual({ ...desligada, toolbar: true });
  });

  it('consulta das flags falhando não liga a experiência nova', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    h.rows = todasLigadas();
    h.error = { message: 'sem permissão de leitura em feature_flags' };
    const { result } = renderFlags();
    await aguardarConsulta();
    expect(result.current).toEqual(desligada);
  });
});

describe('contactsV2AreasLigadas — o que o módulo publica', () => {
  it('lista vazia quando nada está ligado (a tela é a atual)', () => {
    expect(contactsV2AreasLigadas(desligada)).toEqual([]);
  });

  it('lista só a área ligada, na ordem canônica', () => {
    expect(contactsV2AreasLigadas({ ...desligada, cards: true })).toEqual(['cards']);
    expect(contactsV2AreasLigadas({ ...desligada, protecao: true, toolbar: true, cards: true })).toEqual([
      'toolbar',
      'cards',
      'protecao',
    ]);
  });
});
