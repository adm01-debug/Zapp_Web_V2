/**
 * Sem CRM configurado o botão manual não podia sumir sem explicação
 * (`CRMAutoSync.tsx`: `if (!isConfigured) return null`). Agora ele fica
 * DESABILITADO, com a dica 'CRM não configurado' no tooltip e no `aria-label`.
 *
 * O tooltip é desmontado neste teste (mesmo padrão de
 * `contact-details/__tests__/ContactActionButtons.test.tsx`): o Radix só põe o
 * conteúdo no DOM quando o tooltip abre, e o que se prova aqui é o texto
 * declarado + o nome acessível do botão.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { axe } from 'vitest-axe';

vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false, lastResult: undefined }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span data-testid="crm-sync-tooltip">{children}</span>,
}));

import { CRMSyncButton } from '../CRMAutoSync';

const conversation = { id: 'conv-1', status: 'open', contact: { id: 'c1', name: 'Contato' } } as never;

describe('CRMSyncButton — CRM desligado', () => {
  it('fica desabilitado, com dica e nome acessível "CRM não configurado"', () => {
    render(<CRMSyncButton conversation={conversation} />);

    const botao = screen.getByRole('button', { name: 'CRM não configurado' });
    expect(botao).toBeDisabled();
    expect(screen.getByTestId('crm-sync-tooltip')).toHaveTextContent('CRM não configurado');
  });

  it('axe sem violações', async () => {
    const { container } = render(<CRMSyncButton conversation={conversation} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
