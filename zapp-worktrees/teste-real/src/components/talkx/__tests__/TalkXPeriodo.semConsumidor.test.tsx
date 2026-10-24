import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * R2-MOD-059 (#426) — "Filtro de período do Talk X aparece nas quatro telas sem consumidor".
 *
 * A TalkXFilterBar (kit/filters.tsx) desenhava o chip "Período" SEMPRE, mesmo sem ninguém
 * para consumir o recorte. As quatro instâncias de produção (Visão geral, Templates,
 * Segmentos e Supressão) não passam `period`/`onPeriodChange`, então escolher
 * "Hoje"/"7 dias"/"30 dias"/"Este mês"/"Personalizado" só fechava o popover: o rótulo
 * continuava "Todo o período" e os dados não mudavam. Um controle que promete recortar
 * dados e não recorta nada — o usuário não tem por onde fazer o recorte por data.
 *
 * A prova é sobre as TELAS DE PRODUÇÃO (não sobre o kit isolado com um `vi.fn`, que era
 * o furo do teste antigo): sem consumidor ligado, o chip não pode ser oferecido. E o
 * recurso não foi apagado — com consumidor, o menu continua lá e entrega o intervalo.
 */

vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutate: vi.fn() },
      updateSegment: { mutate: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn() },
    updateTemplate: { mutate: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1', full_name: 'QA' }, user: { id: 'auth-1' }, session: null, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const chain = (data: unknown[]) => {
    const self: Record<string, unknown> = {};
    self.select = () => self;
    self.is = () => self;
    self.not = () => self;
    self.eq = () => self;
    self.order = () => Promise.resolve({ data, error: null });
    return self;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'auth-1' } }, error: null }) },
      from: (table: string) => chain(table === 'contacts' ? [] : []),
    },
  };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => ({ insert: () => Promise.resolve({ error: null }) }),
}));

import { TalkXOverview } from '../TalkXOverview';
import { TalkXTemplates } from '../TalkXTemplates';
import { TalkXSegments } from '../TalkXSegments';
import { TalkXSuppression } from '../TalkXSuppression';
import { FilterBarV2 } from '../kit/filters';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const campanha: TalkXCampaign = {
  id: 'c1',
  name: 'Campanha de outubro',
  message_template: 'Olá {{nome}}',
  variables_config: [],
  typing_delay_min: 1,
  typing_delay_max: 2,
  send_interval_min: 1,
  send_interval_max: 2,
  status: 'completed',
  total_recipients: 10,
  sent_count: 10,
  failed_count: 0,
  delivered_count: 10,
  whatsapp_connection_id: null,
  created_by: 'profile-1',
  started_at: '2026-10-01T10:00:00.000Z',
  completed_at: '2026-10-01T11:00:00.000Z',
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-01T11:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** O chip do menu de período, pelo rótulo acessível do gatilho. */
const chipPeriodo = () => screen.queryByRole('button', { name: 'Período' });

describe('R2-MOD-059 · período do Talk X só aparece onde tem consumidor', () => {
  it('Visão geral (sem consumidor) não oferece o menu de período', () => {
    wrap(
      <TalkXOverview
        campaigns={[campanha]}
        segments={[]}
        creators={{}}
        isLoading={false}
        onNew={vi.fn()}
        onEdit={vi.fn()}
        onView={vi.fn()}
        onDuplicate={vi.fn()}
        onStart={vi.fn()}
        onPause={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onGoTab={vi.fn()}
      />,
    );
    expect(chipPeriodo()).toBeNull();
  });

  it('Templates (sem consumidor) não oferece o menu de período', () => {
    wrap(<TalkXTemplates onUseTemplate={vi.fn()} />);
    expect(chipPeriodo()).toBeNull();
  });

  it('Segmentos (sem consumidor) não oferece o menu de período', () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);
    expect(chipPeriodo()).toBeNull();
  });

  it('Supressão (sem consumidor) não oferece o menu de período', () => {
    wrap(<TalkXSuppression />);
    expect(chipPeriodo()).toBeNull();
  });

  it('com consumidor ligado o menu continua disponível e entrega o intervalo', () => {
    const onPeriodChange = vi.fn();
    // O contraste é do kit: a barra só some onde não há consumidor.
    wrap(<FilterBarV2 onPeriodChange={onPeriodChange} />);

    const chip = chipPeriodo();
    expect(chip).not.toBeNull();
    fireEvent.click(chip!);
    fireEvent.click(screen.getByRole('menuitem', { name: '7 dias' }));

    expect(onPeriodChange).toHaveBeenCalledTimes(1);
    const [chave, range] = onPeriodChange.mock.calls[0];
    expect(chave).toBe('7d');
    expect(range?.from).toBeInstanceOf(Date);
    expect(range?.to).toBeInstanceOf(Date);
  });
});
