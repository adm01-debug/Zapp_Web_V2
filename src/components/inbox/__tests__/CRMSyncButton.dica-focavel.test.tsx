/**
 * [refazer 1] A dica do botão desabilitado tem de ABRIR de verdade.
 *
 * Aqui o Tooltip do Radix é o REAL (nenhum mock desmonta o Tooltip, ao contrário
 * de `CRMSyncButton.crm-desligado.test.tsx`): o gatilho é o wrapper focável,
 * porque um `<button disabled>` não recebe foco nem evento de ponteiro e o
 * Radix só abre o Tooltip pelo TRIGGER. Focar/passar o mouse no wrapper tem de
 * revelar 'CRM não configurado'.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({
    syncConversationAsync: vi.fn(),
    isSyncing: false,
    isConfigured: false,
    lastResult: undefined,
  }),
}));

import { CRMSyncButton } from '../CRMAutoSync';
import { TooltipProvider } from '@/components/ui/tooltip';

const conversation = { id: 'conv-1', status: 'open', contact: { id: 'c1', name: 'Contato' } } as never;

const wrapperDoBotao = () => {
  const wrapper = screen.getByTestId('crm-sync-button').closest('[tabindex="0"]') as HTMLElement | null;
  expect(wrapper).not.toBeNull();
  return wrapper as HTMLElement;
};

describe('CRMSyncButton sem CRM — a dica abre no gatilho focável (Tooltip real)', () => {
  it('ao FOCAR o wrapper o tooltip "CRM não configurado" aparece', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <CRMSyncButton conversation={conversation} />
      </TooltipProvider>,
    );

    fireEvent.focus(wrapperDoBotao());

    expect(await screen.findByRole('tooltip')).toHaveTextContent('CRM não configurado');
  });

  it('ao passar o mouse no wrapper o tooltip também aparece', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <CRMSyncButton conversation={conversation} />
      </TooltipProvider>,
    );

    fireEvent.pointerMove(wrapperDoBotao());

    expect(await screen.findByRole('tooltip')).toHaveTextContent('CRM não configurado');
  });

  // O app real envolve tudo em `AppProviders.tsx:128` com `delayDuration={300}`:
  // é essa a árvore medida aqui (o Radix exige um Provider acima do Tooltip).
  it('com o delayDuration do app (300ms) a dica abre igual ao focar o wrapper', async () => {
    render(
      <TooltipProvider delayDuration={300}>
        <CRMSyncButton conversation={conversation} />
      </TooltipProvider>,
    );

    fireEvent.focus(wrapperDoBotao());

    expect(await screen.findByRole('tooltip', undefined, { timeout: 3000 })).toHaveTextContent('CRM não configurado');
  });

  it('o <button> real segue desabilitado: quem recebe o foco é só o wrapper', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <CRMSyncButton conversation={conversation} />
      </TooltipProvider>,
    );

    const botao = screen.getByTestId('crm-sync-button');
    expect(botao).toBeDisabled();
    botao.focus();
    expect(botao).not.toHaveFocus();
    wrapperDoBotao().focus();
    expect(wrapperDoBotao()).toHaveFocus();
  });
});
