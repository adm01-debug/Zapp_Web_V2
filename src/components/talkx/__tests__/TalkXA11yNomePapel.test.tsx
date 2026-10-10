/**
 * TX-A11Y-1 (refazer 2) — nome acessível e papel nos controles do TalkX.
 *
 * Trava os 5 pontos do pedido + o restante da recusa 2:
 * 1. TalkXLiveMonitor: Progress com nome ("Progresso do envio") e filtro de
 *    status com nome ("Filtrar status").
 * 2. TalkXCampaignScheduled: data/horário com label (sem datetime-local sem
 *    nome) e os dois Switch com nome.
 * 3. TalkXTemplateEditor: selects de Categoria e Status com label (id+htmlFor).
 * 4. RuleRow (segmentos): os 3 selects com nome (Campo, Operador, Valor).
 * 5. TalkXHelp: a região rolável da tela de ajuda é alcançável por teclado
 *    (o scroller é do shell — ViewContainer —, não dos arquivos da ajuda).
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

const h = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
  updateAsync: vi.fn(),
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  calls: [] as Array<{ table: string; id: string | null }>,
  campaignPending: false,
  campaignError: null as Error | null,
  recipientsPending: false,
  recipientsError: null as Error | null,
  rateError: null as Error | null,
  eventsError: null as Error | null,
  refetchRate: vi.fn(),
  refetchEvents: vi.fn(),
  templatesMut: () => ({
    createTemplate: { mutateAsync: vi.fn() },
    updateTemplate: { mutateAsync: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: vi.fn().mockResolvedValue([]),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn().mockResolvedValue(0),
  }),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.campaigns,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchCampaigns: h.refetch,
    updateCampaign: { mutateAsync: h.updateAsync },
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));

vi.mock('@/integrations/supabase/client', () => {
  const CAMPAIGN = {
    id: 'camp-1',
    name: 'Campanha A11y',
    status: 'sending',
    message_template: 'mensagem de teste',
    total_recipients: 10,
    sent_count: 3,
    delivered_count: 2,
    failed_count: 1,
    outcome_unknown_count: 0,
    started_at: null,
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-05T10:00:00.000Z',
  };

  const resolveChain = (table: string, id: string | null) => {
    h.calls.push({ table, id });
    if (table === 'talkx_campaigns') {
      if (h.campaignPending) return new Promise(() => {});
      if (h.campaignError) return Promise.resolve({ data: null, error: h.campaignError });
      return Promise.resolve({ data: CAMPAIGN, error: null });
    }
    if (h.recipientsPending) return new Promise(() => {});
    if (h.recipientsError) return Promise.resolve({ data: null, error: h.recipientsError });
    return Promise.resolve({ data: [], error: null });
  };

  const makeChain = (table: string) => {
    let id: string | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => { if (col === 'id') id = String(value); return chain; };
    chain.order = () => chain;
    chain.limit = () => resolveChain(table, id);
    chain.single = () => resolveChain(table, id);
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({
    events: [],
    isLoading: false,
    isError: h.eventsError !== null,
    error: h.eventsError,
    refetch: h.refetchEvents,
    logEvent: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({
    rateByMinute: [],
    isLoading: false,
    isError: h.rateError !== null,
    refetch: h.refetchRate,
  }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => h.templatesMut(),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';
import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';
import { TalkXTemplateEditor } from '../TalkXTemplateEditor';
import { RuleRow } from '../segments/RuleRow';
import { TalkXHelpArticle } from '../help/TalkXHelpArticle';
import { TalkXHelpCenter } from '../help/TalkXHelpCenter';
import { ViewContainer } from '@/components/layout/ViewContainer';
import type { TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';
import type { TalkXHelpDoc } from '../help/talkxHelpIndex';

// Manaus é UTC-4: 10/06/2030 02:30 UTC é 09/06/2030 22:30 na campanha.
const SCHEDULED_CAMPAIGN = {
  id: 'camp-agendada-1',
  name: 'Promoção de Outubro',
  message_template: 'Olá {{nome}}, chegou a promoção!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4500,
  send_interval_min: 15000,
  send_interval_max: 30000,
  status: 'scheduled',
  total_recipients: 1200,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2030-06-01T10:00:00.000Z',
  updated_at: '2030-06-01T10:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2030-06-10T02:30:00.000Z',
  schedule_timezone: 'America/Manaus',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'slow',
  respect_suppression: true,
  confirm_consent: true,
  revision: 7,
};

const EDITING_TEMPLATE = {
  id: 'tpl-1',
  name: 'Boas-vindas',
  description: null,
  category: 'geral',
  content: 'Olá {{nome}}!',
  media_url: null,
  media_type: null,
  tags: [],
  status: 'approved',
  use_count: 0,
  created_by: null,
  custom_variables: [],
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
} as TalkXTemplate;

const HELP_DOC = {
  id: 'comeco/guia-teste',
  slug: 'guia-teste',
  topicSlug: 'comeco',
  topic: 'Comece por aqui',
  title: 'Guia de teste',
  kind: 'guia',
  level: null,
  order: 1,
  resume: 'Resumo do guia de teste.',
  keywords: [],
  minutes: 1,
  body: '## Passo 1\n\nTexto do passo com `codigo` e **destaque**.',
  sourcePath: 'docs/talkx/help/comeco/guia-teste.md',
} as TalkXHelpDoc;

/**
 * Regiões roláveis sem acesso por teclado: seletor que espelha a regra
 * `scrollable-region-focusable` do axe (conteúdo com rolagem própria precisa
 * ser focalizável). Retorna os infratores.
 */
function rolaveisSemFoco(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[class*="overflow-auto"],[class*="overflow-x-auto"],[class*="overflow-y-auto"],[class*="overflow-scroll"]',
    ),
  ).filter((el) => el.getAttribute('tabindex') !== '0');
}

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXLiveMonitor campaignId="camp-1" onBack={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.campaigns = [SCHEDULED_CAMPAIGN];
  h.calls = [];
  h.campaignError = null;
  h.campaignPending = false;
  h.recipientsError = null;
  h.recipientsPending = false;
  h.rateError = null;
  h.eventsError = null;
});

describe('TX-A11Y-1 — nome acessível e papel (TalkX)', () => {
  it('monitor ao vivo: Progress tem nome e o filtro de status tem nome', async () => {
    renderMonitor();

    // Barra de progresso do envio com nome acessível (era `progressbar` sem nome).
    const progress = await screen.findByRole('progressbar', { name: 'Progresso do envio' });
    expect(progress).toBeTruthy();

    // O filtro de status mora na aba de destinatários (botões, não role=tab).
    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));
    expect(
      await screen.findByRole('combobox', { name: 'Filtrar status' }),
    ).toBeTruthy();
  });

  it('agendamento: data e horário têm label e os dois Switch têm nome', () => {
    render(
      <TalkXCampaignScheduled
        campaignId="camp-agendada-1"
        onBack={() => {}}
        onEdit={() => {}}
        onStatusChange={() => {}}
      />,
    );

    // Não há mais `datetime-local` sem nome: data e hora separadas, rotuladas.
    const date = screen.getByLabelText('Data de início') as HTMLInputElement;
    const time = screen.getByLabelText('Horário de início') as HTMLInputElement;
    expect(date.type).toBe('date');
    expect(time.type).toBe('time');
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();

    // Fuso com label associada (id + htmlFor).
    expect(screen.getByRole('combobox', { name: 'Fuso horário' })).toBeTruthy();

    // Os dois Switch (janela de envio e horário comercial) têm nome.
    const janela = screen.getByRole('switch', { name: 'Janela de envio' });
    expect(janela).toBeTruthy();
    fireEvent.click(janela);
    expect(screen.getByLabelText('Início')).toBeTruthy();
    expect(screen.getByLabelText('Fim')).toBeTruthy();
    expect(
      screen.getByRole('switch', { name: 'Limitar por horário comercial' }),
    ).toBeTruthy();
  });

  it('editor de template: selects de Categoria e Status têm nome', () => {
    render(
      <TalkXTemplateEditor
        templates={[EDITING_TEMPLATE]}
        isLoading={false}
        editing={EDITING_TEMPLATE}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy();
  });

  it('linha de regra do segmento: os 3 selects têm nome (Campo, Operador, Valor)', () => {
    render(
      <RuleRow
        rule={{ id: 'r1', field: 'group_category', op: 'eq', value: '' }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Campo' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Operador' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Valor' })).toBeTruthy();
  });

  it('ajuda: nenhuma região rolável sem acesso por teclado nos componentes da ajuda', async () => {
    const { container } = render(
      <TalkXHelpCenter route={{}} onRouteChange={() => {}} onClose={() => {}} />,
    );
    // A central carrega os docs de verdade (lazy); esperando a lista, o teste
    // atravessa o caminho de produção (loading → lista → artigo).
    const topicos = await screen.findByRole('heading', { name: 'Tópicos' });
    expect(topicos).toBeTruthy();
    expect(rolaveisSemFoco(container)).toEqual([]);

    const { container: artigo } = render(
      <TalkXHelpArticle doc={HELP_DOC} previous={null} next={null} onBack={() => {}} onOpen={() => {}} />,
    );
    expect(rolaveisSemFoco(artigo)).toEqual([]);
  });

  it('ajuda: o scroller do shell que envolve a ajuda é região nomeada e focalizável', () => {
    const { container } = render(
      <ViewContainer viewId="talkx-help">
        <TalkXHelpArticle doc={HELP_DOC} previous={null} next={null} onBack={() => {}} onOpen={() => {}} />
      </ViewContainer>,
    );

    const scroller = container.querySelector<HTMLElement>('[class*="overflow-y-auto"]');
    expect(scroller).toBeTruthy();
    // Sem tabindex="0" o teclado não alcança a rolagem (scrollable-region-focusable).
    expect(scroller!.getAttribute('tabindex')).toBe('0');
    // Com papel de região, o nome é obrigatório.
    expect(scroller!.getAttribute('role')).toBe('region');
    const regiao = within(container as HTMLElement).getByRole('region', { name: 'Conteúdo da página' });
    expect(regiao.contains(screen.getByText('Guia de teste'))).toBe(true);
  });

  it('controle negativo: o detector acusa rolagem sem tabindex', () => {
    const { container } = render(
      <div className="overflow-y-auto" style={{ maxHeight: 40 }}>
        <div style={{ height: 400 }}>conteúdo alto</div>
      </div>,
    );
    // Prova que o auxiliar acima não passa batido: sem tabindex ele encontra 1.
    expect(rolaveisSemFoco(container)).toHaveLength(1);
  });
});
