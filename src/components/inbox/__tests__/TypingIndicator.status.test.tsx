/**
 * L8 — o indicador "está digitando" anuncia o estado em região viva.
 *
 * Antes: o balão não tinha role nem aria-live, então leitor de tela não anunciava
 * quem estava digitando (e as variantes mortas `bubble`/`minimal`/`avatar` e o
 * `TypingIndicatorInline` sem uso carregavam animação sem alternativa).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator, TypingIndicatorCompact } from '../TypingIndicator';

describe('L8 — TypingIndicator em região de status', () => {
  it('uma pessoa digitando é anunciada', () => {
    render(<TypingIndicator isVisible userName="Maria" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Maria está digitando');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('duas pessoas digitando são anunciadas pelos nomes', () => {
    render(<TypingIndicator isVisible multipleUsers={['Maria', 'João']} />);

    expect(screen.getByRole('status')).toHaveTextContent('Maria e João estão digitando');
  });

  it('mais de duas pessoas são resumidas em quantidade', () => {
    render(<TypingIndicator isVisible multipleUsers={['Maria', 'João', 'Ana']} />);

    expect(screen.getByRole('status')).toHaveTextContent('3 pessoas estão digitando');
  });

  it('o indicador compacto do cabeçalho também é região de status', () => {
    render(<TypingIndicatorCompact isVisible />);

    expect(screen.getByRole('status')).toHaveTextContent('digitando');
  });

  it('invisível não deixa região de status na árvore', () => {
    render(<TypingIndicator isVisible={false} userName="Maria" />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
