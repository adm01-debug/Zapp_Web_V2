/**
 * Contato → Compras/Propostas: a falha do insert era silenciosa (`if (!error) {...}`
 * sem `else`), o diálogo fechava como se tivesse salvado e o usuário não sabia.
 *
 * Vermelho antes: nenhum toast de erro e nada no log. Verde depois: toast de erro
 * visível e o diálogo continua aberto para tentar de novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  insert: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/lib/logger', () => ({ log: h.log, getLogger: () => h.log, createLogger: () => h.log }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: h.insert }) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/crm/useContactCrm360', () => ({ contactCrm360Key: (id: string) => ['crm360', id] }));
vi.mock('@/hooks/crm/useContactPurchases', () => ({
  useContactPurchases: () => ({ data: [], isLoading: false }),
  contactPurchasesKey: (id: string) => ['purchases', id],
}));

import { ContactPurchasesPanel } from '../ContactPurchasesPanel';

async function openAndSubmit() {
  render(<ContactPurchasesPanel contactId="c1" profileId="p1" />);

  fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
  fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Peça X' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
}

describe('ContactPurchasesPanel — falha de gravação visível', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra toast de erro e registra no log quando o insert falha', async () => {
    h.insert.mockResolvedValue({ error: { message: 'permissão negada' } });

    await openAndSubmit();

    expect(h.toast.error).toHaveBeenCalledWith('Não foi possível registrar. Tente novamente.');
    // Nada de anúncio falso de sucesso.
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.log.error).toHaveBeenCalled();
  });

  it('sem erro fecha o diálogo e anuncia sucesso', async () => {
    h.insert.mockResolvedValue({ error: null });

    await openAndSubmit();

    expect(h.toast.success).toHaveBeenCalledWith('Registro adicionado');
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});
