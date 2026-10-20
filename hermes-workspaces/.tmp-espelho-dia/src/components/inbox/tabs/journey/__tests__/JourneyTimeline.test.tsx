/**
 * Testes do `JourneyTimeline` — etapas S061–S072 do
 * PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS, com foco em S066 (o "de" das
 * datas não pode virar "De") e S070 (cabeçalho do dia).
 *
 * O que estes testes provam, e como:
 * - dias em ordem decrescente e eventos do dia do mais novo para o mais antigo;
 * - o cabeçalho vem de `formatDayLabel`: `Hoje, ...` quando é o dia de hoje e
 *   `de` MINÚSCULO sempre (a varredura de texto recusa "De" maiúsculo);
 * - `names` e `resolve` decidem a foto/nome exibidos, com prioridade de `resolve`;
 * - o clique no cartão chega ao `onOpen` com o `event.target` certo;
 * - estados vazios (nenhum episódio) e de carregamento (esqueleto) têm marcação
 *   própria;
 * - os instantes usados NÃO têm fuso: `new Date` lê como hora local e o dia
 *   agrupado é o mesmo em qualquer fuso onde o teste rodar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { localDayKey } from '@/lib/localDay';
import type { JourneyDay, JourneyEvent } from '@/lib/journey/model';
import { JourneyTimeline } from '../JourneyTimeline';

function evento(over: Partial<JourneyEvent> = {}): JourneyEvent {
  return {
    id: 'e1',
    at: '2026-10-07T14:32:00',
    category: 'message',
    kind: 'message_in',
    title: 'Mensagem recebida',
    summary: 'Bom dia',
    details: [{ label: 'De', value: '(11) 98888-7777' }],
    actor: { kind: 'contact', id: 'c1', name: 'Maria', avatarUrl: null },
    target: { type: 'message', id: 'm1', threadId: 't1' },
    ...over,
  };
}

function renderTimeline(props: Partial<Parameters<typeof JourneyTimeline>[0]> = {}) {
  const onOpen = vi.fn();
  const utils = render(<JourneyTimeline days={[{ date: '2026-10-07', events: [evento()] }]} onOpen={onOpen} {...props} />);
  return { ...utils, onOpen };
}

afterEach(() => {
  cleanup();
});

describe('JourneyTimeline — S061–S072', () => {
  it('(1) cabeçalho do dia com "de" minúsculo (S066) — nunca "De" maiúsculo', () => {
    renderTimeline({ days: [{ date: '2020-01-15', events: [evento()] }] });

    const cabecalho = screen.getByTestId('journey-day-header');
    expect(cabecalho).toHaveTextContent('15 de janeiro de 2020');
    expect(cabecalho.textContent).not.toMatch(/\bDe\b/);
    expect(cabecalho.textContent).not.toMatch(/[A-ZÀ-Ü][a-zà-ü]+ De /);
  });

  it('(2) o dia de HOJE sai como "Hoje, <data>"', () => {
    const hoje = localDayKey(new Date()) as string;
    renderTimeline({ days: [{ date: hoje, events: [evento()] }] });

    expect(screen.getByTestId('journey-day-header')).toHaveTextContent(/^Hoje, .+ de .+ de \d{4}$/);
  });

  it('(3) agrupa a lista achatada por dia local, mais recente primeiro', () => {
    const { container } = renderTimeline({ days: undefined, events: [
      evento({ id: 'a', at: '2026-10-06T09:00:00', title: 'Evento A' }),
      evento({ id: 'b', at: '2026-10-07T08:00:00', title: 'Evento B' }),
      evento({ id: 'c', at: '2026-10-07T18:00:00', title: 'Evento C' }),
    ] });

    const secoes = [...container.querySelectorAll('section[data-testid^="journey-day-"]')];
    expect(secoes.map((s) => s.getAttribute('data-testid'))).toEqual([
      'journey-day-2026-10-07',
      'journey-day-2026-10-06',
    ]);

    const titulos = (secao: Element) =>
      [...secao.querySelectorAll('[data-testid="journey-event-title"]')].map((el) => el.textContent);
    expect(titulos(secoes[0])).toEqual(['Evento C', 'Evento B']);
    expect(titulos(secoes[1])).toEqual(['Evento A']);
  });

  it('(4) "days" vence "events" quando os dois vêm', () => {
    renderTimeline({
      days: [{ date: '2020-05-05', events: [evento({ id: 'do-dia' })] }],
      events: [evento({ id: 'ignorado', at: '2030-01-01T00:00:00' })],
    });

    expect(screen.getByTestId('journey-day-2020-05-05')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-day-2030-01-01')).toBeNull();
  });

  it('(5) "names" sobrepõe nome/foto do autor e "resolve" vence o mapa', () => {
    const names = { c1: { name: 'Maria Souza', avatarUrl: 'https://exemplo.test/maria.png' } };
    const { unmount } = renderTimeline({ names });

    expect(screen.getByTestId('journey-event-actor')).toHaveTextContent('Maria Souza');
    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', 'https://exemplo.test/maria.png');

    unmount();

    renderTimeline({
      names,
      resolve: () => ({ name: 'Nome do resolve', avatarUrl: null }),
    });
    expect(screen.getByTestId('journey-event-actor')).toHaveTextContent('Nome do resolve');
  });

  it('(6) sem nome nenhum, o autor cai no rótulo padrão por tipo (Cliente)', () => {
    renderTimeline({ days: [{ date: '2026-10-07', events: [evento({ actor: { kind: 'contact', id: null, name: null, avatarUrl: null } })] }] });

    expect(screen.getByTestId('journey-event-actor')).toHaveTextContent('Cliente');
  });

  it('(7) o clique no cartão entrega o alvo do episódio ao onOpen', () => {
    const { onOpen } = renderTimeline();

    fireEvent.click(screen.getByTestId('journey-event-card'));

    expect(onOpen).toHaveBeenCalledWith({ type: 'message', id: 'm1', threadId: 't1' });
  });

  it('(8) o trilho para no último evento de CADA dia', () => {
    const dias: JourneyDay[] = [
      { date: '2026-10-07', events: [evento({ id: 'e1' }), evento({ id: 'e2' })] },
      { date: '2026-10-06', events: [evento({ id: 'e3' })] },
    ];
    const { container } = renderTimeline({ days: dias });

    const itens = [...container.querySelectorAll('[data-testid="journey-event"]')];
    expect(itens).toHaveLength(3);
    // e1 (não último) tem trilho; e2 (último do dia) não; e3 (último do dia) não
    expect(itens[0].querySelector('[data-testid="journey-rail-line"]')).not.toBeNull();
    expect(itens[1].querySelector('[data-testid="journey-rail-line"]')).toBeNull();
    expect(itens[2].querySelector('[data-testid="journey-rail-line"]')).toBeNull();
  });

  it('(9) sem episódios: estado vazio claro; carregando: esqueleto com role=status', () => {
    const { unmount } = renderTimeline({ days: [] });
    expect(screen.getByTestId('journey-timeline-empty')).toHaveTextContent('Nenhum episódio no período.');
    expect(screen.queryByTestId('journey-timeline')).toBeNull();

    unmount();

    renderTimeline({ loading: true });
    expect(screen.getByTestId('journey-timeline-loading')).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('journey-timeline')).toBeNull();
  });

  it('(10) sem violação de acessibilidade', async () => {
    const { container } = renderTimeline({
      days: undefined,
      events: [evento({ id: 'a', at: '2026-10-07T08:00:00' }), evento({ id: 'b', at: '2026-10-07T18:00:00', count: 3 })],
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
