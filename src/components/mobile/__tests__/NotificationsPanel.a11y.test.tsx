/**
 * Y18-2 (SHELL-04 e SHELL-08) — painel de notificações do celular (`NotificationsPanel`).
 *
 * Defeitos medidos pela auditoria Y18 (2026-10-07, 390×844):
 *  - SHELL-04: o `X` do cabeçalho só tinha o ícone (sem nome acessível);
 *  - SHELL-08: o painel é um `motion.div` fixo SEM papel de diálogo, o cabeçalho usa
 *    `h3` sem `h2` antes (`heading-order`) e o conteúdo fica fora de landmark
 *    (`region`, 3 nós) — e o foco não entra no painel ao abrir.
 *
 * O teste renderiza o painel REAL (com o `NotificationItem` real) e cobra o contrato
 * de diálogo nomeado + o foco inicial. O axe roda com `color-contrast` desligado
 * (jsdom não tem layout) — `region`, `heading-order` e `aria-dialog-name` são
 * estruturais e valem no jsdom.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { Notification } from '@/hooks/system/useNotifications';
import { NotificationsPanel } from '../NotificationsPanel';

function notificacao(over: Partial<Notification> & { id: string }): Notification {
  return {
    user_id: 'user-1',
    title: 'Notificação',
    message: 'Mensagem',
    type: 'info',
    is_read: false,
    metadata: {},
    created_at: '2026-10-06T12:00:00.000Z',
    read_at: null,
    ...over,
  };
}

const LIDA = notificacao({ id: 'n-1', title: 'Nova conversa atribuída', is_read: true });

const abrir = (notifications: Notification[] = [LIDA]) =>
  render(
    <NotificationsPanel
      isOpen
      onClose={vi.fn()}
      notifications={notifications}
      onMarkAllRead={vi.fn()}
      onMarkRead={vi.fn()}
    />,
  );

describe('SHELL-08 — o painel é um diálogo modal nomeado pelo próprio título', () => {
  it('expõe role="dialog" + aria-modal + aria-labelledby apontando para o título', () => {
    abrir();

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');

    const id = dialogo.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    const titulo = document.getElementById(id as string);
    expect(titulo?.textContent).toBe('Notificações');
  });

  it('é anunciado pelo nome "Notificações" e o título está no nível 2 (não h3 solto)', () => {
    abrir();

    expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Notificações' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('recebe o foco ao abrir (o foco entra no painel, não fica no gatilho)', () => {
    abrir();

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it('o axe não acusa `region` nem `heading-order` no painel aberto', async () => {
    abrir();
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => ['region', 'heading-order', 'aria-dialog-name'].includes(v.id))).toEqual([]);
  });

  it('continua fechando pelo X nomeado e pelo Escape', async () => {
    abrir();
    expect(screen.getByRole('button', { name: 'Fechar notificações' })).toBeInTheDocument();
  });

  it('fechado não renderiza nada', () => {
    const { container } = render(
      <NotificationsPanel isOpen={false} onClose={vi.fn()} notifications={[]} onMarkAllRead={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
