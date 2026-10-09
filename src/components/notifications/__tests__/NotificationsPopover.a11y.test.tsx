/**
 * Y18-2 (SHELL-07) — popover de notificações do desktop (`NotificationsPopover`).
 *
 * O `PopoverContent` do Radix já nasce com `role="dialog"`, mas SEM nome acessível: a
 * auditoria Y18 (2026-10-07, 1280×800) mediu `aria-dialog-name` [serious] nos 3 combos
 * de tema ("aria-label attribute does not exist or is empty / aria-labelledby … does
 * not exist"). O título do próprio componente (`<h3>Notificações</h3>`) já existia — o
 * que faltava era ligá-lo ao diálogo por `aria-labelledby`.
 *
 * O teste abre o popover REAL (Radix de verdade, sem mock do `@/components/ui/popover`)
 * pelo clique no gatilho e cobra o nome acessível resolvido pelo título.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { Notification } from '@/hooks/system/useNotifications';

const fonte = vi.hoisted(() => ({
  notifications: [] as unknown[],
  unreadCount: 0,
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  loading: false,
}));

vi.mock('@/hooks/system/useNotifications', () => ({
  useNotifications: () => fonte,
}));

import { NotificationsPopover } from '../NotificationsPopover';

const NAO_LIDA: Notification = {
  id: 'n-1',
  user_id: 'user-1',
  title: 'Nova conversa atribuída',
  message: 'Ana começou uma conversa com você',
  type: 'info',
  is_read: false,
  metadata: {},
  created_at: '2026-10-06T12:00:00.000Z',
  read_at: null,
};

function abrir() {
  render(<NotificationsPopover />);
  fireEvent.click(screen.getByRole('button', { name: /^Notificações/ }));
}

describe('SHELL-07 — o popover de notificações do desktop é um diálogo com nome', () => {
  it('o diálogo é anunciado pelo título "Notificações"', async () => {
    fonte.notifications = [NAO_LIDA];
    fonte.unreadCount = 1;

    abrir();

    const dialogo = await screen.findByRole('dialog', { name: 'Notificações' });
    const id = dialogo.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe('Notificações');
  });

  it('o axe não acusa `aria-dialog-name` com o popover aberto', async () => {
    fonte.notifications = [];
    fonte.unreadCount = 0;

    abrir();
    await screen.findByRole('dialog', { name: 'Notificações' });

    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'aria-dialog-name')).toEqual([]);
  });
});
