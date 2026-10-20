/**
 * Testes do `JourneyEventCard` — etapas S061–S069 do
 * PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS (decisão D07 para o texto seguro).
 *
 * O que estes testes provam, e como:
 * - o componente REAL é renderizado e o que o usuário vê é afirmado (papel,
 *   nome acessível, texto, classes de token) — não há mock do componente;
 * - a cor da categoria é provada pela CLASSE do token (`meta.iconClass` /
 *   `meta.railClass`), porque o jsdom não calcula cor nem layout;
 * - o cartão inteiro é um `<button>` nativo (Enter/Espaço são do navegador) e o
 *   gatilho do `Collapse` dos agrupados é IRMÃO do botão — nunca um botão dentro
 *   do outro. Por isso o axe roda no cartão agrupado (o pior caso): se houvesse
 *   aninhamento, o axe reprovaria com `nested-interactive`;
 * - o horário usa um instante SEM fuso de propósito: `new Date` lê como hora
 *   local, então o `HH:mm` é o mesmo em qualquer fuso onde o teste rodar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { CATEGORY_META } from '@/lib/journey/model';
import type { JourneyCategory, JourneyEvent } from '@/lib/journey/model';
import { JourneyEventCard } from '../JourneyEventCard';

const INSTANTE_SEM_FUSO = '2026-10-07T14:32:00';

function evento(over: Partial<JourneyEvent> = {}): JourneyEvent {
  return {
    id: 'e1',
    at: INSTANTE_SEM_FUSO,
    category: 'message',
    kind: 'message_in',
    title: 'Mensagem recebida',
    summary: 'Bom dia, tudo bem?',
    details: [{ label: 'De', value: '(11) 98888-7777' }],
    actor: { kind: 'contact', id: 'c1', name: 'Maria', avatarUrl: null },
    target: { type: 'message', id: 'm1', threadId: 't1' },
    ...over,
  };
}

function renderCard(props: Partial<Parameters<typeof JourneyEventCard>[0]> = {}) {
  const onOpen = vi.fn();
  const utils = render(
    <ul>
      <JourneyEventCard event={evento()} actorName="Maria" actorAvatarUrl={null} onOpen={onOpen} {...props} />
    </ul>,
  );
  return { ...utils, onOpen };
}

afterEach(() => {
  cleanup();
});

describe('JourneyEventCard — S061–S069', () => {
  it('(1) usa o ícone e a cor da categoria no tile e no ponto (TODAS as categorias)', () => {
    for (const [categoria, meta] of Object.entries(CATEGORY_META)) {
      const { unmount } = renderCard({ event: evento({ category: categoria as JourneyCategory }) });

      expect(screen.getByTestId('journey-event-icon').className).toContain(meta.iconClass);
      expect(screen.getByTestId('journey-rail-dot').className).toContain(meta.railClass);

      unmount();
    }
  });

  it('(2) mostra título, resumo, horário e o selo de status na cor do seu tom', () => {
    renderCard({ event: evento({ badge: { label: 'Sem resposta', tone: 'warning' } }) });

    expect(screen.getByTestId('journey-event-title')).toHaveTextContent('Mensagem recebida');
    expect(screen.getByTestId('journey-event-summary')).toHaveTextContent('Bom dia, tudo bem?');
    expect(screen.getByTestId('journey-event-time')).toHaveTextContent('14:32');

    const selo = screen.getByTestId('journey-event-badge');
    expect(selo).toHaveTextContent('Sem resposta');
    expect(selo.className).toContain('bg-warning/15 text-warning border-warning/30');
  });

  it('(3) lista os detalhes em linhas "rótulo: valor"', () => {
    renderCard({
      event: evento({
        details: [
          { label: 'De', value: '(11) 98888-7777' },
          { label: 'Tipo', value: 'texto' },
        ],
      }),
    });

    const detalhes = screen.getByTestId('journey-event-details');
    expect(detalhes).toHaveTextContent('De:');
    expect(detalhes).toHaveTextContent('(11) 98888-7777');
    expect(detalhes).toHaveTextContent('Tipo:');
    expect(detalhes).toHaveTextContent('texto');
  });

  it('(4) resumo com JSON cru vira texto seguro — o JSON nunca aparece na tela', () => {
    const json = JSON.stringify({
      latitude: -23.55,
      longitude: -46.63,
      name: 'Praça da Sé',
      address: 'R. Direita, 1',
    });
    renderCard({ event: evento({ summary: json }) });

    const resumo = screen.getByTestId('journey-event-summary');
    expect(resumo).toHaveTextContent('Localização: Praça da Sé — R. Direita, 1');
    expect(resumo.textContent).not.toContain('{');
    expect(resumo.textContent).not.toContain('latitude');
  });

  it('(5) mostra foto + nome de quem agiu; "Sistema" aparece com ícone, sem foto', () => {
    const { unmount } = renderCard({ actorAvatarUrl: 'https://exemplo.test/foto.png' });

    expect(screen.getByTestId('sender-avatar-photo')).toHaveAttribute('src', 'https://exemplo.test/foto.png');
    expect(screen.getByTestId('journey-event-actor')).toHaveTextContent('Maria');
    expect(screen.queryByTestId('journey-event-system')).toBeNull();

    unmount();

    renderCard({
      event: evento({ actor: { kind: 'system', id: null, name: null, avatarUrl: null } }),
      actorName: 'Sistema',
      actorAvatarUrl: null,
    });

    expect(screen.getByTestId('journey-event-system')).toBeInTheDocument();
    expect(screen.queryByTestId('sender-avatar')).toBeNull();
    expect(screen.getByTestId('journey-event-actor')).toHaveTextContent('Sistema');
  });

  it('(6) agrupado (count > 1): o rótulo do grupo expande os detalhes no Collapse', () => {
    renderCard({
      event: evento({
        count: 3,
        details: [
          { label: 'Mensagem 1', value: 'oi' },
          { label: 'Mensagem 2', value: 'tudo bem?' },
        ],
      }),
    });

    // agrupado: os detalhes NÃO ficam inline, só dentro do painel fechado
    expect(screen.queryByTestId('journey-event-details')).toBeNull();
    expect(screen.queryByTestId('journey-event-group-details')).toBeNull();
    expect(screen.getByTestId('journey-event-group-label')).toHaveTextContent('3 mensagens recebidas');

    const gatilho = screen.getByRole('button', { name: /3 mensagens recebidas/ });
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');
    expect(gatilho).toHaveAttribute('aria-controls', 'journey-grupo-e1');

    fireEvent.click(gatilho);

    expect(gatilho).toHaveAttribute('aria-expanded', 'true');
    const painel = screen.getByTestId('journey-event-group-details');
    expect(painel).toHaveTextContent('Mensagem 1');
    expect(painel).toHaveTextContent('tudo bem?');
  });

  it('(7) o cartão inteiro é um botão nativo: clique (e Enter/Espaço do navegador) abre o alvo', () => {
    const { onOpen } = renderCard();

    const botao = screen.getByTestId('journey-event-card');
    expect(botao.tagName).toBe('BUTTON');
    expect(botao).toHaveAttribute('type', 'button');
    expect(botao).toBeEnabled();
    // o nome acessível junta categoria, título, horário e autor (S097)
    expect(botao).toHaveAttribute('aria-label', 'Mensagens, Mensagem recebida, às 14:32, Maria');

    fireEvent.click(botao);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ type: 'message', id: 'm1', threadId: 't1' });
  });

  it('(8) agrupado: nenhum botão dentro de botão e sem violação de acessibilidade', async () => {
    const { container } = renderCard({ event: evento({ count: 3 }) });

    const cartao = screen.getByTestId('journey-event-card');
    expect(cartao.querySelector('button')).toBeNull();
    // o gatilho do Collapse é irmão do cartão
    expect(screen.getAllByRole('button')).toHaveLength(2);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('(9) o trilho desce até o próximo item — e para no último do dia', () => {
    const { container, unmount } = renderCard({ isLast: false });
    expect(container.querySelector('[data-testid="journey-rail-line"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="journey-rail-dot"]')).not.toBeNull();

    unmount();

    const ultimo = renderCard({ isLast: true });
    expect(ultimo.container.querySelector('[data-testid="journey-rail-line"]')).toBeNull();
    expect(ultimo.container.querySelector('[data-testid="journey-rail-dot"]')).not.toBeNull();
  });

  it('(10) horário só aparece com instante completo e o rótulo do grupo segue o tipo', () => {
    const { unmount } = renderCard({ event: evento({ at: '2026-10-07' }) });
    expect(screen.getByTestId('journey-event-time')).toHaveTextContent('—');
    unmount();

    const casos: [Partial<JourneyEvent>, string][] = [
      [{ count: 2, kind: 'message_out' }, '2 mensagens enviadas'],
      [{ count: 3, kind: 'email_in' }, '3 e-mails recebidos'],
      [{ count: 5, kind: 'note' }, '5 episódios agrupados'],
    ];
    for (const [over, esperado] of casos) {
      const um = renderCard({ event: evento(over) });
      expect(screen.getByTestId('journey-event-group-label')).toHaveTextContent(esperado);
      um.unmount();
    }
  });
});
