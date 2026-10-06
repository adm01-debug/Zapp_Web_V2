import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OmnichannelInbox } from '../OmnichannelInbox';

// R2-API-064 — a tela projetava cadastros (contacts, 200 por updated_at) como se
// fossem conversas: sem última mensagem, sem não lidas, sem abrir a conversa.
// Estes testes provam que a tela consome a projeção canônica de conversas, abre a
// conversa da linha e busca no universo de contatos (não só na amostra carregada).

const h = vi.hoisted(() => {
  const makeChain = (resolve: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'or', 'in', 'order', 'limit', 'not']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled);
    return chain;
  };

  return {
    makeChain,
    state: {
      connections: [] as unknown[],
      contactsResult: { data: [] as unknown[], error: null as unknown },
      messagesResult: { data: [] as unknown[], error: null as unknown },
      lastContactsQuery: null as Record<string, ReturnType<typeof vi.fn>> | null,
      openContactChat: vi.fn(),
      fetchInitialConversations: vi.fn(),
    },
  };
});

vi.mock('@/components/catalog/useSendProduct', () => ({
  openContactChat: h.state.openContactChat,
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: { fetchInitialConversations: h.state.fetchInitialConversations },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'channel_connections_safe') {
        return h.makeChain(() => ({ data: h.state.connections, error: null }));
      }
      if (table === 'contacts') {
        const chain = h.makeChain(() => h.state.contactsResult);
        h.state.lastContactsQuery = chain as Record<string, ReturnType<typeof vi.fn>>;
        return chain;
      }
      return h.makeChain(() => h.state.messagesResult);
    },
  },
}));

const mockConnections = [
  { id: 'conn1', channel_type: 'whatsapp', name: 'WhatsApp Principal', is_active: true },
  { id: 'conn2', channel_type: 'instagram', name: 'Instagram Oficial', is_active: true },
];

const contact = (over: Record<string, unknown>) => ({
  id: 'c0',
  name: 'Contato',
  phone: '+5511990000000',
  channel_type: 'whatsapp',
  conversation_status: 'open',
  is_lid_legacy: false,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-02T12:00:00.000Z',
  assigned_to: null,
  ...over,
});

// Projeção canônica: conversa com última mensagem, não lidas e estado.
const sampleConversations = [
  {
    contact: contact({ id: 'c1', name: 'Maria Silva', channel_type: 'whatsapp' }),
    messages: [],
    unreadCount: 3,
    lastMessage: {
      id: 'm1',
      contact_id: 'c1',
      content: 'Pode me enviar o orçamento?',
      sender: 'contact',
      is_read: false,
      created_at: '2026-10-02T12:00:00.000Z',
    },
  },
  {
    contact: contact({
      id: 'c2',
      name: 'João Santos',
      channel_type: 'instagram',
      conversation_status: 'resolved',
    }),
    messages: [],
    unreadCount: 0,
    lastMessage: {
      id: 'm2',
      contact_id: 'c2',
      content: 'Obrigado!',
      sender: 'agent',
      is_read: true,
      created_at: '2026-10-02T09:00:00.000Z',
    },
  },
  {
    contact: contact({ id: 'c3', name: 'Ana Costa', channel_type: 'telegram' }),
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  },
  {
    contact: contact({ id: 'c4', name: 'Lid Legado', channel_type: 'whatsapp', is_lid_legacy: true }),
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  },
];

// Contato que NÃO está na amostra carregada: só aparece pela busca no banco.
const searchContactsResult = {
  data: [
    contact({
      id: 'c9',
      name: 'Zeca Fora da Amostra',
      phone: '+5511990000009',
      conversation_status: 'waiting',
    }),
  ],
  error: null,
};

const searchMessagesResult = {
  data: [
    {
      id: 'm9',
      contact_id: 'c9',
      content: 'Vim pela busca',
      sender: 'contact',
      is_read: false,
      created_at: '2026-10-03T08:00:00.000Z',
    },
  ],
  error: null,
};

describe('OmnichannelInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.connections = mockConnections;
    h.state.contactsResult = { data: [], error: null };
    h.state.messagesResult = { data: [], error: null };
    h.state.lastContactsQuery = null;
    h.state.fetchInitialConversations.mockResolvedValue(sampleConversations);
  });

  // ===== R2-API-064: PROJEÇÃO CANÔNICA DE CONVERSAS =====
  describe('Projeção canônica de conversas', () => {
    it('mostra a última mensagem de cada conversa em vez de só o cadastro', async () => {
      render(<OmnichannelInbox />);

      expect(await screen.findByText('Pode me enviar o orçamento?')).toBeInTheDocument();
      expect(screen.getByText('Obrigado!')).toBeInTheDocument();
    });

    it('marca não lidas com a contagem vinda da projeção', async () => {
      render(<OmnichannelInbox />);

      const unreadRow = await screen.findByRole('button', { name: /Abrir conversa de Maria Silva/ });
      expect(unreadRow).toHaveAccessibleName(/3 mensagens não lidas/);

      const readRow = screen.getByRole('button', { name: /Abrir conversa de João Santos/ });
      expect(readRow).toHaveAccessibleName(expect.not.stringContaining('não lidas'));
    });

    it('representa contato sem histórico sem inventar última mensagem', async () => {
      render(<OmnichannelInbox />);

      expect(await screen.findByText(/Sem mensagens ainda/)).toBeInTheDocument();
    });

    it('não lista cadastro LID legado como conversa', async () => {
      render(<OmnichannelInbox />);

      await screen.findByText('Maria Silva');
      expect(screen.queryByText('Lid Legado')).not.toBeInTheDocument();
    });

    it('declara que a lista é uma amostra de conversas recentes', async () => {
      render(<OmnichannelInbox />);

      expect(await screen.findByText(/conversas recentes/i)).toBeInTheDocument();
    });
  });

  // ===== R2-API-064: ABRIR A CONVERSA =====
  describe('Abrir conversa', () => {
    it('abre a conversa no canal correspondente ao acionar a linha', async () => {
      render(<OmnichannelInbox />);

      const row = await screen.findByRole('button', { name: /Abrir conversa de Maria Silva/ });
      fireEvent.click(row);

      expect(h.state.openContactChat).toHaveBeenCalledWith('c1');
    });

    it('abre também a conversa de contato sem histórico', async () => {
      render(<OmnichannelInbox />);

      const row = await screen.findByRole('button', { name: /Abrir conversa de Ana Costa/ });
      fireEvent.click(row);

      expect(h.state.openContactChat).toHaveBeenCalledWith('c3');
    });
  });

  // ===== R2-API-064: BUSCA NO UNIVERSO, NÃO SÓ NA AMOSTRA =====
  describe('Busca no universo de contatos', () => {
    it('consulta o banco por nome/telefone quando a busca é digitada', async () => {
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      fireEvent.change(screen.getByPlaceholderText(/Buscar por nome ou telefone/), {
        target: { value: 'Zeca' },
      });

      await waitFor(() => {
        const query = h.state.lastContactsQuery;
        expect(query?.or).toHaveBeenCalled();
        expect(query?.or.mock.calls[0][0]).toContain('name.ilike.%Zeca%');
        expect(query?.or.mock.calls[0][0]).toContain('phone.ilike.%Zeca%');
      });
    });

    it('mostra contato que está fora da amostra carregada, com a última mensagem', async () => {
      h.state.contactsResult = searchContactsResult;
      h.state.messagesResult = searchMessagesResult;

      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      fireEvent.change(screen.getByPlaceholderText(/Buscar por nome ou telefone/), {
        target: { value: 'Zeca' },
      });

      expect(await screen.findByText('Zeca Fora da Amostra')).toBeInTheDocument();
      expect(await screen.findByText('Vim pela busca')).toBeInTheDocument();
    });
  });

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders title', async () => {
      render(<OmnichannelInbox />);
      expect(screen.getByText('Inbox Omnichannel')).toBeInTheDocument();
    });

    it('renders subtitle with channel count', async () => {
      render(<OmnichannelInbox />);
      await waitFor(() => {
        expect(screen.getByText(/Todas as conversas/)).toBeInTheDocument();
      });
    });

    it('renders update button', () => {
      render(<OmnichannelInbox />);
      expect(screen.getByText('Atualizar')).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(<OmnichannelInbox />);
      expect(screen.getByPlaceholderText(/Buscar por nome ou telefone/)).toBeInTheDocument();
    });

    it('renders all 6 channel cards', () => {
      render(<OmnichannelInbox />);
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Instagram')).toBeInTheDocument();
      expect(screen.getByText('Telegram')).toBeInTheDocument();
      expect(screen.getByText('Messenger')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Webchat')).toBeInTheDocument();
    });

    it('renders conversations section', async () => {
      render(<OmnichannelInbox />);
      await waitFor(() => {
        expect(screen.getByText(/Conversas/)).toBeInTheDocument();
      });
    });

    it('renders connected channels section', () => {
      render(<OmnichannelInbox />);
      expect(screen.getByText('Canais Conectados')).toBeInTheDocument();
    });
  });

  // ===== CHANNEL CONFIG =====
  describe('Channel configuration', () => {
    const CHANNEL_CONFIG = {
      whatsapp: { label: 'WhatsApp', color: 'text-green-500' },
      instagram: { label: 'Instagram', color: 'text-pink-500' },
      telegram: { label: 'Telegram', color: 'text-blue-400' },
      messenger: { label: 'Messenger', color: 'text-blue-600' },
      email: { label: 'Email', color: 'text-yellow-500' },
      webchat: { label: 'Webchat', color: 'text-purple-500' },
    };

    it('has 6 channel types', () => expect(Object.keys(CHANNEL_CONFIG).length).toBe(6));

    Object.entries(CHANNEL_CONFIG).forEach(([type, config]) => {
      it(`${type} has label ${config.label}`, () => expect(config.label).toBeTruthy());
      it(`${type} has color`, () => expect(config.color).toBeTruthy());
    });
  });

  // ===== CHANNEL FILTER =====
  describe('Channel filtering', () => {
    it('filters by channel type (logic)', () => {
      const msgs = [
        { channelType: 'whatsapp' },
        { channelType: 'instagram' },
        { channelType: 'telegram' },
      ];
      const filtered = msgs.filter(m => m.channelType === 'instagram');
      expect(filtered.length).toBe(1);
    });

    it('renders clear filter button when filtered', async () => {
      render(<OmnichannelInbox />);
      await waitFor(() => screen.getByText('WhatsApp'));
      // Click a channel to filter
      const cards = screen.getAllByText('WhatsApp');
      fireEvent.click(cards[0].closest('.cursor-pointer') || cards[0]);
      await waitFor(() => {
        expect(screen.getByText('Limpar filtro')).toBeInTheDocument();
      });
    });

    it('filtra as conversas pelo canal escolhido', async () => {
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      fireEvent.click(screen.getAllByText('Telegram')[0].closest('.cursor-pointer') as Element);

      await waitFor(() => {
        expect(screen.getByText('Ana Costa')).toBeInTheDocument();
        expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
      });
    });
  });

  // ===== CHANNEL STATS =====
  describe('Channel stats', () => {
    it('computes channel stats from the conversation projection', async () => {
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');
      // 1 WhatsApp (Maria) + 1 Instagram (João) + 1 Telegram (Ana); o LID legado não conta.
      await waitFor(() => {
        expect(screen.getByText('Conversas (3)')).toBeInTheDocument();
      });
    });
  });

  // ===== CONNECTED CHANNELS =====
  describe('Connected channels display', () => {
    it('shows connection names as badges', async () => {
      render(<OmnichannelInbox />);
      await waitFor(() => {
        expect(screen.getByText('WhatsApp Principal')).toBeInTheDocument();
        expect(screen.getByText('Instagram Oficial')).toBeInTheDocument();
      });
    });
  });

  // ===== CONTACT AVATAR =====
  describe('Contact avatar', () => {
    it('shows first 2 chars uppercase', () => {
      const name = 'Maria Silva';
      const initials = name.substring(0, 2).toUpperCase();
      expect(initials).toBe('MA');
    });

    it('handles single char name', () => {
      const name = 'M';
      const initials = name.substring(0, 2).toUpperCase();
      expect(initials).toBe('M');
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('handles empty conversations list', async () => {
      h.state.fetchInitialConversations.mockResolvedValue([]);
      render(<OmnichannelInbox />);
      expect(await screen.findByText('Nenhuma conversa encontrada')).toBeInTheDocument();
    });

    it('handles empty connections', async () => {
      h.state.connections = [];
      render(<OmnichannelInbox />);
      expect(await screen.findByText('Nenhum canal adicional conectado')).toBeInTheDocument();
    });
  });
});
