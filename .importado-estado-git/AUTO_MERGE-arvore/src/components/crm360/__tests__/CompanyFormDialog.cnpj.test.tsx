import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * CompanyFormDialog — CNPJ validado (paridade V3, cartão t_c4169ef4).
 *
 * Contrato provado aqui:
 *  - CNPJ informado com dígito verificador inválido NÃO grava (o form barra e avisa);
 *  - CNPJ válido (com ou sem máscara) grava normalmente;
 *  - CNPJ vazio continua permitido (campo opcional);
 *  - o aviso aparece enquanto digita, sem bloquear a digitação.
 *
 * Caminho real: form → useExternalMutation → callCRMIntegration → supabase.functions.invoke.
 * Só o cliente Supabase e o toast são dublados.
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

const CNPJ_VALIDO = '11.222.333/0001-81';
const CNPJ_INVALIDO = '11.222.333/0001-80';
const MENSAGEM_CNPJ = 'CNPJ inválido — confira os dígitos verificadores.';

function gatewayReplies(rows: unknown[]) {
  mocks.invoke.mockResolvedValue({
    data: { data: rows, meta: { record_count: rows.length, duration_ms: 1, severity: 'ok' } },
    error: null,
  });
}

function renderCreateDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CompanyFormDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} company={null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gatewayReplies([{ id: 'emp-1' }]);
});

describe('CompanyFormDialog — CNPJ com dígito verificador', () => {
  it('não grava CNPJ inválido: avisa e não chama o gateway', async () => {
    renderCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nome Fantasia/), { target: { value: 'ACME Brindes' } });
    fireEvent.change(screen.getByLabelText(/^CNPJ$/), { target: { value: CNPJ_INVALIDO } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Empresa/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(MENSAGEM_CNPJ));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('grava CNPJ válido com máscara', async () => {
    renderCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nome Fantasia/), { target: { value: 'ACME Brindes' } });
    fireEvent.change(screen.getByLabelText(/^CNPJ$/), { target: { value: CNPJ_VALIDO } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Empresa/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('crm-integration', expect.objectContaining({
      body: expect.objectContaining({
        action: 'mutate',
        mutationAction: 'insert',
        table: 'companies',
        data: expect.objectContaining({ cnpj: CNPJ_VALIDO }),
      }),
    })));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('aceita CNPJ sem máscara (dígitos normalizados na validação)', async () => {
    renderCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nome Fantasia/), { target: { value: 'ACME Brindes' } });
    fireEvent.change(screen.getByLabelText(/^CNPJ$/), { target: { value: '11222333000181' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Empresa/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('mantém CNPJ opcional: vazio grava com cnpj null', async () => {
    renderCreateDialog();

    fireEvent.change(screen.getByLabelText(/Nome Fantasia/), { target: { value: 'ACME Brindes' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar Empresa/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('crm-integration', expect.objectContaining({
      body: expect.objectContaining({ data: expect.objectContaining({ cnpj: null }) }),
    })));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('mostra o aviso enquanto digita, sem bloquear a digitação nem disparar o toast', () => {
    renderCreateDialog();

    const campo = screen.getByLabelText(/^CNPJ$/);
    fireEvent.change(campo, { target: { value: CNPJ_INVALIDO } });

    expect(screen.getByText(MENSAGEM_CNPJ)).toBeTruthy();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(mocks.toastError).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: CNPJ_VALIDO } });
    expect(screen.queryByText(MENSAGEM_CNPJ)).toBeNull();
  });
});
