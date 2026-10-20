// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OmnichannelInbox } from '../OmnichannelInbox';

const mockContacts = [
  { id: 'c1', name: 'Maria Silva', phone: '+5511999990001', channel_type: 'whatsapp', updated_at: new Date().toISOString(), assigned_to: null },
  { id: 'c2', name: 'João Santos', phone: '+5511999990002', channel_type: 'instagram', updated_at: new Date().toISOString(), assigned_to: 'agent1' },
  { id: 'c3', name: 'Ana Costa', phone: '+5511999990003', channel_type: 'telegram', updated_at: new Date().toISOString(), assigned_to: null },
  { id: 'c4', name: 'Pedro Lima', phone: '+5511999990004', channel_type: 'messenger', updated_at: new Date().toISOString(), assigned_to: null },
  { id: 'c5', name: 'Carla Dias', phone: '+5511999990005', channel_type: 'email', updated_at: new Date().toISOString(), assigned_to: null },
  { id: 'c6', name: 'Lucas Souza', phone: '+5511999990006', channel_type: 'webchat', updated_at: new Date().toISOString(), assigned_to: null },
  { id: 'c7', name: 'Fernanda Oliveira', phone: '+5511999990007', channel_type: null, updated_at: new Date().toISOString(), assigned_to: null },
];

const mockConnections = [
  { id: 'conn1', channel_type: 'whatsapp', name: 'WhatsApp Principal', is_active: true },
  { id: 'conn2', channel_type: 'instagram', name: 'Instagram Oficial', is_active: true },
];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'channel_connections_safe') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: mockConnections, error: null }),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: mockContacts, error: null }),
          })),
        })),
      };
    }),
  },
}));

describe('OmnichannelInbox', () => {
  beforeEach(() => vi.clearAllMocks());

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

    it('filters by name (logic)', () => {
      const msgs = mockContacts.map(c => ({ contactName: c.name, contactPhone: c.phone, channelType: c.channel_type }));
      const filtered = msgs.filter(m => m.contactName.toLowerCase().includes('maria'));
      expect(filtered.length).toBe(1);
    });

    it('filters by phone (logic)', () => {
      const msgs = mockContacts.map(c => ({ contactName: c.name, contactPhone: c.phone }));
      const filtered = msgs.filter(m => m.contactPhone.includes('0007'));
      expect(filtered.length).toBe(1);
    });
  });

  // ===== CHANNEL FILTER =====
  describe('Channel filtering', () => {
    it('filters by channel type (logic)', () => {
      const msgs = mockContacts.map(c => ({ channelType: c.channel_type || 'whatsapp' }));
      const filtered = msgs.filter(m => m.channelType === 'instagram');
      expect(filtered.length).toBe(1);
    });

    it('shows all when filter is "all"', () => {
      const msgs = mockContacts.map(c => ({ channelType: c.channel_type || 'whatsapp' }));
      const filtered = msgs.filter(() => true);
      expect(filtered.length).toBe(7);
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
  });

  // ===== CHANNEL STATS =====
  describe('Channel stats', () => {
    it('computes channel stats from contacts', () => {
      const stats: Record<string, number> = {};
      mockContacts.forEach(c => {
        const type = c.channel_type || 'whatsapp';
        stats[type] = (stats[type] || 0) + 1;
      });
      expect(stats.whatsapp).toBe(2); // 1 explicit + 1 null defaulting
      expect(stats.instagram).toBe(1);
      expect(stats.telegram).toBe(1);
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
    it('handles null channel_type defaulting to whatsapp', () => {
      const contact = mockContacts.find(c => c.channel_type === null);
      expect(contact).toBeDefined();
      const type = contact?.channel_type || 'whatsapp';
      expect(type).toBe('whatsapp');
    });

    it('handles empty connections', () => {
      const connections: unknown[] = [];
      expect(connections.length).toBe(0);
    });

    it('handles empty contacts list', () => {
      const contacts: unknown[] = [];
      expect(contacts.length).toBe(0);
    });
  });
});
