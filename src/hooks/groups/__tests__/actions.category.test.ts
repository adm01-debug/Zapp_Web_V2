/**
 * Prova do cartão: ao trocar a categoria de um grupo, a gravação em
 * `whatsapp_groups` é a fonte de verdade. A propagação para
 * `contacts.group_category` casa por PHONE EXATO — o JID de grupo
 * `12345-67890@g.us` vira `12345-67890` (sem `@g.us`, sem LIKE, sem `%`) —
 * e, se ela falhar, a ação NÃO quebra: resta um aviso no log e o estado
 * local segue atualizado.
 *
 * O alvo é o HOOK REAL (`useGroupActions`). A fronteira dublada é a rede
 * (o cliente Supabase), o toast, o logger e o `useActionFeedback` — o dublê
 * do cliente grava os filtros de cada chamada, então os casos provam o que
 * o hook manda para o banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { WhatsAppGroup } from '@/hooks/groups/types';

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  from: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: mocks.logWarn, debug: vi.fn() },
}));
vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: vi.fn(async (fn: () => Promise<void>) => { await fn(); }),
  }),
}));

import { useGroupActions } from '@/hooks/groups/actions';

interface Filtro {
  coluna: string;
  valor: unknown;
}

function grupo(): WhatsAppGroup {
  return {
    id: 'g1',
    whatsapp_connection_id: 'c1',
    group_id: '12345-67890@g.us',
    name: 'Fornecedores',
    description: null,
    participant_count: 3,
    avatar_url: null,
    is_admin: false,
    created_at: '2026-10-15T00:00:00.000Z',
    category: null,
  };
}

describe('useGroupActions — categoria do grupo propaga por phone exato', () => {
  const gruposFiltros: Filtro[] = [];
  const contatosFiltros: Filtro[] = [];
  const contatosLike = vi.fn();
  let resultadoGrupo: { error: unknown } = { error: null };
  let resultadoContato: { error: unknown } = { error: null };

  function cadeia(filtros: Filtro[], resultado: () => { error: unknown }, comLike = false) {
    const obj: Record<string, unknown> = {};
    obj.eq = vi.fn((coluna: string, valor: unknown) => {
      filtros.push({ coluna, valor });
      return obj;
    });
    if (comLike) {
      obj.like = vi.fn((coluna: string, valor: unknown) => {
        contatosLike(coluna, valor);
        return obj;
      });
    }
    obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resultado()).then(resolve, reject);
    return obj;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    gruposFiltros.length = 0;
    contatosFiltros.length = 0;
    contatosLike.mockClear();
    resultadoGrupo = { error: null };
    resultadoContato = { error: null };
    mocks.from.mockImplementation((tabela: string) => {
      if (tabela === 'whatsapp_groups') {
        return { update: vi.fn(() => cadeia(gruposFiltros, () => resultadoGrupo)) };
      }
      if (tabela === 'contacts') {
        return { update: vi.fn(() => cadeia(contatosFiltros, () => resultadoContato, true)) };
      }
      return { update: vi.fn(() => cadeia([], () => ({ error: null }))) };
    });
  });

  function montarCategoria() {
    const setGroups = vi.fn();
    const utils = renderHook(() => useGroupActions({
      connections: [], groups: [grupo()], selectedGroups: new Set<string>(),
      setGroups, setSelectedGroups: vi.fn(), fetchGroups: vi.fn(async () => {}),
    }));
    return { ...utils, setGroups };
  }

  it('propaga aos contatos por phone exato, sem LIKE nem curinga', async () => {
    const { result } = montarCategoria();

    await act(async () => { await result.current.handleCategoryChange('g1', 'orcamentos'); });

    expect(gruposFiltros).toContainEqual({ coluna: 'id', valor: 'g1' });
    // JID `12345-67890@g.us` casa o phone SEM o sufixo e COM o hífen, via `.eq`.
    expect(contatosFiltros).toContainEqual({ coluna: 'phone', valor: '12345-67890' });
    expect(contatosFiltros.every((f) => !String(f.valor).includes('%'))).toBe(true);
    expect(contatosLike).not.toHaveBeenCalled();
  });

  it('não engole a recusa do 2º UPDATE: avisa no log e mantém a categoria do grupo', async () => {
    resultadoContato = { error: { message: 'permission denied' } };
    const { result, setGroups } = montarCategoria();

    await act(async () => { await result.current.handleCategoryChange('g1', 'orcamentos'); });

    expect(mocks.logWarn).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith('Categoria atualizada');
    expect(mocks.toast.error).not.toHaveBeenCalled();
    const atualizador = setGroups.mock.calls[0][0] as (prev: WhatsAppGroup[]) => WhatsAppGroup[];
    expect(atualizador([grupo()])).toEqual([{ ...grupo(), category: 'orcamentos' }]);
  });

  it('mantém o aviso de erro quando a própria gravação do grupo falha e não toca nos contatos', async () => {
    resultadoGrupo = { error: { message: 'rls' } };
    const { result, setGroups } = montarCategoria();

    await act(async () => { await result.current.handleCategoryChange('g1', 'orcamentos'); });

    expect(mocks.toast.error).toHaveBeenCalledWith('Erro ao atualizar categoria');
    expect(contatosFiltros).toHaveLength(0);
    expect(setGroups).not.toHaveBeenCalled();
  });
});
