import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

/**
 * R2-AUTH-019 (#246) — o gateway `crm-integration` responde HTTP 200 com
 * `data: []` quando o UPDATE de um único id não atinge nenhuma linha (empresa ou
 * contato removido entre abrir o form e salvar). Os forms ignoravam o conteúdo da
 * resposta: anunciavam "atualizado" e fechavam o diálogo.
 *
 * Contrato provado aqui:
 *  - zero linhas gravadas NÃO é sucesso: o diálogo continua aberto e o erro aparece;
 *  - uma linha gravada mantém o aviso de sucesso e o fechamento (sem regressão).
 *
 * O caminho exercitado é o real da tela: form → useExternalMutation →
 * callCRMIntegration → supabase.functions.invoke. Só o cliente do Supabase e o
 * toast são dublados.
 */

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { CompanyFormDialog } from '../CompanyFormDialog';
import { ContactFormDialog } from '../ContactFormDialog';

const EMPRESA = { id: 'emp-1', nome_fantasia: 'ACME Brindes', razao_social: 'ACME LTDA', status: 'ativo' };
const CONTATO = { id: 'cont-1', first_name: 'Ana', last_name: 'Souza' };

/** Resposta do gateway com as linhas efetivamente gravadas. */
function gatewayReplies(rows: unknown[]) {
  mocks.invoke.mockResolvedValue({
    data: { data: rows, meta: { record_count: rows.length, duration_ms: 1, severity: 'ok' } },
    error: null,
  });
}

function renderDialog(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CompanyFormDialog — edição que não grava linha não é sucesso', () => {
  it('empresa removida entre abrir e salvar não anuncia sucesso nem fecha o diálogo', async () => {
    gatewayReplies([]);
    const onOpenChange = vi.fn();
    renderDialog(<CompanyFormDialog open onOpenChange={onOpenChange} company={EMPRESA} />);

    fireEvent.click(screen.getByRole('button', { name: /Salvar Altera/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'A empresa não foi encontrada no CRM externo. Nenhuma alteração foi gravada.',
    ));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mocks.invoke).toHaveBeenCalledWith('crm-integration', expect.objectContaining({
      body: expect.objectContaining({
        action: 'mutate',
        mutationAction: 'update',
        table: 'companies',
        match: { id: 'emp-1' },
      }),
    }));
  });

  it('uma linha gravada mantém o aviso de sucesso e fecha o diálogo', async () => {
    gatewayReplies([{ ...EMPRESA, nome_fantasia: 'ACME Brindes Editada' }]);
    const onOpenChange = vi.fn();
    renderDialog(<CompanyFormDialog open onOpenChange={onOpenChange} company={EMPRESA} />);

    fireEvent.click(screen.getByRole('button', { name: /Salvar Altera/i }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Empresa atualizada com sucesso!'));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ContactFormDialog — edição que não grava linha não é sucesso', () => {
  it('contato removido entre abrir e salvar não anuncia sucesso nem fecha o diálogo', async () => {
    gatewayReplies([]);
    const onOpenChange = vi.fn();
    renderDialog(<ContactFormDialog open onOpenChange={onOpenChange} contact={CONTATO} />);

    fireEvent.click(screen.getByRole('button', { name: /Salvar Altera/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'O contato não foi encontrado no CRM externo. Nenhuma alteração foi gravada.',
    ));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mocks.invoke).toHaveBeenCalledWith('crm-integration', expect.objectContaining({
      body: expect.objectContaining({
        action: 'mutate',
        mutationAction: 'update',
        table: 'contacts',
        match: { id: 'cont-1' },
      }),
    }));
  });

  it('uma linha gravada mantém o aviso de sucesso e fecha o diálogo', async () => {
    gatewayReplies([{ ...CONTATO, first_name: 'Ana Editada' }]);
    const onOpenChange = vi.fn();
    renderDialog(<ContactFormDialog open onOpenChange={onOpenChange} contact={CONTATO} />);

    fireEvent.click(screen.getByRole('button', { name: /Salvar Altera/i }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Contato atualizado com sucesso!'));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
