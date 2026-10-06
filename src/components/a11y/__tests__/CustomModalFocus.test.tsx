import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { MobileDrawerMenu } from '@/components/mobile/MobileDrawerMenu';

vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ roles: ['admin'], permissions: ['*'] }),
}));

function WelcomeHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir boas-vindas</button>
      <button>Controle externo</button>
      <WelcomeModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onStartTour={() => setOpen(false)}
        userName="Ana"
      />
    </>
  );
}

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir menu</button>
      <button>Controle externo</button>
      <MobileDrawerMenu
        isOpen={open}
        onClose={() => setOpen(false)}
        currentView="dashboard"
        onViewChange={vi.fn()}
        agentName="Ana"
      />
    </>
  );
}

async function proveModalFocusContract(openLabel: string, dialogName: RegExp) {
  const trigger = screen.getByRole('button', { name: openLabel });
  const external = screen.getByRole('button', { name: 'Controle externo' });
  // fireEvent.click não aplica o foco nativo que um clique real aplica no browser.
  trigger.focus();
  fireEvent.click(trigger);

  const dialog = await screen.findByRole('dialog', { name: dialogName });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

  expect(external.closest('[aria-hidden="true"]')).not.toBeNull();
  external.focus();
  await waitFor(() => {
    expect(external).not.toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: dialogName })).not.toBeInTheDocument()
  );
  await waitFor(() => expect(trigger).toHaveFocus());
}

describe('contrato de foco dos modais próprios', () => {
  it('WelcomeModal move, contém e devolve o foco e fecha com Escape', async () => {
    render(<WelcomeHarness />);
    await proveModalFocusContract('Abrir boas-vindas', /bem-vindo/i);
  });

  it('MobileDrawerMenu move, contém e devolve o foco e fecha com Escape', async () => {
    render(<DrawerHarness />);
    await proveModalFocusContract('Abrir menu', /menu de navegação/i);
  });
});
