/** Porta de entrada de `set-presence` (wrapper sem tela; o #2054 apagou a rota por isso). */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ setPresence: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => api }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { PresenceTabContent } from '../InstancePresenceTab';

beforeEach(() => { vi.clearAllMocks(); });

describe('PresenceTabContent', () => {
  it('aplica a presença escolhida (padrão: disponível) na instância', async () => {
    api.setPresence.mockResolvedValue({});
    render(<PresenceTabContent instanceName="PRINCIPAL" />);
    fireEvent.click(screen.getByRole('button', { name: /aplicar presença/i }));
    await waitFor(() => expect(api.setPresence).toHaveBeenCalledWith('PRINCIPAL', 'available'));
    expect(toastMock.success).toHaveBeenCalledWith('Presença atualizada');
  });

  it('notSupported (Evolution GO) aparece como erro, nunca como sucesso', async () => {
    api.setPresence.mockRejectedValue(Object.assign(new Error('set-presence não é suportado na Evolution GO.'), { notSupported: true }));
    render(<PresenceTabContent instanceName="PRINCIPAL" />);
    fireEvent.click(screen.getByRole('button', { name: /aplicar presença/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('set-presence não é suportado na Evolution GO.'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
