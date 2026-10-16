/**
 * Segurança > IPs — falha de consulta ≠ lista vazia, e confirmação antes de
 * bloquear (o aviso do próprio acesso).
 *
 * O defeito: os dois painéis tratavam erro como sucesso. `BlockedIPsPanel.tsx`
 * (linha 31) e `IPWhitelistPanel.tsx` (linha 59) só aplicavam `data` quando
 * `!error`, mas o ramo de render caía em "Nenhum IP bloqueado" / "Nenhum IP na
 * whitelist" — a tela AFIRMAVA lista vazia quando a consulta tinha falhado. E
 * `BlockIPDialog` não pedia confirmação nenhuma, o que corta o acesso sem aviso.
 *
 * Como este teste prova: renderiza os painéis REAIS com a consulta devolvendo
 * erro, exige o bloco de erro com "Tentar de novo" (e a ausência do texto de
 * lista vazia), confere que o botão refaz a consulta, e no diálogo prova que o
 * IP inválido não insere e que o válido só entra depois de confirmar — com o
 * valor trim()ado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IPWhitelistPanel } from '../IPWhitelistPanel';
import { BlockedIPsPanel } from '../BlockedIPsPanel';
import { BlockIPDialog } from '../BlockedIPDialogs';

const orderMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' } }),
}));

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

const ERRO = { message: 'falha de rede', code: '500' };

beforeEach(() => {
  orderMock.mockReset();
  insertMock.mockReset();
  fromMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  fromMock.mockImplementation(() => ({
    select: () => ({ order: orderMock }),
    insert: insertMock,
  }));
});

describe('IPWhitelistPanel — falha de consulta não vira lista vazia', () => {
  it('mostra erro com "Tentar de novo" e não afirma "Nenhum IP na whitelist"', async () => {
    orderMock.mockResolvedValue({ data: null, error: ERRO });

    render(<IPWhitelistPanel />);

    expect(await screen.findByTestId('whitelist-erro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.queryByText('Nenhum IP na whitelist')).toBeNull();
  });

  it('"Tentar de novo" refaz a consulta e, dando certo, mostra a lista', async () => {
    orderMock
      .mockResolvedValueOnce({ data: null, error: ERRO })
      .mockResolvedValueOnce({
        data: [{ id: 'w-1', ip_address: '10.0.0.7', description: null, created_at: new Date().toISOString() }],
        error: null,
      });

    render(<IPWhitelistPanel />);
    await screen.findByTestId('whitelist-erro');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('10.0.0.7')).toBeTruthy();
    expect(screen.queryByTestId('whitelist-erro')).toBeNull();
    expect(orderMock).toHaveBeenCalledTimes(2);
  });
});

describe('BlockedIPsPanel — falha de consulta não vira lista vazia', () => {
  it('mostra erro com "Tentar de novo" e não afirma "Nenhum IP bloqueado"', async () => {
    orderMock.mockResolvedValue({ data: null, error: ERRO });

    render(<BlockedIPsPanel />);

    expect(await screen.findByTestId('bloqueados-erro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    expect(screen.queryByText('Nenhum IP bloqueado')).toBeNull();
  });

  it('"Tentar de novo" refaz a consulta', async () => {
    orderMock.mockResolvedValue({ data: null, error: ERRO });

    render(<BlockedIPsPanel />);
    await screen.findByTestId('bloqueados-erro');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(orderMock).toHaveBeenCalledTimes(2);
  });
});

describe('BlockIPDialog — confirmação antes de bloquear', () => {
  const preencher = (ip: string) => {
    fireEvent.change(screen.getByLabelText('Endereço IP'), { target: { value: ip } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Força bruta' } });
  };

  it('recusa octeto fora de 0–255 sem inserir nada', () => {
    insertMock.mockResolvedValue({ error: null });
    render(<BlockIPDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);

    preencher('999.999.999.999');
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(insertMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Bloquear mesmo assim')).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });

  it('pede confirmação e só então insere — com o IP sem os espaços', async () => {
    insertMock.mockResolvedValue({ error: null });
    render(<BlockIPDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);

    preencher('  192.168.1.0/24  ');
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    // Nada foi para o banco antes de confirmar.
    expect(insertMock).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Bloquear mesmo assim' }));

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ ip_address: '192.168.1.0/24' });
  });
});
