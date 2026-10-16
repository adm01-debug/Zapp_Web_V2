import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Prova do cartão: ao trocar a categoria de um grupo, a gravação em
// `whatsapp_groups` é a fonte de verdade. A propagação para `contacts.group_category`
// casa por PHONE EXATO (o JID de grupo vira `12345-67890` — sem `@g.us`, sem LIKE) e,
// se ela falhar, a ação NÃO quebra: resta um log de aviso e o estado local segue atualizado.

interface Filtro {
  coluna: string;
  valor: unknown;
}

const groupsFilters: Filtro[] = [];
const contactsFilters: Filtro[] = [];
const contactsLike = vi.fn();

let groupsUpdateResult: { error: unknown } = { error: null };
let contactsUpdateResult: { error: unknown } = { error: null };

function updateChain(
  filters: Filtro[],
  getResult: () => { error: unknown },
  withLike = false,
) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn((coluna: string, valor: unknown) => {
    filters.push({ coluna, valor });
    return obj;
  });
  if (withLike) {
    obj.like = vi.fn((coluna: string, valor: unknown) => {
      contactsLike(coluna, valor);
      return obj;
    });
  }
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(getResult()).then(resolve, reject);
  return obj;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'whatsapp_groups') {
        return {
          update: vi.fn(() => updateChain(groupsFilters, () => groupsUpdateResult)),
        };
      }
      if (table === 'contacts') {
        return {
          update: vi.fn(() => updateChain(contactsFilters, () => contactsUpdateResult, true)),
        };
      }
      return { update: vi.fn(() => updateChain([], () => ({ error: null }))) };
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useGroupActions } from '@/hooks/groups/actions';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import type { WhatsAppGroup } from '@/hooks/groups/types';

const GRUPO: WhatsAppGroup = {
  id: 'g1',
  whatsapp_connection_id: null,
  group_id: '12345-67890@g.us',
  name: 'Fornecedores',
  description: null,
  participant_count: 3,
  avatar_url: null,
  is_admin: false,
  created_at: '2026-10-15T00:00:00.000Z',
  category: null,
};

function montar(setGroups = vi.fn()) {
  return {
    props: {
      connections: [],
      groups: [GRUPO],
      selectedGroups: new Set<string>(),
      setGroups,
      setSelectedGroups: vi.fn(),
      fetchGroups: vi.fn(async () => {}),
    },
    setGroups,
  };
}

beforeEach(() => {
  groupsFilters.length = 0;
  contactsFilters.length = 0;
  contactsLike.mockClear();
  groupsUpdateResult = { error: null };
  contactsUpdateResult = { error: null };
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(log.warn).mockClear();
});

describe('useGroupActions.handleCategoryChange — categoria do grupo', () => {
  it('casa a propagação para contatos por phone exato (sem LIKE)', async () => {
    const { props } = montar();
    const { result } = renderHook(() => useGroupActions(props));

    await act(async () => {
      await result.current.handleCategoryChange('g1', 'orcamentos');
    });

    expect(groupsFilters).toContainEqual({ coluna: 'id', valor: 'g1' });
    expect(contactsFilters).toContainEqual({ coluna: 'phone', valor: '12345-67890' });
    expect(contactsLike).not.toHaveBeenCalled();
  });

  it('não quebra a ação quando a propagação para contatos é recusada: avisa e mantém o estado local', async () => {
    contactsUpdateResult = { error: { message: 'permission denied' } };
    const { props, setGroups } = montar();
    const { result } = renderHook(() => useGroupActions(props));

    await act(async () => {
      await result.current.handleCategoryChange('g1', 'orcamentos');
    });

    expect(log.warn).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(setGroups).toHaveBeenCalled();

    const updater = setGroups.mock.calls[0][0] as (prev: WhatsAppGroup[]) => WhatsAppGroup[];
    expect(updater([GRUPO])).toEqual([{ ...GRUPO, category: 'orcamentos' }]);
  });

  it('mantém o aviso de erro quando a própria gravação do grupo falha e não propaga aos contatos', async () => {
    groupsUpdateResult = { error: { message: 'rls' } };
    const { props, setGroups } = montar();
    const { result } = renderHook(() => useGroupActions(props));

    await act(async () => {
      await result.current.handleCategoryChange('g1', 'orcamentos');
    });

    expect(toast.error).toHaveBeenCalledWith('Erro ao atualizar categoria');
    expect(contactsFilters).toHaveLength(0);
    expect(setGroups).not.toHaveBeenCalled();
  });
});
