import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import GmailInboxView from '../GmailInboxView';
import type { EmailThread, GmailAccount } from '@/hooks/integrations/useGmail';

/**
 * O filtro de status do inbox nomeava o controle com `aria-label="Filtro de
 * status"` — nome oculto, invisível na tela. A correção rotula o
 * `SelectTrigger` com `aria-labelledby` apontando para o `SelectValue`
 * visível (`id="gmail-status-filter-value"`), então o nome acessível vem do
 * conteúdo que o usuário vê (ex.: "Todos").
 *
 * COMO A PROVA É FEITA: este arquivo NÃO faz mock de
 * `@/components/ui/select` — monta o filtro Radix REAL que vai para
 * produção. `getByRole('combobox', { name: 'Todos' })` só passa quando o
 * nome vem do valor visível; com o `aria-label` antigo o nome seria "Filtro
 * de status" e a consulta falha. O `not.toHaveAttribute('aria-label')`
 * pega regressão para rotulagem oculta. O axe varre o controle real e
 * prova que a referência `aria-labelledby` resolve (sem violações).
 */

// framer-motion: AnimatePresence passes through children
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ScrollArea: simple div wrapper
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Tabs: Radix portal event system doesn't work in jsdom — use context-based async stub
vi.mock('@/components/ui/tabs', async () => {
  const { createContext, useContext, createElement: ce } = await import('react');
  type TabsCtxType = { value: string; onChange: (v: string) => void };
  const TabsCtx = createContext<TabsCtxType>({ value: '', onChange: () => {} });
  return {
    Tabs: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: ReactNode }) =>
      ce(TabsCtx.Provider, { value: { value: value ?? '', onChange: onValueChange ?? (() => {}) } },
        ce('div', {}, children)),
    TabsList: ({ children }: { children: ReactNode }) =>
      ce('div', { role: 'tablist' }, children),
    TabsTrigger: ({ value: tabValue, children }: { value: string; children: ReactNode }) => {
      const ctx = useContext(TabsCtx);
      return ce('button', {
        role: 'tab',
        'aria-selected': ctx.value === tabValue,
        onClick: () => ctx.onChange(tabValue),
      }, children);
    },
    TabsContent: ({ children }: { children: ReactNode }) =>
      ce('div', {}, children),
  };
});

// Mock EmailThreadView, EmailComposer, ThreadListItem
vi.mock('@/components/gmail/EmailThreadView', () => ({
  EmailThreadView: ({ thread, onBack }: { thread: EmailThread; onBack: () => void }) => (
    <div data-testid="thread-view" data-subject={thread.subject}>
      <button onClick={onBack}>Voltar</button>
    </div>
  ),
}));

vi.mock('@/components/gmail/EmailComposer', () => ({
  EmailComposer: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="composer">
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));

vi.mock('@/components/gmail/ThreadListItem', () => ({
  ThreadListItem: ({ thread, onClick }: { thread: EmailThread; onClick?: () => void }) => (
    <button data-testid="thread-item" data-subject={thread.subject} onClick={onClick}>
      {thread.subject || '(Sem assunto)'}
    </button>
  ),
}));

// Mutable config to control mock values across tests
const config: {
  activeAccount: GmailAccount | null;
} = {
  activeAccount: {
    id: 'acc1',
    email_address: 'eu@promobrindes.com.br',
    is_active: true,
    sync_status: 'synced',
    last_sync_at: null,
    last_error: null,
    created_at: '2026-09-04T00:00:00Z',
  },
};

vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    accounts: [],
    activeAccount: config.activeAccount,
    accountsLoading: false,
    accountsError: null,
    refetchAccounts: vi.fn(),
    threads: [],
    threadsLoading: false,
    threadsError: null,
    refetchThreads: vi.fn(),
    labels: [],
    unreadCount: 0,
    starredCount: 0,
    syncInbox: { mutate: vi.fn(), isPending: false },
    subscribeToThreads: vi.fn(() => vi.fn()),
  }),
}));

describe('a11y: filtro de status do Gmail (Select real)', () => {
  beforeEach(() => {
    config.activeAccount = {
      id: 'acc1',
      email_address: 'eu@promobrindes.com.br',
      is_active: true,
      sync_status: 'synced',
      last_sync_at: null,
      last_error: null,
      created_at: '2026-09-04T00:00:00Z',
    };
  });

  it('o combobox tem o nome do valor visível ("Todos"), sem aria-label', () => {
    render(<GmailInboxView />);
    const trigger = screen.getByRole('combobox', { name: 'Todos' });
    expect(trigger).not.toHaveAttribute('aria-label');
    const id = trigger.getAttribute('aria-labelledby');
    expect(id).toBe('gmail-status-filter-value');
    expect(document.getElementById(id!)?.textContent).toMatch(/Todos/);
  });

  it('axe: nenhuma violação no controle do filtro real', async () => {
    render(<GmailInboxView />);
    const trigger = screen.getByRole('combobox', { name: 'Todos' });
    // jsdom não tem layout: contraste fica fora (declarado). O alvo aqui é
    // a rotulagem (select-name, referência aria-labelledby resolvida).
    const results = await axe(trigger, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
