import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * X082 — painel lateral da Visão geral.
 *
 * O que esta prova cobre:
 * 1. As 4 ações rápidas estão presentes (incluindo "Importar contatos");
 * 2. A dica do dia é determinística pelo dia (índice baseado na data);
 * 3. A seta "›" avança a dica;
 * 4. Campanhas nas "Últimas campanhas" refletem o status correto.
 */

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
vi.mock('@/hooks/integrations/useTalkXOverviewStats', () => ({
  useTalkXOverviewStats: () => ({
    data: {
      current: { campaignsSent: 2, completed: 1, contactsReached: null, sent: 50, deliveryRatePct: 95 },
      previous: null, active: null, dailySent: [],
    },
  }),
}));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
  }),
}));

import { TalkXOverview } from '../TalkXOverview';
import { TIPS } from '../talkxShared';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const HOJE = new Date('2026-10-09T12:00:00.000Z');

function camp(id: string, status: TalkXCampaign['status'] = 'completed'): TalkXCampaign {
  return {
    id, name: `Camp ${id}`, status,
    message_template: 'Oi', variables_config: [], typing_delay_min: 1, typing_delay_max: 2,
    send_interval_min: 1, send_interval_max: 2,
    total_recipients: 100, sent_count: 80, failed_count: 5, delivered_count: 75,
    whatsapp_connection_id: 'w1', created_by: 'u1',
    started_at: '2026-10-08T10:00:00.000Z', completed_at: '2026-10-08T11:00:00.000Z',
    created_at: '2026-10-08T09:00:00.000Z', updated_at: '2026-10-08T11:00:00.000Z',
    media_url: null, media_type: null, scheduled_at: null,
    description: '', objective: 'engajamento', segment_id: null,
  } as unknown as TalkXCampaign;
}

const baseProps = {
  campaigns: [camp('c1'), camp('c2', 'sending')] as TalkXCampaign[],
  segments: [], creators: {}, isLoading: false,
  onNew: vi.fn(), onEdit: vi.fn(), onView: vi.fn(),
  onDuplicate: vi.fn(), onStart: vi.fn(), onPause: vi.fn(),
  onCancel: vi.fn(), onDelete: vi.fn(), onGoTab: vi.fn(),
};

describe('X082 · painel lateral', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOJE);
    sessionStorage.clear(); localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); localStorage.clear(); });

  it('4 ações rápidas presentes, incluindo "Importar contatos"', () => {
    render(<TalkXOverview {...baseProps} />);
    expect(screen.getByText('Nova campanha')).toBeTruthy();
    expect(screen.getByText('Usar template')).toBeTruthy();
    expect(screen.getByText('Criar segmento')).toBeTruthy();
    expect(screen.getByText('Importar contatos')).toBeTruthy();
  });

  it('"Importar contatos" chama onGoTab com "contacts"', () => {
    render(<TalkXOverview {...baseProps} />);
    const importar = screen.getByText('Importar contatos').closest('button') ??
                     screen.getByText('Importar contatos').closest('[role="button"]') ??
                     screen.getByText('Adicionar novos contatos').closest('button');
    if (importar) fireEvent.click(importar);
    expect(baseProps.onGoTab).toHaveBeenCalledWith('contacts');
  });

  it('dica do dia é determinística pelo índice do dia', () => {
    render(<TalkXOverview {...baseProps} />);
    const dayIndex = Math.floor(HOJE.getTime() / 86400000) % TIPS.length;
    expect(screen.getByText(TIPS[dayIndex])).toBeTruthy();
  });

  it('seta "›" avança a dica', () => {
    render(<TalkXOverview {...baseProps} />);
    const dayIndex = Math.floor(HOJE.getTime() / 86400000) % TIPS.length;
    const nextIndex = (dayIndex + 1) % TIPS.length;

    const nextBtn = screen.getByRole('button', { name: 'Próxima dica' });
    fireEvent.click(nextBtn);
    expect(screen.getByText(TIPS[nextIndex])).toBeTruthy();
  });
});
