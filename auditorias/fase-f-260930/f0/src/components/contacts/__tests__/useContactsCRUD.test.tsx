import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * C1 — editar um contato pela lista apagava endereço e coordenada.
 * A lista vem da RPC `search_contacts`, que não devolvia os campos de endereço;
 * `openEditDialog` abria o form com a linha da lista e `handleEditContact`
 * gravava `null` em todos os campos ausentes.
 */
const mocks = vi.hoisted(() => ({
  updatePayloads: [] as Record<string, unknown>[],
  insertPayloads: [] as Record<string, unknown>[],
  updateError: null as null | { code?: string; message?: string },
  getById: vi.fn(),
  refetch: vi.fn(),
  warning: vi.fn(),
  invalidateQueries: vi.fn(),
  /** Liga o `onSuccess` do `withFeedback` (o mock padrão só roda a mutação). */
  callOnSuccess: false,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        mocks.updatePayloads.push(payload);
        return { eq: async () => ({ error: mocks.updateError }) };
      },
      insert: (payload: Record<string, unknown>) => {
        mocks.insertPayloads.push(payload);
        return Promise.resolve({ error: null });
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: () => Promise.resolve({ data: 'ok', error: null }),
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
  useContactsSearch: () => ({ refetch: mocks.refetch, contacts: [], totalCount: 0 }),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/services/contact.service', () => ({
  ContactService: { getById: mocks.getById },
}));

import { useContactsCRUD } from '../useContactsCRUD';

/** Linha como a lista devolve HOJE (RPC sem as colunas de endereço). */
const LIST_ROW = {
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

/** Linha completa como o banco guarda (e como o `getById` devolve). */
const FULL_ROW = {
  ...LIST_ROW,
  postal_code: '01310100',
  address: 'Av. Paulista',
  address_number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  latitude: -23.5613,
  longitude: -46.6565,
};

const last = <T,>(list: T[]): T => list[list.length - 1];

function mountHook() {
  return renderHook(() => useContactsCRUD());
}

async function openAndEditName(contact: Record<string, unknown>, newName = 'Fulano Editado') {
  const hook = mountHook();
  await act(async () => {
    await hook.result.current.openEditDialog(contact as never);
  });
  await act(async () => {
    hook.result.current.handleEditContactChange('name', newName);
  });
  await act(async () => {
    await hook.result.current.handleEditContact();
  });
  return { hook, payload: last(mocks.updatePayloads) ?? {} };
}

describe('useContactsCRUD — edição não apaga endereço (C1)', () => {
  beforeEach(() => {
    mocks.updatePayloads = [];
    mocks.insertPayloads = [];
    mocks.updateError = null;
    mocks.getById.mockReset();
    mocks.refetch.mockReset();
    mocks.warning.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.callOnSuccess = false;
  });

  it('E01 — editar só o nome preserva endereço e coordenada da linha completa', async () => {
    mocks.getById.mockResolvedValue({ data: FULL_ROW, error: null });

    const { hook, payload } = await openAndEditName(LIST_ROW);

    expect(mocks.getById).toHaveBeenCalledWith('c1');
    expect(payload).toMatchObject({
      name: 'Fulano Editado',
      address: 'Av. Paulista',
      address_number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01310100',
      latitude: -23.5613,
      longitude: -46.6565,
    });
    expect(hook.result.current.editingContact).toMatchObject({ address: 'Av. Paulista' });
  });

  it('E05 — abre a edição com 1 fetch pelo id', async () => {
    mocks.getById.mockResolvedValue({ data: FULL_ROW, error: null });

    const hook = mountHook();
    await act(async () => {
      await hook.result.current.openEditDialog(LIST_ROW as never);
    });

    expect(mocks.getById).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isEditDialogOpen).toBe(true);
  });

  it('E05 — falha do getById não perde endereço: o update não escreve os campos de endereço', async () => {
    mocks.getById.mockRejectedValue(new Error('sem permissão'));

    const { payload } = await openAndEditName(LIST_ROW);

    expect(payload).not.toHaveProperty('address');
    expect(payload).not.toHaveProperty('city');
    expect(payload).not.toHaveProperty('latitude');
    expect(mocks.warning).toHaveBeenCalled();
  });

  it('E05 — getById devolve null: não grava endereço nem sobrescreve com o valor (possivelmente velho) da lista', async () => {
    mocks.getById.mockResolvedValue({ data: null, error: null });

    const { payload } = await openAndEditName({ ...FULL_ROW, address: 'Rua das Flores' });

    expect(payload).not.toHaveProperty('address');
    expect(payload).not.toHaveProperty('city');
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).toHaveProperty('name', 'Fulano Editado');
    expect(mocks.warning).toHaveBeenCalled();
  });

  it('E04 — apagar de propósito continua funcionando: campo esvaziado vira null', async () => {
    mocks.getById.mockResolvedValue({ data: FULL_ROW, error: null });

    const hook = mountHook();
    await act(async () => {
      await hook.result.current.openEditDialog(LIST_ROW as never);
    });
    await act(async () => {
      hook.result.current.handleEditContactChange('address', '');
      hook.result.current.handleEditContactChange('latitude', '');
    });
    await act(async () => {
      await hook.result.current.handleEditContact();
    });

    const payload = last(mocks.updatePayloads) ?? {};
    expect(payload).toHaveProperty('address', null);
    expect(payload).toHaveProperty('latitude', null);
    expect(payload).toHaveProperty('city', 'São Paulo');
  });

  it('E08 — ciclo add → edit: o endereço salvo na criação sobrevive à edição', async () => {
    const hook = mountHook();

    // 1. cadastro com endereço vindo do autocomplete
    act(() => {
      hook.result.current.handleNewContactChange('name', 'Beltrano');
      hook.result.current.handleNewContactChange('phone', '5511988887777');
      hook.result.current.handleNewContactChange('address', 'Av. Paulista');
      hook.result.current.handleNewContactChange('address_number', '1000');
      hook.result.current.handleNewContactChange('city', 'São Paulo');
      hook.result.current.handleNewContactChange('state', 'SP');
      hook.result.current.handleNewContactChange('latitude', '-23.5613');
      hook.result.current.handleNewContactChange('longitude', '-46.6565');
    });
    await act(async () => {
      await hook.result.current.handleAddContact();
    });

    const inserted = last(mocks.insertPayloads) ?? {};
    expect(inserted).toMatchObject({
      address: 'Av. Paulista',
      city: 'São Paulo',
      latitude: -23.5613,
      longitude: -46.6565,
    });

    // 2. reabrir a edição (o getById devolve o que foi salvo) e mudar só a empresa
    mocks.getById.mockResolvedValue({
      data: { ...LIST_ROW, ...inserted, id: 'c2', name: 'Beltrano' },
      error: null,
    });
    const { payload } = await openAndEditName({ ...LIST_ROW, id: 'c2', name: 'Beltrano' }, 'Beltrano');

    expect(payload.address).toBe('Av. Paulista');
    expect(payload.latitude).toBe(-23.5613);
    expect(payload.longitude).toBe(-46.6565);
  });
});

describe('useContactsCRUD — invalida os contadores por tipo (contacts-type-counts)', () => {
  const expectAggregatesInvalidated = () => {
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-kpi'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['contacts-type-counts'] });
  };

  it('após criar, invalida contacts-kpi E contacts-type-counts', async () => {
    mocks.callOnSuccess = true;
    const hook = mountHook();
    act(() => {
      hook.result.current.handleNewContactChange('name', 'Beltrano');
      hook.result.current.handleNewContactChange('phone', '5511988887777');
    });
    await act(async () => {
      await hook.result.current.handleAddContact();
    });
    expectAggregatesInvalidated();
  });

  it('após editar com troca de tipo, invalida contacts-type-counts', async () => {
    mocks.callOnSuccess = true;
    mocks.getById.mockResolvedValue({ data: FULL_ROW, error: null });
    const hook = mountHook();
    await act(async () => {
      await hook.result.current.openEditDialog(LIST_ROW as never);
    });
    act(() => {
      hook.result.current.handleEditContactChange('contact_type', 'fornecedor');
    });
    await act(async () => {
      await hook.result.current.handleEditContact();
    });
    expectAggregatesInvalidated();
  });

  it('após apagar, invalida contacts-type-counts', async () => {
    mocks.callOnSuccess = true;
    const hook = mountHook();
    await act(async () => {
      await hook.result.current.handleDeleteContact('c1');
    });
    expectAggregatesInvalidated();
  });
});
