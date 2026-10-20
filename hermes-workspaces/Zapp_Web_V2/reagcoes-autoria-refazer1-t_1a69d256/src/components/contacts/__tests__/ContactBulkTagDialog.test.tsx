import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * R2-AUTH-013 — o diálogo de tags em lote anunciava sucesso com erro de leitura,
 * lote parcial ou 0 linhas afetadas, e ainda sobrescrevia tags com `[]` quando o
 * SELECT falhava. Estes testes provam o comportamento fiel.
 */
const db = vi.hoisted(() => ({
  selectRows: [] as { id: string; tags: string[] }[],
  selectError: null as unknown,
  updateError: null as unknown,
  /** ids (dentre os atualizados) que o UPDATE devolve como afetados; null = todos. */
  affectedIds: null as string[] | null,
  updates: [] as { payload: Record<string, unknown>; id: string }[],
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: db.selectRows, error: db.selectError }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          db.updates.push({ payload, id });
          const affected = db.affectedIds
            ? [id].filter((value) => db.affectedIds!.includes(value))
            : [id];
          return {
            select: async () => ({ data: affected.map((value) => ({ id: value })), error: db.updateError }),
          };
        },
      }),
    }),
  },
}));

import { ContactBulkTagDialog } from '../ContactBulkTagDialog';

function setup(extra: Partial<React.ComponentProps<typeof ContactBulkTagDialog>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    contactIds: ['a', 'b'],
    allTags: ['vip'],
    onComplete: vi.fn(),
    ...extra,
  };
  render(<ContactBulkTagDialog {...props} />);
  return props;
}

async function pickTagAndApply() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Adicionar 1 Tag/ }));
}

describe('ContactBulkTagDialog — feedback fiel (R2-AUTH-013)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.selectRows = [];
    db.selectError = null;
    db.updateError = null;
    db.affectedIds = null;
    db.updates = [];
  });

  it('erro no SELECT: reporta falha, não fecha e não toca nas tags', async () => {
    db.selectError = { message: 'permission denied' };
    const props = setup();

    await pickTagAndApply();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao atualizar tags. Nenhum contato foi alterado.'));
    expect(db.updates).toEqual([]);
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('lote com autorização mista: atualiza só os legíveis e devolve os recusados', async () => {
    db.selectRows = [{ id: 'a', tags: [] }]; // 'b' invisível (RLS)
    const onPartialComplete = vi.fn();
    setup({ onPartialComplete });

    await pickTagAndApply();

    await waitFor(() => expect(onPartialComplete).toHaveBeenCalledWith(['b']));
    expect(db.updates).toEqual([{ payload: { tags: ['vip'] }, id: 'a' }]);
    expect(toast.warning).toHaveBeenCalledWith('1 de 2 contatos atualizados', expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('erro no UPDATE: reporta falha e não anuncia sucesso', async () => {
    db.selectRows = [{ id: 'a', tags: [] }, { id: 'b', tags: [] }];
    db.updateError = { message: 'permission denied' };
    const props = setup();

    await pickTagAndApply();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao atualizar tags. Nenhum contato foi alterado.'));
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('UPDATE com 0 linhas: recusa vira falha explícita, sem sucesso', async () => {
    db.selectRows = [{ id: 'a', tags: [] }, { id: 'b', tags: [] }];
    db.affectedIds = [];
    setup();

    await pickTagAndApply();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nenhum contato foi atualizado. Verifique se você tem permissão.'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sucesso total: atualiza todos, anuncia e chama onComplete', async () => {
    db.selectRows = [{ id: 'a', tags: [] }, { id: 'b', tags: [] }];
    const props = setup();

    await pickTagAndApply();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('1 tag(s) adicionada(s) a 2 contatos');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('contato que já tem a tag não conta como atualizado', async () => {
    db.selectRows = [{ id: 'a', tags: ['vip'] }, { id: 'b', tags: [] }];
    const props = setup();

    await pickTagAndApply();

    await waitFor(() => expect(props.onComplete).toHaveBeenCalled());
    expect(db.updates).toEqual([{ payload: { tags: ['vip'] }, id: 'b' }]);
    expect(toast.success).toHaveBeenCalledWith('1 tag(s) adicionada(s) a 1 contatos');
  });
});
