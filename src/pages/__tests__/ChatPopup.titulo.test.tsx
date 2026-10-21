/**
 * Título da aba da janela destacada do chat.
 *
 * O popup escrevia `document.title = "Chat — <nome>"` com um literal solto: sem
 * o nome do produto, a janela destoava do resto da aplicação (e do `index.html`,
 * que já diz "ZAPP WEB"). Aqui o título passa a vir da mesma constante de
 * `@/lib/productName` usada por `useDocumentTitle` — este teste prende o
 * contrato (nome do produto no fim, uma constante só).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CONTACT_ID = 'contato-popup-1';

const mocks = vi.hoisted(() => ({
  messages: {} as Record<string, unknown>,
  contactId: '' as string,
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => mocks.messages,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useParams: () => ({ contactId: mocks.contactId }) };
});

const CONTACT_ROW = {
  id: CONTACT_ID,
  name: 'Maria Silva',
  phone: '+551****9999',
  avatar_url: null,
  email: null,
  tags: [],
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ai_priority: null,
  status: 'open',
  last_message: 'oi',
  unread_count: 0,
  assigned_to: null,
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: CONTACT_ROW, error: null }) }) }),
    }),
    storage: {
      from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }),
    },
  },
}));
vi.mock('@/hooks/realtime/messageSender', () => ({ sendMessageToContact: vi.fn() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
// O alvo é o `document.title` escrito antes de montar o painel do chat; o ChatPanel
// (lazy) entra como marcador para o teste não carregar a lista inteira.
vi.mock('@/components/inbox/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

import { PRODUCT_NAME, formatDocumentTitle } from '@/lib/productName';
import ChatPopup from '../ChatPopup';

const ESPERA = { timeout: 3000, interval: 50 };

function buildUi() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ChatPopup />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = PRODUCT_NAME;
  mocks.contactId = CONTACT_ID;
  mocks.messages = {
    messages: [],
    loading: false,
    error: null,
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(),
    refetch: vi.fn(async () => {}),
  };
});

describe('ChatPopup — título da janela', () => {
  it('identifica a conversa pelo nome do contato e assina com o nome do produto', async () => {
    render(buildUi());

    await waitFor(() => expect(document.title).toBe(formatDocumentTitle('Chat — Maria Silva')), ESPERA);
    expect(document.title).toBe('Chat — Maria Silva | ZAPP WEB');
    expect(document.title).not.toContain('WhatsApp Omnichannel');
  });
});
