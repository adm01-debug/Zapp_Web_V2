import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * CT-38/CT-39/CT-40 (trilha telas) — "cor crua -> token" nos 6 pontos de
 * automação/integrações/omnichannel/catálogo/knowledge.
 *
 * Contrato do cartão:
 *  1. zero hex/HSL cru nos pontos citados;
 *  2. "Não conectado" igual nas 3 telas (Conexões/Integrações/Omnichannel),
 *     com `destructive` reservado à falha real;
 *  3. cores de canal em tonalidades distintas (sem 3 ícones na mesma matiz).
 *
 * A varredura lê os arquivos de produção; os renders provam o estado
 * "desconectado" do GmailIntegrationCard e do OmnichannelManager.
 */

const raiz = path.resolve(__dirname, '../../..'); // => src
const fonte = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8');

const GMAIL_CARD = 'components/integrations/GmailIntegrationCard.tsx';
const OMNICHANNEL = 'components/omnichannel/OmnichannelManager.tsx';

describe('cor crua -> token — os 6 pontos não guardam cor literal', () => {
  it('WhatsAppTemplatesManager usa .catalog-phone (tokens --wa-*), sem hsl() cru nem bg-whatsapp-dark', () => {
    const src = fonte('components/catalog/WhatsAppTemplatesManager.tsx');
    expect(src).not.toMatch(/hsl\(\s*\d/);
    expect(src).not.toMatch(/bg-whatsapp-dark/);
    expect(src).toMatch(/catalog-phone__bubble/);
  });

  it('KnowledgeBaseView não usa border-yellow-400 no selo Rascunho', () => {
    const src = fonte('components/knowledge/KnowledgeBaseView.tsx');
    expect(src).not.toMatch(/border-yellow-400/);
    expect(src).toMatch(/border-warning\/30/);
  });

  it('IntegrationsHub troca os hsl() crus das marcas por tokens e corrige o ícone do n8n', () => {
    const src = fonte('components/integrations/IntegrationsHub.tsx');
    expect(src).not.toMatch(/hsl\(\s*\d/);
    expect(src).toMatch(/text-warning-foreground/);
  });

  it('os arquivos do Gmail não pintam a marca com destructive nem bg-red-500', () => {
    const card = fonte(GMAIL_CARD);
    const inbox = fonte('components/gmail/GmailInboxView.tsx');
    expect(card).not.toMatch(/bg-red-500/);
    expect(card).not.toMatch(/text-white/);
    expect(inbox).not.toMatch(/<Mail className="w-5 h-5 text-destructive/);
    expect(inbox).toMatch(/<Mail className="w-5 h-5 text-muted-foreground/);
  });

  it('OmnichannelManager distribui canais em tonalidades distintas', () => {
    const src = fonte(OMNICHANNEL);
    expect(src).toMatch(/text-dash-violet/); // Instagram
    expect(src).toMatch(/text-info/); // Telegram
    expect(src).toMatch(/text-streak/); // Messenger
    expect(src).not.toMatch(/text-accent',\s*bg: 'bg-accent/); // não cai no azul do accent
  });
});

describe('"Não conectado" fala a mesma língua nas 3 telas', () => {
  it('Conexões, Integrações/Gmail e Omnichannel usam o par status-offline', () => {
    expect(fonte('components/connections/ConnectionCard.tsx')).toMatch(/border-status-offline text-status-offline/);
    expect(fonte(GMAIL_CARD)).toMatch(/border-status-offline text-status-offline/);
    expect(fonte(OMNICHANNEL)).toMatch(/border-status-offline text-status-offline/);
  });

  it('Omnichannel não marca falha de conexão como destructive (falha real é outra coisa)', () => {
    expect(fonte(OMNICHANNEL)).not.toMatch(/<Badge variant="destructive">Desconectado<\/Badge>/);
  });
});

// ── render: o estado vazio de fato usa o par status-offline ──────────────
vi.mock('@/hooks/integrations/useGmail', () => ({
  useGmail: () => ({
    activeAccount: null,
    accountsLoading: false,
    accountsError: null,
    refetchAccounts: vi.fn(),
    disconnectGmail: { mutate: vi.fn() },
    syncInbox: { mutate: vi.fn(), isPending: false },
    connectGmail: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    })),
  },
}));

vi.mock('../../omnichannel/ChannelRoutingRules', () => ({ ChannelRoutingRules: () => null }));

import { GmailIntegrationCard } from '../GmailIntegrationCard';
import { OmnichannelManager } from '../../omnichannel/OmnichannelManager';

describe('"Não conectado" — render real', () => {
  it('GmailIntegrationCard desconectado usa outline + status-offline', () => {
    render(<GmailIntegrationCard />);
    const badge = screen.getByText('Desconectado');
    expect(badge.className).toContain('border-status-offline');
    expect(badge.className).toContain('text-status-offline');
    // `destructive` fica só para a falha real (Indisponível), não para a ausência de conta.
    expect(badge.className).not.toContain('destructive');
  });

  it('OmnichannelManager mostra desligado com o mesmo par de tokens', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'c1', channel_type: 'instagram', name: 'IG', status: 'disconnected', is_active: false, external_account_id: null, created_at: '2026-10-10T00:00:00Z' }],
          error: null,
        }),
      })),
      delete: vi.fn(),
    })) as never;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (ui: ReactNode) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
    wrap(<OmnichannelManager />);
    const badge = await screen.findByText('Desconectado');
    expect(badge.className).toContain('border-status-offline');
    expect(badge.className).toContain('text-status-offline');
  });
});
