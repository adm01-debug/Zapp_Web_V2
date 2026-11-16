import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * X081 (TL-117) — seleção em massa na Visão geral.
 *
 * O que esta prova cobre:
 * 1. O TalkXBulkBar aparece ao selecionar itens;
 * 2. "Pausar (1 de 3)" quando só 1 das 3 selecionadas é elegível para pausa;
 * 3. Trocar lista ↔ grade mantém a seleção;
 * 4. Mudar de página limpa a seleção (via selectionResetKey).
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
      current: { campaignsSent: 3, completed: null, contactsReached: null, sent: null, deliveryRatePct: null },
      previous: null, active: null, dailySent: [],
    },
  }),
}));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
  }),
}));

import { TalkXOverview } from '../TalkXOverview';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const HOJE = new Date('2026-10-09T12:00:00.000Z');

function camp(id: string, status: TalkXCampaign['status']): TalkXCampaign {
  return {
    id, name: `Campanha ${id}`, status,
    message_template: 'Oi', variables_config: [], typing_delay_min: 1, typing_delay_max: 2,
    send_interval_min: 1, send_interval_max: 2,
    total_recipients: 20, sent_count: 10, failed_count: 0, delivered_count: 10,
    whatsapp_connection_id: 'w1', created_by: 'u1',
    started_at: '2026-10-08T10:00:00.000Z', completed_at: null,
    created_at: '2026-10-08T09:00:00.000Z', updated_at: '2026-10-08T11:00:00.000Z',
    media_url: null, media_type: null, scheduled_at: null,
    description: '', objective: 'engajamento', segment_id: null,
  } as unknown as TalkXCampaign;
}

const sending  = camp('c-sending',  'sending');
const draft    = camp('c-draft',    'draft');
const completed = camp('c-done',   'completed');

const baseProps = {
  campaigns: [sending, draft, completed] as TalkXCampaign[],
  segments: [], creators: {}, isLoading: false,
  onNew: vi.fn(), onEdit: vi.fn(), onView: vi.fn(),
  onDuplicate: vi.fn(), onStart: vi.fn(), onPause: vi.fn(),
  onCancel: vi.fn(), onDelete: vi.fn(), onGoTab: vi.fn(),
};

function selectCheckbox(name: string) {
  const cb = screen.getByRole('checkbox', { name: new RegExp(name, 'i') });
  fireEvent.click(cb);
}

describe('X081 · seleção em massa', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOJE);
    sessionStorage.clear(); localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); localStorage.clear(); });

  it('BulkBar aparece ao selecionar e mostra contagem', () => {
    render(<TalkXOverview {...baseProps} />);
    expect(screen.queryByText(/selecionada/i)).toBeNull();

    selectCheckbox('Selecionar Campanha c-sending');
    expect(screen.getByText(/1 selecionada/i)).toBeTruthy();
  });

  it('Pausar informa elegíveis: "1 de 3" ao selecionar em andamento + rascunho + concluída', () => {
    render(<TalkXOverview {...baseProps} />);

    // Selecionar as 3
    selectCheckbox('Selecionar Campanha c-sending');
    selectCheckbox('Selecionar Campanha c-draft');
    selectCheckbox('Selecionar Campanha c-done');

    expect(screen.getByText(/3 selecionadas/i)).toBeTruthy();
    // Pausar mostra "1 de 3" (só a sending é elegível)
    const pausar = screen.getByRole('button', { name: /Pausar/i });
    expect(pausar.textContent).toContain('1 de 3');
  });

  it('trocar lista ↔ grade mantém a seleção', () => {
    render(<TalkXOverview {...baseProps} />);
    selectCheckbox('Selecionar Campanha c-sending');
    expect(screen.getByText(/1 selecionada/i)).toBeTruthy();

    // Trocar para grade
    fireEvent.click(screen.getByTitle('Grade'));
    // A BulkBar continua visível (seleção preservada)
    expect(screen.getByText(/1 selecionada/i)).toBeTruthy();
  });

  it('"Limpar seleção" no BulkBar zera a seleção', () => {
    render(<TalkXOverview {...baseProps} />);
    selectCheckbox('Selecionar Campanha c-sending');
    expect(screen.getByText(/1 selecionada/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.queryByText(/selecionada/i)).toBeNull();
  });
});

/**
 * Achados da revisão da PR #3175 — o laço de `rowActions.run` e o `onDelete`
 * direto estavam errados de três formas, e nenhuma delas falhava nos testes
 * acima porque nenhum deles clicava nos botões do lote.
 */
const sending2  = camp('c-sending2',  'sending');
const draft2    = camp('c-draft2',    'draft');
const scheduled = camp('c-sched',     'scheduled');
const cancelled = camp('c-cancel',    'cancelled');

describe('X081 · o lote confirma uma vez e executa em todas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOJE);
    sessionStorage.clear(); localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); localStorage.clear(); });

  it('Excluir NÃO apaga no clique: pede confirmação do conjunto', () => {
    const onDelete = vi.fn();
    render(<TalkXOverview {...baseProps} campaigns={[draft, draft2]} onDelete={onDelete} />);
    selectCheckbox('Selecionar Campanha c-draft$');
    selectCheckbox('Selecionar Campanha c-draft2');

    fireEvent.click(screen.getByRole('button', { name: /Excluir/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir campanhas')).toBeTruthy();
  });

  it('confirmado, Excluir apaga TODAS as elegíveis — não só a última', async () => {
    const onDelete = vi.fn();
    render(<TalkXOverview {...baseProps} campaigns={[draft, draft2]} onDelete={onDelete} />);
    selectCheckbox('Selecionar Campanha c-draft$');
    selectCheckbox('Selecionar Campanha c-draft2');

    fireEvent.click(screen.getByRole('button', { name: /Excluir/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir 2' }));
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
    expect(onDelete.mock.calls.map(([id]) => id).sort()).toEqual(['c-draft', 'c-draft2']);
  });

  it('confirmado, Pausar pausa TODAS as em andamento', async () => {
    const onPause = vi.fn();
    render(<TalkXOverview {...baseProps} campaigns={[sending, sending2]} onPause={onPause} />);
    selectCheckbox('Selecionar Campanha c-sending$');
    selectCheckbox('Selecionar Campanha c-sending2');

    fireEvent.click(screen.getByRole('button', { name: /Pausar/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar 2' }));
    await vi.waitFor(() => expect(onPause).toHaveBeenCalledTimes(2));
    expect(onPause.mock.calls.map(([id]) => id).sort()).toEqual(['c-sending', 'c-sending2']);
  });

  it('elegibilidade de exclusão é a da RPC: agendada entra, cancelada não', () => {
    render(<TalkXOverview {...baseProps} campaigns={[scheduled, cancelled]} />);
    selectCheckbox('Selecionar Campanha c-sched');
    selectCheckbox('Selecionar Campanha c-cancel');

    // delete_talkx_campaign aceita draft e scheduled; cancelled ela recusa com
    // talkx_campaign_not_deletable.
    expect(screen.getByRole('button', { name: /Excluir/i }).textContent).toContain('1 de 2');
  });

  it('filtrar com a grade ativa limpa a seleção — a tabela não está montada para fazer isso', async () => {
    render(<TalkXOverview {...baseProps} campaigns={[draft, draft2]} />);
    selectCheckbox('Selecionar Campanha c-draft$');
    expect(screen.getByText(/1 selecionada/i)).toBeTruthy();

    fireEvent.click(screen.getByTitle('Grade'));
    expect(screen.getByText(/1 selecionada/i)).toBeTruthy();

    // A busca é debounced: a chave do recorte só muda quando o valor propaga.
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: 'nao-existe-nenhuma' } });
    await vi.waitFor(() => expect(screen.queryByText(/selecionada/i)).toBeNull());
  });
});

describe('X081 · o que falha no lote continua selecionado', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOJE);
    sessionStorage.clear(); localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); localStorage.clear(); });

  it('a campanha cuja exclusão falhou fica selecionada; a que deu certo sai', async () => {
    const onDelete = vi.fn(async (id: string) => {
      if (id === 'c-draft2') throw new Error('rede caiu');
    });
    render(<TalkXOverview {...baseProps} campaigns={[draft, draft2]} onDelete={onDelete} />);
    selectCheckbox('Selecionar Campanha c-draft$');
    selectCheckbox('Selecionar Campanha c-draft2');

    fireEvent.click(screen.getByRole('button', { name: /Excluir/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir 2' }));

    await vi.waitFor(() => expect(screen.getByText(/1 selecionada/i)).toBeTruthy());
    expect(onDelete).toHaveBeenCalledTimes(2);
  });
});
