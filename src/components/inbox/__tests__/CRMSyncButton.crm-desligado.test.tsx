/**
 * Sem CRM configurado o botão manual não podia sumir sem explicação
 * (`CRMAutoSync.tsx`: `if (!isConfigured) return null`). Agora ele fica
 * DESABILITADO, com a dica 'CRM não configurado' no tooltip e no `aria-label`.
 *
 * [refazer 1] Um `<button disabled>` não recebe foco nem dispara hover, e o
 * Tooltip do Radix abre pelo TRIGGER: o motivo ("CRM não configurado") ficava
 * inalcançável por teclado. O botão passa a vir dentro do mesmo wrapper focável
 * do `Tile` (`contact-details/ContactActionButtons.tsx:119-126`):
 * `tabIndex=0`, `role=button`, `aria-disabled=true`, `aria-label`. Os testes
 * abaixo medem exatamente esse wrapper (não o texto do tooltip, que é o mesmo).
 *
 * O tooltip é desmontado neste teste (mesmo padrão de
 * `contact-details/__tests__/ContactActionButtons.test.tsx`): o Radix só põe o
 * conteúdo no DOM quando o tooltip abre, e o que se prova aqui é o texto
 * declarado + o nome acessível do botão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { axe } from 'vitest-axe';

const crmMock = vi.hoisted(() => ({
  isConfigured: false,
  syncConversationAsync: vi.fn(),
}));

vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({
    syncConversationAsync: crmMock.syncConversationAsync,
    isSyncing: false,
    isConfigured: crmMock.isConfigured,
    lastResult: undefined,
  }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span data-testid="crm-sync-tooltip">{children}</span>,
}));

import { CRMSyncButton } from '../CRMAutoSync';

const conversation = { id: 'conv-1', status: 'open', contact: { id: 'c1', name: 'Contato' } } as never;

/** O <button> real que carrega o estado desabilitado. */
function botaoReal() {
  return screen.getByTestId('crm-sync-button');
}

describe('CRMSyncButton — CRM desligado', () => {
  beforeEach(() => {
    crmMock.isConfigured = false;
    crmMock.syncConversationAsync.mockReset();
  });

  it('fica desabilitado, com dica e nome acessível "CRM não configurado"', () => {
    render(<CRMSyncButton conversation={conversation} />);

    const botao = botaoReal();
    expect(botao).toBeDisabled();
    expect(botao).toHaveAccessibleName('CRM não configurado');
    expect(screen.getByTestId('crm-sync-tooltip')).toHaveTextContent('CRM não configurado');
  });

  it('o botão desabilitado fica focável: o tooltip abre pelo wrapper com tabIndex=0', () => {
    render(<CRMSyncButton conversation={conversation} />);

    // O <button> real não pode receber foco quando disabled — o Radix liga o
    // Tooltip ao trigger, então sem um wrapper focável o motivo nunca aparece
    // para quem usa só o teclado.
    const wrapper = botaoReal().closest('[tabindex="0"]');
    expect(wrapper).not.toBeNull();
    expect(botaoReal()).toHaveAttribute('disabled');

    (wrapper as HTMLElement).focus();
    expect(wrapper).toHaveFocus();
  });

  it('o wrapper focável tem role=button, aria-disabled e aria-label (WCAG 4.1.2)', () => {
    render(<CRMSyncButton conversation={conversation} />);

    const wrapper = botaoReal().closest('[tabindex="0"]') as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('role', 'button');
    expect(wrapper).toHaveAttribute('aria-disabled', 'true');
    expect(wrapper).toHaveAttribute('aria-label', 'CRM não configurado');
  });

  it('axe sem violações', async () => {
    const { container } = render(<CRMSyncButton conversation={conversation} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('CRMSyncButton — contato não encontrado no CRM', () => {
  beforeEach(() => {
    crmMock.isConfigured = true;
    crmMock.syncConversationAsync.mockReset();
  });

  it('o botão desabilitado também fica focável e explica o motivo', async () => {
    crmMock.syncConversationAsync.mockResolvedValue({ reason: 'contact_not_found' });
    render(<CRMSyncButton conversation={conversation} />);

    fireEvent.click(botaoReal());
    await waitFor(() => expect(botaoReal()).toBeDisabled());

    const wrapper = botaoReal().closest('[tabindex="0"]') as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveAttribute('aria-label', 'Contato não encontrado no CRM');
    expect(screen.getByTestId('crm-sync-tooltip')).toHaveTextContent('Contato não encontrado no CRM');
  });
});
