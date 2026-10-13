import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CRMSyncButton } from '../CRMAutoSync';

const sync = vi.hoisted(() => ({ impl: vi.fn(async () => ({ reason: 'ok' })) }));

vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({
    syncConversationAsync: sync.impl,
    isSyncing: false,
    isConfigured: true,
    lastResult: null,
  }),
}));

type AnyProps = Record<string, unknown> & { children?: ReactNode };
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: AnyProps) => <>{children}</>,
  TooltipTrigger: ({ children }: AnyProps) => <>{children}</>,
  TooltipContent: ({ children }: AnyProps) => <>{children}</>,
}));

const conversation = {
  id: 'c1',
  status: 'open',
  contact: { id: 'ct1', name: 'Ana', conversation_status: 'open' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('CRMSyncButton — botão só de ícone com nome acessível (A11Y-13)', () => {
  beforeEach(() => {
    sync.impl.mockReset();
    sync.impl.mockResolvedValue({ reason: 'ok' });
  });

  it('nomeia o botão de sincronizar por padrão', () => {
    render(<CRMSyncButton conversation={conversation} />);
    expect(screen.getByRole('button', { name: 'Sincronizar com CRM externo' })).toBeInTheDocument();
  });

  it('nomeia o botão desabilitado quando o contato não existe no CRM', async () => {
    sync.impl.mockResolvedValue({ reason: 'contact_not_found' });
    render(<CRMSyncButton conversation={conversation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar com CRM externo' }));

    const botao = await screen.findByRole('button', { name: 'Contato não encontrado no CRM' });
    expect(botao).toBeDisabled();
  });
});
