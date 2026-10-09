/**
 * TL-045 (F86) — acessibilidade do monitor de disparo Multiplix
 * (`src/components/multiplix/MultiplixMonitor.tsx`).
 *
 * Lacunas que este teste fixa (todas no arquivo do cartão):
 *   1. o `<Select>` de status não tinha nome acessível (axe `select-name`,
 *      `critical`): o leitor de tela anunciava só o valor atual ("Todos");
 *   2. a barra de `Progress` não tinha nome (axe `aria-progressbar-name`,
 *      `serious`);
 *   3. os contadores/progresso mudam sozinhos por realtime e não eram
 *      anunciados — agora saem numa região `aria-live="polite"` (sr-only)
 *      cujo texto vem dos contadores reais (o teste troca os números e vê o
 *      anúncio mudar: nada de valor fixo no teste);
 *   4. a lista de destinatários rolava em `overflow-auto` sem ser alcançável
 *      pelo teclado — passa a ser uma região focável com nome;
 *   5. ao trocar lista↔monitor a lista é desmontada e o foco caía no
 *      `<body>`; o monitor passa a receber o foco no título.
 *
 * Radix roda de verdade; o canal do realtime é mockado como nos testes
 * vizinhos (`MultiplixMonitor.recipients.test.tsx`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => ({
  dispatch: null as unknown,
  recipients: { rows: [] as unknown[], total: 0 as number | null, truncated: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // O monitor abre um canal realtime; o encadeamento e o mesmo do componente.
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatch: () => ({ data: h.dispatch }),
  useMultiplixRecipients: () => ({ data: h.recipients, isError: false, error: null }),
  useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // F51/MX01: o monitor usa isto para iniciar um rascunho (startDraft); não é
  // o alvo deste teste de acessibilidade, só precisa existir no mock.
  useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  fetchMultiplixRecipientsTotal: () => Promise.resolve(0),
}));

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

const SERIOUS = new Set(['critical', 'serious']);

function disparo(over: Record<string, unknown> = {}) {
  return {
    id: 'd1', name: 'Disparo F86', message_template: 'oi', status: 'sending',
    total_recipients: 4, sent_count: 1, failed_count: 0, delivered_count: 0,
    outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
    completed_at: null, created_at: '2026-10-06T10:00:00Z',
    ...over,
  };
}

function recipientsRow(id: string) {
  return {
    id,
    company_name_snapshot: `Empresa ${id}`,
    destino_e164: '+551****9999',
    status: 'sent',
    sent_at: '2026-10-06T10:00:00Z',
    error_message: null,
    personalized_message: null,
  };
}

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  h.dispatch = disparo();
  h.recipients = { rows: [], total: 0, truncated: false };
});

describe('MultiplixMonitor — acessibilidade (TL-045/F86)', () => {
  it('não tem violação séria/critical no axe', async () => {
    h.recipients = { rows: [recipientsRow('r1')], total: 1, truncated: false };
    renderMonitor();

    const results = await axe(document.body);

    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  it('o filtro de status tem nome acessível (não só o valor "Todos")', () => {
    renderMonitor();

    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument();
  });

  it('a barra de progresso tem nome acessível', () => {
    renderMonitor();

    expect(screen.getByRole('progressbar', { name: /progresso/i })).toBeInTheDocument();
  });

  it('os contadores são anunciados numa região aria-live', () => {
    h.dispatch = disparo({ total_recipients: 4, sent_count: 1, failed_count: 1 });

    renderMonitor();

    const live = screen.getByTestId('multiplix-progresso-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('role', 'status');
    // 2 processados (1 enviada + 1 falha) de 4 → 50%.
    expect(live.textContent).toContain('50% concluído');
    expect(live.textContent).toContain('2 de 4 processados');
    expect(live.textContent).toContain('1 falha');
    expect(live.textContent).toContain('2 restantes');
  });

  it('o anúncio acompanha os contadores quando o realtime atualiza o disparo', () => {
    const { rerender } = renderMonitor();
    expect(screen.getByTestId('multiplix-progresso-live').textContent).toContain('25% concluído');

    // Mesmo disparo, contadores novos (o que o realtime provoca na tela).
    h.dispatch = disparo({ total_recipients: 4, sent_count: 3, failed_count: 1 });
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('multiplix-progresso-live').textContent).toContain('100% concluído');
    expect(screen.getByTestId('multiplix-progresso-live').textContent).toContain('0 restantes');
  });

  it('a lista de destinatários é alcançável pelo teclado (região focável com nome)', () => {
    h.recipients = { rows: [recipientsRow('r1')], total: 1, truncated: false };
    renderMonitor();

    const lista = screen.getByRole('region', { name: /destinatários/i });
    expect(lista).toHaveAttribute('tabindex', '0');

    lista.focus();
    expect(document.activeElement).toBe(lista);
  });

  it('ao abrir o monitor o foco vai para o título (troca lista↔monitor)', () => {
    renderMonitor();

    const titulo = screen.getByRole('heading', { name: 'Disparo F86' });
    expect(titulo).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(titulo);
  });

  it('a animação de "Enviando agora…" respeita `prefers-reduced-motion`', () => {
    renderMonitor();

    const animados = Array.from(document.body.querySelectorAll('[class*="animate-pulse"]'));
    expect(animados.length).toBeGreaterThan(0);
    for (const el of animados) {
      expect(el.getAttribute('class')).toContain('motion-safe:animate-pulse');
    }
  });
});
