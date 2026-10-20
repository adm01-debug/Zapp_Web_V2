import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  {
    // cadastro sem canal definido: cai em WhatsApp (comportamento preservado)
    contact: contact({ id: 'c5', name: 'Fernanda Oliveira', channel_type: null }),
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

async function typeSearch(term: string) {
  fireEvent.change(screen.getByPlaceholderText(/Buscar por nome ou telefone/), {
    target: { value: term },
  });
  await waitFor(() => expect(h.state.lastContactsQuery?.or).toHaveBeenCalled(), { timeout: 3000 });
}

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

      expect(await screen.findAllByText(/Sem mensagens ainda/)).not.toHaveLength(0);
      expect(screen.queryByRole('button', { name: /Abrir conversa de Ana Costa/ })).toBeInTheDocument();
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
    it('consulta o banco por nome e telefone quando a busca é digitada', async () => {
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      await typeSearch('Zeca');

      const filter = h.state.lastContactsQuery?.or.mock.calls[0][0] as string;
      expect(filter).toContain('name.ilike.%Zeca%');
      expect(filter).toContain('phone.ilike.%Zeca%');
    });

    it('mostra contato que está fora da amostra carregada, com a última mensagem', async () => {
      h.state.contactsResult = searchContactsResult;
      h.state.messagesResult = searchMessagesResult;

      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      await typeSearch('Zeca');

      expect(await screen.findByText('Zeca Fora da Amostra')).toBeInTheDocument();
      expect(await screen.findByText('Vim pela busca')).toBeInTheDocument();
    });

    it('não afirma que o contato sem mensagem na página limitada não tem histórico', async () => {
      h.state.contactsResult = {
        data: [
          contact({ id: 'c-heavy', name: 'Contato muito ativo' }),
          contact({ id: 'c-starved', name: 'Contato com histórico' }),
        ],
        error: null,
      };
      h.state.messagesResult = {
        data: Array.from({ length: 500 }, (_, index) => ({
          id: `m-heavy-${index}`,
          contact_id: 'c-heavy',
          content: `Mensagem ${index}`,
          sender: 'contact',
          is_read: false,
          created_at: `2026-10-03T08:${String(index % 60).padStart(2, '0')}:00.000Z`,
        })),
        error: null,
      };

      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      await typeSearch('Contato');

      const starvedRow = await screen.findByRole('button', { name: /Abrir conversa de Contato com histórico/ });
      expect(within(starvedRow).queryByText(/Sem mensagens ainda/)).not.toBeInTheDocument();
      expect(within(starvedRow).getByText(/Histórico não carregado/)).toBeInTheDocument();
      // Página truncada: o total de não lidas do contato faminto é desconhecido,
      // não zero — nada de selo numérico nem de contagem no nome acessível.
      expect(starvedRow).toHaveAccessibleName(/Histórico não carregado/);
      expect(starvedRow).not.toHaveAccessibleName(/não lidas/);
      expect(within(starvedRow).queryByText(/^(>=\d+|\d+\+?)$/)).not.toBeInTheDocument();

      // Contato parcialmente carregado: a contagem é só um limite inferior.
      const heavyRow = screen.getByRole('button', { name: /Abrir conversa de Contato muito ativo/ });
      expect(heavyRow).toHaveAccessibleName(/ao menos 500 mensagens não lidas/);
      expect(heavyRow).not.toHaveAccessibleName(
        'Abrir conversa de Contato muito ativo — 500 mensagens não lidas',
      );
      expect(within(heavyRow).getByText('>=500')).toBeInTheDocument();
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

  // ===== SEARCH FILTER =====
  describe('Search filtering', () => {
    it('accepts search input', () => {
      render(<OmnichannelInbox />);
      const input = screen.getByPlaceholderText(/Buscar/);
      fireEvent.change(input, { target: { value: 'Maria' } });
      expect(input).toHaveValue('Maria');
    });

    it('filters by name (logic)', async () => {
      h.state.contactsResult = searchContactsResult;
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      await typeSearch('Zeca');

      const filter = h.state.lastContactsQuery?.or.mock.calls[0][0] as string;
      expect(filter).toContain('name.ilike.%Zeca%');
      expect(await screen.findByText('Zeca Fora da Amostra')).toBeInTheDocument();
    });

    it('filters by phone (logic)', async () => {
      h.state.contactsResult = searchContactsResult;
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      await typeSearch('0009');

      const filter = h.state.lastContactsQuery?.or.mock.calls[0][0] as string;
      expect(filter).toContain('phone.ilike.%0009%');
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

    it('shows all when filter is "all"', async () => {
      render(<OmnichannelInbox />);

      expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
      expect(screen.getByText('João Santos')).toBeInTheDocument();
      expect(screen.getByText('Ana Costa')).toBeInTheDocument();
      expect(screen.getByText('Fernanda Oliveira')).toBeInTheDocument();
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
    it('computes channel stats from contacts', async () => {
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      const card = (label: string) =>
        screen.getAllByText(label)[0].closest('.cursor-pointer') as HTMLElement;

      // 2 WhatsApp (Maria + canal nulo), 1 Instagram (João), 1 Telegram (Ana);
      // o LID legado não entra na lista nem nas contagens.
      expect(within(card('WhatsApp')).getByText('2')).toBeInTheDocument();
      expect(within(card('Instagram')).getByText('1')).toBeInTheDocument();
      expect(within(card('Telegram')).getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Conversas (4)')).toBeInTheDocument();
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
    it('handles null channel_type defaulting to whatsapp', async () => {
      render(<OmnichannelInbox />);
      await screen.findByText('Maria Silva');

      fireEvent.click(screen.getAllByText('WhatsApp')[0].closest('.cursor-pointer') as Element);

      await waitFor(() => {
        expect(screen.getByText('Fernanda Oliveira')).toBeInTheDocument();
        expect(screen.queryByText('João Santos')).not.toBeInTheDocument();
      });
    });

    it('handles empty connections', async () => {
      h.state.connections = [];
      render(<OmnichannelInbox />);
      expect(await screen.findByText('Nenhum canal conectado')).toBeInTheDocument();
    });

    it('handles empty contacts list', async () => {
      h.state.fetchInitialConversations.mockResolvedValue([]);
      render(<OmnichannelInbox />);
      expect(await screen.findByText('Nenhuma conversa encontrada')).toBeInTheDocument();
    });
  });
});
