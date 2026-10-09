import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * SL-085 — o formulário de regra de SLA é o primeiro do app validado por schema
 * com `zodResolver` (antes: `validate()` escrito à mão dentro do componente e
 * nenhuma ocorrência de zodResolver em `src`). O schema também é o lugar do
 * teto de caracteres: o mesmo número que limita o campo (`maxLength`) recusa o
 * valor que já estava no banco.
 */
const mocks = vi.hoisted(() => ({
  createRule: vi.fn(),
  updateRule: vi.fn(),
  contacts: [{ id: 'c1', name: 'Fulano', phone: '5511999999999' }],
}));

vi.mock('@/hooks/sla/useSLARules', () => ({
  useSLARules: () => ({
    createRule: mocks.createRule,
    updateRule: mocks.updateRule,
    isCreating: false,
    isUpdating: false,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.contacts }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SLARuleFormDialog } from '../SLARuleFormDialog';
import type { SLARule } from '@/hooks/sla/useSLARules';

const NAME_MAX = 120;
const NOME_ACIMA_DO_TETO = 'n'.repeat(NAME_MAX + 1);

const REGRA_LONGA: SLARule = {
  id: 'r1',
  name: NOME_ACIMA_DO_TETO,
  first_response_minutes: 5,
  resolution_minutes: 60,
  priority: 7,
  contact_id: 'c1',
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
  is_active: true,
  metadata: { notify_on_warning: false, escalation_notes: '' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderDialog(editingRule: SLARule | null = null) {
  return render(
    <SLARuleFormDialog open onOpenChange={() => {}} scope="contact" editingRule={editingRule} />
  );
}

/** Escolhe o cliente pelo resultado da busca (o escopo é select/lista, não campo de texto). */
const escolherCliente = () => {
  fireEvent.change(screen.getByPlaceholderText('Buscar por nome ou telefone...'), {
    target: { value: 'Fu' },
  });
  fireEvent.click(screen.getByText('Fulano — 5511999999999'));
};

const nomeDaRegra = () => screen.getByLabelText('Nome da Regra');

describe('SLARuleFormDialog — validação por schema (zodResolver)', () => {
  beforeEach(() => {
    mocks.createRule.mockReset();
    mocks.updateRule.mockReset();
  });

  it('limita o nome da regra no próprio campo (maxLength igual ao teto do schema)', () => {
    renderDialog();
    expect(nomeDaRegra()).toHaveAttribute('maxlength', String(NAME_MAX));
    expect(screen.getByLabelText('Notas de Escalação')).toHaveAttribute('maxlength', '500');
  });

  it('nome vazio é recusado pelo schema e a regra não é criada', async () => {
    renderDialog();
    escolherCliente();
    fireEvent.click(screen.getByText('Criar'));

    expect(await screen.findByText('Nome é obrigatório')).toBeInTheDocument();
    expect(mocks.createRule).not.toHaveBeenCalled();
  });

  it('escopo vazio é recusado pelo schema e a regra não é criada', async () => {
    renderDialog();
    fireEvent.change(nomeDaRegra(), { target: { value: 'SLA VIP' } });
    fireEvent.click(screen.getByText('Criar'));

    expect(await screen.findByText('Selecione um(a) cliente')).toBeInTheDocument();
    expect(mocks.createRule).not.toHaveBeenCalled();
  });

  it('nome acima do teto que já estava salvo é recusado no salvar (schema, não só o campo)', async () => {
    renderDialog(REGRA_LONGA);
    fireEvent.click(screen.getByText('Salvar'));

    expect(
      await screen.findByText(`Nome deve ter no máximo ${NAME_MAX} caracteres`)
    ).toBeInTheDocument();
    expect(mocks.updateRule).not.toHaveBeenCalled();
  });

  it('regra válida é criada com os valores do formulário', async () => {
    renderDialog();
    fireEvent.change(nomeDaRegra(), { target: { value: 'SLA VIP' } });
    escolherCliente();
    fireEvent.click(screen.getByText('Criar'));

    await waitFor(() => expect(mocks.createRule).toHaveBeenCalledTimes(1));
    expect(mocks.createRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SLA VIP',
        contact_id: 'c1',
        first_response_minutes: 5,
        resolution_minutes: 60,
        priority: 10,
      })
    );
  });
});
