import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * Regressão do bug: "clicar no botão de detalhes do contato abre a
 * Galeria de Mídia por cima da tela".
 *
 * Causa raiz: MediaGallery era renderizado dentro da seção "Mídia
 * Compartilhada" do accordion de detalhes como um Dialog modal com
 * open travado em true e onOpenChange vazio — quando a seção
 * expandia, o overlay cobria tudo e o X não fechava. A correção
 * separa o corpo da galeria (inline) do wrapper de diálogo opcional.
 */

// ---- mocks (padrão do repo: ver ImagePreviewDownload.test.tsx) ----

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLDivElement>) =>
      React.createElement('div', { ...filterDomProps(props), ref }, children)),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
}));

function filterDomProps(props: Record<string, unknown>) {
  const { whileHover, whileTap, initial, animate, exit, transition, ...rest } = props;
  return rest;
}

const mockMessages = [
  { id: 'm1', media_url: 'https://example.com/foto.jpg', message_type: 'image', content: 'primeira', created_at: '2026-09-01T10:00:00Z' },
  { id: 'm2', media_url: 'https://example.com/doc.pdf', message_type: 'document', content: 'segunda', created_at: '2026-09-01T11:00:00Z' },
];

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockMessages, isLoading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('@/hooks/storage/useResolvedStorageUrl', () => ({
  useResolvedStorageUrl: (url: string) => ({ url, isLoading: false, refresh: vi.fn() }),
}));

vi.mock('@/components/ui/accordion', async () => {
  const React = await import('react');
  return {
    Accordion: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
    AccordionItem: ({ children, value }: { children: React.ReactNode; value?: string }) => React.createElement('div', { 'data-item': value }, children),
    AccordionTrigger: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
    AccordionContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  };
});

vi.mock('@/integrations/supabase/externalClient', () => ({ isExternalConfigured: false }));

vi.mock('@/hooks/crm/useContactEnrichedData', () => ({
  useContactEnrichedData: () => ({ enrichedData: null, aiTags: [], slaInfo: null }),
}));

vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({ profileId: null }),
}));

vi.mock('@/components/contacts/CustomFieldsSection', () => ({ CustomFieldsSection: () => null }));
vi.mock('../../PrivateNotes', () => ({ PrivateNotes: () => null }));
vi.mock('../../ConversationHistory', () => ({ ConversationHistory: () => null }));
vi.mock('../../ConversationTasksPanel', () => ({ ConversationTasksPanel: () => null }));
vi.mock('../../RemindersPanel', () => ({ RemindersPanel: () => null }));
vi.mock('../../ConversationMemoryPanel', () => ({ ConversationMemoryPanel: () => null }));
vi.mock('../../LeadRiskScorePanel', () => ({ LeadRiskScorePanel: () => null }));
vi.mock('../../ContactPurchasesPanel', () => ({ ContactPurchasesPanel: () => null }));
vi.mock('../../ConversationTimeline', () => ({ ConversationTimeline: () => null }));
vi.mock('./ContactInfoSection', () => ({
  ContactInfoSection: () => React.createElement('div', { 'data-testid': 'info-section-stub' }, 'info'),
}));
vi.mock('./AssignmentSection', () => ({ AssignmentSection: () => null }));
vi.mock('./ContactStatsSection', () => ({ ContactStatsSection: () => null }));
vi.mock('./SLAAndAITagsSection', () => ({ SLAAndAITagsSection: () => null }));
vi.mock('./ExternalContact360Panel', () => ({ ExternalContact360Panel: () => null }));
vi.mock('./ContactIntelligencePanel', () => ({ ContactIntelligencePanel: () => null }));
vi.mock('./WhatsAppStatusSection', () => ({ WhatsAppStatusSection: () => null }));
vi.mock('./EvolutionContactProfileSection', () => ({ EvolutionContactProfileSection: () => null }));

import { ContactAccordionSections } from '@/components/inbox/contact-details/ContactAccordionSections';

const contact = {
  id: 'c1', name: 'Contato Teste', phone: '+5511999999999', avatar: null, createdAt: '2025-01-15T10:00:00Z',
  email: null, tags: [], last_seen: '2026-09-01T12:00:00Z', is_online: false, notes: null,
} as never;

const conversation = {
  id: 'conv1', contact, tags: [], unread_count: 0, last_message: null,
  status: 'open', is_pinned: false,
} as never;

function renderSections() {
  return render(
    React.createElement(ContactAccordionSections, {
      contact, conversation, enrichedData: null, aiTags: [], slaInfo: null, profileId: null,
    })
  );
}

describe('ContactDetails — Galeria de Mídia inline (regressão bug modal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('não renderiza galeria como modal/overlay quando a seção de mídia está aberta', () => {
    renderSections();
    // O bug: um Dialog modal (role=dialog) cobria a tela ao abrir Detalhes.
    expect(screen.queryByRole('dialog')).toBeNull();
    // Título da galeria agora é conteúdo INLINE da seção, não um modal.
    expect(screen.getByRole('heading', { name: /Galeria de Mídia 2 itens/ })).toBeTruthy();
  });

  it('renderiza o conteúdo da galeria inline dentro da seção de mídia', () => {
    renderSections();
    expect(screen.getByText('2 itens')).toBeTruthy();
    // imagem renderiza <img alt="foto.jpg">; documento mostra o nome como texto
    expect(screen.getByAltText('foto.jpg')).toBeTruthy();
    expect(screen.getByText('doc.pdf')).toBeTruthy();
  });

  it('wrapper de diálogo da galeria continua funcional quando controlado externamente', async () => {
    const { MediaGallery } = await import('@/components/inbox/MediaGallery');
    const onOpenChange = vi.fn();
    const { unmount } = render(React.createElement(MediaGallery, { contactId: 'c1', open: false, onOpenChange }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    render(React.createElement(MediaGallery, { contactId: 'c1', open: true, onOpenChange }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
