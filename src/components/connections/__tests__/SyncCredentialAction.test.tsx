import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 13/11 — botão "Sincronizar credencial" do diálogo de QR: só para quem a Edge
// autoriza (admin/supervisor); os demais papéis recebem orientação.
const role = vi.hoisted(() => ({ value: { isSupervisor: true, loading: false } }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => role.value }));

import { SyncCredentialAction } from '../SyncCredentialAction';

beforeEach(() => { role.value = { isSupervisor: true, loading: false }; });

describe('SyncCredentialAction', () => {
  it('admin/supervisor vê o botão e o clique sincroniza', () => {
    const onSync = vi.fn();
    render(<SyncCredentialAction syncing={false} onSync={onSync} />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar credencial/ }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('desabilita o botão durante a sincronização', () => {
    render(<SyncCredentialAction syncing onSync={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Sincronizar credencial/ })).toBeDisabled();
  });

  it('agente não vê o botão; recebe orientação', () => {
    role.value = { isSupervisor: false, loading: false };
    render(<SyncCredentialAction syncing={false} onSync={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Peça a um administrador/)).toBeInTheDocument();
  });

  it('enquanto o papel carrega, não mostra nada', () => {
    role.value = { isSupervisor: false, loading: true };
    const { container } = render(<SyncCredentialAction syncing={false} onSync={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
