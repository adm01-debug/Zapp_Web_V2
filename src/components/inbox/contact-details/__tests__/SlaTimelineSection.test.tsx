/**
 * Prova de tela da seção "Linha do tempo de SLA" — filtros e memória.
 *
 * Renderiza o componente REAL dentro do acordeão real. O único mock é o hook de
 * dados (`useContactSlaTimeline`), que devolve a lista CRUA de marcos: o filtro
 * por situação (`filterSlaMilestones`) é o de produção, então o atalho só passa
 * se de fato filtrar — não há mock devolvendo a resposta pronta.
 *
 * A memória é provada nas duas pontas: montar com preferência salva devolve o
 * filtro do usuário, e clicar grava a escolha para a próxima abertura.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Accordion } from '@/components/ui/accordion';
import { SlaTimelineSection } from '../SlaTimelineSection';
import { SLA_TIMELINE_FILTERS_STORAGE_KEY } from '../slaTimelineFilterState';

const h = vi.hoisted(() => {
  const at = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
  return {
    estado: { loading: false, incomplete: false, limitsReady: true },
    milestones: [
      { id: 'm-ok', kind: 'first_response', at: at(5), deadlineAt: null, durationMs: 30_000, status: 'ok', limitMinutes: 5 },
      { id: 'm-risco', kind: 'first_response', at: at(8), deadlineAt: null, durationMs: 240_000, status: 'warning', limitMinutes: 5 },
      { id: 'm-estourado', kind: 'resolution', at: at(12), deadlineAt: null, durationMs: 400_000, status: 'breached', limitMinutes: 5 },
      { id: 'm-sem-prazo', kind: 'transfer', at: at(15), deadlineAt: null, durationMs: null, status: 'na', limitMinutes: null },
    ],
  };
});

vi.mock('@/hooks/sla/useContactSlaTimeline', () => ({
  contactSlaTimelineKey: (contactId: string | null | undefined) => ['contact-sla-timeline', contactId],
  useContactSlaTimeline: () => ({
    milestones: h.milestones,
    incomplete: h.estado.incomplete,
    limitsReady: h.estado.limitsReady,
    loading: h.estado.loading,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  h.estado = { loading: false, incomplete: false, limitsReady: true };
});

afterEach(() => {
  localStorage.clear();
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Accordion type="multiple" defaultValue={['sla-timeline']}>
        <SlaTimelineSection contactId="contact-1" index={0} />
      </Accordion>
    </QueryClientProvider>,
  );
}

describe('SlaTimelineSection — filtro por situação e atalho "só em risco/estourado"', () => {
  it('sem filtro, mostra todas as situações', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    for (const id of ['m-ok', 'm-risco', 'm-estourado', 'm-sem-prazo']) {
      expect(screen.getByTestId(`sla-milestone-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('sla-risk-shortcut')).toHaveAttribute('aria-pressed', 'false');
  });

  it('um clique no atalho deixa só em risco e estourado; o mesmo clique desliga', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    fireEvent.click(screen.getByTestId('sla-risk-shortcut'));

    expect(screen.queryByTestId('sla-milestone-m-ok')).toBeNull();
    expect(screen.queryByTestId('sla-milestone-m-sem-prazo')).toBeNull();
    expect(screen.getByTestId('sla-milestone-m-risco')).toBeInTheDocument();
    expect(screen.getByTestId('sla-milestone-m-estourado')).toBeInTheDocument();
    expect(screen.getByTestId('sla-risk-shortcut')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sla-status-chip-warning')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sla-status-chip-breached')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('sla-risk-shortcut'));

    expect(screen.getByTestId('sla-milestone-m-ok')).toBeInTheDocument();
    expect(screen.getByTestId('sla-milestone-m-sem-prazo')).toBeInTheDocument();
    expect(screen.getByTestId('sla-risk-shortcut')).toHaveAttribute('aria-pressed', 'false');
  });

  it('chip de situação também filtra sozinho', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    fireEvent.click(screen.getByTestId('sla-status-chip-breached'));

    expect(screen.getByTestId('sla-milestone-m-estourado')).toBeInTheDocument();
    expect(screen.queryByTestId('sla-milestone-m-risco')).toBeNull();
    expect(screen.queryByTestId('sla-milestone-m-ok')).toBeNull();
  });
});

describe('SlaTimelineSection — filtros lembrados', () => {
  it('lembra o filtro salvo ao montar: situação e período voltam marcados', async () => {
    localStorage.setItem(
      SLA_TIMELINE_FILTERS_STORAGE_KEY,
      JSON.stringify({ period: '7d', kinds: [], statuses: ['breached'] }),
    );

    renderSection();
    await screen.findByTestId('sla-timeline-list');

    expect(screen.getByTestId('sla-milestone-m-estourado')).toBeInTheDocument();
    expect(screen.queryByTestId('sla-milestone-m-ok')).toBeNull();
    expect(screen.queryByTestId('sla-milestone-m-risco')).toBeNull();
    expect(screen.getByTestId('sla-status-chip-breached')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('segmented-item-7d')).toHaveAttribute('aria-checked', 'true');
  });

  it('grava a escolha do atalho para a próxima abertura', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    fireEvent.click(screen.getByTestId('sla-risk-shortcut'));

    await waitFor(() => {
      const raw = localStorage.getItem(SLA_TIMELINE_FILTERS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).statuses).toEqual(['warning', 'breached']);
    });
  });

  it('"Limpar filtros" volta a seleção ao default e isso também é lembrado', async () => {
    localStorage.setItem(
      SLA_TIMELINE_FILTERS_STORAGE_KEY,
      JSON.stringify({ period: '24h', kinds: ['transfer'], statuses: ['na'] }),
    );

    renderSection();
    await screen.findByTestId('sla-timeline-list');
    expect(screen.getByTestId('sla-clear-filters')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sla-clear-filters'));

    expect(screen.getByTestId('sla-milestone-m-ok')).toBeInTheDocument();
    expect(screen.getByTestId('sla-kind-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sla-status-all')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      const raw = localStorage.getItem(SLA_TIMELINE_FILTERS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string)).toEqual({ period: 'all', kinds: [], statuses: [] });
    });
  });
});
