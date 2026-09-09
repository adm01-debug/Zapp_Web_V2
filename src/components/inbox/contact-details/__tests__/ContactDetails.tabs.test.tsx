import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { Conversation } from '@/types/chat';

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
      ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>,
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/hooks/crm/useContactEnrichedData', () => ({
  useContactEnrichedData: () => ({ enrichedData: null, aiTags: [], slaInfo: null }),
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({ profileId: 'profile-1' }),
}));
vi.mock('../EditContactDialog', () => ({ EditContactDialog: () => null }));
vi.mock('../ContactHeaderSection', () => ({
  ContactHeaderSection: ({ isCompact }: { isCompact?: boolean }) => (
    <div data-testid={isCompact ? 'contact-header-compact' : 'contact-header-full'} />
  ),
}));
vi.mock('../ContactAccordionSections', () => ({
  ContactAccordionSections: () => <div data-testid="contact-sections" />,
}));
vi.mock('../../ConversationHistory', () => ({ ConversationHistory: () => <div>Conteúdo histórico</div> }));
vi.mock('../../ConversationTasksPanel', () => ({ ConversationTasksPanel: () => <div>Conteúdo tarefas</div> }));
vi.mock('../../RemindersPanel', () => ({ RemindersPanel: () => <div>Lembretes</div> }));
vi.mock('../../PrivateNotes', () => ({ PrivateNotes: () => <div>Conteúdo notas</div> }));
vi.mock('../../MediaGallery', () => ({ MediaGalleryContent: () => <div>Conteúdo arquivos</div> }));

import { ContactDetails } from '../../ContactDetails';

function conversation(contactId = 'contact-1'): Conversation {
  return {
    id: `conversation-${contactId}`,
    contact: {
      id: contactId,
      name: 'Contato Teste',
      phone: '5511999999999',
      avatar: null,
      email: null,
      tags: [],
    },
    messages: [],
    tags: [],
    unreadCount: 0,
    status: 'open',
    priority: 'medium',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  } as unknown as Conversation;
}

describe('ContactDetails tabbed panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('renders five reachable tabs and a viewport-safe width', () => {
    render(<ContactDetails conversation={conversation()} onClose={vi.fn()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    const panel = screen.getByTestId('contact-panel');
    expect(panel.className).toContain('w-full');
    expect(panel.className).toContain('max-w-full');
    expect(panel.className).toContain('sm:w-[380px]');
    expect(screen.getByTestId('contact-panel-tabs').className).toContain('overflow-x-auto');
  });

  it('keeps the full header in the scroller and the compact header outside it', async () => {
    render(<ContactDetails conversation={conversation()} onClose={vi.fn()} />);
    const scroll = screen.getByTestId('contact-panel-scroll');
    expect(scroll.contains(screen.getByTestId('contact-header-full'))).toBe(true);

    Object.defineProperty(scroll, 'scrollTop', { configurable: true, value: 220 });
    fireEvent.scroll(scroll);

    const compact = screen.getByTestId('contact-header-compact');
    expect(scroll.contains(compact)).toBe(false);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Histórico' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.queryByTestId('contact-header-compact')).toBeNull());
  });

  it('opens Notes from the keyboard shortcut and resets to Contact on contact change', async () => {
    const { rerender } = render(<ContactDetails conversation={conversation()} onClose={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    await screen.findByText('Conteúdo notas');
    expect(screen.getByRole('tab', { name: 'Notas' })).toHaveAttribute('data-state', 'active');

    rerender(<ContactDetails conversation={conversation('contact-2')} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Contato' })).toHaveAttribute('data-state', 'active'));
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
  });
});
