/**
 * Cartão t_d0f7873a — o erro de telefone duplicado não dizia a verdade:
 * `handleEditContact` reconhecia a constraint pelo nome REMOVIDO
 * (`contacts_phone_unique`, retirada em
 * `20260827130300_drop_duplicate_phone_constraint_m04.sql`); a constraint viva
 * hoje é `contacts_phone_key`. Com o nome errado o 23505 caía no `throw error`
 * e a tela mostrava o texto cru do Postgres em inglês.
 *
 * Além de reconhecer o nome atual, quando o número pertence a um contato
 * EXCLUÍDO (soft-delete) o fluxo orienta restaurar em vez de só recusar. A
 * consulta do duplicado excluído passa pela policy de SELECT: fora de
 * admin/supervisor ela não devolve a linha, então o operador comum segue
 * recebendo a mensagem padrão — o "ofereça restaurar (admin)" é do banco, não
 * uma segunda cópia da regra no front.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  updatePayloads: [] as Record<string, unknown>[],
  updateError: null as null | { code?: string; message?: string },
  updateRows: [{ id: 'c1' }] as { id: string }[],
  /** Linhas que a consulta do duplicado EXCLUÍDO devolve (default: nenhuma). */
  duplicadoExcluido: [] as { id: string }[],
  /** Erro devolvido pela consulta do duplicado (default: sucesso). */
  duplicadoErro: null as null | { message: string },
  /** Filtros da consulta do duplicado: [metodo, ...args]. */
  lookup: [] as unknown[][],
  getById: vi.fn(),
  refetch: vi.fn(),
  setShowLegacy: vi.fn(),
  warning: vi.fn(),
  invalidateQueries: vi.fn(),
  callOnSuccess: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_tabela: string) => ({
      update: (payload: Record<string, unknown>) => {
        mocks.updatePayloads.push(payload);
        return {
          eq: () => ({
            select: async () => ({ data: mocks.updateRows, error: mocks.updateError }),
          }),
        };
      },
      select: (...args: unknown[]) => {
        mocks.lookup.push(['select', ...args]);
        return {
          eq: (col: string, val: unknown) => {
            mocks.lookup.push(['eq', col, val]);
            return {
              not: (col2: string, op: string, val2: unknown) => {
                mocks.lookup.push(['not', col2, op, val2]);
                return {
                  limit: async () => ({ data: mocks.duplicadoExcluido, error: mocks.duplicadoErro }),
                };
              },
            };
          },
        };
      },
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u-1' } }) }));

vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    withFeedback: async (fn: () => Promise<unknown>, options?: { onSuccess?: () => void }) => {
      await fn();
      if (mocks.callOnSuccess) options?.onSuccess?.();
    },
    warning: mocks.warning,
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/hooks/crm/useContactsSearch', () => ({
  useContactsSearch: () => ({ refetch: mocks.refetch, setShowLegacy: mocks.setShowLegacy, contacts: [], totalCount: 0 }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: { getById: mocks.getById },
}));

import { useContactsCRUD } from '../useContactsCRUD';

const LINHA = {
  id: 'c1',
  name: 'Fulano',
  nickname: null,
  surname: null,
  job_title: null,
  company: null,
  phone: '5511999999999',
  email: null,
  contact_type: 'cliente',
  latitude: null,
  longitude: null,
};

const MENSAGEM_PADRAO = 'Já existe outro contato com este número de telefone.';
const MENSAGEM_RESTAURAR =
  'Já existe um contato excluído com este número de telefone. Restaure-o e tente de novo.';

async function editarCaindoNoErro() {
  const hook = renderHook(() => useContactsCRUD());
  await act(async () => {
    await hook.result.current.openEditDialog(LINHA as never);
  });
  act(() => {
    hook.result.current.handleEditContactChange('name', 'Fulano Editado');
  });
  let caught: unknown;
  await act(async () => {
    try {
      await hook.result.current.handleEditContact();
    } catch (error) {
      caught = error;
    }
  });
  return caught;
}

describe('useContactsCRUD — erro de telefone duplicado diz a verdade', () => {
  beforeEach(() => {
    mocks.updatePayloads = [];
    mocks.updateError = null;
    mocks.updateRows = [{ id: 'c1' }];
    mocks.duplicadoExcluido = [];
    mocks.lookup = [];
    mocks.getById.mockReset();
    mocks.getById.mockResolvedValue({ data: LINHA, error: null });
    mocks.refetch.mockReset();
    mocks.warning.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.callOnSuccess = false;
  });

  it('reconhece a constraint VIVA (contacts_phone_key) e mostra a mensagem em pt-BR', async () => {
    mocks.updateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "contacts_phone_key"',
    };

    const caught = await editarCaindoNoErro();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(MENSAGEM_PADRAO);
  });

  it('duplicado EXCLUÍDO: orienta restaurar e a consulta filtra deleted_at e o telefone (só dígitos)', async () => {
    mocks.updateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "contacts_phone_key"',
    };
    mocks.duplicadoExcluido = [{ id: 'ex-1' }];

    const caught = await editarCaindoNoErro();

    expect((caught as Error).message).toBe(MENSAGEM_RESTAURAR);
    expect(mocks.lookup).toContainEqual(['eq', 'phone', '5511999999999']);
    expect(mocks.lookup).toContainEqual(['not', 'deleted_at', 'is', null]);
  });

  it('contraponta: 23505 sem excluído correspondente mantém a mensagem padrão (não promete restaurar)', async () => {
    mocks.updateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "contacts_phone_key"',
    };
    mocks.duplicadoExcluido = [];

    const caught = await editarCaindoNoErro();

    expect((caught as Error).message).toBe(MENSAGEM_PADRAO);
  });

  it('contraponta: falha na consulta do duplicado não vira "sem excluído" silencioso — cai na mensagem padrão', async () => {
    mocks.updateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "contacts_phone_key"',
    };
    mocks.duplicadoExcluido = [{ id: 'ex-1' }];
    mocks.duplicadoErro = { message: 'network error' };

    const caught = await editarCaindoNoErro();

    expect((caught as Error).message).toBe(MENSAGEM_PADRAO);
  });

  it('contraponta: erro que não é de telefone duplicado propaga como veio, sem consultar o banco', async () => {
    mocks.updateError = { code: '42501', message: 'permission denied for table contacts' };

    const caught = await editarCaindoNoErro();

    expect((caught as Error).message).toBe('permission denied for table contacts');
    expect(mocks.lookup).toEqual([]);
  });
});
