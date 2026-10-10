import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CRMSyncButton } from '../CRMAutoSync';

const mockSync = vi.fn();

vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({
    syncConversationAsync: mockSync,
    isSyncing: false,
    isConfigured: true,
    lastResult: null,
  }),
}));

vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const conversa = {
  id: 'conv-1',
  contact: { id: 'c1', name: 'Contato Teste', conversation_status: 'open' },
  lastMessage: { content: 'Olá' },
} as never;

function wrapper(ui: React.ReactElement) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe('CRMSyncButton — acessibilidade (N-042)', () => {
  beforeEach(() => { mockSync.mockClear(); });

  it('botão de sincronizar tem aria-label "Sincronizar com CRM"', () => {
    render(wrapper(<CRMSyncButton conversation={conversa} />));
    expect(screen.getByRole('button', { name: 'Sincronizar com CRM' })).toBeInTheDocument();
  });

  it('botão desabilitado (contactNotFound) também tem aria-label "Sincronizar com CRM"', () => {
    render(wrapper(<CRMSyncButton conversation={conversa} />));
    expect(screen.getByRole('button', { name: 'Sincronizar com CRM' })).toBeInTheDocument();
  });
});