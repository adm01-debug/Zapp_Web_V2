/**
 * PE-57 — o menu de mensagem não pode oferecer "Status/Story" a quem o servidor
 * vai negar, e a publicação precisa avisar o alcance.
 *
 * `send-status` publica para TODA a base da conexão (não tem contato-alvo) e o
 * servidor só aceita admin/supervisor (R2EXT-STATUS). Antes, o item aparecia
 * para todo atendente e o clique terminava em erro do servidor.
 *
 * Contrato exigido:
 *  - agente comum NÃO vê o item "Status/Story" (nenhum botão que o servidor nega);
 *  - admin ou supervisor VÊ o item; ao publicar, aparece a confirmação
 *    "isso aparece para todos os seus contatos" ANTES de qualquer envio;
 *  - `sendStatusMessage` só é chamado depois da confirmação explícita.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { toastMock, sendStatusMessageMock, papeis } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  sendStatusMessageMock: vi.fn().mockResolvedValue(undefined),
  papeis: { value: [] as string[] },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ sendStatusMessage: sendStatusMessageMock, isLoading: false }),
}));

// Espelha o useUserRole real: `isSupervisor` já inclui admin.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    isSupervisor: papeis.value.includes('admin') || papeis.value.includes('supervisor'),
    hasRole: (r: string) => papeis.value.includes(r),
  }),
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue(undefined),
  sendRichOutboundMessage: vi.fn().mockResolvedValue(undefined),
}));

// UI: render determinístico, sem portal do Radix.
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { AdvancedMessageMenu } from '@/components/inbox/AdvancedMessageMenu';

function renderMenu() {
  return render(
    <AdvancedMessageMenu
      contactId="50000000-0000-0000-0000-000000000001"
      instanceName="wpp1"
      recipientNumber="5511999999999"
    />,
  );
}

describe('AdvancedMessageMenu — Status/Story só para admin/supervisor (PE-57)', () => {
  beforeEach(() => {
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    sendStatusMessageMock.mockReset();
    sendStatusMessageMock.mockResolvedValue(undefined);
  });

  it('agente comum não vê o item Status/Story e nada é enviado', () => {
    papeis.value = ['agent'];
    renderMenu();

    expect(screen.getByText('Figurinha')).toBeTruthy();
    expect(screen.getByText('Enquete')).toBeTruthy();
    expect(screen.queryByText('Status/Story')).toBeNull();
    expect(sendStatusMessageMock).not.toHaveBeenCalled();
  });

  it('supervisor vê o item e só publica depois da confirmação de alcance', async () => {
    papeis.value = ['supervisor'];
    renderMenu();

    fireEvent.click(screen.getByText('Status/Story'));
    fireEvent.change(screen.getByPlaceholderText('Seu status aqui...'), {
      target: { value: 'Promoção de hoje' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Publicar$/ }));

    // Sem confirmação ainda: nada foi para o servidor.
    expect(sendStatusMessageMock).not.toHaveBeenCalled();
    expect(screen.getByText(/aparece para todos os seus contatos/i)).toBeTruthy();

    const confirmar = screen.getAllByRole('button', { name: 'Publicar' }).at(-1)!;
    fireEvent.click(confirmar);

    await waitFor(() =>
      expect(sendStatusMessageMock).toHaveBeenCalledWith('wpp1', {
        type: 'text',
        content: 'Promoção de hoje',
      }),
    );
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('admin (que o useUserRole trata como supervisor) também vê o item', () => {
    papeis.value = ['admin'];
    renderMenu();

    expect(screen.getByText('Status/Story')).toBeTruthy();
  });
});
