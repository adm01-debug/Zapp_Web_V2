/**
 * U05 — acessibilidade do chip "E-mail" de não lidos no leitor de tela (componente REAL).
 *
 * O teste não olha a aparência: prova o que um leitor de tela ANUNCIA, que é o que
 * `getByRole('button', { name })` enxerga.
 *  - o chip é um botão NATIVO com nome acessível que leva a contagem real
 *    (`N e-mails não lidos`): dá para alcançá-lo pelo número, sem depender do texto visível;
 *  - a contagem é anunciada UMA vez: o `aria-label` (nome acessível) carrega o número e o
 *    selo visível fica só como texto decorativo — o nome NÃO é o texto visível (`E-mail 3`);
 *  - com 1 vira o singular (`1 e-mail não lido`);
 *  - acima de 99 o visível é `99+`, mas o leitor de tela recebe o número REAL;
 *  - o ícone do e-mail fica fora da árvore de acessibilidade (decorativo);
 *  - a régua do axe (`button-name`) não aponta violação — no chip isolado e na barra que o monta.
 *
 * A ligação na barra (só monta com count > 0, fora do `tablist`) já é coberta em
 * `EmailUnreadChip.test.tsx`; aqui o foco é o nome acessível. Nenhum valor esperado vem da
 * implementação: a contagem entra por prop e o esperado é a contagem que o teste passou.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { EmailUnreadChip } from '../EmailUnreadChip';
import { ConversationTabs } from '../ConversationTabs';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';

const ZERO: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0 };

function renderChip(count: number) {
  const onOpen = vi.fn();
  const { container } = render(<EmailUnreadChip count={count} onOpen={onOpen} />);
  return { onOpen, container };
}

describe('EmailUnreadChip — nome acessível e leitor de tela (U05)', () => {
  it('o leitor de tela alcança o chip pela contagem: `N e-mails não lidos`', () => {
    renderChip(3);
    // Se o `aria-label` desaparecer, o nome acessível vira o texto visível ("E-mail 3") e o
    // leitor de tela perde a informação "não lidos" — esta busca passa a falhar.
    const chip = screen.getByRole('button', { name: '3 e-mails não lidos' });
    expect(chip).toBe(screen.getByTestId('email-unread-chip'));
  });

  it('a contagem é anunciada uma única vez (o nome não é o texto visível)', () => {
    renderChip(3);
    // Nome = `aria-label`, não a concatenação do texto visível com o selo.
    expect(screen.queryByRole('button', { name: 'E-mail 3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'E-mail' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '3 e-mails não lidos' })).toHaveLength(1);
    // O número continua visível na tela (o selo), só não entra no nome acessível.
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('3');
  });

  it('com 1 não lido usa o singular', () => {
    renderChip(1);
    expect(screen.getByRole('button', { name: '1 e-mail não lido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 e-mails não lidos' })).not.toBeInTheDocument();
  });

  it('acima de 99 anuncia o número REAL mesmo com `99+` visível', () => {
    renderChip(120);
    expect(screen.getByRole('button', { name: '120 e-mails não lidos' })).toBeInTheDocument();
    expect(screen.getByTestId('email-unread-chip-count')).toHaveTextContent('99+');
  });

  it('é um botão nativo e alcançável (teclado e leitor de tela)', () => {
    renderChip(2);
    const chip = screen.getByTestId('email-unread-chip');
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('type', 'button');
    expect(chip).not.toBeDisabled();
    expect(chip).not.toHaveAttribute('aria-hidden');
  });

  it('o ícone do e-mail é decorativo: fora da árvore de acessibilidade', () => {
    const { container } = renderChip(2);
    const icone = container.querySelector('svg');
    expect(icone).not.toBeNull();
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
    // O nome acessível segue sendo só o rótulo com a contagem.
    expect(screen.getByRole('button', { name: '2 e-mails não lidos' })).toBeInTheDocument();
  });

  it('axe `button-name`: sem violação no chip', async () => {
    const { container } = renderChip(5);
    const resultado = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(resultado).toHaveNoViolations();
  });

  it('axe `button-name`: sem violação na barra que monta o chip', async () => {
    const { container } = render(
      <ConversationTabs
        activeTab="chat"
        onTabChange={vi.fn()}
        counts={ZERO}
        emailUnread={{ count: 4, onOpen: vi.fn() }}
      />,
    );
    // O chip existe de verdade antes de medir (barra não vazia).
    const chip = screen.getByTestId('email-unread-chip');
    expect(within(chip).getByTestId('email-unread-chip-count')).toHaveTextContent('4');
    const resultado = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(resultado).toHaveNoViolations();
  });
});
