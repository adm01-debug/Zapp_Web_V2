import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Conversation } from '@/types/chat';

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

import { ContactActionButtons } from '../ContactActionButtons';

const conversation = {
  id: 'conversation-1',
  contact: { id: 'contact-1', name: 'Contato', phone: '+55 (11) 99999-9999', email: null },
} as unknown as Conversation;

describe('ContactActionButtons', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders five charcoal action tiles and dispatches a scoped transfer event', () => {
    const transferSpy = vi.fn();
    window.addEventListener('zapp:open-transfer-dialog', transferSpy);
    render(<ContactActionButtons contact={{ id: 'contact-1', name: 'Contato', phone: '5511999999999' }} conversation={conversation} onStartCall={vi.fn()} />);

    expect(screen.getAllByTestId('contact-action-tile')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }));
    expect(transferSpy).toHaveBeenCalledTimes(1);
    expect((transferSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({ contactId: 'contact-1' });
    window.removeEventListener('zapp:open-transfer-dialog', transferSpy);
  });

  it('opens WhatsApp without exposing window.opener and disables an empty phone', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { rerender } = render(<ContactActionButtons contact={{ id: 'contact-1', name: 'Contato', phone: '+55 (11) 99999-9999' }} onStartCall={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(openSpy).toHaveBeenCalledWith('https://wa.me/5511999999999', '_blank', 'noopener,noreferrer');

    rerender(<ContactActionButtons contact={{ id: 'contact-1', name: 'Contato', phone: '' }} onStartCall={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeDisabled();
  });
});
